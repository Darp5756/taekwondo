import { Router } from 'express';
import { query, transaction } from '../db.js';
import { HttpError } from '../lib/http-error.js';
import { bool, id, option, optionalId, z } from '../lib/validation.js';
import { SELECT_COMBATES } from '../dominio/combates.js';
import { crearLlave, eliminarLlave, exigirSinLlave, inscritosActivos, podio } from '../dominio/llaves.js';
import { siguientePotenciaDe2, sortear } from '../dominio/sorteo.js';

const router = Router();

// Estado derivado: pendiente (nada disputado), en_curso o finalizada.
const SELECT_LLAVES = `
  SELECT l.*, co.nombre AS competencia, co.fecha AS fecha_competencia, ca.nombre AS categoria, ca.modalidad,
         (SELECT count(*)::int FROM combates c, unnest(ARRAY[c.id_inscripcion_rojo, c.id_inscripcion_azul]) x
          WHERE c.id_llave = l.id AND c.eliminado_en IS NULL AND c.numero_ronda = 1 AND x IS NOT NULL) AS participantes,
         CASE
           WHEN NOT EXISTS (SELECT 1 FROM combates c WHERE c.id_llave = l.id AND c.eliminado_en IS NULL
                              AND c.estado <> 'finalizado') THEN 'finalizada'
           WHEN EXISTS (SELECT 1 FROM combates c WHERE c.id_llave = l.id AND c.eliminado_en IS NULL
                          AND (c.estado = 'en_curso' OR (c.estado = 'finalizado' AND NOT c.resuelto_automaticamente)))
             THEN 'en_curso'
           ELSE 'pendiente'
         END AS estado
  FROM llaves l
  JOIN competencias co ON co.id = l.id_competencia
  JOIN categorias ca ON ca.id = l.id_categoria
  WHERE l.eliminado_en IS NULL`;

const filtrosSchema = z.object({ id_competencia: optionalId, id_categoria: optionalId });

router.get('/', async (req, res) => {
  const f = filtrosSchema.parse(req.query);
  const { rows } = await query(
    `${SELECT_LLAVES}
       AND ($1::int IS NULL OR l.id_competencia = $1)
       AND ($2::int IS NULL OR l.id_categoria = $2)
     ORDER BY co.fecha DESC, ca.modalidad, ca.nombre`,
    [f.id_competencia ?? null, f.id_categoria ?? null],
  );
  res.json({ data: rows, total: rows.length });
});

async function detalle(db, idLlave) {
  const { rows } = await db.query(`${SELECT_LLAVES} AND l.id = $1`, [idLlave]);
  const llave = rows[0];
  if (!llave) throw new HttpError(404, 'Llave no encontrada');
  const { rows: combates } = await db.query(
    `${SELECT_COMBATES} WHERE t.id_llave = $1 AND t.eliminado_en IS NULL ORDER BY t.numero_ronda, t.posicion`,
    [idLlave],
  );
  // Inscritos activos que no están en la llave (se inscribieron después de generarla).
  const enLlave = new Set(
    combates.filter((c) => c.numero_ronda === 1).flatMap((c) => [c.id_inscripcion_rojo, c.id_inscripcion_azul]),
  );
  const fuera = (await inscritosActivos(db, llave.id_competencia, llave.id_categoria)).filter((i) => !enLlave.has(i.id));
  return {
    ...llave,
    combates,
    podio: podio(combates, llave.tercer_puesto),
    inscritos_fuera: fuera.map((i) => ({ id: i.id, taekwondista: i.taekwondista, academia: i.academia })),
  };
}

router.get('/:id', async (req, res) => {
  res.json(await detalle({ query }, id.parse(req.params.id)));
});

const SEPARACIONES = ['ninguna', 'academia', 'estado'];
const sorteoSchema = z.object({
  id_competencia: id,
  id_categoria: id,
  separacion: option(SEPARACIONES).default('ninguna'),
});

// Propone una llave (no guarda nada). El usuario puede ajustarla y confirmarla.
router.post('/sorteo', async (req, res) => {
  const { id_competencia, id_categoria, separacion } = sorteoSchema.parse(req.body ?? {});
  await exigirSinLlave({ query }, id_competencia, id_categoria);
  const inscritos = await inscritosActivos({ query }, id_competencia, id_categoria);
  if (inscritos.length < 2) throw new HttpError(400, 'Se necesitan al menos 2 inscritos activos para armar una llave');

  const grupo = (i) => (separacion === 'academia' ? i.id_academia : separacion === 'estado' ? i.id_estado : null);
  const { slots, avisos } = sortear(
    inscritos.map((i) => ({ id: i.id, grupo: grupo(i) })),
    { separar: separacion !== 'ninguna' },
  );
  const porId = new Map(inscritos.map((i) => [i.id, i]));
  const datos = (idInscripcion) => {
    const i = porId.get(idInscripcion);
    return { id: i.id, taekwondista: i.taekwondista, academia: i.academia, estado: i.estado };
  };
  res.json({
    tamano: siguientePotenciaDe2(inscritos.length),
    slots: slots.map((x) => (x == null ? null : datos(x))),
    avisos: avisos.map(([a, b]) => ({ rojo: datos(a), azul: datos(b) })),
  });
});

const crearSchema = sorteoSchema.extend({
  tercer_puesto: bool.default(true),
  slots: z.array(id.nullable(), { error: 'Falta la ubicación de los participantes' }),
});

router.post('/', async (req, res) => {
  const data = crearSchema.parse(req.body ?? {});
  const llave = await transaction(async (db) => detalle(db, await crearLlave(db, data)));
  res.status(201).json(llave);
});

router.delete('/:id', async (req, res) => {
  await transaction((db) => eliminarLlave(db, id.parse(req.params.id)));
  res.status(204).end();
});

export default router;
