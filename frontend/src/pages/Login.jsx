import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Alert from '../components/Alert.jsx';
import Spinner from '../components/Spinner.jsx';

export default function Login() {
  const { user, login, setup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [needsSetup, setNeedsSetup] = useState(null);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', confirmar: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/auth/setup')
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch((err) => {
        setNeedsSetup(false);
        setError(err.message);
      });
  }, []);

  if (user) return <Navigate to={location.state?.from?.pathname ?? '/'} replace />;
  if (needsSetup === null) return <Spinner fullScreen />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (needsSetup && form.password !== form.confirmar) return setError('Las contraseñas no coinciden');
    setSubmitting(true);
    try {
      if (needsSetup) await setup({ nombre: form.nombre, email: form.email, password: form.password });
      else await login(form.email, form.password);
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (err) {
      const fields = err.fieldErrors ?? {};
      setError(Object.values(fields)[0] ?? err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const input = (name, label, type = 'text', autoComplete) => (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="input py-2.5"
        value={form[name]}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 overflow-hidden lg:flex">
        <div className="flex-1 bg-tkd-red" />
        <div className="flex-1 bg-tkd-blue" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="font-mono text-8xl font-black text-tkd-gold drop-shadow-lg">01:30</p>
          <p className="mt-4 text-4xl font-extrabold tracking-tight drop-shadow">Taekwondo ITF</p>
          <p className="mt-2 text-lg text-white/80">Gestión de competencias y marcador en vivo</p>
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 lg:max-w-lg">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="text-center lg:text-left">
            <span className="text-5xl lg:hidden">🥋</span>
            <h1 className="mt-2 text-3xl font-extrabold">{needsSetup ? 'Configuración inicial' : 'Iniciar sesión'}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {needsSetup
                ? 'Aún no hay usuarios. Crea la cuenta de administrador.'
                : 'Ingresa con tu cuenta para gestionar las competencias.'}
            </p>
          </div>

          <Alert>{error}</Alert>

          {needsSetup && input('nombre', 'Nombre', 'text', 'name')}
          {input('email', 'Email', 'email', 'email')}
          {input('password', 'Contraseña', 'password', needsSetup ? 'new-password' : 'current-password')}
          {needsSetup && input('confirmar', 'Repite la contraseña', 'password', 'new-password')}

          <button disabled={submitting} className="btn btn-primary w-full py-3 text-base">
            {submitting ? 'Ingresando…' : needsSetup ? 'Crear administrador' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
