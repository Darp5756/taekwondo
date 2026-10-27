// Marcador ITF conectado a un combate. Port del HTML original
// (docs/marcador-original.html): cada cambio de puntos o avisos se guarda en
// el combate, y el temporizador es local.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import Alert from '../components/Alert.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';

const ROUND_SECONDS = 90;
const SAVE_DELAY_MS = 400;

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function Marcador() {
  const { id } = useParams();
  const [combate, setCombate] = useState(null);
  const [score, setScore] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState('');
  const [time, setTime] = useState(ROUND_SECONDS);
  const [running, setRunning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const pending = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    api(`/combates/${id}`)
      .then((c) => {
        setCombate(c);
        setScore({
          puntos_rojo: c.puntos_rojo,
          puntos_azul: c.puntos_azul,
          amonestaciones_rojo: c.amonestaciones_rojo,
          amonestaciones_azul: c.amonestaciones_azul,
        });
      })
      .catch((err) => setLoadError(err.message));
  }, [id]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setSaveState('saving');
    try {
      const saved = await api(`/combates/${id}`, { method: 'PATCH', body: patch });
      setCombate(saved);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setSaveError(err.message);
    }
  }, [id]);

  const save = useCallback(
    (patch, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      if (immediate) return flush();
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  // Guarda lo pendiente al salir de la pantalla.
  useEffect(() => () => void flush(), [flush]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTime((t) => Math.max(t - 1, 0)), 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (time === 0) setRunning(false);
  }, [time]);

  if (loadError)
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8">
        <Alert>{loadError}</Alert>
        <Link to="/combates" className="btn btn-secondary">
          ← Volver a combates
        </Link>
      </div>
    );
  if (!combate || !score) return <Spinner fullScreen />;

  const finalizado = combate.estado === 'finalizado';

  const updateScore = (changes) => {
    const next = { ...score, ...changes };
    setScore(next);
    save(next);
  };

  const addPoint = (color, pts) => updateScore({ [`puntos_${color}`]: score[`puntos_${color}`] + pts });

  // Regla ITF: cada 3 avisos (Kyong-go) se descuenta 1 punto.
  const addWarning = (color) => {
    const warnings = score[`amonestaciones_${color}`] + 1;
    updateScore({
      [`amonestaciones_${color}`]: warnings,
      [`puntos_${color}`]: score[`puntos_${color}`] - (warnings % 3 === 0 ? 1 : 0),
    });
  };

  const removeWarning = (color) => {
    const warnings = score[`amonestaciones_${color}`];
    if (warnings === 0) return;
    updateScore({
      [`amonestaciones_${color}`]: warnings - 1,
      [`puntos_${color}`]: score[`puntos_${color}`] + (warnings % 3 === 0 ? 1 : 0),
    });
  };

  const startStop = () => {
    if (!running && time === 0) return;
    if (!running && combate.estado === 'pendiente') save({ estado: 'en_curso' }, true);
    setRunning((r) => !r);
  };

  const resetTimer = () => {
    setRunning(false);
    setTime(ROUND_SECONDS);
  };

  const finish = async (ganador) => {
    setRunning(false);
    await save({ ...score, estado: 'finalizado', id_taekwondista_ganador: ganador }, true);
    setFinishing(false);
    setPanelOpen(false);
  };

  const reopen = () => save({ estado: 'en_curso', id_taekwondista_ganador: null }, true);

  const timerLabel = running ? 'PAUSA' : time === ROUND_SECONDS ? 'INICIAR' : 'REANUDAR';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-tkd-dark text-white">
      {/* Cabecera: tiempo y controles */}
      <header className="relative border-b-2 border-neutral-800 bg-neutral-900 px-4 py-3 text-center">
        <Link to="/combates" className="absolute top-3 left-4 text-sm text-neutral-400 hover:text-white">
          ← Combates
        </Link>
        <button
          onClick={() => setPanelOpen(true)}
          className="absolute top-3 right-4 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20"
        >
          Presi. de Mesa
        </button>
        <p className="truncate px-32 text-xs text-neutral-400">
          {combate.competencia} · {combate.categoria} · {combate.ronda}
        </p>
        <p className="font-mono text-[clamp(3.5rem,10vw,8rem)] leading-none font-extrabold text-tkd-gold">
          {formatTime(time)}
        </p>
        {time === 0 && <p className="text-lg font-bold tracking-widest text-tkd-gold">FINAL DEL ROUND</p>}
        <div className="mt-2 flex justify-center gap-3">
          <button onClick={startStop} disabled={finalizado} className="rounded bg-white px-8 py-2 font-bold text-black disabled:opacity-40">
            {timerLabel}
          </button>
          <button onClick={resetTimer} className="rounded bg-neutral-700 px-8 py-2 font-bold">
            RESET
          </button>
        </div>
        <SaveIndicator state={saveState} error={saveError} />
      </header>

      {/* Lados rojo y azul */}
      <div className="flex flex-1">
        {['rojo', 'azul'].map((color) => (
          <section
            key={color}
            className={`flex flex-1 flex-col items-center justify-center gap-4 p-4 ${color === 'rojo' ? 'bg-tkd-red' : 'bg-tkd-blue'}`}
          >
            <p className="max-w-full truncate text-center text-[clamp(1rem,2.5vw,2rem)] font-bold">
              {combate[`taekwondista_${color}`]}
              {combate.id_taekwondista_ganador === combate[`id_taekwondista_${color}`] && ' 🏆'}
            </p>
            <p className="rounded-full bg-black/30 px-5 py-1 text-[clamp(1rem,2vw,1.8rem)]">
              Avisos: {score[`amonestaciones_${color}`]}
            </p>
            <p className="text-[clamp(6rem,20vw,18rem)] leading-none font-black [text-shadow:5px_5px_15px_rgba(0,0,0,0.3)]">
              {score[`puntos_${color}`]}
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((pts) => (
                <button
                  key={pts}
                  onClick={() => addPoint(color, pts)}
                  disabled={finalizado}
                  className="size-[clamp(3.5rem,7vw,4.5rem)] rounded-full border-2 border-white bg-white/10 text-2xl font-bold transition active:bg-white active:text-black disabled:opacity-40"
                >
                  {pts}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Panel lateral del presidente de mesa */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${panelOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setPanelOpen(false)}
      />
      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col overflow-y-auto bg-neutral-950/95 p-6 shadow-2xl transition-transform duration-300 ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <button onClick={() => setPanelOpen(false)} className="self-end text-3xl text-neutral-500 hover:text-white">
          &times;
        </button>
        <h2 className="mb-6 text-center text-xl font-bold text-tkd-gold">Panel de Control</h2>

        {['rojo', 'azul'].map((color) => (
          <div key={color} className="mb-6 rounded-2xl bg-white/[0.03] p-5">
            <h3 className={`mb-3 font-bold uppercase ${color === 'rojo' ? 'text-red-400' : 'text-blue-400'}`}>{color}</h3>
            <PanelButton onClick={() => addWarning(color)} disabled={finalizado} className={color === 'rojo' ? 'bg-red-500' : 'bg-blue-500'}>
              +1 Aviso (Kyong-go)
            </PanelButton>
            <PanelButton onClick={() => addPoint(color, -1)} disabled={finalizado} className="border-2 border-white">
              -1 Deducción (Gam-jum)
            </PanelButton>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => removeWarning(color)}
                disabled={finalizado || score[`amonestaciones_${color}`] === 0}
                className="flex-1 rounded-lg bg-white/5 py-2 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-40"
              >
                Corregir: quitar aviso
              </button>
              <button
                onClick={() => addPoint(color, 1)}
                disabled={finalizado}
                className="flex-1 rounded-lg bg-white/5 py-2 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-40"
              >
                Corregir: +1 punto
              </button>
            </div>
          </div>
        ))}

        <p className="mb-6 text-center text-sm text-neutral-500">Nota: 3 avisos restan automáticamente 1 punto.</p>

        {finalizado ? (
          <PanelButton onClick={reopen} className="bg-neutral-700">
            Reabrir combate
          </PanelButton>
        ) : (
          <PanelButton onClick={() => setFinishing(true)} className="bg-tkd-gold text-black">
            Finalizar combate
          </PanelButton>
        )}
      </aside>

      {finishing && (
        <FinishModal combate={combate} score={score} onCancel={() => setFinishing(false)} onConfirm={finish} />
      )}
    </div>
  );
}

function PanelButton({ className = '', ...props }) {
  return (
    <button
      {...props}
      className={`my-1.5 w-full rounded-xl p-4 font-bold uppercase transition hover:brightness-110 disabled:opacity-40 ${className}`}
    />
  );
}

function SaveIndicator({ state, error }) {
  const text = { idle: '', saving: 'Guardando…', saved: '✓ Guardado', error: `⚠ No se pudo guardar: ${error}` }[state];
  return (
    <p className={`mt-1 h-4 text-xs ${state === 'error' ? 'text-red-400' : 'text-neutral-500'}`} aria-live="polite">
      {text}
    </p>
  );
}

function FinishModal({ combate, score, onCancel, onConfirm }) {
  const sugerido =
    score.puntos_rojo > score.puntos_azul
      ? combate.id_taekwondista_rojo
      : score.puntos_azul > score.puntos_rojo
        ? combate.id_taekwondista_azul
        : null;
  const [ganador, setGanador] = useState(sugerido);

  const option = (color) => {
    const value = combate[`id_taekwondista_${color}`];
    return (
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${
          ganador === value ? 'border-tkd-gold' : 'border-white/10'
        } ${color === 'rojo' ? 'bg-tkd-red/30' : 'bg-tkd-blue/30'}`}
      >
        <input type="radio" name="ganador" checked={ganador === value} onChange={() => setGanador(value)} className="accent-tkd-gold" />
        <span className="flex-1 font-semibold">{combate[`taekwondista_${color}`]}</span>
        <span className="font-mono text-xl font-black">{score[`puntos_${color}`]}</span>
      </label>
    );
  };

  return (
    <Modal title="Finalizar combate" onClose={onCancel}>
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">Selecciona el ganador del combate.</p>
        {option('rojo')}
        {option('azul')}
        {sugerido === null && <p className="text-sm text-tkd-gold">Empate en puntos: elige el ganador por decisión.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancelar
          </button>
          <button onClick={() => onConfirm(ganador)} disabled={!ganador} className="btn btn-primary">
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  );
}
