import { migrate } from '../db/migrator.js';
import { closePool, getPool } from '../src/db.js';

try {
  const applied = await migrate(getPool(), console.log);
  console.log(applied.length ? `${applied.length} migración(es) aplicada(s)` : 'La base ya estaba al día');
} finally {
  await closePool();
}
