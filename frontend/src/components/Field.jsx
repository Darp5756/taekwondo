// Renderiza un campo de formulario a partir de su definición en resources.js.
export default function Field({ field, value, onChange, error, options = [], isEdit }) {
  const id = `f-${field.name}`;
  const required = field.required && !(isEdit && field.optionalOnEdit);
  const common = {
    id,
    name: field.name,
    required,
    className: 'input',
    'aria-invalid': Boolean(error),
  };

  let control;
  if (field.type === 'select') {
    control = (
      <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{field.required ? 'Selecciona…' : '— Ninguno —'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={field.name}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-tkd-gold"
        />
        {field.label}
      </label>
    );
  } else {
    control = (
      <input
        {...common}
        type={field.type || 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        maxLength={field.maxLength}
        min={field.min}
        max={field.max}
        placeholder={isEdit && field.editPlaceholder ? field.editPlaceholder : field.placeholder}
        autoComplete={field.type === 'password' ? 'new-password' : undefined}
      />
    );
  }

  return (
    <div>
      <label htmlFor={id} className="label">
        {field.label}
        {required && <span className="text-tkd-gold"> *</span>}
      </label>
      {control}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
