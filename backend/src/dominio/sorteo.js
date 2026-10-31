// Sorteo y estructura de llaves de eliminación simple. Funciones puras.
//
// Una llave de N participantes se arma con S posiciones, S = siguiente
// potencia de 2. Las S − N posiciones sobrantes son byes (pase directo) y
// siempre quedan enfrentadas a un participante real.

export const siguientePotenciaDe2 = (n) => {
  let s = 1;
  while (s < n) s *= 2;
  return s;
};

/**
 * Orden estándar de siembra: para cada posición de la llave, su número de
 * siembra (1 = primero). Con S = 8: [1, 8, 4, 5, 2, 7, 3, 6]. Garantiza que
 * las siembras más altas se crucen lo más tarde posible.
 *
 * No usamos cabezas de serie, pero este orden sirve para ubicar los byes: las
 * siembras mayores que N son byes y quedan repartidas en las dos mitades de
 * la llave, en lugar de amontonarse de un lado.
 */
export function ordenSiembra(s) {
  let orden = [1];
  while (orden.length < s) {
    const n = orden.length * 2;
    orden = orden.flatMap((x) => [x, n + 1 - x]);
  }
  return orden;
}

// Ronda (1 = primera) en la que se cruzarían dos posiciones de la llave.
export const rondaDeCruce = (a, b) => Math.floor(Math.log2(a ^ b)) + 1;

const mezclar = (lista, random) => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

/**
 * Sortea la ubicación de los participantes en la llave.
 *
 * participantes: [{ id, grupo }]. `grupo` es la academia o el estado cuando se
 *   pide separación (null = sin grupo).
 * separar: si es true, los del mismo grupo se ubican para cruzarse lo más
 *   tarde posible. Es una búsqueda local: no siempre es posible evitar todos
 *   los cruces en primera ronda (p. ej. si casi todos son de la misma academia).
 * random: función tipo Math.random (inyectable para tests).
 *
 * Devuelve { slots, avisos }: slots es un array de S ids o null (bye), en el
 * orden de la llave (posiciones 2k y 2k+1 se enfrentan en primera ronda);
 * avisos son los cruces de primera ronda entre participantes del mismo grupo.
 */
export function sortear(participantes, { separar = false, random = Math.random } = {}) {
  const n = participantes.length;
  if (n < 2) throw new Error('Se necesitan al menos 2 participantes');
  const s = siguientePotenciaDe2(n);
  const orden = ordenSiembra(s);
  const reales = orden.map((siembra, pos) => (siembra <= n ? pos : -1)).filter((pos) => pos >= 0);
  const rondas = Math.log2(s);

  // Penalización de un par del mismo grupo según cuándo se cruzan: cruzarse en
  // primera ronda pesa mucho más que hacerlo en semifinal.
  const peso = (a, b) => 4 ** (rondas - rondaDeCruce(a, b));

  let mejor = null;
  const intentos = separar ? 8 : 1;
  for (let intento = 0; intento < intentos; intento++) {
    // posicion[i] = posición en la llave del participante i
    const posicion = mezclar(reales, random);
    if (separar) mejorarSeparacion(participantes, posicion, peso);
    const costo = separar ? costoTotal(participantes, posicion, peso) : 0;
    if (!mejor || costo < mejor.costo) mejor = { posicion, costo };
    if (costo === 0) break;
  }

  const slots = Array(s).fill(null);
  mejor.posicion.forEach((pos, i) => {
    slots[pos] = participantes[i].id;
  });

  const grupoDe = new Map(participantes.map((p) => [p.id, p.grupo]));
  const avisos = [];
  for (let k = 0; k < s; k += 2) {
    const [a, b] = [slots[k], slots[k + 1]];
    if (a != null && b != null && grupoDe.get(a) != null && grupoDe.get(a) === grupoDe.get(b)) avisos.push([a, b]);
  }
  return { slots, avisos };
}

function costoTotal(participantes, posicion, peso) {
  let costo = 0;
  for (let i = 0; i < participantes.length; i++)
    for (let j = i + 1; j < participantes.length; j++)
      if (participantes[i].grupo != null && participantes[i].grupo === participantes[j].grupo)
        costo += peso(posicion[i], posicion[j]);
  return costo;
}

