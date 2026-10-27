import { readFile } from 'node:fs/promises';
import { closePool, query } from '../src/db.js';

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');

try {
  await query(sql);
  console.log('Esquema aplicado correctamente');
} finally {
  await closePool();
}
