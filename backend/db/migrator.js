import { readdir, readFile } from 'node:fs/promises';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
// Identificador arbitrario del lock que evita aplicar migraciones en paralelo.
const LOCK_ID = 751_200_001;

/**
 * Aplica, en orden, los archivos de db/migrations que aún no figuran en la
 * tabla schema_migrations. Cada migración corre en su propia transacción: si
 * falla, no queda aplicada a medias. Devuelve los nombres de las aplicadas.
 *
 * Usa un lock de transacción (no de sesión) para funcionar también con
 * conexiones pooled tipo PgBouncer, como las de Neon.
 */
export async function migrate(pool, log = () => {}) {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  const applied = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre      text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )`);

    for (const file of files) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
        const done = await client.query('SELECT 1 FROM schema_migrations WHERE nombre = $1', [file]);
        if (done.rowCount) {
          await client.query('COMMIT');
          continue;
        }
        await client.query(await readFile(new URL(file, MIGRATIONS_DIR), 'utf8'));
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        log(`Aplicada ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falló la migración ${file}: ${err.message}`, { cause: err });
      }
    }
  } finally {
    client.release();
  }
  return applied;
}
