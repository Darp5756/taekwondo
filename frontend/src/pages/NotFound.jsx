import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-mono text-7xl font-black text-tkd-gold">404</p>
      <p className="mt-4 text-neutral-400">La página que buscas no existe.</p>
      <Link to="/" className="btn btn-primary mt-6">
        Volver al inicio
      </Link>
    </div>
  );
}
