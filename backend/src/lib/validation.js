import { z } from 'zod';

z.config(z.locales.es());

const isBlank = (v) => v === '' || v === null || v === undefined;

// Enteros que aceptan número o texto numérico (formularios). Un valor vacío
// se trata como ausente, no como 0.
export const integer = (min, max) =>
  z.preprocess(
    (v) => (isBlank(v) ? undefined : typeof v === 'string' ? Number(v) : v),
    z
      .number({ error: (iss) => (iss.input === undefined ? 'Campo obligatorio' : 'Debe ser un número') })
      .int('Debe ser un número entero')
      .min(min)
      .max(max),
  );

// Campo opcional: vacío o ausente se guarda como null.
export const nullable = (schema) => z.preprocess((v) => (isBlank(v) ? null : v), schema.nullable());

export const id = integer(1, 2147483647);
export const optionalId = nullable(id);
export const smallUInt = integer(0, 255);
export const optionalSmallUInt = nullable(smallUInt);
export const smallInt = integer(-32768, 32767);
export const nonNegativeSmallInt = integer(0, 32767);

export const text = (max) =>
  z
    .string({ error: (iss) => (iss.input === undefined ? 'Campo obligatorio' : 'Debe ser texto') })
    .trim()
    .min(1, 'Campo obligatorio')
    .max(max);

// Valor de una lista cerrada (select). Vacío = "Campo obligatorio".
export const option = (values) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.enum(values, { error: (iss) => (iss.input === undefined ? 'Campo obligatorio' : 'Opción inválida') }),
  );

export const bool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

export const date = z
  .string({ error: 'Campo obligatorio' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe tener formato AAAA-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha inválida');

export { z };
