// Piezas compartidas por los marcadores de matsogi y de tul.
import { useState } from 'react';
import { Link } from 'react-router';
import { TIPOS_VICTORIA, tipoVictoriaLabel } from '../resources.jsx';
import Alert from './Alert.jsx';
import Modal from './Modal.jsx';

export function PanelButton({ className = '', ...props }) {
  return (
    <button
      {...props}
      className={`my-1.5 w-full rounded-xl p-4 font-bold uppercase transition hover:brightness-110 disabled:opacity-40 ${className}`}
    />
  );
}

export function SaveIndicator({ state, error }) {
  const text = { idle: '', saving: 'Guardando…', saved: '✓ Guardado', error: `⚠ ${error}` }[state];
  return (
    <p className={`mt-1 min-h-4 text-xs ${state === 'error' ? 'text-red-400' : 'text-neutral-500'}`} aria-live="polite">
      {text}
    </p>
  );
}

// Línea con el resultado de un combate finalizado.
export function ResultadoFinal({ combate }) {
  if (combate.estado !== 'finalizado') return null;
  return (
    <p className="mt-1 text-sm font-semibold text-tkd-gold">
      {combate.taekwondista_ganador ? `🏆 Ganador: ${combate.taekwondista_ganador}` : 'Sin ganador'}
      {combate.tipo_victoria && ` · ${tipoVictoriaLabel(combate.tipo_victoria)}`}
      {combate.resuelto_automaticamente && ' (automático)'}
    </p>
  );
}

// Pantalla de un combate de llave que todavía espera a uno de sus competidores.
export function EsperandoRivales({ combate, volver }) {
  const nombre = (lado) => combate[`taekwondista_${lado}`] ?? 'Por definir';
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md space-y-4 p-8 text-center">
        <p className="text-sm text-neutral-400">
          {combate.competencia} · {combate.categoria} · {combate.ronda}
        </p>
        <p className="text-xl font-bold">
          <span className="text-red-400">{nombre('rojo')}</span>
          <span className="mx-2 text-neutral-500">vs</span>
          <span className="text-blue-400">{nombre('azul')}</span>
        </p>
        <p className="text-neutral-300">
          Este combate todavía espera el resultado de un combate anterior de la llave.
        </p>
        <Link to={volver} className="btn btn-secondary">
          ← Volver
        </Link>
      </div>
    </div>
  );
}

/**
 * Modal para finalizar a mano: elegir ganador y tipo de victoria.
 * tipos: valores permitidos (ver TIPOS_VICTORIA). marcador(lado) muestra el
 * puntaje o votos de cada lado. sugerido: 'rojo' | 'azul' | null.
 */
export function FinishModal({ combate, tipos, tipoInicial, sugerido, marcador, onCancel, onConfirm, error, ayuda }) {
  const [ganador, setGanador] = useState(sugerido);
  const [tipo, setTipo] = useState(tipoInicial ?? tipos[0]);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      await onConfirm({ ganador, tipo });
    } finally {
      setEnviando(false);
    }
  };

  const opcion = (lado) => (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${
        ganador === lado ? 'border-tkd-gold' : 'border-white/10'
      } ${lado === 'rojo' ? 'bg-tkd-red/30' : 'bg-tkd-blue/30'}`}
    >
      <input
        type="radio"
        name="ganador"
        checked={ganador === lado}
        onChange={() => setGanador(lado)}
        className="accent-tkd-gold"
      />
      <span className="flex-1 font-semibold">{combate[`taekwondista_${lado}`]}</span>
      {marcador && <span className="font-mono text-xl font-black">{marcador(lado)}</span>}
    </label>
  );

  return (
    <Modal title="Finalizar combate" onClose={onCancel}>
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">Selecciona el ganador del combate.</p>
        {opcion('rojo')}
        {opcion('azul')}
        {ayuda && <p className="text-sm text-tkd-gold">{ayuda}</p>}
        <div>
          <label htmlFor="tipo_victoria" className="label">
            Tipo de victoria
          </label>
          <select id="tipo_victoria" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_VICTORIA.filter((t) => tipos.includes(t.value)).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!ganador || enviando} className="btn btn-primary">
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  );
}
