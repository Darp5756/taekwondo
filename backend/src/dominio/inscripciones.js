// Reglas de las inscripciones que consultan la base.
import { HttpError } from '../lib/http-error.js';
import { motivosNoElegible } from './elegibilidad.js';
import { propagarLlave } from './llaves.js';

export const SQL_CATEGORIA = `
  SELECT c.*, cmin.orden AS cinta_minima_orden, cmax.orden AS cinta_maxima_orden,
         dmin.numero AS dan_minimo_numero, dmax.numero AS dan_maximo_numero
  FROM categorias c
  LEFT JOIN cintas cmin ON cmin.id = c.id_cinta_minima
  LEFT JOIN cintas cmax ON cmax.id = c.id_cinta_maxima
  LEFT JOIN danes dmin ON dmin.id = c.id_dan_minimo
  LEFT JOIN danes dmax ON dmax.id = c.id_dan_maximo
  WHERE c.id = $1 AND c.eliminado_en IS NULL`;

export const SQL_TAEKWONDISTAS = `
  SELECT t.*, a.nombre AS academia, es.nombre AS estado, ci.orden AS cinta_orden, ci.nombre AS cinta,
         d.numero AS dan_numero, d.nombre AS dan
  FROM taekwondistas t
  JOIN academias a ON a.id = t.id_academia
  JOIN cintas ci ON ci.id = t.id_cinta
  LEFT JOIN danes d ON d.id = t.id_dan
  LEFT JOIN estados es ON es.id = t.id_estado
  WHERE t.eliminado_en IS NULL`;

const modalidadTexto = (m) => (m === 'tul' ? 'tul' : 'matsogi');

// Inscripciones activas del taekwondista en otra categoría de la misma modalidad.
export async function otraInscripcionMismaModalidad(db, { id_competencia, id_taekwondista, modalidad, excluirId }) {
  const { rows } = await db.query(
    `SELECT c.nombre FROM inscripciones i JOIN categorias c ON c.id = i.id_categoria
     WHERE i.id_competencia = $1 AND i.id_taekwondista = $2 AND i.eliminado_en IS NULL
       AND c.modalidad = $3 AND i.id <> $4`,
    [id_competencia, id_taekwondista, modalidad, excluirId ?? 0],
  );
  return rows[0]?.nombre ?? null;
}

const CAMPOS_ESTRUCTURALES = ['id_competencia', 'id_categoria', 'id_taekwondista'];

export async function validarInscripcion(d, { db, current }) {
  const cambiaEstructura = !current || CAMPOS_ESTRUCTURALES.some((c) => d[c] !== current[c]);

  if (current && cambiaEstructura) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM combates WHERE eliminado_en IS NULL
         AND $1 IN (id_inscripcion_rojo, id_inscripcion_azul) LIMIT 1`,
      [current.id],
    );
    if (rowCount)
      throw new HttpError(400, 'No se puede cambiar la competencia, la categoría ni el taekwondista: ya tiene combates');
  }

  // Solo se revisa la elegibilidad cuando cambia algo que la afecta; así se
  // puede, por ejemplo, retirar a alguien aunque la categoría haya cambiado
  // después de inscribirlo.
  const revisar =
    cambiaEstructura || d.peso_kg !== current.peso_kg || d.fuera_de_categoria !== current.fuera_de_categoria;
  if (!revisar) return d;

  const [categoria, taekwondista, competencia] = await Promise.all([
    db.query(SQL_CATEGORIA, [d.id_categoria]).then((r) => r.rows[0]),
    db.query(`${SQL_TAEKWONDISTAS} AND t.id = $1`, [d.id_taekwondista]).then((r) => r.rows[0]),
    db.query('SELECT fecha FROM competencias WHERE id = $1 AND eliminado_en IS NULL', [d.id_competencia]).then(
      (r) => r.rows[0],
    ),
  ]);
  // Si alguno no existe, la comprobación de relaciones lo reporta después.
  if (!categoria || !taekwondista || !competencia) return d;

  const repetida = await db.query(
    `SELECT 1 FROM inscripciones WHERE id_competencia = $1 AND id_categoria = $2 AND id_taekwondista = $3
       AND eliminado_en IS NULL AND id <> $4`,
    [d.id_competencia, d.id_categoria, d.id_taekwondista, current?.id ?? 0],
  );
  if (repetida.rowCount)
    throw new HttpError(409, 'Ya está inscrito en esta categoría', [
      { field: 'id_taekwondista', message: 'Ya está inscrito en esta categoría' },
    ]);

  const otra = await otraInscripcionMismaModalidad(db, {
    id_competencia: d.id_competencia,
    id_taekwondista: d.id_taekwondista,
    modalidad: categoria.modalidad,
    excluirId: current?.id,
  });
  if (otra)
    throw new HttpError(400, 'Ya está inscrito en otra categoría de la misma modalidad', [
      {
        field: 'id_categoria',
        message: `Ya está inscrito en «${otra}» (${modalidadTexto(categoria.modalidad)}) en esta competencia`,
      },
    ]);

  if (!d.fuera_de_categoria) {
    const motivos = motivosNoElegible({
      categoria,
      taekwondista,
      fechaCompetencia: competencia.fecha,
      pesoKg: d.peso_kg,
    });
    if (motivos.length)
      throw new HttpError(400, 'El taekwondista no cumple los requisitos de la categoría', [
        {
          field: 'id_categoria',
          message: `${motivos.join('. ')}. Marca «Fuera de categoría» para inscribirlo igual.`,
        },
      ]);
  }
  return d;
}

// Al retirar (o reincorporar) a un inscrito, se recalculan sus llaves: pierde
// por W.O. los combates que le queden.
export async function alGuardarInscripcion(id, { db, current }) {
  if (!current) return;
  const { rows } = await db.query('SELECT retirado FROM inscripciones WHERE id = $1', [id]);
  if (rows[0].retirado === current.retirado) return;
  const { rows: llaves } = await db.query(
    `SELECT DISTINCT id_llave FROM combates
     WHERE id_llave IS NOT NULL AND eliminado_en IS NULL AND $1 IN (id_inscripcion_rojo, id_inscripcion_azul)`,
    [id],
  );
  for (const { id_llave } of llaves) await propagarLlave(db, id_llave);
}