// Costo de los pares que involucran al participante i si estuviera en `pos`.
function costoDe(participantes, posicion, peso, i, pos, ignorar) {
  const grupo = participantes[i].grupo;
  if (grupo == null) return 0;
  let costo = 0;
  for (let j = 0; j < participantes.length; j++)
    if (j !== i && j !== ignorar && participantes[j].grupo === grupo) costo += peso(pos, posicion[j]);
  return costo;
}

// Intercambia pares de participantes mientras alguno reduzca el costo.
function mejorarSeparacion(participantes, posicion, peso) {
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 0; i < participantes.length; i++) {
      for (let j = i + 1; j < participantes.length; j++) {
        if (participantes[i].grupo === participantes[j].grupo) continue;
        const antes =
          costoDe(participantes, posicion, peso, i, posicion[i], j) +
          costoDe(participantes, posicion, peso, j, posicion[j], i);
        const despues =
          costoDe(participantes, posicion, peso, i, posicion[j], j) +
          costoDe(participantes, posicion, peso, j, posicion[i], i);
        if (despues < antes) {
          [posicion[i], posicion[j]] = [posicion[j], posicion[i]];
          mejoro = true;
        }
      }
    }
  }
}

/**
 * Valida un arreglo de slots enviado para confirmar una llave (puede haber
 * sido modificado a mano). Devuelve un mensaje de error o null.
 */
export function validarSlots(slots, idsInscritos) {
  if (!Array.isArray(slots)) return 'La llave no tiene el formato esperado';
  const esperado = siguientePotenciaDe2(idsInscritos.length);
  if (slots.length !== esperado) return `La llave debe tener ${esperado} posiciones`;
  const presentes = slots.filter((x) => x != null);
  if (new Set(presentes).size !== presentes.length) return 'Hay un participante repetido en la llave';
  const inscritos = new Set(idsInscritos);
  if (presentes.length !== inscritos.size || presentes.some((x) => !inscritos.has(x)))
    return 'Los participantes de la llave no coinciden con los inscritos activos de la categoría';
  for (let k = 0; k < slots.length; k += 2)
    if (slots[k] == null && slots[k + 1] == null) return 'Hay un combate de primera ronda sin competidores';
  return null;
}

export function nombreRonda(numeroRonda, totalRondas) {
  const nombres = ['Final', 'Semifinal', 'Cuartos', 'Octavos', 'Dieciseisavos'];
  return nombres[totalRondas - numeroRonda] ?? `Ronda ${numeroRonda}`;
}

/**
 * Estructura de combates de la llave a partir de los slots.
 * Cada combate: { clave, numero_ronda, posicion, ronda, rojo, azul,
 *   ganador_va_a, esquina_ganador, perdedor_va_a, esquina_perdedor }
 * donde las referencias son claves "ronda-posicion". El combate por el
 * tercer puesto va en la última ronda con posición 1 (la final es la 0).
 */
export function estructuraLlave(slots, { tercerPuesto = true } = {}) {
  const totalRondas = Math.log2(slots.length);
  const clave = (r, p) => `${r}-${p}`;
  const conTercerPuesto = tercerPuesto && totalRondas >= 2;
  const combates = [];

  for (let r = 1; r <= totalRondas; r++) {
    const cantidad = slots.length / 2 ** r;
    for (let p = 0; p < cantidad; p++) {
      const esSemifinal = r === totalRondas - 1;
      combates.push({
        clave: clave(r, p),
        numero_ronda: r,
        posicion: p,
        ronda: nombreRonda(r, totalRondas),
        rojo: r === 1 ? slots[2 * p] : null,
        azul: r === 1 ? slots[2 * p + 1] : null,
        ganador_va_a: r < totalRondas ? clave(r + 1, Math.floor(p / 2)) : null,
        esquina_ganador: r < totalRondas ? (p % 2 === 0 ? 'rojo' : 'azul') : null,
        perdedor_va_a: conTercerPuesto && esSemifinal ? clave(totalRondas, 1) : null,
        esquina_perdedor: conTercerPuesto && esSemifinal ? (p === 0 ? 'rojo' : 'azul') : null,
      });
    }
  }
  if (conTercerPuesto) {
    combates.push({
      clave: clave(totalRondas, 1),
      numero_ronda: totalRondas,
      posicion: 1,
      ronda: 'Tercer puesto',
      rojo: null,
      azul: null,
      ganador_va_a: null,
      esquina_ganador: null,
      perdedor_va_a: null,
      esquina_perdedor: null,
    });
  }
  return combates;
}
