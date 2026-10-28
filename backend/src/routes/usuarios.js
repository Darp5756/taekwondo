import { Router } from 'express';
import { query } from '../db.js';
import { HttpError } from '../lib/http-error.js';
import { hashPassword } from '../lib/passwords.js';
import { id as idSchema, text, z } from '../lib/validation.js';
import { email, password } from './auth.js';

const COLUMNS = 'id, nombre, email, rol, activo, creado_en, eliminado_en';

const baseFields = {
  nombre: text(100),
  email,
  rol: z.enum(['admin', 'operador']),
  activo: z.boolean().default(true),
};
const createSchema = z.object({ ...baseFields, password });
// Al editar, la contraseña es opcional: vacía = no se cambia.
const updateSchema = z.object({
  ...baseFields,
  password: z.preprocess((v) => (v === '' ? undefined : v), password.optional()),
});

const router = Router();

// ?eliminados=true lista la papelera.
router.get('/', async (req, res) => {
  const condition = req.query.eliminados === 'true' ? 'IS NOT NULL' : 'IS NULL';
  const { rows } = await query(`SELECT ${COLUMNS} FROM usuarios WHERE eliminado_en ${condition} ORDER BY nombre`);
  res.json({ data: rows, total: rows.length, limit: rows.length, offset: 0 });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`SELECT ${COLUMNS} FROM usuarios WHERE id = $1 AND eliminado_en IS NULL`, [idSchema.parse(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado');
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const d = createSchema.parse(req.body ?? {});
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [d.nombre, d.email, await hashPassword(d.password), d.rol, d.activo],
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const d = updateSchema.parse(req.body ?? {});
  if (id === req.user.id && (d.rol !== 'admin' || !d.activo))
    throw new HttpError(400, 'No puedes quitarte el rol de administrador ni desactivarte');

  const hash = d.password ? await hashPassword(d.password) : null;
  const { rows } = await query(
    `UPDATE usuarios
     SET nombre = $1, email = $2, rol = $3, activo = $4, password_hash = COALESCE($5, password_hash)
     WHERE id = $6 AND eliminado_en IS NULL RETURNING ${COLUMNS}`,
    [d.nombre, d.email, d.rol, d.activo, hash, id],
  );
  if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'No puedes eliminar tu propio usuario');
  const { rowCount } = await query(
    'UPDATE usuarios SET eliminado_en = now() WHERE id = $1 AND eliminado_en IS NULL',
    [id],
  );
  if (!rowCount) throw new HttpError(404, 'Usuario no encontrado');
  res.status(204).end();
});

router.post('/:id/restaurar', async (req, res) => {
  const { rows } = await query(
    `UPDATE usuarios SET eliminado_en = NULL WHERE id = $1 AND eliminado_en IS NOT NULL RETURNING ${COLUMNS}`,
    [idSchema.parse(req.params.id)],
  );
  if (!rows[0]) throw new HttpError(404, 'No hay un usuario eliminado con ese id');
  res.json(rows[0]);
});

export default router;
