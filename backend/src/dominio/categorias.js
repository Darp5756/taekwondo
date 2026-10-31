// Reglas de las categorías que necesitan consultar la base.
import { HttpError } from '../lib/http-error.js';

// Comprueba que el mínimo de un rango (cintas por orden, danes por número,
// tules por orden) no sea superior al máximo.
async function rangoOrdenado(db, tabla, columnaOrden, idMin, idMax) {
  if (idMin == null || idMax == null) return true;
  const { rows } = await db.query(`SELECT id, ${columnaOrden} AS orden FROM ${tabla} WHERE id = ANY($1)`, [
    [idMin, idMax],
  ]);
  const orden = Object.fromEntries(rows.map((r) => [r.id, r.orden]));
  // Si alguno no existe, la comprobación de relaciones lo reporta después.
  return orden[idMin] == null || orden[idMax] == null || orden[idMin] <= orden[idMax];
}

export async function validarCategoria(d, { db, current }) {
  const details = [];
  const error = (field, message) => details.push({ field, message });

  // Cada modalidad usa sus campos; los de la otra se limpian para no guardar
  // configuración que no aplica.
  if (d.modalidad === 'matsogi') {
    d.id_tul_desde = null;
    d.id_tul_hasta = null;
    if (d.peso_minimo_kg == null) error('peso_minimo_kg', 'Obligatorio en matsogi');
    if (d.peso_maximo_kg == null) error('peso_maximo_kg', 'Obligatorio en matsogi');
    if (d.peso_minimo_kg != null && d.peso_maximo_kg != null && d.peso_minimo_kg > d.peso_maximo_kg)
      error('peso_minimo_kg', 'El peso mínimo no puede ser mayor que el máximo');
  } else {
    d.peso_minimo_kg = null;
    d.peso_maximo_kg = null;
    if (d.id_tul_desde == null) error('id_tul_desde', 'Obligatorio en tul');
    if (d.id_tul_hasta == null) error('id_tul_hasta', 'Obligatorio en tul');
    if (!(await rangoOrdenado(db, 'tules', 'orden', d.id_tul_desde, d.id_tul_hasta)))
      error('id_tul_desde', 'El primer tul del rango no puede ir después del último');
  }

  if (!(await rangoOrdenado(db, 'cintas', 'orden', d.id_cinta_minima, d.id_cinta_maxima)))
    error('id_cinta_minima', 'La cinta mínima no puede ser superior a la máxima');
  if (!(await rangoOrdenado(db, 'danes', 'numero', d.id_dan_minimo, d.id_dan_maximo)))
    error('id_dan_minimo', 'El dan mínimo no puede ser superior al máximo');

  if (current && current.modalidad !== d.modalidad) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM inscripciones WHERE id_categoria = $1 AND eliminado_en IS NULL
       UNION ALL
       SELECT 1 FROM combates WHERE id_categoria = $1 AND eliminado_en IS NULL
       LIMIT 1`,
      [current.id],
    );
    if (rowCount) error('modalidad', 'No se puede cambiar: la categoría ya tiene inscripciones o combates');
  }

  if (details.length) throw new HttpError(400, details.length === 1 ? details[0].message : 'Datos inválidos', details);
  return d;
}
