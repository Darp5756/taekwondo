import { validarCategoria } from './dominio/categorias.js';
import {
  date,
  id,
  integer,
  nonNegativeSmallInt,
  option,
  optionalId,
  optionalSmallUInt,
  smallInt,
  smallUInt,
  text,
  z,
} from './lib/validation.js';

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
      modalidad: option(['matsogi', 'tul']).default('matsogi'),
      sexo: option(['femenino', 'masculino', 'mixto']).default('mixto'),
      edad_minima: smallUInt,
      edad_maxima: smallUInt,
      // Solo matsogi.
      peso_minimo_kg: optionalSmallUInt,
      peso_maximo_kg: optionalSmallUInt,
      // Rango de grado opcional.
      id_cinta_minima: optionalId,
      id_cinta_maxima: optionalId,
      id_dan_minimo: optionalId,
      id_dan_maximo: optionalId,
      // Solo tul.
      id_tul_desde: optionalId,
      id_tul_hasta: optionalId,
      tules_por_encuentro: integer(1, 2).default(1),
      eleccion_tul: option(['sorteo', 'manual']).default('sorteo'),
      jueces: integer(1, 9)
        .refine((n) => n % 2 === 1, 'Debe ser un número impar para que siempre haya mayoría')
        .default(3),
    }),
    check: (d) => (d.edad_minima > d.edad_maxima ? 'La edad mínima no puede ser mayor que la máxima' : null),
    validate: validarCategoria,
    select: `
      SELECT t.*, cmin.nombre AS cinta_minima, cmax.nombre AS cinta_maxima,
             dmin.nombre AS dan_minimo, dmax.nombre AS dan_maximo,
             tdes.nombre AS tul_desde, thas.nombre AS tul_hasta
      FROM categorias t
      LEFT JOIN cintas cmin ON cmin.id = t.id_cinta_minima
      LEFT JOIN cintas cmax ON cmax.id = t.id_cinta_maxima
      LEFT JOIN danes dmin ON dmin.id = t.id_dan_minimo
      LEFT JOIN danes dmax ON dmax.id = t.id_dan_maximo
      LEFT JOIN tules tdes ON tdes.id = t.id_tul_desde
      LEFT JOIN tules thas ON thas.id = t.id_tul_hasta`,
    search: ['t.nombre'],
    filters: ['modalidad', 'sexo'],
    orderBy: 't.modalidad, t.edad_minima, t.peso_minimo_kg NULLS LAST, t.nombre',
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
    path: 'tules',
    table: 'tules',
    fields: z.object({ nombre: text(30), orden: smallUInt }),
    search: ['t.nombre'],
    orderBy: 't.orden',
  },
  {
    path: 'estados',
    table: 'estados',
    fields: z.object({ nombre: text(50) }),
    search: ['t.nombre'],
    orderBy: 't.nombre',
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
      // Categoría habitual (opcional): la categoría en la que compite se define en cada inscripción.
      id_categoria: optionalId,
      id_cinta: id,
      id_dan: optionalId,
      id_estado: id,
      nombre: text(150),
      sexo: option(['femenino', 'masculino']),
      fecha_nacimiento: date,
      peso_kg: smallUInt,
    }),
    check: (d) =>
      d.fecha_nacimiento > new Date().toISOString().slice(0, 10)
        ? 'La fecha de nacimiento no puede ser futura'
        : null,
    select: `
      SELECT t.*, a.nombre AS academia, c.nombre AS categoria, ci.nombre AS cinta, d.nombre AS dan,
             es.nombre AS estado
      FROM taekwondistas t
      JOIN academias a ON a.id = t.id_academia
      LEFT JOIN categorias c ON c.id = t.id_categoria
      JOIN cintas ci ON ci.id = t.id_cinta
      LEFT JOIN danes d ON d.id = t.id_dan
      LEFT JOIN estados es ON es.id = t.id_estado`,
    search: ['t.nombre', 'a.nombre', 'es.nombre'],
    filters: ['id_academia', 'id_categoria', 'id_cinta', 'id_dan', 'id_estado', 'sexo'],
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
