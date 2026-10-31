import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  estructuraLlave,
  nombreRonda,
  ordenSiembra,
  rondaDeCruce,
  siguientePotenciaDe2,
  sortear,
  validarSlots,
} from '../src/dominio/sorteo.js';

// Generador pseudoaleatorio con semilla, para que los tests sean reproducibles.
function semilla(seed) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return x / 2 ** 31;
  };
}

const participantes = (n, grupo = () => null) => Array.from({ length: n }, (_, i) => ({ id: i + 1, grupo: grupo(i) }));
const primeraRonda = (slots) => Array.from({ length: slots.length / 2 }, (_, k) => [slots[2 * k], slots[2 * k + 1]]);

describe('sorteo', () => {
  test('potencias de 2 y orden de siembra', () => {
    assert.deepEqual([2, 3, 5, 8, 9].map(siguientePotenciaDe2), [2, 4, 8, 8, 16]);
    assert.deepEqual(ordenSiembra(8), [1, 8, 4, 5, 2, 7, 3, 6]);
    assert.equal(rondaDeCruce(0, 1), 1);
    assert.equal(rondaDeCruce(0, 3), 2);
    assert.equal(rondaDeCruce(0, 7), 3);
  });

  test('byes: cantidad correcta, nunca dos juntos, repartidos entre mitades', () => {
    for (let n = 2; n <= 33; n++) {
      const { slots } = sortear(participantes(n), { random: semilla(n) });
      const s = siguientePotenciaDe2(n);
      assert.equal(slots.length, s);
      assert.equal(slots.filter((x) => x === null).length, s - n);
      assert.ok(primeraRonda(slots).every(([a, b]) => a !== null || b !== null), `n=${n}: dos byes juntos`);
      assert.deepEqual(slots.filter(Boolean).sort((a, b) => a - b), participantes(n).map((p) => p.id));
      const byesMitad = (desde) => slots.slice(desde, desde + s / 2).filter((x) => x === null).length;
      assert.ok(Math.abs(byesMitad(0) - byesMitad(s / 2)) <= 1, `n=${n}: byes desbalanceados`);
    }
  });

  test('5 participantes: 3 byes y un solo combate real en primera ronda', () => {
    const { slots } = sortear(participantes(5), { random: semilla(1) });
    const reales = primeraRonda(slots).filter(([a, b]) => a !== null && b !== null);
    assert.equal(reales.length, 1);
  });

  test('separación: evita cruces de primera ronda entre compañeros cuando es posible', () => {
    // 8 participantes de 4 academias (2 por academia): se puede evitar siempre.
    for (let seed = 1; seed <= 20; seed++) {
      const { slots, avisos } = sortear(participantes(8, (i) => i % 4), { separar: true, random: semilla(seed) });
      assert.deepEqual(avisos, []);
      // Y además los compañeros quedan en mitades opuestas (se cruzarían recién en la final).
      const pos = (id) => slots.indexOf(id);
      for (let g = 0; g < 4; g++) {
        const [a, b] = participantes(8, (i) => i % 4).filter((p) => p.grupo === g);
        assert.equal(rondaDeCruce(pos(a.id), pos(b.id)), 3, `seed ${seed}: academia ${g}`);
      }
    }
  });

  test('separación: avisa de los cruces imposibles de evitar', () => {
    // 5 de 6 son de la misma academia: al menos un cruce entre ellos en primera ronda.
    const { avisos } = sortear(participantes(6, (i) => (i < 5 ? 'A' : 'B')), { separar: true, random: semilla(3) });
    assert.ok(avisos.length >= 1);
  });

  test('validarSlots', () => {
    assert.equal(validarSlots([1, 2, 3, null], [1, 2, 3]), null);
    assert.match(validarSlots([1, 2, 3], [1, 2, 3]), /4 posiciones/);
    assert.match(validarSlots([1, 1, 3, null], [1, 2, 3]), /repetido/);
    assert.match(validarSlots([1, 2, 4, null], [1, 2, 3]), /no coinciden/);
    assert.match(validarSlots([1, 2, null, null, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]), /sin competidores/);
  });

  test('nombres de ronda', () => {
    assert.deepEqual([1, 2, 3, 4].map((r) => nombreRonda(r, 4)), ['Octavos', 'Cuartos', 'Semifinal', 'Final']);
    assert.equal(nombreRonda(1, 6), 'Ronda 1');
  });

  test('estructura con tercer puesto', () => {
    const combates = estructuraLlave([1, 2, 3, 4, 5, 6, 7, null], { tercerPuesto: true });
    assert.equal(combates.length, 8); // 4 + 2 + final + tercer puesto
    const por = Object.fromEntries(combates.map((c) => [c.clave, c]));
    assert.deepEqual([por['1-0'].rojo, por['1-0'].azul], [1, 2]);
    assert.deepEqual([por['1-3'].ganador_va_a, por['1-3'].esquina_ganador], ['2-1', 'azul']);
    assert.deepEqual([por['2-0'].perdedor_va_a, por['2-0'].esquina_perdedor], ['3-1', 'rojo']);
    assert.deepEqual([por['2-1'].perdedor_va_a, por['2-1'].esquina_perdedor], ['3-1', 'azul']);
    assert.equal(por['3-1'].ronda, 'Tercer puesto');
    assert.equal(por['3-0'].ronda, 'Final');
  });

  test('estructura sin tercer puesto y llave de 2', () => {
    assert.equal(estructuraLlave([1, 2, 3, 4], { tercerPuesto: false }).length, 3);
    const dos = estructuraLlave([1, 2], { tercerPuesto: true });
    assert.deepEqual(dos.map((c) => c.ronda), ['Final']);
  });
});
