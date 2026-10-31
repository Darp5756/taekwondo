// Llaves de eliminación simple: creación, avance automático y podio.
//
// Cada combate de la llave sabe adónde pasan su ganador y su perdedor
// (id_combate_ganador_va_a / id_combate_perdedor_va_a). Los competidores de las
// rondas siguientes no se guardan a mano: propagarLlave los recalcula a partir
// de los resultados, y además resuelve solo los combates que no se disputan
// (byes y W.O. por retiro).
import { HttpError } from '../lib/http-error.js';
import { estructuraLlave, validarSlots } from './sorteo.js';

const ESQUINAS = ['rojo', 'azul'];

const perdedor = (c) =>
  c.id_inscripcion_ganador == null || !c.id_inscripcion_rojo || !c.id_inscripcion_azul
    ? null
    : c.id_inscripcion_ganador === c.id_inscripcion_rojo
      ? c.id_inscripcion_azul
      : c.id_inscripcion_rojo;

// Un combate lo decidió una persona (o se está disputando): el sistema no lo toca.
const decididoAMano = (c) => c.estado === 'en_curso' || (c.estado === 'finalizado' && !c.resuelto_automaticamente);

/**
 * Resultado automático de un combate según el estado de sus esquinas:
 * 'ocupada' (hay competidor), 'pendiente' (falta el resultado del combate que
 * la alimenta) o 'vacia' (no llegará nadie: bye). Devuelve null si el combate
 * se tiene que disputar (o todavía no se sabe).
 */
function resultadoAutomatico(c, esquinas, retirados) {
  if (esquinas.rojo === 'pendiente' || esquinas.azul === 'pendiente') return null;
  if (esquinas.rojo === 'vacia' && esquinas.azul === 'vacia') return { ganador: null, tipo: null };
  if (esquinas.rojo === 'vacia') return { ganador: c.id_inscripcion_azul, tipo: 'bye' };
  if (esquinas.azul === 'vacia') return { ganador: c.id_inscripcion_rojo, tipo: 'bye' };
  const rojoRetirado = retirados.has(c.id_inscripcion_rojo);
  const azulRetirado = retirados.has(c.id_inscripcion_azul);
  if (rojoRetirado && azulRetirado) return { ganador: null, tipo: 'wo' };
  if (rojoRetirado) return { ganador: c.id_inscripcion_azul, tipo: 'wo' };
  if (azulRetirado) return { ganador: c.id_inscripcion_rojo, tipo: 'wo' };
  return null;
}

/**
 * Recalcula los competidores de cada combate de la llave y resuelve los que
 * no se disputan. Es idempotente: se llama después de cualquier cambio
 * (resultado, reapertura, retiro). Si un cambio obligaría a modificar un
 * combate que ya se disputó o está en curso, lanza 409 y la transacción se
 * revierte.
 */
