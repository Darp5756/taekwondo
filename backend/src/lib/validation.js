import { z } from 'zod';

z.config(z.locales.es());

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

export const id = z.coerce.number().int().positive();
export const optionalId = z.preprocess(emptyToNull, id.nullable());
export const text = (max) => z.string().trim().min(1).max(max);
export const smallUInt = z.coerce.number().int().min(0).max(255);
export const smallInt = z.coerce.number().int().min(-32768).max(32767);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe tener formato AAAA-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha inválida');

export { z };
