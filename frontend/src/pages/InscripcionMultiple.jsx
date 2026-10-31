import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api.js';
import Alert from '../components/Alert.jsx';
import Spinner from '../components/Spinner.jsx';
import { categoriaLabel } from '../resources.jsx';

// Inscribe varios taekwondistas en una categoría a la vez. Muestra quién
// cumple los requisitos y, para quien no, el motivo.
export default function InscripcionMultiple() {
  const [params, setParams] = useSearchParams();
  const idCompetencia = params.get('id_competencia') ?? '';
  const idCategoria = params.get('id_categoria') ?? '';

  const [competencias, setCompetencias] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [candidatos, setCandidatos] = useState(null);
  const [seleccion, setSeleccion] = useState(new Set());
  const [soloCumplen, setSoloCumplen] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [exito, setExito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    api('/competencias', { params: { limit: 500 } }).then((r) => setCompetencias(r.data)).catch((e) => setError(e.message));
    api('/categorias', { params: { limit: 500 } }).then((r) => setCategorias(r.data)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!idCompetencia || !idCategoria) {
      setCandidatos(null);
      return;
    }
    let cancelado = false;
    setCandidatos(null);
    setSeleccion(new Set());
    setErrores({});
    api('/inscripciones/candidatos', { params: { id_competencia: idCompetencia, id_categoria: idCategoria } })
      .then((r) => !cancelado && setCandidatos(r.data))
      .catch((e) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, [idCompetencia, idCategoria, recarga]);

  const seleccionable = (c) => !c.inscrito && !c.inscrito_en_otra && c.motivos.length === 0;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (candidatos ?? []).filter(
      (c) =>
        (!soloCumplen || seleccionable(c) || c.inscrito) &&
        (!q || c.nombre.toLowerCase().includes(q) || c.academia.toLowerCase().includes(q)),
    );
  }, [candidatos, soloCumplen, busqueda]);

  const setParam = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setExito('');
  };

  const toggle = (id) =>
    setSeleccion((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const seleccionarTodos = () => setSeleccion(new Set(visibles.filter(seleccionable).map((c) => c.id)));

  const inscribir = async () => {
    setEnviando(true);
    setError('');
    setErrores({});
    try {
      const r = await api('/inscripciones/lote', {
        method: 'POST',
        body: { id_competencia: idCompetencia, id_categoria: idCategoria, taekwondistas: [...seleccion] },
      });
      setExito(`${r.inscritos} taekwondista(s) inscrito(s).`);
      setRecarga((n) => n + 1);
    } catch (err) {
      setError(err.message);
      setErrores(err.fieldErrors ?? {});
    } finally {
      setEnviando(false);
    }
  };

  const categoria = categorias.find((c) => String(c.id) === idCategoria);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">📝 Inscripción múltiple</h1>
          <p className="text-sm text-neutral-400">Elige la competencia y la categoría, y marca a quiénes inscribir.</p>
        </div>
        <Link to="/inscripciones" className="btn btn-secondary">
          ← Inscripciones
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <select
          className="input"
          aria-label="Competencia"
          value={idCompetencia}
          onChange={(e) => setParam('id_competencia', e.target.value)}
        >
          <option value="">Competencia…</option>
          {competencias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Categoría"
          value={idCategoria}
          onChange={(e) => setParam('id_categoria', e.target.value)}
        >
          <option value="">Categoría…</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {categoriaLabel(c)}
            </option>
          ))}
        </select>
      </div>

      <Alert>{error}</Alert>
      <Alert tone="success">{exito}</Alert>

      {idCompetencia && idCategoria && !candidatos && <Spinner />}

      {candidatos && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              className="input max-w-xs"
              placeholder="Buscar por nombre o academia…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-tkd-gold"
                checked={soloCumplen}
                onChange={(e) => setSoloCumplen(e.target.checked)}
              />
              Solo los que cumplen la categoría
            </label>
            <button onClick={seleccionarTodos} className="btn btn-secondary">
              Seleccionar todos
            </button>
            <button onClick={() => setSeleccion(new Set())} className="btn btn-secondary">
              Ninguno
            </button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs tracking-wide text-neutral-400 uppercase">
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Academia</th>
                  <th className="px-4 py-3">Grado</th>
                  {categoria?.modalidad !== 'tul' && <th className="px-4 py-3">Peso</th>}
                  <th className="px-4 py-3">Situación</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => {
                  const puede = seleccionable(c);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-white/5 last:border-0 ${puede ? 'cursor-pointer hover:bg-white/[0.03]' : 'opacity-60'}`}
                      onClick={() => puede && toggle(c.id)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="size-4 accent-tkd-gold"
                          disabled={!puede}
                          checked={c.inscrito || seleccion.has(c.id)}
                          onChange={() => toggle(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Seleccionar a ${c.nombre}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{c.nombre}</td>
                      <td className="px-4 py-3">{c.academia}</td>
                      <td className="px-4 py-3">{[c.cinta, c.dan].filter(Boolean).join(' · ')}</td>
                      {categoria?.modalidad !== 'tul' && <td className="px-4 py-3">{c.peso_kg} kg</td>}
                      <td className="px-4 py-3">
                        {errores[c.id] ? (
                          <span className="text-red-300">{errores[c.id]}</span>
                        ) : c.inscrito ? (
                          <span className="text-emerald-400">Ya inscrito</span>
                        ) : c.inscrito_en_otra ? (
                          <span className="text-neutral-400">Inscrito en «{c.inscrito_en_otra}»</span>
                        ) : c.motivos.length ? (
                          <span className="text-red-300">{c.motivos.join('. ')}</span>
                        ) : (
                          <span className="text-neutral-400">Cumple</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!visibles.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      No hay taekwondistas para mostrar
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-neutral-400">{seleccion.size} seleccionado(s)</span>
            <button onClick={inscribir} disabled={!seleccion.size || enviando} className="btn btn-primary">
              {enviando ? 'Inscribiendo…' : 'Inscribir seleccionados'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
