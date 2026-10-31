import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararApi, skip } from './helpers.js';

describe('llaves', { skip }, () => {
  let api;
  const ids = {};
  const insc = {}; // inscripciones por nombre

  before(async () => {
    api = await prepararApi();
    const { get, post } = api;
    ids.competencia = (await post('/competencias', { nombre: 'Nacional', fecha: '2026-11-15', lugar: 'Valencia' }, 201)).body.id;
    for (const a of ['A', 'B', 'C']) ids[`academia${a}`] = (await post('/academias', { nombre: `Academia ${a}` }, 201)).body.id;
    ids.cinta = (await get('/cintas?q=Negra')).body.data.find((c) => c.nombre === 'Negra').id;
    ids.estado = (await get('/estados?q=Lara')).body.data[0].id;
    ids.dan = (await get('/danes?q=1er')).body.data[0].id;
    ids.categoria = (
      await post('/categorias', { nombre: 'Adultos -70', edad_minima: 18, edad_maxima: 35, peso_minimo_kg: 60, peso_maximo_kg: 70 }, 201)
    ).body.id;
    ids.categoria3 = (
      await post('/categorias', { nombre: 'Adultos -80', edad_minima: 18, edad_maxima: 35, peso_minimo_kg: 70, peso_maximo_kg: 80 }, 201)
    ).body.id;

    const tkd = async (nombre, academia, peso = 65) =>
      (
        await post(
          '/taekwondistas',
          {
            nombre,
            sexo: 'masculino',
            fecha_nacimiento: '2000-01-01',
            peso_kg: peso,
            id_academia: ids[`academia${academia}`],
            id_cinta: ids.cinta,
            id_dan: ids.dan,
            id_estado: ids.estado,
          },
          201,
        )
      ).body.id;
    const inscribir = async (nombre, academia, categoria = ids.categoria, peso = 65) => {
      ids[nombre] = await tkd(nombre, academia, peso);
      insc[nombre] = (
        await post('/inscripciones', { id_competencia: ids.competencia, id_categoria: categoria, id_taekwondista: ids[nombre] }, 201)
      ).body.id;
    };
    for (const [nombre, academia] of [['A1', 'A'], ['A2', 'A'], ['B1', 'B'], ['B2', 'B'], ['C1', 'C']]) await inscribir(nombre, academia);
    for (const nombre of ['X', 'Y', 'Z']) await inscribir(nombre, 'C', ids.categoria3, 75);
  });

  after(() => api.closePool());

  const base = () => ({ id_competencia: ids.competencia, id_categoria: ids.categoria });
  let llave;
  const combate = (ronda, posicion) => llave.combates.find((c) => c.numero_ronda === ronda && c.posicion === posicion);
  const recargar = async () => {
    llave = (await api.get(`/llaves/${llave.id}`, undefined, 200)).body;
  };

  test('sorteo: propone una llave de 8 con 3 byes, sin guardar nada', async () => {
    const res = await api.post('/llaves/sorteo', base(), 200);
    assert.equal(res.body.tamano, 8);
    assert.equal(res.body.slots.length, 8);
    assert.equal(res.body.slots.filter((s) => s === null).length, 3);
    assert.ok(res.body.slots.filter(Boolean).every((s) => s.taekwondista && s.academia));
    assert.equal((await api.get('/llaves', undefined, 200)).body.total, 0);
  });

  test('sorteo con separación por academia', async () => {
    const res = await api.post('/llaves/sorteo', { ...base(), separacion: 'academia' }, 200);
    assert.deepEqual(res.body.avisos, []);
    for (let k = 0; k < 8; k += 2) {
      const [a, b] = [res.body.slots[k], res.body.slots[k + 1]];
      if (a && b) assert.notEqual(a.academia, b.academia);
    }
  });

  test('confirmar valida los slots', async () => {
    const mal = await api.post('/llaves', { ...base(), slots: [insc.A1, null, insc.B1] });
    assert.equal(mal.status, 400);
    assert.match(mal.body.error, /8 posiciones/);
    const faltaUno = await api.post('/llaves', {
      ...base(),
      slots: [insc.A1, null, insc.B1, insc.C1, insc.B2, null, null, null],
    });
    assert.equal(faltaUno.status, 400);
  });

  test('confirmar crea los combates y resuelve los byes', async () => {
    // Cuartos: A1-bye, B1-C1, B2-bye, A2-bye
    const res = await api.post(
      '/llaves',
      { ...base(), tercer_puesto: true, slots: [insc.A1, null, insc.B1, insc.C1, insc.B2, null, insc.A2, null] },
      201,
    );
    llave = res.body;
    assert.equal(llave.combates.length, 8);
    assert.equal(llave.participantes, 5);
    assert.equal(llave.estado, 'pendiente');

    const bye = combate(1, 0);
    assert.equal(bye.estado, 'finalizado');
    assert.equal(bye.tipo_victoria, 'bye');
    assert.equal(bye.resuelto_automaticamente, true);
    assert.equal(bye.taekwondista_ganador, 'A1');

    assert.equal(combate(1, 1).estado, 'pendiente');
    assert.equal(combate(2, 0).taekwondista_rojo, 'A1');
    assert.equal(combate(2, 0).id_inscripcion_azul, null, 'espera al ganador de B1-C1');
    assert.equal(combate(2, 1).taekwondista_rojo, 'B2');
    assert.equal(combate(2, 1).taekwondista_azul, 'A2');
    assert.equal(combate(3, 0).ronda, 'Final');
    assert.equal(combate(3, 1).ronda, 'Tercer puesto');

    const dup = await api.post('/llaves', { ...base(), slots: [insc.A1, null, insc.B1, insc.C1, insc.B2, null, insc.A2, null] });
    assert.equal(dup.status, 409);
  });

  test('el listado de combates oculta los byes', async () => {
    const res = await api.get(`/combates?id_llave=${llave.id}`, undefined, 200);
    assert.equal(res.body.total, 5); // B1-C1, 2 semifinales, final y tercer puesto
  });

  test('reglas de edición de los combates de llave', async () => {
    const semi = combate(2, 0);
    const sinRival = await api.post(`/combates/${semi.id}/finalizar`, { ganador: 'rojo' });
    assert.equal(sinRival.status, 400);
    assert.match(sinRival.body.error, /dos competidores/);

    const cambiar = await api.patch(`/combates/${combate(2, 1).id}`, { id_inscripcion_rojo: insc.A1 });
    assert.equal(cambiar.status, 400);
    const finalizarPorPatch = await api.patch(`/combates/${combate(2, 1).id}`, { estado: 'finalizado' });
    assert.equal(finalizarPorPatch.status, 400);
    const puntos = await api.patch(`/combates/${combate(2, 1).id}`, { puntos_rojo: 2, estado: 'en_curso' }, 200);
    assert.equal(puntos.body.puntos_rojo, 2);

    assert.equal((await api.del(`/combates/${combate(1, 1).id}`)).status, 409);
    const iniciar = await api.patch(`/combates/${semi.id}`, { estado: 'en_curso' });
    assert.equal(iniciar.status, 400, 'no se inicia sin los dos competidores');
  });

  test('el ganador avanza y el perdedor de semifinal va al tercer puesto', async () => {
    await api.post(`/combates/${combate(1, 1).id}/finalizar`, { ganador: 'rojo' }, 200); // gana B1
    await recargar();
    assert.equal(combate(2, 0).taekwondista_azul, 'B1');
    assert.equal(llave.estado, 'en_curso');

    await api.post(`/combates/${combate(2, 1).id}/finalizar`, { ganador: 'azul', tipo_victoria: 'ko' }, 200); // gana A2
    await recargar();
    assert.equal(combate(3, 0).taekwondista_azul, 'A2');
    assert.equal(combate(3, 1).taekwondista_azul, 'B2');
    assert.equal(combate(2, 1).tipo_victoria, 'ko');
  });

  test('reabrir: se puede mientras el combate siguiente no empezó', async () => {
    await api.post(`/combates/${combate(1, 1).id}/reabrir`, undefined, 200);
    await recargar();
    assert.equal(combate(1, 1).estado, 'en_curso');
    assert.equal(combate(2, 0).id_inscripcion_azul, null);

    await api.post(`/combates/${combate(1, 1).id}/finalizar`, { ganador: 'azul' }, 200); // ahora gana C1
    await api.post(`/combates/${combate(2, 0).id}/finalizar`, { ganador: 'rojo' }, 200); // gana A1
    await recargar();
    assert.equal(combate(3, 0).taekwondista_rojo, 'A1');
    assert.equal(combate(3, 1).taekwondista_rojo, 'C1');

    await api.patch(`/combates/${combate(3, 0).id}`, { estado: 'en_curso' }, 200);
    const bloqueado = await api.post(`/combates/${combate(2, 0).id}/reabrir`);
    assert.equal(bloqueado.status, 409);
    assert.match(bloqueado.body.error, /final/);
    await recargar();
    assert.equal(combate(2, 0).estado, 'finalizado', 'la transacción se revirtió');

    assert.equal((await api.post(`/combates/${combate(1, 0).id}/reabrir`)).status, 400, 'un bye no se reabre');
    assert.equal((await api.del(`/llaves/${llave.id}`)).status, 409, 'no se elimina una llave con combates disputados');
  });

  test('retiro: W.O. automático y se deshace al reincorporarlo', async () => {
    await api.patch(`/inscripciones/${insc.C1}`, { retirado: true }, 200);
    await recargar();
    const tercero = combate(3, 1);
    assert.equal(tercero.estado, 'finalizado');
    assert.equal(tercero.tipo_victoria, 'wo');
    assert.equal(tercero.taekwondista_ganador, 'B2');

    await api.patch(`/inscripciones/${insc.C1}`, { retirado: false }, 200);
    await recargar();
    assert.equal(combate(3, 1).estado, 'pendiente');
    assert.equal(combate(3, 1).id_inscripcion_ganador, null);

    await api.patch(`/inscripciones/${insc.C1}`, { retirado: true }, 200);
  });

  test('podio y llave finalizada', async () => {
    await api.post(`/combates/${combate(3, 0).id}/finalizar`, { ganador: 'rojo' }, 200);
    await recargar();
    assert.equal(llave.estado, 'finalizada');
    assert.equal(llave.podio.oro.nombre, 'A1');
    assert.equal(llave.podio.plata.nombre, 'A2');
    assert.deepEqual(llave.podio.bronce.map((b) => b.nombre), ['B2']);

    const lista = await api.get(`/llaves?id_competencia=${ids.competencia}`, undefined, 200);
    assert.equal(lista.body.data[0].estado, 'finalizada');
  });

  test('reincorporar a quien perdió por W.O. no deshace un combate ya disputado', async () => {
    // Si se reincorpora a C1, el tercer puesto volvería a disputarse: se permite
    // porque nadie lo peleó (fue W.O.). Pero si alguien lo hubiera finalizado a
    // mano, no se tocaría.
    await api.patch(`/inscripciones/${insc.C1}`, { retirado: false }, 200);
    await recargar();
    assert.equal(combate(3, 1).estado, 'pendiente');
    await api.post(`/combates/${combate(3, 1).id}/finalizar`, { ganador: 'rojo' }, 200); // gana C1
    await api.patch(`/inscripciones/${insc.C1}`, { retirado: true }, 200);
    await recargar();
    assert.equal(combate(3, 1).taekwondista_ganador, 'C1', 'el resultado a mano se mantiene');
    assert.deepEqual(llave.podio.bronce.map((b) => b.nombre), ['C1']);
  });

  test('inscritos fuera de la llave', async () => {
    const nuevo = await api.post(
      '/taekwondistas',
      {
        nombre: 'Tardío', sexo: 'masculino', fecha_nacimiento: '2000-01-01', peso_kg: 65,
        id_academia: ids.academiaA, id_cinta: ids.cinta, id_estado: ids.estado,
      },
      201,
    );
    await api.post('/inscripciones', { ...base(), id_taekwondista: nuevo.body.id }, 201);
    await recargar();
    assert.deepEqual(llave.inscritos_fuera.map((i) => i.taekwondista), ['Tardío']);
  });

  test('llave de 3 con tercer puesto: el bronce va directo al perdedor de la única semifinal', async () => {
    const b3 = { id_competencia: ids.competencia, id_categoria: ids.categoria3 };
    const res = await api.post('/llaves', { ...b3, tercer_puesto: true, slots: [insc.X, null, insc.Y, insc.Z] }, 201);
    llave = res.body;
    assert.equal(combate(2, 0).taekwondista_rojo, 'X', 'X pasa directo a la final');
    await api.post(`/combates/${combate(1, 1).id}/finalizar`, { ganador: 'rojo' }, 200); // gana Y
    await recargar();
    const tercero = combate(2, 1);
    assert.equal(tercero.estado, 'finalizado');
    assert.equal(tercero.tipo_victoria, 'bye');
    assert.equal(tercero.taekwondista_ganador, 'Z');
    await api.post(`/combates/${combate(2, 0).id}/finalizar`, { ganador: 'azul' }, 200); // gana Y
    await recargar();
    assert.deepEqual(
      [llave.podio.oro.nombre, llave.podio.plata.nombre, llave.podio.bronce.map((b) => b.nombre)],
      ['Y', 'X', ['Z']],
    );
  });

  test('eliminar una llave sin combates disputados y volver a generarla', async () => {
    const otra = await api.post(
      '/categorias',
      { nombre: 'Libre', edad_minima: 0, edad_maxima: 99, peso_minimo_kg: 0, peso_maximo_kg: 200 },
      201,
    );
    const b = { id_competencia: ids.competencia, id_categoria: otra.body.id };
    const nuevos = [];
    for (const nombre of ['N1', 'N2']) {
      const t = await api.post(
        '/taekwondistas',
        { nombre, sexo: 'femenino', fecha_nacimiento: '2001-02-02', peso_kg: 60, id_academia: ids.academiaB, id_cinta: ids.cinta, id_estado: ids.estado },
        201,
      );
      nuevos.push((await api.post('/inscripciones', { ...b, id_taekwondista: t.body.id }, 201)).body.id);
    }
    const creada = await api.post('/llaves', { ...b, slots: nuevos }, 201);
    assert.deepEqual(creada.body.combates.map((c) => c.ronda), ['Final'], 'llave de 2: solo la final');
    await api.del(`/llaves/${creada.body.id}`, undefined, 204);
    assert.equal((await api.get(`/llaves/${creada.body.id}`)).status, 404);
    await api.post('/llaves', { ...b, slots: [...nuevos].reverse() }, 201);
  });
});

