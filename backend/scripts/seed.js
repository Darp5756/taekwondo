// Carga los catálogos básicos (cintas y danes ITF) y, si se definen
// ADMIN_EMAIL y ADMIN_PASSWORD, crea el usuario administrador.
// Es idempotente: no duplica datos existentes.
import { closePool, query } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';

const cintas = [
  'Blanca',
  'Blanca punta amarilla',
  'Amarilla',
  'Amarilla punta verde',
  'Verde',
  'Verde punta azul',
  'Azul',
  'Azul punta roja',
  'Roja',
  'Roja punta negra',
  'Negra',
];

const danes = ['1er Dan', '2do Dan', '3er Dan', '4to Dan', '5to Dan', '6to Dan', '7mo Dan', '8vo Dan', '9no Dan'];

try {
  for (const [i, nombre] of cintas.entries()) {
    await query('INSERT INTO cintas (nombre, orden) VALUES ($1, $2) ON CONFLICT DO NOTHING', [nombre, i + 1]);
  }
  for (const [i, nombre] of danes.entries()) {
    await query('INSERT INTO danes (nombre, numero) VALUES ($1, $2) ON CONFLICT DO NOTHING', [nombre, i + 1]);
  }
  console.log(`Catálogos cargados: ${cintas.length} cintas, ${danes.length} danes`);

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE = 'Administrador' } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const { rowCount } = await query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, 'admin') ON CONFLICT (email) DO NOTHING`,
      [ADMIN_NOMBRE, ADMIN_EMAIL.trim().toLowerCase(), await hashPassword(ADMIN_PASSWORD)],
    );
    console.log(rowCount ? `Administrador creado: ${ADMIN_EMAIL}` : `El usuario ${ADMIN_EMAIL} ya existía`);
  }
} finally {
  await closePool();
}
