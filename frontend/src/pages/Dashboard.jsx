import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { EstadoBadge, Rivales, resources } from '../resources.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({});
  const [enCurso, setEnCurso] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const cards = resources.filter((r) => !r.adminOnly);

  useEffect(() => {
    cards.forEach((r) =>
      api(`/${r.path}`, { params: { limit: 1 } })
        .then((res) => setCounts((c) => ({ ...c, [r.path]: res.total })))
        .catch(() => {}),
    );
    api('/combates', { params: { estado: 'en_curso', limit: 10 } })
      .then((r) => setEnCurso(r.data))
      .catch(() => {});
    api('/combates', { params: { estado: 'pendiente', limit: 10 } })
      .then((r) => setPendientes(r.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Hola, {user.nombre} 👋</h1>
        <p className="text-sm text-neutral-400">Resumen de la gestión de competencias.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((r) => (
          <Link key={r.path} to={`/${r.path}`} className="card p-5 transition hover:border-tkd-gold/60">
            <p className="text-2xl">{r.icon}</p>
            <p className="mt-2 text-3xl font-black">{counts[r.path] ?? '–'}</p>
            <p className="text-sm text-neutral-400">{r.title}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CombateList title="Combates en curso" combates={enCurso} empty="No hay combates en curso" />
        <CombateList title="Próximos combates" combates={pendientes} empty="No hay combates pendientes" />
      </div>
    </div>
  );
}

function CombateList({ title, combates, empty }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 font-bold">{title}</h2>
      {combates.length === 0 ? (
        <p className="text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {combates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <Rivales combate={c} />
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {c.competencia} · {c.categoria} · {c.ronda}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <EstadoBadge estado={c.estado} />
                {c.id_inscripcion_rojo && c.id_inscripcion_azul && (
                  <Link to={`/combates/${c.id}/marcador`} className="btn btn-primary px-3 py-1">
                    Marcador
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
