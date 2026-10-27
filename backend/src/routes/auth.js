import { Router } from 'express';
import { query } from '../db.js';
import { HttpError } from '../lib/http-error.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/passwords.js';
import { text, z } from '../lib/validation.js';
import { requireAuth, signToken } from '../middleware/auth.js';

export const email = z.string().trim().toLowerCase().pipe(z.email().max(150));
export const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72);

const loginSchema = z.object({ email, password: z.string().min(1) });
const setupSchema = z.object({ nombre: text(100), email, password });
const changePasswordSchema = z.object({ password_actual: z.string().min(1), password_nueva: password });

const publicUser = ({ id, nombre, email, rol }) => ({ id, nombre, email, rol });

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body ?? {});
  const { rows } = await query('SELECT * FROM usuarios WHERE email = $1', [email]);
  const user = rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.activo) throw new HttpError(401, 'Email o contraseña incorrectos');
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

router.put('/password', requireAuth, async (req, res) => {
  const { password_actual, password_nueva } = changePasswordSchema.parse(req.body ?? {});
  const { rows } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
  if (!(await verifyPassword(password_actual, rows[0].password_hash)))
    throw new HttpError(400, 'La contraseña actual no es correcta');
  await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [
    await hashPassword(password_nueva),
    req.user.id,
  ]);
  res.status(204).end();
});

// Configuración inicial: mientras no exista ningún usuario, permite crear el
// primer administrador desde la pantalla de login.
router.get('/setup', async (req, res) => {
  const { rows } = await query('SELECT NOT EXISTS (SELECT 1 FROM usuarios) AS needs_setup');
  res.json({ needsSetup: rows[0].needs_setup });
});

router.post('/setup', async (req, res) => {
  const data = setupSchema.parse(req.body ?? {});
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     SELECT $1, $2, $3, 'admin'
     WHERE NOT EXISTS (SELECT 1 FROM usuarios)
     RETURNING *`,
    [data.nombre, data.email, await hashPassword(data.password)],
  );
  if (!rows[0]) throw new HttpError(409, 'El sistema ya tiene usuarios configurados');
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
});

export default router;
