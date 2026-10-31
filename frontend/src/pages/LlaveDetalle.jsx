import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import Alert from '../components/Alert.jsx';
import Llave, { EstadoLlaveBadge } from '../components/Llave.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { modalidadLabel } from '../resources.jsx';

const SEPARACION = { ninguna: 'Sin separación', academia: 'Separada por academia', estado: 'Separada por estado' };

export default function LlaveDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [llave, setLlave] = useState(null);
  const [error, setError] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  const cargar = useCallback(() => {
    api(`/llaves/${id}`)
      .then(setLlave)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    cargar();
    // Al volver a la pestaña (p. ej. desde el marcador en otra ventana) se actualiza.
    window.addEventListener('focus', cargar);
    return () => window.removeEventListener('focus', cargar);
  }, [cargar]);

  const eliminar = async () => {
    setErrorEliminar('');
    try {
      await api(`/llaves/${id}`, { method: 'DELETE' });
      navigate(`/llaves/nueva?id_competencia=${llave.id_competencia}&id_categoria=${llave.id_categoria}`);
    } catch (e) {
      setErrorEliminar(e.message);
    }
  };

  if (error && !llave) return <Alert>{error}</Alert>;
  if (!llave) return <Spinner />;

  const { podio } = llave;
  const hayPodio = podio.oro || podio.plata || podio.bronce.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-400">
            <Link to={`/llaves?id_competencia=${llave.id_competencia}`} className="hover:text-white">
              {llave.competencia}
            </Link>
          </p>
          <h1 className="text-2xl font-bold">
            {llave.categoria} · {modalidadLabel(llave.modalidad)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-400">
            <EstadoLlaveBadge estado={llave.estado} />
            <span>{llave.participantes} participantes</span>
            <span>{llave.tercer_puesto ? 'Con combate por el tercer puesto' : 'Dos bronces'}</span>
            <span>{SEPARACION[llave.separacion]}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar} className="btn btn-secondary">
            Actualizar
          </button>
          {llave.estado === 'pendiente' && (
            <button onClick={() => setEliminando(true)} className="btn btn-danger">
              Eliminar llave
            </button>
          )}
        </div>
      </div>

      {llave.inscritos_fuera.length > 0 && (
        <Alert>
          {llave.inscritos_fuera.length === 1 ? 'Hay 1 inscrito que no está' : `Hay ${llave.inscritos_fuera.length} inscritos que no están`}{' '}
          en la llave (se inscribieron después de generarla):{' '}
          {llave.inscritos_fuera.map((i) => i.taekwondista).join(', ')}.{' '}
          {llave.estado === 'pendiente'
            ? 'Para incluirlos, elimina la llave y genérala de nuevo.'
            : 'La llave ya comenzó, así que no se puede regenerar.'}
        </Alert>
      )}

      {hayPodio ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Puesto medalla="🥇" titulo="Oro" personas={podio.oro ? [podio.oro] : []} />
          <Puesto medalla="🥈" titulo="Plata" personas={podio.plata ? [podio.plata] : []} />
          <Puesto medalla="🥉" titulo="Bronce" personas={podio.bronce} />
        </div>
      ) : null}

      <Llave combates={llave.combates} />

      {eliminando && (
        <Modal title="Eliminar llave" onClose={() => setEliminando(false)}>
          <div className="space-y-4">
            <p className="text-neutral-300">
              Se eliminarán la llave y sus combates. Después podrás generarla de nuevo, por ejemplo para incluir
              inscritos nuevos.
            </p>
            <Alert>{errorEliminar}</Alert>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEliminando(false)} className="btn btn-secondary">
                Cancelar
              </button>
              <button onClick={eliminar} className="btn btn-danger">
                Eliminar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Puesto({ medalla, titulo, personas }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-neutral-400">
        {medalla} {titulo}
      </p>
      {personas.length ? (
        personas.map((p) => (
          <div key={p.id_inscripcion} className="mt-1">
            <p className="font-bold">{p.nombre}</p>
            <p className="text-xs text-neutral-500">{p.academia}</p>
          </div>
        ))
      ) : (
        <p className="mt-1 text-neutral-600 italic">Por definir</p>
      )}
    </div>
  );
}
