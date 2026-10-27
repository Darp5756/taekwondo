import { Router } from 'express';
import { query } from '../db.js';
import { HttpError } from './http-error.js';
import { id as idSchema } from './validation.js';

const MAX_LIMIT = 500;

function pageParams(q) {
  const limit = Math.min(Math.max(Number.parseInt(q.limit, 10) || 100, 1), MAX_LIMIT);
  const offset = Math.max(Number.parseInt(q.offset, 10) || 0, 0);
  return { limit, offset };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

/**
 * Crea un router REST (GET lista, GET uno, POST, PUT, PATCH, DELETE) para una tabla.
 *
 * - fields: z.object con las columnas editables.
 * - check: validación entre campos; devuelve un mensaje de error o null.
 * - select: SELECT base (la tabla principal debe tener alias `t`), útil para JOINs.
 * - search: expresiones SQL en las que busca el parámetro ?q=.
 * - filters: columnas de `t` que se pueden filtrar por igualdad (?columna=valor).
 */
export function crudRouter({ table, fields, check, select, search = [], filters = [], orderBy = 't.id' }) {
  const columns = Object.keys(fields.shape);
  const baseSelect = select ?? `SELECT t.* FROM ${table} t`;
  const router = Router();

  const parseId = (raw) => idSchema.parse(raw);

  async function findById(id) {
    const { rows } = await query(`${baseSelect} WHERE t.id = $1`, [id]);
    return rows[0];
  }

  function validate(data) {
    const parsed = fields.parse(data ?? {});
    const message = check?.(parsed);
    if (message) throw new HttpError(400, message);
    return parsed;
  }

  async function update(id, data) {
    const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const { rowCount } = await query(
      `UPDATE ${table} SET ${sets} WHERE id = $${columns.length + 1}`,
      [...columns.map((c) => data[c]), id],
    );
    if (!rowCount) throw new HttpError(404, 'Registro no encontrado');
    return findById(id);
  }

  router.get('/', async (req, res) => {
    const where = [];
    const params = [];

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q && search.length) {
      params.push(`%${escapeLike(q)}%`);
      where.push(`(${search.map((expr) => `${expr}::text ILIKE $${params.length}`).join(' OR ')})`);
    }
    for (const f of filters) {
      const value = req.query[f];
      if (typeof value === 'string' && value !== '') {
        params.push(value);
        where.push(`t.${f} = $${params.length}`);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { limit, offset } = pageParams(req.query);
    const [list, count] = await Promise.all([
      query(
        `${baseSelect} ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      query(`SELECT count(*)::int AS total FROM (${baseSelect} ${whereSql}) sub`, params),
    ]);
    res.json({ data: list.rows, total: count.rows[0].total, limit, offset });
  });

  router.get('/:id', async (req, res) => {
    const row = await findById(parseId(req.params.id));
    if (!row) throw new HttpError(404, 'Registro no encontrado');
    res.json(row);
  });

  router.post('/', async (req, res) => {
    const data = validate(req.body);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      columns.map((c) => data[c]),
    );
    res.status(201).json(await findById(rows[0].id));
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    res.json(await update(id, validate(req.body)));
  });

  // PATCH combina el registro actual con los campos recibidos y valida el
  // resultado completo, así las reglas entre campos siguen aplicando.
  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Registro no encontrado');
    const current = Object.fromEntries(columns.map((c) => [c, rows[0][c]]));
    const patch = Object.fromEntries(Object.entries(req.body ?? {}).filter(([k]) => columns.includes(k)));
    res.json(await update(id, validate({ ...current, ...patch })));
  });

  router.delete('/:id', async (req, res) => {
    const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [parseId(req.params.id)]);
    if (!rowCount) throw new HttpError(404, 'Registro no encontrado');
    res.status(204).end();
  });

  return router;
}
