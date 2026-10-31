import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararApi, skip } from './helpers.js';

describe('inscripciones', { skip }, () => {
  let api;
  const ids = {};

  before(async () => {
    api = await prepararApi();
    const { get, post } = api;
    const cinta = async (nombre) => (await get(`/cintas?q=${nombre}`)).body.data.find((c) => c.nombre === nombre).id;
    const estado = async (q) => (await get(`/estados?q=${q}`)).body.data[0].id;
    ids.competencia = (await post('/competencias', { nombre: 'Open', fecha: '2026-11-15', lugar: 'Caracas' }, 201)).body.id;
    ids.academia = (await post('/academias', { nombre: 'Academia A' }, 201)).body.id;
    ids.negra = await cinta('Negra');
    ids.verde = await cinta('Verde');
    ids.zulia = await estado('zulia');
    ids.dan1 = (await get('/danes?q=1er')).body.data[0].id;
    ids.matsogi = (
      await post(
        '/categorias',
        { nombre: 'Juvenil -60 F', sexo: 'femenino', edad_minima: 14, edad_maxima: 17, peso_minimo_kg: 50, peso_maximo_kg: 60 },
        201,
      )
    ).body.id;
    ids.matsogi2 = (
      await post(
        '/categorias',
        { nombre: 'Juvenil -70 F', sexo: 'femenino', edad_minima: 14, edad_maxima: 17, peso_minimo_kg: 60, peso_maximo_kg: 70 },
        201,
      )
    ).body.id;
    const tules = (await get('/tules')).body.data;
    ids.tul = (
      await post(
        '/categorias',
        {
          nombre: 'Tul 1er Dan',
          modalidad: 'tul',
          edad_minima: 14,
          edad_maxima: 17,
          id_dan_minimo: ids.dan1,
          id_dan_maximo: ids.dan1,
          id_tul_desde: tules[9].id,
          id_tul_hasta: tules[11].id,
        },
        201,
      )
    ).body.id;

    const tkd = async (nombre, extra = {}) =>
      (
        await post(
          '/taekwondistas',
          {
            nombre,
            sexo: 'femenino',
            fecha_nacimiento: '2010-05-20',
            peso_kg: 55,
            id_academia: ids.academia,
            id_cinta: ids.negra,
            id_dan: ids.dan1,
            id_estado: ids.zulia,
            ...extra,
          },
          201,
        )
      ).body.id;
    ids.ana = await tkd('Ana');
    ids.bea = await tkd('Bea');
    ids.pesada = await tkd('Pesada', { peso_kg: 75 });
    ids.chico = await tkd('Chico', { sexo: 'masculino' });
    ids.verdeTkd = await tkd('Verde', { id_cinta: ids.verde, id_dan: '' });
  });

  after(() => api.closePool());

  const inscripcion = (extra) => ({ id_competencia: ids.competencia, id_categoria: ids.matsogi, ...extra });

  test('inscribe y devuelve los datos relacionados', async () => {
    const res = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.ana }), 201);
    assert.equal(res.body.taekwondista, 'Ana');
    assert.equal(res.body.modalidad, 'matsogi');
    assert.equal(res.body.peso_efectivo_kg, 55);
    assert.equal(res.body.retirado, false);
    ids.inscAna = res.body.id;

    const dup = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.ana }));
    assert.equal(dup.status, 409);
  });

  test('rechaza a quien no cumple la categoría, salvo «fuera de categoría»', async () => {
    const pesada = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.pesada }));
    assert.equal(pesada.status, 400);
    assert.equal(pesada.body.details[0].field, 'id_categoria');
    assert.match(pesada.body.details[0].message, /Pesa 75 kg/);

    const conPesaje = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.pesada, peso_kg: 58 }));
    assert.equal(conPesaje.status, 201, 'el peso del pesaje manda');
    assert.equal(conPesaje.body.peso_efectivo_kg, 58);

    const chico = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.chico }));
    assert.match(chico.body.details[0].message, /femenina/);

    const forzado = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.chico, fuera_de_categoria: true }));
    assert.equal(forzado.status, 201);
  });

  test('una categoría por modalidad y competencia', async () => {
    const otra = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.ana, id_categoria: ids.matsogi2 }));
    assert.equal(otra.status, 400);
    assert.match(otra.body.details[0].message, /Juvenil -60 F/);

    // Pero sí puede inscribirse también en tul.
    await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.ana, id_categoria: ids.tul }), 201);
  });

  test('tul: exige el grado de la categoría y no mira el peso', async () => {
    const sinDan = await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.verdeTkd, id_categoria: ids.tul }));
    assert.match(sinDan.body.details[0].message, /no tiene dan/);
    await api.post('/inscripciones', inscripcion({ id_taekwondista: ids.pesada, id_categoria: ids.tul }), 201);
  });

  test('retirar no vuelve a validar la categoría', async () => {
    await api.patch(`/categorias/${ids.matsogi}`, { edad_maxima: 15 }, 200);
    const res = await api.patch(`/inscripciones/${ids.inscAna}`, { retirado: true }, 200);
    assert.equal(res.body.retirado, true);
    await api.patch(`/categorias/${ids.matsogi}`, { edad_maxima: 17 }, 200);
    await api.patch(`/inscripciones/${ids.inscAna}`, { retirado: false }, 200);
  });

  test('candidatos: indica quién cumple y quién ya está inscrito', async () => {
    const res = await api.get(`/inscripciones/candidatos?id_competencia=${ids.competencia}&id_categoria=${ids.matsogi}`, undefined, 200);
    const por = Object.fromEntries(res.body.data.map((c) => [c.nombre, c]));
    assert.equal(por.Ana.inscrito, true);
    assert.deepEqual(por.Bea.motivos, []);
    assert.equal(por.Bea.inscrito, false);
    assert.match(por.Pesada.motivos[0], /Pesa 75/);
    assert.match(por.Chico.motivos[0], /femenina/);
  });

  test('inscripción múltiple: todo o nada', async () => {
    const mal = await api.post('/inscripciones/lote', {
      id_competencia: ids.competencia,
      id_categoria: ids.matsogi,
      taekwondistas: [ids.bea, ids.chico],
    });
    assert.equal(mal.status, 400);
    assert.deepEqual(mal.body.details, [{ field: String(ids.chico), message: 'Ya está inscrito en esta categoría' }]);
    const lista = await api.get(`/inscripciones?id_categoria=${ids.matsogi}&id_taekwondista=${ids.bea}`, undefined, 200);
    assert.equal(lista.body.total, 0, 'no inscribió a nadie');

    const ok = await api.post(
      '/inscripciones/lote',
      { id_competencia: ids.competencia, id_categoria: ids.matsogi, taekwondistas: [ids.bea] },
      201,
    );
    assert.equal(ok.body.inscritos, 1);
  });

  test('no se cambia la modalidad de una categoría con inscripciones', async () => {
    const tules = (await api.get('/tules')).body.data;
    const res = await api.patch(`/categorias/${ids.matsogi}`, {
      modalidad: 'tul',
      id_tul_desde: tules[0].id,
      id_tul_hasta: tules[1].id,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].field, 'modalidad');
  });

  test('filtros', async () => {
    const res = await api.get(`/inscripciones?id_competencia=${ids.competencia}&id_categoria=${ids.matsogi}&retirado=false`, undefined, 200);
    assert.deepEqual(res.body.data.map((i) => i.taekwondista).sort(), ['Ana', 'Bea', 'Chico', 'Pesada']);
  });
});
