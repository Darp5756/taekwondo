// Con borrado lógico, las FK de PostgreSQL ya no impiden "borrar" un registro
// en uso ni apuntar a uno eliminado. Estas funciones hacen esas comprobaciones
// leyendo las FK reales del catálogo, así cualquier tabla nueva queda cubierta.
import { query } from '../db.js';
import { HttpError } from './http-error.js';

let foreignKeysPromise;

function foreignKeys() {
  foreignKeysPromise ??= query(`
    SELECT c.conrelid::regclass::text  AS tabla,
           a.attname                   AS columna,
           c.confrelid::regclass::text AS referencia
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
  `)
    .then((r) => r.rows)
    .catch((err) => {
      foreignKeysPromise = undefined;
      throw err;
    });
  return foreignKeysPromise;
}

// Los registros relacionados (id_academia, id_cinta, ...) deben existir y estar activos.
export async function assertReferencesActive(table, data) {
  const fks = (await foreignKeys()).filter((fk) => fk.tabla === table && data[fk.columna] != null);
  const details = [];
  for (const fk of fks) {
    const { rowCount } = await query(`SELECT 1 FROM ${fk.referencia} WHERE id = $1 AND eliminado_en IS NULL`, [
      data[fk.columna],
    ]);
    if (!rowCount) details.push({ field: fk.columna, message: 'El registro seleccionado no existe o fue eliminado' });
  }
  if (details.length) throw new HttpError(400, 'Uno de los registros relacionados no existe o fue eliminado', details);
}

// No se puede eliminar un registro mientras otros registros activos lo usen.
export async function assertNoActiveDependents(table, id) {
  const fks = (await foreignKeys()).filter((fk) => fk.referencia === table);
  const tablas = [];
  for (const fk of fks) {
    const { rowCount } = await query(
      `SELECT 1 FROM ${fk.tabla} WHERE ${fk.columna} = $1 AND eliminado_en IS NULL LIMIT 1`,
      [id],
    );
    if (rowCount && !tablas.includes(fk.tabla)) tablas.push(fk.tabla);
  }
  if (tablas.length)
    throw new HttpError(409, `No se puede eliminar: hay registros activos que dependen de este (${tablas.join(', ')})`);
}
