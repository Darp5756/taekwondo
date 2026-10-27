import { date, id, nonNegativeSmallInt, optionalId, smallInt, smallUInt, text, z } from './lib/validation.js';

// Definición de las tablas que exponen un CRUD genérico en /api/<path>.
export const resources = [
  {
    path: 'academias',
    table: 'academias',
    fields: z.object({ nombre: text(100) }),
    search: ['t.nombre'],
    orderBy: 't.nombre',
  },
  {
    path: 'categorias',
    table: 'categorias',
    fields: z.object({
      nombre: text(50),
      edad_minima: smallUInt,
      edad_maxima: smallUInt,
      peso_minimo_kg: smallUInt,
      peso_maximo_kg: smallUInt,
    }),
    check: (d) => {
      if (d.edad_minima > d.edad_maxima) return 'La edad mínima no puede ser mayor que la máxima';
      if (d.peso_minimo_kg > d.peso_maximo_kg) return 'El peso mínimo no puede ser mayor que el máximo';
      return null;
    },
    search: ['t.nombre'],
    orderBy: 't.edad_minima, t.peso_minimo_kg, t.nombre',
  },
  {
    path: 'cintas',
    table: 'cintas',
    fields: z.object({ nombre: text(30), orden: smallUInt }),
    search: ['t.nombre'],
    orderBy: 't.orden',
  },
  {
    path: 'danes',
    table: 'danes',
    fields: z.object({ nombre: text(20), numero: smallUInt }),
    search: ['t.nombre'],
    orderBy: 't.numero',
  },
  {
    path: 'competencias',
    table: 'competencias',
    fields: z.object({ nombre: text(100), fecha: date, lugar: text(150) }),
    search: ['t.nombre', 't.lugar'],
    orderBy: 't.fecha DESC, t.nombre',
  },
  {
    path: 'taekwondistas',
    table: 'taekwondistas',
    fields: z.object({
      id_academia: id,
      id_categoria: id,
      id_cinta: id,
      id_dan: optionalId,
      nombre: text(150),
      fecha_nacimiento: date,
      peso_kg: smallUInt,
    }),
    check: (d) =>
      d.fecha_nacimiento > new Date().toISOString().slice(0, 10)
        ? 'La fecha de nacimiento no puede ser futura'
        : null,
    select: `
      SELECT t.*, a.nombre AS academia, c.nombre AS categoria, ci.nombre AS cinta, d.nombre AS dan
      FROM taekwondistas t
      JOIN academias a ON a.id = t.id_academia
      JOIN categorias c ON c.id = t.id_categoria
      JOIN cintas ci ON ci.id = t.id_cinta
      LEFT JOIN danes d ON d.id = t.id_dan`,
    search: ['t.nombre', 'a.nombre'],
    filters: ['id_academia', 'id_categoria', 'id_cinta', 'id_dan'],
    orderBy: 't.nombre',
  },
  {
    path: 'combates',
    table: 'combates',
    fields: z.object({
      id_competencia: id,
      id_categoria: id,
      id_taekwondista_rojo: id,
      id_taekwondista_azul: id,
      id_taekwondista_ganador: optionalId,
      ronda: text(20),
      estado: z.enum(['pendiente', 'en_curso', 'finalizado']).default('pendiente'),
      puntos_rojo: smallInt.default(0),
      puntos_azul: smallInt.default(0),
      amonestaciones_rojo: nonNegativeSmallInt.default(0),
      amonestaciones_azul: nonNegativeSmallInt.default(0),
    }),
    check: (d) => {
      if (d.id_taekwondista_rojo === d.id_taekwondista_azul)
        return 'El competidor rojo y el azul deben ser distintos';
      if (
        d.id_taekwondista_ganador != null &&
        ![d.id_taekwondista_rojo, d.id_taekwondista_azul].includes(d.id_taekwondista_ganador)
      )
        return 'El ganador debe ser el competidor rojo o el azul';
      return null;
    },
    select: `
      SELECT t.*, co.nombre AS competencia, ca.nombre AS categoria,
             r.nombre AS taekwondista_rojo, az.nombre AS taekwondista_azul,
             g.nombre AS taekwondista_ganador
      FROM combates t
      JOIN competencias co ON co.id = t.id_competencia
      JOIN categorias ca ON ca.id = t.id_categoria
      JOIN taekwondistas r ON r.id = t.id_taekwondista_rojo
      JOIN taekwondistas az ON az.id = t.id_taekwondista_azul
      LEFT JOIN taekwondistas g ON g.id = t.id_taekwondista_ganador`,
    search: ['t.ronda', 'co.nombre', 'r.nombre', 'az.nombre'],
    filters: ['id_competencia', 'id_categoria', 'estado'],
    orderBy: 'co.fecha DESC, t.id',
  },
];
