// Rutas de inscripciones que no son CRUD: candidatos e inscripción múltiple.
import { Router } from 'express';
import { query, transaction } from '../db.js';
import { HttpError } from '../lib/http-error.js';
import { assertReferencesActive } from '../lib/relations.js';
import { id, z } from '../lib/validation.js';
import { motivosNoElegible } from '../dominio/elegibilidad.js';
import { SQL_CATEGORIA, SQL_TAEKWONDISTAS, validarInscripcion } from '../dominio/inscripciones.js';

const router = Router();

const paramsSchema = z.object({ id_competencia: id, id_categoria: id });

async function cargarContexto(db, { id_competencia, id_categoria }) {
  const [categoria, competencia] = await Promise.all([
    db.query(SQL_CATEGORIA, [id_categoria]).then((r) => r.rows[0]),
    db.query('SELECT * FROM competencias WHERE id = $1 AND eliminado_en IS NULL', [id_competencia]).then(
      (r) => r.rows[0],
    ),
  ]);
  if (!categoria) throw new HttpError(404, 'Categoría no encontrada');
  if (!competencia) throw new HttpError(404, 'Competencia no encontrada');
  return { categoria, competencia };
}

// Todos los taekwondistas activos, indicando para cada uno si cumple la
// categoría (motivos vacío), si ya está inscrito en ella o si está inscrito en
// otra categoría de la misma modalidad.
router.get('/candidatos', async (req, res) => {
  const params = paramsSchema.parse(req.query);
  const { categoria, competencia } = await cargarContexto({ query }, params);
  const [taekwondistas, inscritos] = await Promise.all([
    query(`${SQL_TAEKWONDISTAS} ORDER BY t.nombre`).then((r) => r.rows),
    query(
      `SELECT i.id_taekwondista, i.id_categoria, c.nombre AS categoria
       FROM inscripciones i JOIN categorias c ON c.id = i.id_categoria
       WHERE i.id_competencia = $1 AND i.eliminado_en IS NULL AND c.modalidad = $2`,
      [params.id_competencia, categoria.modalidad],
    ).then((r) => r.rows),
  ]);

  const data = taekwondistas.map((t) => {
    const inscripcion = inscritos.find((i) => i.id_taekwondista === t.id);
    return {
      id: t.id,
      nombre: t.nombre,
      academia: t.academia,
      estado: t.estado,
      sexo: t.sexo,
      cinta: t.cinta,
      dan: t.dan,
      peso_kg: t.peso_kg,
      fecha_nacimiento: t.fecha_nacimiento,
      inscrito: inscripcion?.id_categoria === params.id_categoria,
      inscrito_en_otra: inscripcion && inscripcion.id_categoria !== params.id_categoria ? inscripcion.categoria : null,
      motivos: motivosNoElegible({ categoria, taekwondista: t, fechaCompetencia: competencia.fecha }),
    };
  });
  res.json({ data });
});

const loteSchema = paramsSchema.extend({ taekwondistas: z.array(id).min(1, 'Selecciona al menos un taekwondista') });

// Inscribe varios taekwondistas en una categoría. Todo o nada: si alguno no
// se puede inscribir, no se inscribe ninguno y se informa el motivo de cada uno.
router.post('/lote', async (req, res) => {
  const { id_competencia, id_categoria, taekwondistas } = loteSchema.parse(req.body ?? {});
  const creadas = await transaction(async (db) => {
    await cargarContexto(db, { id_competencia, id_categoria });
    const errores = [];
    const ids = [];
    for (const id_taekwondista of [...new Set(taekwondistas)]) {
      const data = { id_competencia, id_categoria, id_taekwondista, peso_kg: null, retirado: false, fuera_de_categoria: false };
      try {
        await validarInscripcion(data, { db, current: null });
        await assertReferencesActive('inscripciones', data, db);
        const { rows } = await db.query(
          `INSERT INTO inscripciones (id_competencia, id_categoria, id_taekwondista) VALUES ($1, $2, $3) RETURNING id`,
          [id_competencia, id_categoria, id_taekwondista],
        );
        ids.push(rows[0].id);
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        const detalle = Array.isArray(err.details) ? err.details.map((d) => d.message).join('. ') : err.message;
        errores.push({ field: String(id_taekwondista), message: detalle });
      }
    }
    if (errores.length) throw new HttpError(400, 'No se pudo inscribir a todos los seleccionados', errores);
    return ids;
  });
  res.status(201).json({ inscritos: creadas.length });
});

export default router;
