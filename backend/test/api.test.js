// Tests de integración contra PostgreSQL real.
// Usan TEST_DATABASE_URL, que se BORRA y recrea en cada ejecución.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const skip = !process.env.TEST_DATABASE_URL && 'Define TEST_DATABASE_URL para correr los tests';

describe('API', { skip }, () => {
  let request, closePool, query, getPool, migrate, seed;
  let adminToken;

  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });

  before(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET ||= 'test-secret';
    ({ query, closePool, getPool } = await import('../src/db.js'));
    ({ migrate } = await import('../db/migrator.js'));
    ({ seed } = await import('../db/seeder.js'));
    const { default: app } = await import('../src/app.js');
    const { default: supertest } = await import('supertest');
    request = supertest(app);

    await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  });

  after(() => closePool());

  describe('migraciones y seed', () => {
    test('las migraciones se aplican una sola vez', async () => {
      const first = await migrate(getPool());
      assert.deepEqual(first, ['001_esquema_inicial.sql', '002_estados_y_borrado_logico.sql']);
      assert.deepEqual(await migrate(getPool()), []);
    });

    test('el seed carga los catálogos y no duplica al repetirse', async () => {
      assert.deepEqual(await seed(query), { cintas: 11, danes: 9, estados: 24, admin: 0 });
      assert.deepEqual(await seed(query), { cintas: 0, danes: 0, estados: 0, admin: 0 });
      const { rows } = await query('SELECT count(*)::int AS n FROM estados');
      assert.equal(rows[0].n, 24);
    });

    test('el seed no restaura lo que se eliminó', async () => {
      await query("UPDATE estados SET eliminado_en = now() WHERE nombre = 'Amazonas'");
      assert.equal((await seed(query)).estados, 0);
      const { rows } = await query("SELECT eliminado_en FROM estados WHERE nombre = 'Amazonas'");
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].eliminado_en, null);
    });
  });

  describe('autenticación', () => {
    test('rechaza rutas protegidas sin token', async () => {
      const res = await request.get('/api/academias');
      assert.equal(res.status, 401);
    });

    test('setup crea el primer admin una sola vez', async () => {
      assert.equal((await request.get('/api/auth/setup')).body.needsSetup, true);

      const res = await request
        .post('/api/auth/setup')
        .send({ nombre: 'Admin', email: 'Admin@Test.com', password: 'secreta123' });
      assert.equal(res.status, 201);
      assert.equal(res.body.user.rol, 'admin');
      assert.equal(res.body.user.email, 'admin@test.com');

      const again = await request
        .post('/api/auth/setup')
        .send({ nombre: 'Otro', email: 'otro@test.com', password: 'secreta123' });
      assert.equal(again.status, 409);
      assert.equal((await request.get('/api/auth/setup')).body.needsSetup, false);
    });

    test('login con credenciales correctas e incorrectas', async () => {
      const bad = await request.post('/api/auth/login').send({ email: 'admin@test.com', password: 'nope' });
      assert.equal(bad.status, 401);

      const ok = await request.post('/api/auth/login').send({ email: 'ADMIN@test.com', password: 'secreta123' });
      assert.equal(ok.status, 200);
      adminToken = ok.body.token;

      const me = await request.get('/api/auth/me').set(auth());
      assert.equal(me.body.email, 'admin@test.com');
    });

    test('token inválido', async () => {
      const res = await request.get('/api/auth/me').set(auth('basura'));
      assert.equal(res.status, 401);
    });
  });

  describe('usuarios', () => {
    let operadorToken, operadorId;

    test('el admin crea un operador', async () => {
      const res = await request
        .post('/api/usuarios')
        .set(auth())
        .send({ nombre: 'Mesa 1', email: 'mesa@test.com', password: 'mesa12345', rol: 'operador' });
      assert.equal(res.status, 201);
      assert.equal(res.body.password_hash, undefined);
      operadorId = res.body.id;

      const login = await request.post('/api/auth/login').send({ email: 'mesa@test.com', password: 'mesa12345' });
      operadorToken = login.body.token;
    });

    test('el operador no puede gestionar usuarios pero sí datos', async () => {
      assert.equal((await request.get('/api/usuarios').set(auth(operadorToken))).status, 403);
      assert.equal((await request.get('/api/academias').set(auth(operadorToken))).status, 200);
    });

    test('desactivar un usuario corta su acceso', async () => {
      const res = await request
        .put(`/api/usuarios/${operadorId}`)
        .set(auth())
        .send({ nombre: 'Mesa 1', email: 'mesa@test.com', rol: 'operador', activo: false, password: '' });
      assert.equal(res.status, 200);
      assert.equal((await request.get('/api/academias').set(auth(operadorToken))).status, 401);
    });

    test('papelera y restaurar son solo para admin', async () => {
      await request
        .put(`/api/usuarios/${operadorId}`)
        .set(auth())
        .send({ nombre: 'Mesa 1', email: 'mesa@test.com', rol: 'operador', activo: true });
      operadorToken = (await request.post('/api/auth/login').send({ email: 'mesa@test.com', password: 'mesa12345' })).body.token;
      assert.equal((await request.get('/api/academias?eliminados=true').set(auth(operadorToken))).status, 403);
      assert.equal((await request.post('/api/academias/1/restaurar').set(auth(operadorToken))).status, 403);
    });

    test('un usuario eliminado no puede entrar y se puede restaurar', async () => {
      assert.equal((await request.delete(`/api/usuarios/${operadorId}`).set(auth())).status, 204);
      assert.equal((await request.get('/api/academias').set(auth(operadorToken))).status, 401);
      const login = await request.post('/api/auth/login').send({ email: 'mesa@test.com', password: 'mesa12345' });
      assert.equal(login.status, 401);

      const papelera = await request.get('/api/usuarios?eliminados=true').set(auth());
      assert.deepEqual(papelera.body.data.map((u) => u.email), ['mesa@test.com']);

      assert.equal((await request.post(`/api/usuarios/${operadorId}/restaurar`).set(auth())).status, 200);
      const again = await request.post('/api/auth/login').send({ email: 'mesa@test.com', password: 'mesa12345' });
      assert.equal(again.status, 200);
    });

    test('el admin no puede eliminarse a sí mismo', async () => {
      const me = await request.get('/api/auth/me').set(auth());
      assert.equal((await request.delete(`/api/usuarios/${me.body.id}`).set(auth())).status, 400);
    });

    test('cambio de contraseña propia', async () => {
      const wrong = await request
        .put('/api/auth/password')
        .set(auth())
        .send({ password_actual: 'mala', password_nueva: 'nueva12345' });
      assert.equal(wrong.status, 400);
      const ok = await request
        .put('/api/auth/password')
        .set(auth())
        .send({ password_actual: 'secreta123', password_nueva: 'nueva12345' });
      assert.equal(ok.status, 204);
      const login = await request.post('/api/auth/login').send({ email: 'admin@test.com', password: 'nueva12345' });
      assert.equal(login.status, 200);
    });
  });

  describe('CRUD', () => {
    const ids = {};
    const create = async (path, body) => {
      const res = await request.post(`/api/${path}`).set(auth()).send(body);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body;
    };

    test('academias: crear, listar, buscar, editar, duplicado y borrar', async () => {
      const a = await create('academias', { nombre: 'Academia Norte' });
      ids.academia = a.id;
      await create('academias', { nombre: 'Academia Sur' });

      const list = await request.get('/api/academias?q=nor').set(auth());
      assert.equal(list.body.total, 1);
      assert.equal(list.body.data[0].nombre, 'Academia Norte');

      const dup = await request.post('/api/academias').set(auth()).send({ nombre: 'Academia Sur' });
      assert.equal(dup.status, 409);

      const put = await request.put(`/api/academias/${a.id}`).set(auth()).send({ nombre: 'Academia Norte TKD' });
      assert.equal(put.body.nombre, 'Academia Norte TKD');

      const sur = (await request.get('/api/academias?q=sur').set(auth())).body.data[0];
      assert.equal((await request.delete(`/api/academias/${sur.id}`).set(auth())).status, 204);
      assert.equal((await request.get(`/api/academias/${sur.id}`).set(auth())).status, 404);
    });

    test('validaciones de datos', async () => {
      const empty = await request.post('/api/academias').set(auth()).send({ nombre: '  ' });
      assert.equal(empty.status, 400);
      assert.equal(empty.body.details[0].field, 'nombre');

      const rango = await request.post('/api/categorias').set(auth()).send({
        nombre: 'Mal',
        edad_minima: 20,
        edad_maxima: 10,
        peso_minimo_kg: 0,
        peso_maximo_kg: 50,
      });
      assert.equal(rango.status, 400);
      assert.match(rango.body.error, /edad mínima/);

      const vacio = await request.post('/api/cintas').set(auth()).send({ nombre: 'Gris', orden: '' });
      assert.equal(vacio.status, 400);
      assert.deepEqual(vacio.body.details, [{ field: 'orden', message: 'Campo obligatorio' }]);

      assert.equal((await request.get('/api/academias/abc').set(auth())).status, 400);
    });

    test('catálogos y taekwondistas con relaciones', async () => {
      ids.categoria = (
        await create('categorias', {
          nombre: 'Juvenil -60',
          edad_minima: '14',
          edad_maxima: '17',
          peso_minimo_kg: 50,
          peso_maximo_kg: 60,
        })
      ).id;
      ids.cinta = (await create('cintas', { nombre: 'Cinta prueba', orden: 50 })).id;
      ids.dan = (await create('danes', { nombre: 'Dan prueba', numero: 50 })).id;
      ids.estado = (await request.get('/api/estados?q=zulia').set(auth())).body.data[0].id;

      const base = {
        id_academia: ids.academia,
        id_categoria: ids.categoria,
        id_cinta: ids.cinta,
        id_estado: ids.estado,
        fecha_nacimiento: '2010-05-20',
        peso_kg: 55,
      };

      const sinEstado = await request.post('/api/taekwondistas').set(auth()).send({ ...base, id_estado: '', nombre: 'X' });
      assert.equal(sinEstado.status, 400);
      assert.equal(sinEstado.body.details[0].field, 'id_estado');

      const rojo = await create('taekwondistas', { ...base, nombre: 'Ana Rojas', id_dan: ids.dan });
      const azul = await create('taekwondistas', { ...base, nombre: 'Bea Azua', id_dan: '' });
      assert.equal(rojo.academia, 'Academia Norte TKD');
      assert.equal(rojo.dan, 'Dan prueba');
      assert.equal(rojo.estado, 'Zulia');
      assert.equal(rojo.fecha_nacimiento, '2010-05-20');
      assert.equal(azul.id_dan, null);
      ids.rojo = rojo.id;
      ids.azul = azul.id;

      const tercero = await create('taekwondistas', { ...base, nombre: 'Caro Tercera' });
      ids.tercero = tercero.id;

      const fk = await request.post('/api/taekwondistas').set(auth()).send({ ...base, id_academia: 9999, nombre: 'X' });
      assert.equal(fk.status, 400);
      assert.equal(fk.body.details[0].field, 'id_academia');

      const filtro = await request.get(`/api/taekwondistas?id_academia=${ids.academia}&q=ana`).set(auth());
      assert.equal(filtro.body.total, 1);
      const porEstado = await request.get(`/api/taekwondistas?id_estado=${ids.estado}`).set(auth());
      assert.equal(porEstado.body.total, 3);
    });

    test('combates: reglas, PATCH de puntaje y borrado protegido', async () => {
      ids.competencia = (await create('competencias', { nombre: 'Open 2026', fecha: '2026-11-15', lugar: 'Santiago' })).id;
      const base = {
        id_competencia: ids.competencia,
        id_categoria: ids.categoria,
        id_taekwondista_rojo: ids.rojo,
        id_taekwondista_azul: ids.azul,
        ronda: 'Final',
      };

      const mismo = await request
        .post('/api/combates')
        .set(auth())
        .send({ ...base, id_taekwondista_azul: ids.rojo });
      assert.equal(mismo.status, 400);

      const ganadorAjeno = await request
        .post('/api/combates')
        .set(auth())
        .send({ ...base, id_taekwondista_ganador: ids.tercero });
      assert.equal(ganadorAjeno.status, 400);

      const combate = await create('combates', base);
      assert.equal(combate.estado, 'pendiente');
      assert.equal(combate.puntos_rojo, 0);
      assert.equal(combate.taekwondista_rojo, 'Ana Rojas');

      const patch = await request
        .patch(`/api/combates/${combate.id}`)
        .set(auth())
        .send({ puntos_rojo: 5, amonestaciones_azul: 3, puntos_azul: -1, estado: 'finalizado', id_taekwondista_ganador: ids.rojo });
      assert.equal(patch.status, 200, JSON.stringify(patch.body));
      assert.equal(patch.body.puntos_rojo, 5);
      assert.equal(patch.body.ronda, 'Final');
      assert.equal(patch.body.taekwondista_ganador, 'Ana Rojas');

      const estadoMalo = await request.get('/api/combates?estado=otro').set(auth());
      assert.equal(estadoMalo.status, 400);
      const porEstado = await request.get('/api/combates?estado=finalizado').set(auth());
      assert.equal(porEstado.body.total, 1);

      const borrarComp = await request.delete(`/api/competencias/${ids.competencia}`).set(auth());
      assert.equal(borrarComp.status, 409);
      assert.match(borrarComp.body.error, /dependen/);

      assert.equal((await request.delete(`/api/combates/${combate.id}`).set(auth())).status, 204);
      assert.equal((await request.delete(`/api/competencias/${ids.competencia}`).set(auth())).status, 204);
    });

    test('paginación', async () => {
      const res = await request.get('/api/taekwondistas?limit=2&offset=0').set(auth());
      assert.equal(res.body.data.length, 2);
      assert.equal(res.body.total, 3);
    });

    test('borrado lógico: el registro se oculta pero sigue en la base', async () => {
      const a = await create('academias', { nombre: 'Academia Temporal' });
      assert.equal((await request.delete(`/api/academias/${a.id}`).set(auth())).status, 204);
      assert.equal((await request.get(`/api/academias/${a.id}`).set(auth())).status, 404);
      assert.equal((await request.put(`/api/academias/${a.id}`).set(auth()).send({ nombre: 'Y' })).status, 404);
      assert.equal((await request.delete(`/api/academias/${a.id}`).set(auth())).status, 404);
      const lista = await request.get('/api/academias?q=temporal').set(auth());
      assert.equal(lista.body.total, 0);

      const { rows } = await query('SELECT eliminado_en FROM academias WHERE id = $1', [a.id]);
      assert.notEqual(rows[0].eliminado_en, null);

      const papelera = await request.get('/api/academias?eliminados=true').set(auth());
      assert.ok(papelera.body.data.some((r) => r.id === a.id));
    });

    test('borrado lógico: un nombre eliminado se puede reutilizar y restaurar choca', async () => {
      const vieja = await create('academias', { nombre: 'Academia Repetida' });
      await request.delete(`/api/academias/${vieja.id}`).set(auth());
      const nueva = await create('academias', { nombre: 'Academia Repetida' });

      const choque = await request.post(`/api/academias/${vieja.id}/restaurar`).set(auth());
      assert.equal(choque.status, 409);

      await request.delete(`/api/academias/${nueva.id}`).set(auth());
      const ok = await request.post(`/api/academias/${vieja.id}/restaurar`).set(auth());
      assert.equal(ok.status, 200);
      assert.equal(ok.body.nombre, 'Academia Repetida');
      assert.equal((await request.post(`/api/academias/${vieja.id}/restaurar`).set(auth())).status, 404);
    });

    test('borrado lógico: dependencias activas y referencias a eliminados', async () => {
      // La academia tiene taekwondistas activos.
      const enUso = await request.delete(`/api/academias/${ids.academia}`).set(auth());
      assert.equal(enUso.status, 409);
      assert.match(enUso.body.error, /taekwondistas/);

      // No se puede asignar una academia eliminada.
      const borrada = await create('academias', { nombre: 'Academia Cerrada' });
      await request.delete(`/api/academias/${borrada.id}`).set(auth());
      const tkd = (await request.get(`/api/taekwondistas/${ids.tercero}`).set(auth())).body;
      const res = await request
        .patch(`/api/taekwondistas/${ids.tercero}`)
        .set(auth())
        .send({ id_academia: borrada.id });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body.details, [
        { field: 'id_academia', message: 'El registro seleccionado no existe o fue eliminado' },
      ]);

      // Un taekwondista sin combates activos se puede eliminar y luego restaurar.
      assert.equal((await request.delete(`/api/taekwondistas/${tkd.id}`).set(auth())).status, 204);
      const restaurado = await request.post(`/api/taekwondistas/${tkd.id}/restaurar`).set(auth());
      assert.equal(restaurado.body.nombre, 'Caro Tercera');
    });

    test('no se restaura un registro cuya relación sigue eliminada', async () => {
      const academia = await create('academias', { nombre: 'Academia Efímera' });
      const t = await create('taekwondistas', {
        id_academia: academia.id,
        id_categoria: ids.categoria,
        id_cinta: ids.cinta,
        id_estado: ids.estado,
        nombre: 'Dani Efímera',
        fecha_nacimiento: '2011-01-01',
        peso_kg: 52,
      });
      await request.delete(`/api/taekwondistas/${t.id}`).set(auth());
      await request.delete(`/api/academias/${academia.id}`).set(auth());
      const res = await request.post(`/api/taekwondistas/${t.id}/restaurar`).set(auth());
      assert.equal(res.status, 400);
      assert.equal(res.body.details[0].field, 'id_academia');
    });
  });
});
