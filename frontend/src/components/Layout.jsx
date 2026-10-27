import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { resources } from '../resources.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-tkd-gold text-black' : 'text-neutral-300 hover:bg-white/5 hover:text-white'
  }`;

export default function Layout() {
  const { user, logout } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const items = resources.filter((r) => !r.adminOnly || user.rol === 'admin');

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-white/10 bg-neutral-950 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-5 py-4 md:py-6">
          <span className="text-3xl">🥋</span>
          <div>
            <p className="font-extrabold leading-tight tracking-tight">Taekwondo ITF</p>
            <p className="text-xs text-tkd-gold">Gestión de competencias</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto">
          <NavLink to="/" end className={linkClass}>
            <span>📊</span> Inicio
          </NavLink>
          {items.map((r) => (
            <NavLink key={r.path} to={`/${r.path}`} className={linkClass}>
              <span>{r.icon}</span> {r.title}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-4 md:block">
          <p className="truncate text-sm font-semibold">{user.nombre}</p>
          <p className="truncate text-xs text-neutral-500">
            {user.email} · {user.rol === 'admin' ? 'Administrador' : 'Operador'}
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setChangingPassword(true)} className="btn btn-secondary flex-1 px-2 py-1.5 text-xs">
              Contraseña
            </button>
            <button onClick={logout} className="btn btn-secondary flex-1 px-2 py-1.5 text-xs">
              Salir
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-sm md:hidden">
          <span className="truncate text-neutral-400">{user.nombre}</span>
          <div className="flex gap-3">
            <button onClick={() => setChangingPassword(true)} className="text-neutral-300">
              Contraseña
            </button>
            <button onClick={logout} className="text-tkd-gold">
              Salir
            </button>
          </div>
        </div>
        <main className="mx-auto max-w-7xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
