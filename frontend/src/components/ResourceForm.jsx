import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Alert from './Alert.jsx';
import Field from './Field.jsx';
import useSourceRows, { optionsFor } from './useSourceRows.js';

const emptyValue = (field) => (field.type === 'checkbox' ? false : '');

function initialValues(fields, row) {
  return Object.fromEntries(
    fields.map((f) => {
      const value = row ? row[f.name] : f.default;
      if (value === null || value === undefined) return [f.name, emptyValue(f)];
      return [f.name, f.type === 'checkbox' ? Boolean(value) : String(value)];
    }),
  );
}

export default function ResourceForm({ resource, row, onSaved, onCancel }) {
  const isEdit = Boolean(row);
  const [values, setValues] = useState(() => initialValues(resource.fields, row));
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const sourceRows = useSourceRows(resource.fields);

  // Si un select filtrado deja de ofrecer el valor elegido (p. ej. al cambiar
  // la categoría de un combate), se limpia para no enviar datos inconsistentes.
  useEffect(() => {
    const invalid = resource.fields.filter(
      (f) =>
        f.filter &&
        values[f.name] !== '' &&
        sourceRows[f.source.path] &&
        !optionsFor(f, sourceRows, values).some((o) => o.value === values[f.name]),
    );
    if (invalid.length) setValues((v) => ({ ...v, ...Object.fromEntries(invalid.map((f) => [f.name, ''])) }));
  }, [values, sourceRows, resource.fields]);

  const setValue = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setFieldErrors((e) => ({ ...e, [name]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const saved = await api(isEdit ? `/${resource.path}/${row.id}` : `/${resource.path}`, {
        method: isEdit ? 'PUT' : 'POST',
        body: values,
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fieldErrors ?? {});
    } finally {
      setSaving(false);
    }
  };

  const visibleFields = resource.fields.filter((f) => !f.showIf || f.showIf(values));

  return (
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      <Alert>{error}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleFields.map((field) => (
          <div key={field.name} className={visibleFields.length === 1 ? 'sm:col-span-2' : undefined}>
            <Field
              field={field}
              value={values[field.name]}
              onChange={(v) => setValue(field.name, v)}
              error={fieldErrors[field.name]}
              options={optionsFor(field, sourceRows, values)}
              isEdit={isEdit}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'}
        </button>
      </div>
    </form>
  );
}
