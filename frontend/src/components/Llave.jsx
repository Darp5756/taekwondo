// Dibujo de una llave de eliminación simple a partir de sus combates.
import { Link } from 'react-router';
import { EstadoBadge, Resultado } from '../resources.jsx';

const ESTADO_LLAVE = {
  pendiente: { label: 'Sin comenzar', className: 'bg-neutral-700 text-neutral-200' },
  en_curso: { label: 'En curso', className: 'bg-tkd-gold text-black' },
  finalizada: { label: 'Finalizada', className: 'bg-emerald-600 text-white' },
};

export function EstadoLlaveBadge({ estado }) {
  const e = ESTADO_LLAVE[estado] ?? ESTADO_LLAVE.pendiente;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.className}`}>{e.label}</span>;
}

function Esquina({ combate, lado }) {
  const id = combate[`id_inscripcion_${lado}`];
  const ganador = id != null && combate.id_inscripcion_ganador === id;
  const perdio = combate.estado === 'finalizado' && id != null && !ganador;
  const esBye = combate.resuelto_automaticamente && id == null;
  return (
    <div
      className={`flex items-center gap-2 border-l-4 px-3 py-1.5 ${lado === 'rojo' ? 'border-tkd-red' : 'border-tkd-blue'} ${
        ganador ? 'bg-white/[0.06]' : ''
      }`}
    >
      <div className={`min-w-0 flex-1 ${perdio ? 'text-neutral-500' : ''}`}>
        {id != null ? (
          <>
            <p className={`truncate text-sm ${ganador ? 'font-bold text-white' : 'font-medium'}`}>
              {combate[`taekwondista_${lado}`]}
              {combate[`retirado_${lado}`] && <span className="ml-1 text-xs text-red-300">(retirado)</span>}
            </p>
            <p className="truncate text-xs text-neutral-500">{combate[`academia_${lado}`]}</p>
          </>
        ) : (
          <p className="text-sm text-neutral-600 italic">{esBye ? 'Pase directo' : 'Por definir'}</p>
        )}
      </div>
      {ganador && <span className="text-tkd-gold">●</span>}
    </div>
  );
}

function TarjetaCombate({ combate }) {
  const jugable = combate.id_inscripcion_rojo && combate.id_inscripcion_azul;
  const contenido = (
    <div
      className={`card w-60 overflow-hidden transition ${jugable ? 'hover:border-tkd-gold/60' : ''} ${
        combate.resuelto_automaticamente ? 'opacity-60' : ''
      }`}
    >
      <Esquina combate={combate} lado="rojo" />
      <Esquina combate={combate} lado="azul" />
      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-1 text-xs">
        <EstadoBadge estado={combate.estado} />
        <span className="text-neutral-400">
          {combate.estado === 'finalizado' && !combate.resuelto_automaticamente && <Resultado combate={combate} />}
          {combate.resuelto_automaticamente && combate.tipo_victoria === 'wo' && 'W.O.'}
        </span>
      </div>
    </div>
  );
  return jugable ? (
    <Link to={`/combates/${combate.id}/marcador`} title="Abrir marcador">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}

export default function Llave({ combates }) {
  const totalRondas = Math.max(...combates.map((c) => c.numero_ronda));
  const rondas = Array.from({ length: totalRondas }, (_, i) =>
    combates.filter((c) => c.numero_ronda === i + 1 && !(i + 1 === totalRondas && c.posicion === 1)),
  );
  const tercerPuesto = combates.find((c) => c.numero_ronda === totalRondas && c.posicion === 1);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-8">
          {rondas.map((lista, i) => (
            <div key={i} className="flex flex-col">
              <p className="mb-3 text-center text-xs font-semibold tracking-wide text-neutral-400 uppercase">
                {lista[0]?.ronda}
              </p>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {lista.map((c) => (
                  <TarjetaCombate key={c.id} combate={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {tercerPuesto && (
        <div>
          <p className="mb-3 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Combate por el tercer puesto</p>
          <TarjetaCombate combate={tercerPuesto} />
        </div>
      )}
    </div>
  );
}
