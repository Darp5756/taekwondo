// Acciones sobre un combate que no son CRUD: finalizar, reabrir y, en tul,
// definir los tules y registrar los votos. Cada una corre en una transacción
// y, si el combate es de una llave, actualiza la llave.
import { Router } from 'express';
import { transaction } from '../db.js';
import { id, option, z } from '../lib/validation.js';
import {
  TIPOS_VICTORIA,
  cargarCombate,
  elegirTules,
  finalizarCombate,
  reabrirCombate,
  registrarVotos,
  sortearTules,
} from '../dominio/combates.js';

const router = Router();

const accion = (fn) => async (req, res) => {
  const idCombate = id.parse(req.params.id);
  const combate = await transaction(async (db) => {
    await fn(db, idCombate, req.body ?? {});
    return cargarCombate(db, idCombate);
  });
  res.json(combate);
};

const lado = option(['rojo', 'azul']);

const finalizarSchema = z.object({
  ganador: lado,
  tipo_victoria: option(TIPOS_VICTORIA).optional(),
});

router.post(
  '/:id/finalizar',
  accion((db, idCombate, body) => finalizarCombate(db, idCombate, finalizarSchema.parse(body))),
);

router.post(
  '/:id/reabrir',
  accion((db, idCombate) => reabrirCombate(db, idCombate)),
);

router.post(
  '/:id/tules/sorteo',
  accion((db, idCombate) => sortearTules(db, idCombate)),
);

const tulesSchema = z.object({ tules: z.array(id).min(1, 'Elige el tul') });

router.put(
  '/:id/tules',
  accion((db, idCombate, body) => elegirTules(db, idCombate, tulesSchema.parse(body).tules)),
);

const votosSchema = z.object({ votos: z.array(lado).min(1, 'Faltan los votos') });

router.post(
  '/:id/votos',
  accion((db, idCombate, body) => registrarVotos(db, idCombate, votosSchema.parse(body).votos)),
);

export default router;
