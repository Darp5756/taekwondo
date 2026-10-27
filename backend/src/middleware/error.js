import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

// Traduce los errores conocidos (validación, PostgreSQL, JSON mal formado)
// a respuestas HTTP con mensajes en español.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  }

  switch (err.code) {
    case '23505':
      return res.status(409).json({ error: 'Ya existe un registro con ese valor', details: err.detail });
    case '23503':
      return res.status(409).json({
        error: err.detail?.includes('still referenced')
          ? 'No se puede eliminar: hay otros registros que dependen de este'
          : 'Uno de los registros relacionados no existe',
        details: err.detail,
      });
    case '23514':
      return res.status(400).json({ error: 'Los datos no cumplen una restricción', details: err.constraint });
    case '22P02':
    case '22003':
    case '22007':
    case '22008':
      return res.status(400).json({ error: 'Valor con formato o rango inválido', details: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
