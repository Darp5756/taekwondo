import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { edadEn, motivosNoElegible } from '../src/dominio/elegibilidad.js';

describe('edadEn', () => {
  test('cuenta los años cumplidos a la fecha', () => {
    assert.equal(edadEn('2010-05-20', '2026-05-19'), 15);
    assert.equal(edadEn('2010-05-20', '2026-05-20'), 16);
    assert.equal(edadEn('2010-12-31', '2026-01-01'), 15);
  });
});

describe('motivosNoElegible', () => {
  const categoria = {
    sexo: 'femenino',
    modalidad: 'matsogi',
    edad_minima: 14,
    edad_maxima: 17,
    peso_minimo_kg: 50,
    peso_maximo_kg: 60,
    cinta_minima_orden: null,
    cinta_maxima_orden: null,
    dan_minimo_numero: null,
    dan_maximo_numero: null,
  };
  const taekwondista = { sexo: 'femenino', fecha_nacimiento: '2010-05-20', peso_kg: 55, cinta_orden: 11, dan_numero: 1 };
  const motivos = (c = {}, t = {}, pesoKg = null) =>
    motivosNoElegible({
      categoria: { ...categoria, ...c },
      taekwondista: { ...taekwondista, ...t },
      fechaCompetencia: '2026-11-15',
      pesoKg,
    });

  test('cumple', () => assert.deepEqual(motivos(), []));

  test('sexo', () => {
    assert.match(motivos({}, { sexo: 'masculino' })[0], /femenina/);
    assert.match(motivos({}, { sexo: null })[0], /sexo registrado/);
    assert.deepEqual(motivos({ sexo: 'mixto' }, { sexo: 'masculino' }), []);
  });

  test('edad a la fecha de la competencia', () => {
    assert.match(motivos({ edad_maxima: 15 })[0], /Tiene 16 años/);
  });

  test('peso: el del pesaje tiene prioridad', () => {
    assert.match(motivos({}, { peso_kg: 62 })[0], /Pesa 62 kg/);
    assert.deepEqual(motivos({}, { peso_kg: 62 }, 59), []);
    assert.match(motivos({}, {}, 49)[0], /Pesa 49 kg/);
  });

  test('en tul no cuenta el peso', () => {
    assert.deepEqual(motivos({ modalidad: 'tul', peso_minimo_kg: null, peso_maximo_kg: null }, { peso_kg: 90 }), []);
  });

  test('grado: cinta y dan', () => {
    assert.match(motivos({ cinta_minima_orden: 1, cinta_maxima_orden: 10 })[0], /cinta/);
    assert.deepEqual(motivos({ dan_minimo_numero: 1, dan_maximo_numero: 1 }), []);
    assert.match(motivos({ dan_minimo_numero: 2 })[0], /dan está fuera/);
    assert.match(motivos({ dan_minimo_numero: 1 }, { dan_numero: null })[0], /no tiene dan/);
  });

  test('acumula varios motivos', () => {
    assert.equal(motivos({}, { sexo: 'masculino', peso_kg: 80 }).length, 2);
  });
});
