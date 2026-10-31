// Combates: consulta común, reglas de edición y acciones (finalizar, reabrir,
// tules y votos). Un combate puede ser suelto o parte de una llave.
import { randomInt } from 'node:crypto';
import { HttpError } from '../lib/http-error.js';
import { propagarLlave } from './llaves.js';

export const TIPOS_VICTORIA = ['puntos', 'decision', 'ko', 'abandono', 'descalificacion', 'wo', 'votos', 'bye'];

// Tipos que se pueden elegir al finalizar a mano, por modalidad. 'votos' se
// asigna al cargar los votos de tul; 'bye' y los W.O. por retiro, el sistema.
export const TIPOS_MANUALES = {
  matsogi: ['puntos', 'decision', 'ko', 'abandono', 'descalificacion', 'wo'],
  tul: ['abandono', 'descalificacion', 'wo'],
};

export const SELECT_COMBATES = `
  SELECT t.*, co.nombre AS competencia, co.fecha AS fecha_competencia,
         ca.nombre AS categoria, ca.modalidad, ca.jueces, ca.tules_por_encuentro, ca.eleccion_tul,
         ca.id_tul_desde, ca.id_tul_hasta,
         tr.nombre AS taekwondista_rojo, ar.nombre AS academia_rojo, ir.retirado AS retirado_rojo,
         ta.nombre AS taekwondista_azul, aa.nombre AS academia_azul, ia.retirado AS retirado_azul,
         tg.nombre AS taekwondista_ganador,
         (SELECT COALESCE(json_agg(json_build_object('orden', ct.orden, 'id_tul', ct.id_tul, 'nombre', tu.nombre)
                                   ORDER BY ct.orden), '[]')
          FROM combate_tules ct JOIN tules tu ON tu.id = ct.id_tul WHERE ct.id_combate = t.id) AS tules,
         (SELECT COALESCE(json_agg(cv.voto ORDER BY cv.juez), '[]')
          FROM combate_votos cv WHERE cv.id_combate = t.id) AS votos
  FROM combates t
  JOIN competencias co ON co.id = t.id_competencia
  JOIN categorias ca ON ca.id = t.id_categoria
  LEFT JOIN inscripciones ir ON ir.id = t.id_inscripcion_rojo
  LEFT JOIN taekwondistas tr ON tr.id = ir.id_taekwondista
  LEFT JOIN academias ar ON ar.id = tr.id_academia
  LEFT JOIN inscripciones ia ON ia.id = t.id_inscripcion_azul
  LEFT JOIN taekwondistas ta ON ta.id = ia.id_taekwondista
  LEFT JOIN academias aa ON aa.id = ta.id_academia
  LEFT JOIN inscripciones ig ON ig.id = t.id_inscripcion_ganador
  LEFT JOIN taekwondistas tg ON tg.id = ig.id_taekwondista`;