describe('tul', { skip }, () => {
  let api;
  const ids = {};

  before(async () => {
    api = await prepararApi();
    const { get, post } = api;
    ids.competencia = (await post('/competencias', { nombre: 'Copa Tul', fecha: '2026-11-15', lugar: 'Mérida' }, 201)).body.id;
    ids.academia = (await post('/academias', { nombre: 'Academia T' }, 201)).body.id;
    ids.cinta = (await get('/cintas?q=Negra')).body.data.find((c) => c.nombre === 'Negra').id;
    ids.estado = (await get('/estados?q=Mérida')).body.data[0].id;
    const tules = (await get('/tules')).body.data;
    ids.tules = tules;
    const categoria = async (nombre, extra) =>
      (
        await post(
          '/categorias',
          { nombre, modalidad: 'tul', edad_minima: 0, edad_maxima: 99, id_tul_desde: tules[9].id, id_tul_hasta: tules[11].id, ...extra },
          201,
        )
      ).body.id;
    ids.sorteo = await categoria('Tul sorteo', {});
    ids.manual = await categoria('Tul manual', { eleccion_tul: 'manual', tules_por_encuentro: 2, jueces: 5 });

    const llave = async (idCategoria, nombres) => {
      const inscripciones = [];
      for (const nombre of nombres) {
        const t = await post(
          '/taekwondistas',
          { nombre, sexo: 'femenino', fecha_nacimiento: '2005-03-03', peso_kg: 50, id_academia: ids.academia, id_cinta: ids.cinta, id_estado: ids.estado },
          201,
        );
        inscripciones.push(
          (await post('/inscripciones', { id_competencia: ids.competencia, id_categoria: idCategoria, id_taekwondista: t.body.id }, 201)).body.id,
        );
      }
      return (await post('/llaves', { id_competencia: ids.competencia, id_categoria: idCategoria, slots: inscripciones }, 201)).body;
    };
    ids.encuentroSorteo = (await llave(ids.sorteo, ['Rosa', 'Alba'])).combates[0];
    ids.encuentroManual = (await llave(ids.manual, ['Sol', 'Luna'])).combates[0];
  });

  after(() => api.closePool());

  test('el encuentro trae la configuración de la categoría', () => {
    const c = ids.encuentroSorteo;
    assert.equal(c.modalidad, 'tul');
    assert.equal(c.jueces, 3);
    assert.equal(c.eleccion_tul, 'sorteo');
    assert.deepEqual(c.tules, []);
  });

  test('no se vota sin tul definido', async () => {
    const res = await api.post(`/combates/${ids.encuentroSorteo.id}/votos`, { votos: ['rojo', 'rojo', 'azul'] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /define el tul/);
  });

  test('sorteo de tul dentro del rango', async () => {
    const res = await api.post(`/combates/${ids.encuentroSorteo.id}/tules/sorteo`, undefined, 200);
    assert.equal(res.body.tules.length, 1);
    assert.ok(['Kwang-Gae', 'Po-Eun', 'Ge-Baek'].includes(res.body.tules[0].nombre));
    assert.equal(res.body.estado, 'en_curso');
    const manual = await api.put(`/combates/${ids.encuentroSorteo.id}/tules`, { tules: [ids.tules[9].id] });
    assert.equal(manual.status, 400, 'esta categoría sortea');
  });

  test('votos: cantidad de jueces y mayoría', async () => {
    const pocos = await api.post(`/combates/${ids.encuentroSorteo.id}/votos`, { votos: ['rojo', 'azul'] });
    assert.equal(pocos.status, 400);
    assert.match(pocos.body.error, /3 jueces/);

    const res = await api.post(`/combates/${ids.encuentroSorteo.id}/votos`, { votos: ['azul', 'rojo', 'azul'] }, 200);
    assert.equal(res.body.estado, 'finalizado');
    assert.equal(res.body.tipo_victoria, 'votos');
    assert.equal(res.body.taekwondista_ganador, 'Alba');
    assert.deepEqual(res.body.votos, ['azul', 'rojo', 'azul']);
  });

  test('reabrir borra los votos y conserva el tul', async () => {
    const res = await api.post(`/combates/${ids.encuentroSorteo.id}/reabrir`, undefined, 200);
    assert.deepEqual(res.body.votos, []);
    assert.equal(res.body.tules.length, 1);
    assert.equal(res.body.estado, 'en_curso');
  });

  test('en tul no se finaliza por puntos, sí por W.O.', async () => {
    const puntos = await api.post(`/combates/${ids.encuentroSorteo.id}/finalizar`, { ganador: 'rojo', tipo_victoria: 'puntos' });
    assert.equal(puntos.status, 400);
    const wo = await api.post(`/combates/${ids.encuentroSorteo.id}/finalizar`, { ganador: 'rojo', tipo_victoria: 'wo' }, 200);
    assert.equal(wo.body.taekwondista_ganador, 'Rosa');
  });

  test('elección manual: cantidad, rango y sin repetir', async () => {
    const id = ids.encuentroManual.id;
    const t = ids.tules;
    assert.equal((await api.post(`/combates/${id}/tules/sorteo`)).status, 400, 'esta categoría no sortea');
    assert.match((await api.put(`/combates/${id}/tules`, { tules: [t[9].id] })).body.error, /2 tul/);
    assert.match((await api.put(`/combates/${id}/tules`, { tules: [t[9].id, t[9].id] })).body.error, /repetir/);
    assert.match((await api.put(`/combates/${id}/tules`, { tules: [t[9].id, t[0].id] })).body.error, /fuera del rango/);
    const ok = await api.put(`/combates/${id}/tules`, { tules: [t[11].id, t[10].id] }, 200);
    assert.deepEqual(ok.body.tules.map((x) => x.nombre), ['Ge-Baek', 'Po-Eun']);
    const res = await api.post(`/combates/${id}/votos`, { votos: ['rojo', 'rojo', 'azul', 'rojo', 'azul'] }, 200);
    assert.equal(res.body.taekwondista_ganador, 'Sol');
  });
});
