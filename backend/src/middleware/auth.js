import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from '../lib/http-error.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), rol: user.rol }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// Verifica el token Bearer y carga el usuario. Se consulta la base en cada
// petición para que desactivar a un usuario corte su acceso de inmediato.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'No autenticado');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  const { rows } = await query(
    'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1 AND eliminado_en IS NULL',
    [Number(payload.sub)],
  );
  const user = rows[0];
  if (!user || !user.activo) throw new HttpError(401, 'Usuario inexistente o desactivado');

  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.rol)) throw new HttpError(403, 'No tienes permiso para esta acción');
    next();
  };
}