export async function cargarCombate(db, id) {
  const { rows } = await db.query(`${SELECT_COMBATES} WHERE t.id = $1 AND t.eliminado_en IS NULL`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Combate no encontrado');
  return rows[0];
}

// Bloquea el combate para modificarlo. Si es de una llave, bloquea antes la
// llave: propagarLlave (y el retiro de un inscrito) toman primero la llave y
// después los combates, y usar el mismo orden evita interbloqueos entre
// acciones simultáneas sobre la misma llave.
async function bloquearCombate(db, id) {
  await db.query('SELECT 1 FROM llaves WHERE id = (SELECT id_llave FROM combates WHERE id = $1) FOR UPDATE', [id]);
  const { rows } = await db.query(
    `SELECT t.*, ca.modalidad, ca.jueces, ca.tules_por_encuentro, ca.eleccion_tul, ca.id_tul_desde, ca.id_tul_hasta
     FROM combates t JOIN categorias ca ON ca.id = t.id_categoria
     WHERE t.id = $1 AND t.eliminado_en IS NULL
     FOR UPDATE OF t`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'Combate no encontrado');
  return rows[0];
}

function exigirDisputable(c) {
  if (c.estado === 'finalizado') throw new HttpError(400, 'El combate ya está finalizado');
  if (!c.id_inscripcion_rojo || !c.id_inscripcion_azul)
    throw new HttpError(400, 'Todavía no se conocen los dos competidores de este combate');
}

// --- Reglas de edición desde el CRUD genérico ---------------------------------

const ESTRUCTURA_LLAVE = ['id_competencia', 'id_categoria', 'id_inscripcion_rojo', 'id_inscripcion_azul', 'ronda'];

export async function validarCombate(d, { db, current }) {
  if (current?.id_llave) {
    if (ESTRUCTURA_LLAVE.some((c) => d[c] !== current[c]))
      throw new HttpError(400, 'En un combate de llave, la categoría, los competidores y la ronda los define la llave');
    if (current.estado === 'finalizado')
      throw new HttpError(400, 'El combate está finalizado: reábrelo desde el marcador para modificarlo');
    if (d.estado === 'finalizado' || d.id_inscripcion_ganador != null || d.tipo_victoria != null)
      throw new HttpError(400, 'Los combates de una llave se finalizan desde el marcador');
    if (d.estado === 'en_curso' && (!d.id_inscripcion_rojo || !d.id_inscripcion_azul))
      throw new HttpError(400, 'Todavía no se conocen los dos competidores de este combate');
    return d;
  }

  const details = [];
  if (!d.id_inscripcion_rojo) details.push({ field: 'id_inscripcion_rojo', message: 'Campo obligatorio' });
  if (!d.id_inscripcion_azul) details.push({ field: 'id_inscripcion_azul', message: 'Campo obligatorio' });
  if (details.length) throw new HttpError(400, 'Datos inválidos', details);

  const { rows } = await db.query(
    'SELECT id, id_competencia, id_categoria, retirado FROM inscripciones WHERE id = ANY($1) AND eliminado_en IS NULL',
    [[d.id_inscripcion_rojo, d.id_inscripcion_azul]],
  );
  for (const lado of ['rojo', 'azul']) {
    const field = `id_inscripcion_${lado}`;
    const insc = rows.find((r) => r.id === d[field]);
    if (!insc) continue; // la comprobación de relaciones lo reporta
    if (insc.id_competencia !== d.id_competencia || insc.id_categoria !== d.id_categoria)
      details.push({ field, message: 'No está inscrito en esta competencia y categoría' });
    else if (insc.retirado && d[field] !== current?.[field])
      details.push({ field, message: 'Está retirado de la competencia' });
  }
  if (details.length) throw new HttpError(400, 'Datos inválidos', details);
  return d;
}

export function antesDeEliminarCombate(row) {
  if (row.id_llave) throw new HttpError(409, 'Los combates de una llave no se eliminan sueltos: elimina la llave completa');
}

export function antesDeRestaurarCombate(row) {
  if (row.id_llave) throw new HttpError(400, 'Este combate pertenece a una llave eliminada; genera la llave de nuevo');
}

// --- Acciones -----------------------------------------------------------------

async function cerrar(db, c, { ganador, tipo }) {
  await db.query(
    `UPDATE combates SET estado = 'finalizado', id_inscripcion_ganador = $1, tipo_victoria = $2,
       resuelto_automaticamente = false
     WHERE id = $3`,
    [ganador, tipo, c.id],
  );
  if (c.id_llave) await propagarLlave(db, c.id_llave);
}

// Finaliza a mano (matsogi, o W.O./descalificación/abandono en tul).
export async function finalizarCombate(db, id, { ganador, tipo_victoria }) {
  const c = await bloquearCombate(db, id);
  exigirDisputable(c);
  const tipo =
    tipo_victoria ?? (c.modalidad === 'matsogi' && c.puntos_rojo === c.puntos_azul ? 'decision' : 'puntos');
  if (!TIPOS_MANUALES[c.modalidad].includes(tipo))
    throw new HttpError(
      400,
      c.modalidad === 'tul'
        ? 'En tul el resultado se registra con los votos de los jueces (o como W.O., descalificación o abandono)'
        : 'Tipo de victoria no válido',
    );
  await cerrar(db, c, { ganador: c[`id_inscripcion_${ganador}`], tipo });
}

// Vuelve a abrir un combate finalizado. Si el ganador ya avanzó y su combate
// siguiente empezó, propagarLlave lo impide (409).
export async function reabrirCombate(db, id) {
  const c = await bloquearCombate(db, id);
  if (c.estado !== 'finalizado') throw new HttpError(400, 'El combate no está finalizado');
  if (c.resuelto_automaticamente)
    throw new HttpError(400, 'Este combate se resolvió automáticamente (bye o W.O. por retiro)');
  await db.query(
    `UPDATE combates SET estado = 'en_curso', id_inscripcion_ganador = NULL, tipo_victoria = NULL WHERE id = $1`,
    [id],
  );
  await db.query('DELETE FROM combate_votos WHERE id_combate = $1', [id]);
  if (c.id_llave) await propagarLlave(db, c.id_llave);
}

async function tulesDelRango(db, c) {
  const { rows } = await db.query(
    `SELECT t.id, t.orden FROM tules t
     WHERE t.eliminado_en IS NULL
       AND t.orden BETWEEN (SELECT orden FROM tules WHERE id = $1) AND (SELECT orden FROM tules WHERE id = $2)
     ORDER BY t.orden`,
    [c.id_tul_desde, c.id_tul_hasta],
  );
  return rows;
}

async function guardarTules(db, c, ids) {
  await db.query('DELETE FROM combate_tules WHERE id_combate = $1', [c.id]);
  for (const [i, idTul] of ids.entries())
    await db.query('INSERT INTO combate_tules (id_combate, orden, id_tul) VALUES ($1, $2, $3)', [c.id, i + 1, idTul]);
  if (c.estado === 'pendiente') await db.query(`UPDATE combates SET estado = 'en_curso' WHERE id = $1`, [c.id]);
}

function exigirTul(c, eleccion) {
  if (c.modalidad !== 'tul') throw new HttpError(400, 'Este combate no es de tul');
  exigirDisputable(c);
  if (eleccion && c.eleccion_tul !== eleccion)
    throw new HttpError(
      400,
      c.eleccion_tul === 'sorteo'
        ? 'En esta categoría el tul se sortea'
        : 'En esta categoría el tul lo elige la mesa',
    );
}

// Sortea los tules del encuentro dentro del rango de la categoría, sin repetir.
// Se puede volver a sortear mientras no haya resultado.
export async function sortearTules(db, id) {
  const c = await bloquearCombate(db, id);
  exigirTul(c, 'sorteo');
  const disponibles = await tulesDelRango(db, c);
  if (disponibles.length < c.tules_por_encuentro)
    throw new HttpError(400, 'El rango de tules de la categoría no tiene suficientes tules para sortear');
  const elegidos = [];
  const bolsa = [...disponibles];
  while (elegidos.length < c.tules_por_encuentro) elegidos.push(bolsa.splice(randomInt(bolsa.length), 1)[0].id);
  await guardarTules(db, c, elegidos);
}

export async function elegirTules(db, id, ids) {
  const c = await bloquearCombate(db, id);
  exigirTul(c, 'manual');
  if (ids.length !== c.tules_por_encuentro)
    throw new HttpError(400, `Esta categoría ejecuta ${c.tules_por_encuentro} tul(es) por encuentro`);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'No se puede repetir el tul en el mismo encuentro');
  const permitidos = new Set((await tulesDelRango(db, c)).map((t) => t.id));
  if (ids.some((x) => !permitidos.has(x))) throw new HttpError(400, 'El tul está fuera del rango de la categoría');
  await guardarTules(db, c, ids);
}

// Registra el voto de cada juez (en orden: juez 1, 2, ...) y finaliza el
// encuentro con el ganador por mayoría. Con jueces impares siempre hay mayoría.
export async function registrarVotos(db, id, votos) {
  const c = await bloquearCombate(db, id);
  exigirTul(c);
  const { rowCount: tules } = await db.query('SELECT 1 FROM combate_tules WHERE id_combate = $1', [id]);
  if (tules !== c.tules_por_encuentro)
    throw new HttpError(400, 'Primero define el tul que se ejecuta en este encuentro');
  if (votos.length !== c.jueces)
    throw new HttpError(400, `Esta categoría tiene ${c.jueces} jueces: falta o sobra algún voto`);

  await db.query('DELETE FROM combate_votos WHERE id_combate = $1', [id]);
  for (const [i, voto] of votos.entries())
    await db.query('INSERT INTO combate_votos (id_combate, juez, voto) VALUES ($1, $2, $3)', [id, i + 1, voto]);

  const rojo = votos.filter((v) => v === 'rojo').length;
  const ganador = rojo > votos.length / 2 ? 'rojo' : 'azul';
  await cerrar(db, c, { ganador: c[`id_inscripcion_${ganador}`], tipo: 'votos' });
}
