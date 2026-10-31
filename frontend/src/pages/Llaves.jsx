import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api.js';
import Alert from '../components/Alert.jsx';
import { EstadoLlaveBadge } from '../components/Llave.jsx';
import Spinner from '../components/Spinner.jsx';
import { modalidadLabel } from '../resources.jsx';

export default function Llaves() {
  const [params, setParams] = useSearchParams();
  const idCompetencia = params.get('id_competencia') ?? '';
  const [competencias, setCompetencias] = useState([]);
  const [llaves, setLlaves] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/competencias', { params: { limit: 500 } }).then((r) => setCompetencias(r.data)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setLlaves(null);
    api('/llaves', { params: { id_competencia: idCompetencia } })
      .then((r) => setLlaves(r.data))
      .catch((e) => setError(e.message));
  }, [idCompetencia]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🏅 Llaves</h1>
          <p className="text-sm text-neutral-400">Eliminación simple por competencia y categoría.</p>
        </div>
        <Link to={`/llaves/nueva${idCompetencia ? `?id_competencia=${idCompetencia}` : ''}`} className="btn btn-primary">
          + Nueva llave
        </Link>
      </div>

      <select
        className="input max-w-xs"
        aria-label="Competencia"
        value={idCompetencia}
        onChange={(e) => setParams(e.target.value ? { id_competencia: e.target.value } : {}, { replace: true })}
      >
        <option value="">Competencia: todas</option>
        {competencias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      <Alert>{error}</Alert>

      <div className="card overflow-x-auto">
        {!llaves ? (
          <Spinner />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs tracking-wide text-neutral-400 uppercase">
              <tr>
                <th className="px-4 py-3">Competencia</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Participantes</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {llaves.map((l) => (
                <tr key={l.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">{l.competencia}</td>
                  <td className="px-4 py-3">
                    {l.categoria} · {modalidadLabel(l.modalidad)}
                  </td>
                  <td className="px-4 py-3">{l.participantes}</td>
                  <td className="px-4 py-3">
                    <EstadoLlaveBadge estado={l.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/llaves/${l.id}`} className="btn btn-secondary px-3 py-1">
                      Ver llave
                    </Link>
                  </td>
                </tr>
              ))}
              {!llaves.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-neutral-500">
                    No hay llaves
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
