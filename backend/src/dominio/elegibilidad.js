// Reglas para decidir si un taekwondista puede competir en una categoría.
// Funciones puras: reciben los datos ya cargados.

// Edad cumplida en una fecha. Ambas en formato 'AAAA-MM-DD'.
export function edadEn(fechaNacimiento, fecha) {
  const [y1, m1, d1] = fechaNacimiento.split('-').map(Number);
  const [y2, m2, d2] = fecha.split('-').map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

const fueraDeRango = (valor, min, max) => (min != null && valor < min) || (max != null && valor > max);

/**
 * Devuelve la lista de motivos por los que el taekwondista NO cumple la
 * categoría (vacía si la cumple).
 *
 * categoria:    { sexo, modalidad, edad_minima, edad_maxima, peso_minimo_kg, peso_maximo_kg,
 *                 cinta_minima_orden, cinta_maxima_orden, dan_minimo_numero, dan_maximo_numero }
 * taekwondista: { sexo, fecha_nacimiento, peso_kg, cinta_orden, dan_numero }
 * pesoKg:       peso del pesaje; si es null se usa el del taekwondista.
 */
export function motivosNoElegible({ categoria: c, taekwondista: t, fechaCompetencia, pesoKg = null }) {
  const motivos = [];

  if (c.sexo !== 'mixto') {
    if (!t.sexo) motivos.push('No tiene el sexo registrado');
    else if (t.sexo !== c.sexo) motivos.push(`La categoría es ${c.sexo === 'femenino' ? 'femenina' : 'masculina'}`);
  }

  const edad = edadEn(t.fecha_nacimiento, fechaCompetencia);
  if (fueraDeRango(edad, c.edad_minima, c.edad_maxima))
    motivos.push(`Tiene ${edad} años el día de la competencia (categoría: ${c.edad_minima} a ${c.edad_maxima})`);

  if (c.modalidad === 'matsogi') {
    const peso = pesoKg ?? t.peso_kg;
    if (fueraDeRango(peso, c.peso_minimo_kg, c.peso_maximo_kg))
      motivos.push(`Pesa ${peso} kg (categoría: ${c.peso_minimo_kg} a ${c.peso_maximo_kg} kg)`);
  }

  if (fueraDeRango(t.cinta_orden, c.cinta_minima_orden, c.cinta_maxima_orden))
    motivos.push('Su cinta está fuera del rango de la categoría');

  if (c.dan_minimo_numero != null || c.dan_maximo_numero != null) {
    if (t.dan_numero == null) motivos.push('La categoría exige dan y no tiene dan registrado');
    else if (fueraDeRango(t.dan_numero, c.dan_minimo_numero, c.dan_maximo_numero))
      motivos.push('Su dan está fuera del rango de la categoría');
  }

  return motivos;
}
