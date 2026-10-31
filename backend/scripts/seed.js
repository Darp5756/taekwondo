// Carga los datos base (ver db/seeder.js). Si se definen ADMIN_EMAIL y
// ADMIN_PASSWORD, crea también ese usuario administrador.
import { seed } from '../db/seeder.js';
import { closePool, query } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;

try {
  const admin =
    ADMIN_EMAIL && ADMIN_PASSWORD
      ? { nombre: ADMIN_NOMBRE, email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD) }
      : undefined;
  const r = await seed(query, { admin });
  console.log(`Registros nuevos: ${r.cintas} cintas, ${r.danes} danes, ${r.estados} estados, ${r.tules} tules`);
  if (admin) console.log(r.admin ? `Administrador creado: ${ADMIN_EMAIL}` : `El usuario ${ADMIN_EMAIL} ya existía`);
} finally {
  await closePool();
}
