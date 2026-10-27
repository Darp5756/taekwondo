import { useState } from 'react';
import { api } from '../api.js';
import Alert from './Alert.jsx';
import Modal from './Modal.jsx';

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', confirmar: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password_nueva !== form.confirmar) return setError('Las contraseñas nuevas no coinciden');
    setSaving(true);
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: { password_actual: form.password_actual, password_nueva: form.password_nueva },
      });
      setDone(true);
    } catch (err) {
      setError(err.fieldErrors?.password_nueva || err.message);
    } finally {
      setSaving(false);
    }
  };

  const input = (name, label, autoComplete) => (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        type="password"
        required
        className="input"
        autoComplete={autoComplete}
        value={form[name]}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      />
    </div>
  );

  return (
    <Modal title="Cambiar contraseña" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">Contraseña actualizada correctamente.</Alert>
          <div className="flex justify-end">
            <button onClick={onClose} className="btn btn-primary">
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Alert>{error}</Alert>
          {input('password_actual', 'Contraseña actual', 'current-password')}
          {input('password_nueva', 'Nueva contraseña (mín. 8 caracteres)', 'new-password')}
          {input('confirmar', 'Repite la nueva contraseña', 'new-password')}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancelar
            </button>
            <button disabled={saving} className="btn btn-primary">
              {saving ? 'Guardando…' : 'Cambiar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
