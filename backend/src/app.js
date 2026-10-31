import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { crudRouter } from './lib/crud.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { resources } from './resources.js';
import authRouter from './routes/auth.js';
import combatesRouter from './routes/combates.js';
import inscripcionesRouter from './routes/inscripciones.js';
import llavesRouter from './routes/llaves.js';
import usuariosRouter from './routes/usuarios.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : true }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/usuarios', requireAuth, requireRole('admin'), usuariosRouter);
// Rutas propias que se resuelven antes que el CRUD genérico del mismo recurso.
const extraRouters = { inscripciones: inscripcionesRouter, combates: combatesRouter };
for (const resource of resources) {
  const extra = extraRouters[resource.path];
  app.use(`/api/${resource.path}`, requireAuth, ...(extra ? [extra] : []), crudRouter(resource));
}

app.use('/api/llaves', requireAuth, llavesRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
