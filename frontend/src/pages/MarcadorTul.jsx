// Marcador de tul: se define el tul (sorteo o elección de la mesa, según la
// categoría), cada juez vota por rojo o azul y gana la mayoría. Con jueces
// impares no hay empate.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import Alert from '../components/Alert.jsx';
import { FinishModal, ResultadoFinal } from '../components/MarcadorComun.jsx';

const TIPOS_TUL = ['wo', 'descalificacion', 'abandono'];
const LADOS = ['rojo', 'azul'];

export default function MarcadorTul({ combate, setCombate, volver }) {
  const finalizado = combate.estado === 'finalizado';
  const [tulesRango, setTulesRango] = useState([]);
  const [eleccion, setEleccion] = useState(() => Array(combate.tules_por_encuentro).fill(''));
  const [votos, setVotos] = useState(() =>
    combate.votos.length ? combate.votos : Array(combate.jueces).fill(null),
  );
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [otroResultado, setOtroResultado] = useState(false);
  const [finishError, setFinishError] = useState('');

  // Tules permitidos por la categoría, para la elección manual y para mostrar el rango.
  useEffect(() => {
    api('/tules', { params: { limit: 500 } })
      .then((r) => {
        const desde = r.data.find((t) => t.id === combate.id_tul_desde)?.orden;
        const hasta = r.data.find((t) => t.id === combate.id_tul_hasta)?.orden;
        setTulesRango(r.data.filter((t) => t.orden >= desde && t.orden <= hasta));
      })
      .catch((err) => setError(err.message));
  }, [combate.id_tul_desde, combate.id_tul_hasta]);

  // Si se reabre el combate, los votos vuelven a cero.
  useEffect(() => {
    setVotos(combate.votos.length ? combate.votos : Array(combate.jueces).fill(null));
  }, [combate.votos, combate.jueces]);

  const conteo = useMemo(
    () => Object.fromEntries(LADOS.map((l) => [l, votos.filter((v) => v === l).length])),
    [votos],
  );
  const tulDefinido = combate.tules.length === combate.tules_por_encuentro;
  const votosCompletos = votos.every(Boolean);

  const ejecutar = async (fn) => {
    setEnviando(true);
    setError('');
    try {
      setCombate(await fn());
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const sortear = () => ejecutar(() => api(`/combates/${combate.id}/tules/sorteo`, { method: 'POST' }));
  const elegir = () =>
    ejecutar(() => api(`/combates/${combate.id}/tules`, { method: 'PUT', body: { tules: eleccion.map(Number) } }));
  const confirmarVotos = () =>
    ejecutar(() => api(`/combates/${combate.id}/votos`, { method: 'POST', body: { votos } }));
  const reabrir = () => ejecutar(() => api(`/combates/${combate.id}/reabrir`, { method: 'POST' }));

  const finalizarManual = async ({ ganador, tipo }) => {
    setFinishError('');
    try {
      setCombate(
        await api(`/combates/${combate.id}/finalizar`, { method: 'POST', body: { ganador, tipo_victoria: tipo } }),
      );
      setOtroResultado(false);
    } catch (err) {
      setFinishError(err.message);
    }
  };

  const rango = tulesRango.length ? `${tulesRango[0].nombre} a ${tulesRango.at(-1).nombre}` : '';

  return (
    <div className="flex min-h-screen flex-col bg-tkd-dark text-white">
      <header className="relative border-b-2 border-neutral-800 bg-neutral-900 px-4 py-4 text-center">
        <Link to={volver} className="absolute top-4 left-4 text-sm text-neutral-400 hover:text-white">
          ← {combate.id_llave ? 'Llave' : 'Combates'}
        </Link>
        <p className="truncate px-24 text-xs text-neutral-400">
          {combate.competencia} · {combate.categoria} · {combate.ronda} · Tul
        </p>

        {/* Tul del encuentro */}
        <div className="mt-2">
          {tulDefinido ? (
            <p className="text-[clamp(2rem,6vw,4.5rem)] leading-tight font-extrabold text-tkd-gold">
              {combate.tules.map((t) => t.nombre).join(' · ')}
            </p>
          ) : (
            <p className="text-2xl font-bold text-neutral-500">Tul por definir</p>
          )}
          <p className="text-xs text-neutral-500">
            {combate.tules_por_encuentro === 2 ? '2 tules por encuentro' : '1 tul por encuentro'}
            {rango && ` · permitidos: ${rango}`}
          </p>
        </div>

        {!finalizado && combate.eleccion_tul === 'sorteo' && (
          <button onClick={sortear} disabled={enviando} className="btn btn-primary mt-3">
            🎲 {tulDefinido ? 'Volver a sortear' : 'Sortear tul'}
          </button>
        )}
        {!finalizado && combate.eleccion_tul === 'manual' && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {eleccion.map((valor, i) => (
              <select
                key={i}
                aria-label={`Tul ${i + 1}`}
                className="input w-48"
                value={valor}
                onChange={(e) => setEleccion((el) => el.map((v, j) => (j === i ? e.target.value : v)))}
              >
                <option value="">Tul {eleccion.length > 1 ? i + 1 : ''}…</option>
                {tulesRango.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            ))}
            <button onClick={elegir} disabled={enviando || eleccion.some((v) => !v)} className="btn btn-primary">
              {tulDefinido ? 'Cambiar tul' : 'Confirmar tul'}
            </button>
          </div>
        )}
        <ResultadoFinal combate={combate} />
      </header>

      {/* Competidores y votos */}
      <div className="flex flex-1 flex-col sm:flex-row">
        {LADOS.map((lado) => (
          <section
            key={lado}
            className={`flex flex-1 flex-col items-center justify-center gap-2 p-6 ${lado === 'rojo' ? 'bg-tkd-red' : 'bg-tkd-blue'}`}
          >
            <p className="max-w-full truncate text-center text-[clamp(1.25rem,3vw,2.25rem)] font-bold">
              {combate[`taekwondista_${lado}`]}
              {combate.id_inscripcion_ganador === combate[`id_inscripcion_${lado}`] && ' 🏆'}
            </p>
            <p className="text-sm text-white/70">{combate[`academia_${lado}`]}</p>
            <p className="text-[clamp(5rem,16vw,12rem)] leading-none font-black [text-shadow:5px_5px_15px_rgba(0,0,0,0.3)]">
              {conteo[lado]}
            </p>
            <p className="text-sm tracking-widest text-white/70 uppercase">votos</p>
          </section>
        ))}
      </div>

      {/* Mesa: votos de los jueces */}
      <section className="border-t-2 border-neutral-800 bg-neutral-950 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <Alert>{error}</Alert>
          <div className="flex flex-wrap justify-center gap-3">
            {votos.map((voto, i) => (
              <div key={i} className="rounded-xl bg-white/[0.04] p-3 text-center">
                <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Juez {i + 1}</p>
                <div className="flex gap-2">
                  {LADOS.map((lado) => (
                    <button
                      key={lado}
                      disabled={finalizado || !tulDefinido}
                      onClick={() => setVotos((v) => v.map((x, j) => (j === i ? lado : x)))}
                      aria-pressed={voto === lado}
                      aria-label={`Juez ${i + 1} vota ${lado}`}
                      className={`h-12 w-16 rounded-lg border-2 font-bold uppercase transition disabled:opacity-40 ${
                        voto === lado
                          ? lado === 'rojo'
                            ? 'border-white bg-tkd-red'
                            : 'border-white bg-tkd-blue'
                          : 'border-white/15 bg-transparent text-neutral-400'
                      }`}
                    >
                      {lado}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!tulDefinido && !finalizado && (
            <p className="text-center text-sm text-neutral-500">Define el tul para habilitar los votos.</p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {finalizado ? (
              combate.resuelto_automaticamente ? (
                <p className="text-sm text-neutral-400">Resuelto automáticamente (bye o W.O. por retiro).</p>
              ) : (
                <button onClick={reabrir} disabled={enviando} className="btn btn-secondary">
                  Reabrir encuentro
                </button>
              )
            ) : (
              <>
                <button
                  onClick={confirmarVotos}
                  disabled={enviando || !tulDefinido || !votosCompletos}
                  className="btn btn-primary px-8 py-3 text-base"
                >
                  Confirmar resultado
                </button>
                <button onClick={() => setOtroResultado(true)} className="btn btn-secondary">
                  W.O. / descalificación / abandono
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {otroResultado && (
        <FinishModal
          combate={combate}
          tipos={TIPOS_TUL}
          sugerido={null}
          error={finishError}
          onCancel={() => setOtroResultado(false)}
          onConfirm={finalizarManual}
        />
      )}
    </div>
  );
}