export async function propagarLlave(db, idLlave) {
  await db.query('SELECT id FROM llaves WHERE id = $1 FOR UPDATE', [idLlave]);
  const { rows: combates } = await db.query(
    `SELECT * FROM combates WHERE id_llave = $1 AND eliminado_en IS NULL ORDER BY numero_ronda, posicion`,
    [idLlave],
  );
  const { rows: retiradosRows } = await db.query(
    `SELECT i.id FROM inscripciones i
     WHERE i.retirado AND i.id IN (
       SELECT unnest(ARRAY[id_inscripcion_rojo, id_inscripcion_azul]) FROM combates
       WHERE id_llave = $1 AND eliminado_en IS NULL)`,
    [idLlave],
  );
  const retirados = new Set(retiradosRows.map((r) => r.id));

  // Para cada combate y esquina: de qué combate viene y si toma al ganador o al perdedor.
  const origen = new Map();
  const registrarOrigen = (destino, esquina, combate, toma) => {
    if (!destino) return;
    if (!origen.has(destino)) origen.set(destino, {});
    origen.get(destino)[esquina] = { combate, toma };
  };
  for (const c of combates) {
    registrarOrigen(c.id_combate_ganador_va_a, c.esquina_ganador, c, 'ganador');
    registrarOrigen(c.id_combate_perdedor_va_a, c.esquina_perdedor, c, 'perdedor');
  }

  const modificados = [];
  // El orden por ronda garantiza que un combate se procesa después de los que lo alimentan.
  for (const c of combates) {
    const antes = JSON.stringify(c);
    const esquinas = {};

    for (const esquina of ESQUINAS) {
      const columna = `id_inscripcion_${esquina}`;
      const o = origen.get(c.id)?.[esquina];
      if (!o) {
        esquinas[esquina] = c[columna] ? 'ocupada' : 'vacia';
        continue;
      }
      const terminado = o.combate.estado === 'finalizado';
      const valor = terminado ? ((o.toma === 'ganador' ? o.combate.id_inscripcion_ganador : perdedor(o.combate)) ?? null) : null;
      esquinas[esquina] = !terminado ? 'pendiente' : valor ? 'ocupada' : 'vacia';
      if (c[columna] !== valor) {
        if (decididoAMano(c))
          throw new HttpError(
            409,
            `No se puede: el combate de ${c.ronda.toLowerCase()} que sigue ya se disputó o está en curso. Reábrelo primero.`,
          );
        c[columna] = valor;
      }
    }

    if (!decididoAMano(c)) {
      const auto = resultadoAutomatico(c, esquinas, retirados);
      c.estado = auto ? 'finalizado' : 'pendiente';
      c.resuelto_automaticamente = Boolean(auto);
      c.id_inscripcion_ganador = auto?.ganador ?? null;
      c.tipo_victoria = auto?.tipo ?? null;
    }

    if (JSON.stringify(c) !== antes) modificados.push(c);
  }

  for (const c of modificados) {
    await db.query(
      `UPDATE combates SET id_inscripcion_rojo = $1, id_inscripcion_azul = $2, id_inscripcion_ganador = $3,
         estado = $4, tipo_victoria = $5, resuelto_automaticamente = $6
       WHERE id = $7`,
      [
        c.id_inscripcion_rojo,
        c.id_inscripcion_azul,
        c.id_inscripcion_ganador,
        c.estado,
        c.tipo_victoria,
        c.resuelto_automaticamente,
        c.id,
      ],
    );
  }
}

// Inscripciones activas (no retiradas) de una competencia y categoría, con los
// datos necesarios para sortear y separar.
export async function inscritosActivos(db, idCompetencia, idCategoria) {
  const { rows } = await db.query(
    `SELECT i.id, tk.nombre AS taekwondista, tk.id_academia, a.nombre AS academia, tk.id_estado, es.nombre AS estado
     FROM inscripciones i
     JOIN taekwondistas tk ON tk.id = i.id_taekwondista
     JOIN academias a ON a.id = tk.id_academia
     LEFT JOIN estados es ON es.id = tk.id_estado
     WHERE i.id_competencia = $1 AND i.id_categoria = $2 AND i.eliminado_en IS NULL AND NOT i.retirado
     ORDER BY tk.nombre`,
    [idCompetencia, idCategoria],
  );
  return rows;
}

export async function exigirSinLlave(db, idCompetencia, idCategoria) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM llaves WHERE id_competencia = $1 AND id_categoria = $2 AND eliminado_en IS NULL',
    [idCompetencia, idCategoria],
  );
  if (rowCount)
    throw new HttpError(409, 'Ya existe una llave para esta categoría en esta competencia. Elimínala para generarla de nuevo.');
}

