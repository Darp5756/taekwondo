// Con borrado lógico, las FK de PostgreSQL ya no impiden "borrar" un registro
// en uso ni apuntar a uno eliminado. Estas funciones hacen esas comprobaciones
// leyendo las FK reales del catálogo, así cualquier tabla nueva queda cubierta.
//
// Reciben `db` (el pool o el client de una transacción) para leer dentro de la
// misma transacción que la escritura.
import { query } from '../db.js';
import { HttpError } from './http-error.js';

const pool = { query };
let foreignKeysPromise;

function foreignKeys() {
  foreignKeysPromise ??= query(`
    SELECT c.conrelid::regclass::text  AS tabla,
           a.attname                   AS columna,
           c.confrelid::regclass::text AS referencia,
           c.confdeltype = 'c'         AS cascada,
           EXISTS (
             SELECT 1 FROM pg_attribute e
             WHERE e.attrelid = c.conrelid AND e.attname = 'eliminado_en' AND NOT e.attisdropped
           )                           AS borrado_logico
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
export async function assertReferencesActive(table, data, db = pool) {
  const fks = (await foreignKeys()).filter((fk) => fk.tabla === table && data[fk.columna] != null);
  const details = [];
  for (const fk of fks) {
    const { rowCount } = await db.query(`SELECT 1 FROM ${fk.referencia} WHERE id = $1 AND eliminado_en IS NULL`, [
      data[fk.columna],
    ]);
    if (!rowCount) details.push({ field: fk.columna, message: 'El registro seleccionado no existe o fue eliminado' });
  }
  if (details.length) throw new HttpError(400, 'Uno de los registros relacionados no existe o fue eliminado', details);
}

// No se puede eliminar un registro mientras otros registros activos lo usen.
// Las tablas de detalle con ON DELETE CASCADE (p. ej. los votos de un combate)
// son parte del registro, no dependientes. En tablas sin borrado lógico, toda
// fila cuenta como activa.
export async function assertNoActiveDependents(table, id, db = pool) {
  const fks = (await foreignKeys()).filter((fk) => fk.referencia === table && !fk.cascada);
  const tablas = [];
  for (const fk of fks) {
    const activos = fk.borrado_logico ? 'AND eliminado_en IS NULL' : '';
    const { rowCount } = await db.query(`SELECT 1 FROM ${fk.tabla} WHERE ${fk.columna} = $1 ${activos} LIMIT 1`, [
      id,
    ]);
    if (rowCount && !tablas.includes(fk.tabla)) tablas.push(fk.tabla);
  }
  if (tablas.length)
    throw new HttpError(409, `No se puede eliminar: hay registros activos que dependen de este (${tablas.join(', ')})`);
}
