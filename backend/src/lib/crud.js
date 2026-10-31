import { Router } from 'express';
import { query, transaction } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError } from './http-error.js';
import { assertNoActiveDependents, assertReferencesActive } from './relations.js';
import { id as idSchema } from './validation.js';

const MAX_LIMIT = 500;

function pageParams(q) {
  const limit = Math.min(Math.max(Number.parseInt(q.limit, 10) || 100, 1), MAX_LIMIT);
  const offset = Math.max(Number.parseInt(q.offset, 10) || 0, 0);
  return { limit, offset };
}

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

const ACTIVE = 't.eliminado_en IS NULL';
const DELETED = 't.eliminado_en IS NOT NULL';

/**
 * Crea un router REST (GET lista, GET uno, POST, PUT, PATCH, DELETE) para una tabla.
 * El DELETE es lógico: marca eliminado_en y el registro deja de aparecer, pero
 * un admin puede verlo con ?eliminados=true y recuperarlo con POST /:id/restaurar.
 * Cada escritura corre en una transacción.
 *
 * - fields: z.object con las columnas editables.
 * - check: validación entre campos; devuelve un mensaje de error o null.
 * - validate: async (data, { db, current }) => data. Validaciones que consultan
 *   la base; puede devolver los datos ajustados. `current` es la fila actual
 *   al editar y null al crear.
 * - afterSave: async (id, { db, current }) tras crear o editar.
 * - beforeDelete / beforeRestore: async (row, { db }); lanzan HttpError para impedirlo.
 * - select: SELECT base (la tabla principal debe tener alias `t`), útil para JOINs.
 * - where: condición extra que solo se aplica al listado.
 * - search: expresiones SQL en las que busca el parámetro ?q=.
 * - filters: columnas de `t` que se pueden filtrar por igualdad (?columna=valor).
 */
export function crudRouter({
  table,
  fields,
  check,
  validate: validateHook,
  afterSave,
  beforeDelete,
  beforeRestore,
  select,
  where: listWhere,
  search = [],
  filters = [],
  orderBy = 't.id',
}) {
  const columns = Object.keys(fields.shape);
  const baseSelect = select ?? `SELECT t.* FROM ${table} t`;
  const router = Router();

  const parseId = (raw) => idSchema.parse(raw);

  async function findById(db, id, condition = ACTIVE) {
    const { rows } = await db.query(`${baseSelect} WHERE t.id = $1 AND ${condition}`, [id]);
    return rows[0];
  }

  async function lockRow(db, id, condition = 'eliminado_en IS NULL') {
    const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = $1 AND ${condition} FOR UPDATE`, [id]);
    return rows[0];
  }

  async function validate(db, data, current = null) {
    let parsed = fields.parse(data ?? {});
    const message = check?.(parsed);
    if (message) throw new HttpError(400, message);
    if (validateHook) parsed = (await validateHook(parsed, { db, current })) ?? parsed;
    await assertReferencesActive(table, parsed, db);
    return parsed;
  }

  async function update(db, id, data, current) {
    const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
    await db.query(`UPDATE ${table} SET ${sets} WHERE id = $${columns.length + 1}`, [
      ...columns.map((c) => data[c]),
      id,
    ]);
    await afterSave?.(id, { db, current });
    return findById(db, id);
  }

  // Solo un admin puede ver la papelera.
  router.get('/', (req, res, next) =>
    req.query.eliminados === 'true' ? requireRole('admin')(req, res, next) : next(),
  );

  router.get('/', async (req, res) => {
    const where = [req.query.eliminados === 'true' ? DELETED : ACTIVE];
    if (listWhere) where.push(`(${listWhere})`);
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

    const whereSql = `WHERE ${where.join(' AND ')}`;
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
    const row = await findById({ query }, parseId(req.params.id));
    if (!row) throw new HttpError(404, 'Registro no encontrado');
    res.json(row);
  });

  router.post('/', async (req, res) => {
    const row = await transaction(async (db) => {
      const data = await validate(db, req.body);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await db.query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        columns.map((c) => data[c]),
      );
      await afterSave?.(rows[0].id, { db, current: null });
      return findById(db, rows[0].id);
    });
    res.status(201).json(row);
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const row = await transaction(async (db) => {
      const current = await lockRow(db, id);
      if (!current) throw new HttpError(404, 'Registro no encontrado');
      return update(db, id, await validate(db, req.body, current), current);
    });
    res.json(row);
  });

  // PATCH combina el registro actual con los campos recibidos y valida el
  // resultado completo, así las reglas entre campos siguen aplicando.
  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const row = await transaction(async (db) => {
      const current = await lockRow(db, id);
      if (!current) throw new HttpError(404, 'Registro no encontrado');
      const base = Object.fromEntries(columns.map((c) => [c, current[c]]));
      const patch = Object.fromEntries(Object.entries(req.body ?? {}).filter(([k]) => columns.includes(k)));
      return update(db, id, await validate(db, { ...base, ...patch }, current), current);
    });
    res.json(row);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    await transaction(async (db) => {
      const row = await lockRow(db, id);
      if (!row) throw new HttpError(404, 'Registro no encontrado');
      await beforeDelete?.(row, { db });
      await assertNoActiveDependents(table, id, db);
      await db.query(`UPDATE ${table} SET eliminado_en = now() WHERE id = $1`, [id]);
    });
    res.status(204).end();
  });

  router.post('/:id/restaurar', requireRole('admin'), async (req, res) => {
    const id = parseId(req.params.id);
    const row = await transaction(async (db) => {
      const deleted = await lockRow(db, id, 'eliminado_en IS NOT NULL');
      if (!deleted) throw new HttpError(404, 'No hay un registro eliminado con ese id');
      await beforeRestore?.(deleted, { db });
      await assertReferencesActive(table, deleted, db);
      // Si mientras tanto se creó otro registro activo con el mismo valor único,
      // el índice parcial lo impide y se responde 409.
      await db.query(`UPDATE ${table} SET eliminado_en = NULL WHERE id = $1`, [id]);
      return findById(db, id);
    });
    res.json(row);
  });

  return router;
}