/** Crea la llave y todos sus combates, y resuelve los byes. Devuelve el id. */
export async function crearLlave(db, { id_competencia, id_categoria, tercer_puesto, separacion, slots }) {
  await exigirSinLlave(db, id_competencia, id_categoria);
  const inscritos = await inscritosActivos(db, id_competencia, id_categoria);
  if (inscritos.length < 2) throw new HttpError(400, 'Se necesitan al menos 2 inscritos activos para armar una llave');
  const error = validarSlots(slots, inscritos.map((i) => i.id));
  if (error) throw new HttpError(400, error);

  const { rows } = await db.query(
    `INSERT INTO llaves (id_competencia, id_categoria, tercer_puesto, separacion)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [id_competencia, id_categoria, tercer_puesto, separacion],
  );
  const idLlave = rows[0].id;

  // Se insertan de la final hacia atrás para que los combates de destino ya existan.
  const estructura = estructuraLlave(slots, { tercerPuesto: tercer_puesto });
  const ids = {};
  const porRondaDesc = [...estructura].sort((a, b) => b.numero_ronda - a.numero_ronda || b.posicion - a.posicion);
  for (const c of porRondaDesc) {
    const { rows: insertado } = await db.query(
      `INSERT INTO combates (id_competencia, id_categoria, id_llave, numero_ronda, posicion, ronda,
         id_inscripcion_rojo, id_inscripcion_azul,
         id_combate_ganador_va_a, esquina_ganador, id_combate_perdedor_va_a, esquina_perdedor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        id_competencia,
        id_categoria,
        idLlave,
        c.numero_ronda,
        c.posicion,
        c.ronda,
        c.rojo,
        c.azul,
        c.ganador_va_a ? ids[c.ganador_va_a] : null,
        c.esquina_ganador,
        c.perdedor_va_a ? ids[c.perdedor_va_a] : null,
        c.esquina_perdedor,
      ],
    );
    ids[c.clave] = insertado[0].id;
  }

  await propagarLlave(db, idLlave);
  return idLlave;
}

// Elimina (lógicamente) la llave y sus combates, solo si no se disputó ninguno.
export async function eliminarLlave(db, idLlave) {
  const { rows } = await db.query('SELECT id FROM llaves WHERE id = $1 AND eliminado_en IS NULL FOR UPDATE', [idLlave]);
  if (!rows[0]) throw new HttpError(404, 'Llave no encontrada');
  const { rowCount } = await db.query(
    `SELECT 1 FROM combates WHERE id_llave = $1 AND eliminado_en IS NULL
       AND (estado = 'en_curso' OR (estado = 'finalizado' AND NOT resuelto_automaticamente))
     LIMIT 1`,
    [idLlave],
  );
  if (rowCount) throw new HttpError(409, 'No se puede eliminar: la llave ya tiene combates disputados o en curso');
  await db.query('UPDATE combates SET eliminado_en = now() WHERE id_llave = $1 AND eliminado_en IS NULL', [idLlave]);
  await db.query('UPDATE llaves SET eliminado_en = now() WHERE id = $1', [idLlave]);
}

/**
 * Podio a partir de los combates de la llave (con nombres). Devuelve los
 * puestos conocidos hasta el momento: { oro, plata, bronce: [] }.
 * Sin combate por el tercer puesto, hay dos bronces (perdedores de semifinal).
 */
export function podio(combates, tercerPuesto) {
  const totalRondas = Math.max(...combates.map((c) => c.numero_ronda));
  const nombre = (c, idInscripcion) =>
    idInscripcion == null
      ? null
      : idInscripcion === c.id_inscripcion_rojo
        ? { id_inscripcion: idInscripcion, nombre: c.taekwondista_rojo, academia: c.academia_rojo }
        : { id_inscripcion: idInscripcion, nombre: c.taekwondista_azul, academia: c.academia_azul };
  const terminado = (c) => c?.estado === 'finalizado';

  const final = combates.find((c) => c.numero_ronda === totalRondas && c.posicion === 0);
  const resultado = { oro: null, plata: null, bronce: [] };
  if (terminado(final)) {
    resultado.oro = nombre(final, final.id_inscripcion_ganador);
    resultado.plata = nombre(final, perdedor(final));
  }
  const tercero = combates.find((c) => c.numero_ronda === totalRondas && c.posicion === 1);
  if (tercerPuesto && tercero) {
    if (terminado(tercero) && tercero.id_inscripcion_ganador) resultado.bronce.push(nombre(tercero, tercero.id_inscripcion_ganador));
  } else {
    for (const semi of combates.filter((c) => c.numero_ronda === totalRondas - 1))
      if (terminado(semi) && perdedor(semi)) resultado.bronce.push(nombre(semi, perdedor(semi)));
  }
  return resultado;
}
