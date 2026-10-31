// Asistente para generar una llave: elegir competencia y categoría, sortear,
// ajustar a mano intercambiando posiciones y confirmar.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import Alert from '../components/Alert.jsx';
import { categoriaLabel } from '../resources.jsx';

const SEPARACIONES = [
  { value: 'ninguna', label: 'No separar' },
  { value: 'academia', label: 'Separar por academia' },
  { value: 'estado', label: 'Separar por estado' },
];

export default function LlaveNueva() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const idCompetencia = params.get('id_competencia') ?? '';
  const idCategoria = params.get('id_categoria') ?? '';

  const [competencias, setCompetencias] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [inscritos, setInscritos] = useState(null);
  const [existente, setExistente] = useState(null);
  const [tercerPuesto, setTercerPuesto] = useState(true);
  const [separacion, setSeparacion] = useState('ninguna');
  const [propuesta, setPropuesta] = useState(null); // { tamano, slots }
  const [seleccionado, setSeleccionado] = useState(null); // índice de slot
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api('/competencias', { params: { limit: 500 } }).then((r) => setCompetencias(r.data)).catch((e) => setError(e.message));
    api('/categorias', { params: { limit: 500 } }).then((r) => setCategorias(r.data)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setPropuesta(null);
    setInscritos(null);
    setExistente(null);
    setError('');
    if (!idCompetencia || !idCategoria) return;
    const filtro = { id_competencia: idCompetencia, id_categoria: idCategoria };
    api('/inscripciones', { params: { ...filtro, retirado: 'false', limit: 1 } })
      .then((r) => setInscritos(r.total))
      .catch((e) => setError(e.message));
    api('/llaves', { params: filtro })
      .then((r) => setExistente(r.data[0] ?? null))
      .catch((e) => setError(e.message));
  }, [idCompetencia, idCategoria]);

  const setParam = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };

  const sortear = async () => {
    setError('');
    setSeleccionado(null);
    try {
      setPropuesta(
        await api('/llaves/sorteo', {
          method: 'POST',
          body: { id_competencia: idCompetencia, id_categoria: idCategoria, separacion },
        }),
      );
    } catch (e) {
      setError(e.message);
    }
  };

  // Intercambia dos posiciones (participante o bye). No se permite dejar un
  // combate de primera ronda sin competidores.
  const tocar = (i) => {
    if (seleccionado === null) return setSeleccionado(i);
    if (seleccionado === i) return setSeleccionado(null);
    const slots = [...propuesta.slots];
    [slots[seleccionado], slots[i]] = [slots[i], slots[seleccionado]];
    const vacio = slots.some((_, k) => k % 2 === 0 && slots[k] === null && slots[k + 1] === null);
    if (vacio) {
      setError('No puede quedar un combate de primera ronda con dos pases directos.');
    } else {
      setError('');
      setPropuesta({ ...propuesta, slots });
    }
    setSeleccionado(null);
  };

  // Cruces de primera ronda entre compañeros (según la separación elegida).
  const avisos = useMemo(() => {
    if (!propuesta || separacion === 'ninguna') return [];
    const lista = [];
    for (let k = 0; k < propuesta.slots.length; k += 2) {
      const [a, b] = [propuesta.slots[k], propuesta.slots[k + 1]];
      if (a && b && a[separacion] && a[separacion] === b[separacion]) lista.push([a, b]);
    }
    return lista;
  }, [propuesta, separacion]);

  const confirmar = async () => {
    setEnviando(true);
    setError('');
    try {
      const llave = await api('/llaves', {
        method: 'POST',
        body: {
          id_competencia: idCompetencia,
          id_categoria: idCategoria,
          tercer_puesto: tercerPuesto,
          separacion,
          slots: propuesta.slots.map((s) => s?.id ?? null),
        },
      });
      navigate(`/llaves/${llave.id}`);
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  };

  const byes = propuesta?.slots.filter((s) => s === null).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🏅 Nueva llave</h1>
          <p className="text-sm text-neutral-400">Eliminación simple con los inscritos activos de la categoría.</p>
        </div>
        <Link to="/llaves" className="btn btn-secondary">
          ← Llaves
        </Link>
      </div>

      <div className="card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="competencia">
              Competencia
            </label>
            <select
              id="competencia"
              className="input"
              value={idCompetencia}
              onChange={(e) => setParam('id_competencia', e.target.value)}
            >
              <option value="">Selecciona…</option>
              {competencias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="categoria">
              Categoría
            </label>
            <select
              id="categoria"
              className="input"
              value={idCategoria}
              onChange={(e) => setParam('id_categoria', e.target.value)}
            >
              <option value="">Selecciona…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoriaLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {existente && (
          <Alert>
            Ya existe una llave para esta categoría.{' '}
            <Link to={`/llaves/${existente.id}`} className="underline">
              Ver la llave
            </Link>
            . Para generarla de nuevo, primero elimínala.
          </Alert>
        )}

        {inscritos !== null && !existente && (
          <>
            <p className="text-sm text-neutral-300">
              {inscritos} inscrito(s) activo(s).{' '}
              {inscritos < 2 && (
                <Link to={`/inscripciones/multiple?id_competencia=${idCompetencia}&id_categoria=${idCategoria}`} className="text-tkd-gold underline">
                  Inscribir taekwondistas
                </Link>
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="separacion">
                  Separación de atletas
                </label>
                <select
                  id="separacion"
                  className="input"
                  value={separacion}
                  onChange={(e) => setSeparacion(e.target.value)}
                >
                  {SEPARACIONES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Intenta que los compañeros no se crucen en las primeras rondas.
                </p>
              </div>
              <label className="flex items-center gap-2 self-center text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-tkd-gold"
                  checked={tercerPuesto}
                  onChange={(e) => setTercerPuesto(e.target.checked)}
                />
                Combate por el tercer puesto (si no, dos bronces)
              </label>
            </div>
            <button onClick={sortear} disabled={inscritos < 2} className="btn btn-primary">
              🎲 {propuesta ? 'Volver a sortear' : 'Sortear'}
            </button>
          </>
        )}
      </div>

      <Alert>{error}</Alert>

      {propuesta && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Primera ronda</h2>
              <p className="text-sm text-neutral-400">
                {propuesta.slots.length - byes} participantes · llave de {propuesta.tamano} · {byes} pase(s) directo(s).
                Toca dos posiciones para intercambiarlas.
              </p>
            </div>
            <button onClick={confirmar} disabled={enviando} className="btn btn-primary">
              {enviando ? 'Creando…' : 'Confirmar llave'}
            </button>
          </div>

          {avisos.length > 0 && (
            <Alert>
              No se pudo evitar que se crucen en primera ronda:{' '}
              {avisos.map(([a, b]) => `${a.taekwondista} vs ${b.taekwondista}`).join('; ')}.
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: propuesta.slots.length / 2 }, (_, k) => (
              <div key={k} className="card overflow-hidden">
                <p className="border-b border-white/5 px-3 py-1 text-xs text-neutral-500">Combate {k + 1}</p>
                {[2 * k, 2 * k + 1].map((i) => {
                  const s = propuesta.slots[i];
                  return (
                    <button
                      key={i}
                      onClick={() => tocar(i)}
                      aria-pressed={seleccionado === i}
                      className={`block w-full border-l-4 px-3 py-2 text-left transition ${
                        i % 2 === 0 ? 'border-tkd-red' : 'border-tkd-blue'
                      } ${seleccionado === i ? 'bg-tkd-gold/20' : 'hover:bg-white/5'}`}
                    >
                      {s ? (
                        <>
                          <p className="truncate text-sm font-medium">{s.taekwondista}</p>
                          <p className="truncate text-xs text-neutral-500">
                            {s.academia}
                            {s.estado && ` · ${s.estado}`}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-neutral-600 italic">Pase directo</p>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
