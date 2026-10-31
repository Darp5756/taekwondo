// Preparación común de los tests de integración: base vacía (TEST_DATABASE_URL,
// que se BORRA), migraciones, seed y un administrador.
export const skip = !process.env.TEST_DATABASE_URL && 'Define TEST_DATABASE_URL para correr los tests';

export async function prepararApi() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_SECRET ||= 'test-secret';
  const db = await import('../src/db.js');
  const { migrate } = await import('../db/migrator.js');
  const { seed } = await import('../db/seeder.js');
  const { default: app } = await import('../src/app.js');
  const { default: supertest } = await import('supertest');

  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db.getPool());
  await seed(db.query);

  const request = supertest(app);
  const { body } = await request
    .post('/api/auth/setup')
    .send({ nombre: 'Admin', email: 'admin@test.com', password: 'secreta123' });
  const headers = { Authorization: `Bearer ${body.token}` };

  // Atajos que fallan con el cuerpo de la respuesta si el status no es el esperado.
  const call = (method) => async (path, data, status) => {
    let req = request[method](`/api${path}`).set(headers);
    if (data !== undefined) req = req.send(data);
    const res = await req;
    if (status !== undefined && res.status !== status)
      throw new Error(`${method.toUpperCase()} ${path} → ${res.status} (esperaba ${status}): ${JSON.stringify(res.body)}`);
    return res;
  };

  return {
    request,
    headers,
    query: db.query,
    closePool: db.closePool,
    get: call('get'),
    post: call('post'),
    put: call('put'),
    patch: call('patch'),
    del: call('delete'),
  };
}
