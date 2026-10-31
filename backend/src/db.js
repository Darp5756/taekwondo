import pg from 'pg';
import { config } from './config.js';

// Las columnas DATE se devuelven como 'YYYY-MM-DD' en lugar de Date para evitar
// corrimientos por zona horaria.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

let pool;

// El pool se crea de forma perezosa y se reutiliza entre invocaciones de la
// función serverless mientras la instancia siga viva.
export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: Number(process.env.PG_POOL_MAX) || 5,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

// Ejecuta fn(client) dentro de una transacción. Todo lo que se haga con ese
// client se confirma junto o se revierte junto si algo falla.
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
