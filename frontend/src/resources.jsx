import { Link } from 'react-router';

// Configuración de las pantallas CRUD. Cada recurso corresponde a /api/<path>.
//
// fields:  campos del formulario (type: text | number | date | select | checkbox | password)
//          - source:  { path, label } para cargar opciones de otra tabla
//          - options: lista fija [{ value, label }]
//          - filter:  (opcion, valoresDelFormulario) => boolean, para limitar opciones
// columns: columnas de la tabla ({ key, label, render? })

export const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'finalizado', label: 'Finalizado' },
];

const estadoStyles = {
  pendiente: 'bg-neutral-700 text-neutral-200',
  en_curso: 'bg-tkd-gold text-black',
  finalizado: 'bg-emerald-600 text-white',
};

export function EstadoBadge({ estado }) {
  const label = ESTADOS.find((e) => e.value === estado)?.label ?? estado;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estadoStyles[estado]}`}>{label}</span>;
}

const formatDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es') : '');

const taekwondistaLabel = (t) => `${t.nombre} · ${t.academia}`;

export const resources = [
  {
    path: 'competencias',
    title: 'Competencias',
    singular: 'competencia',
    icon: '🏆',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true, maxLength: 100 },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'lugar', label: 'Lugar', required: true, maxLength: 150 },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'fecha', label: 'Fecha', render: (r) => formatDate(r.fecha) },
      { key: 'lugar', label: 'Lugar' },
    ],
    rowActions: [{ label: 'Combates', to: (r) => `/combates?id_competencia=${r.id}` }],
  },
  {
    path: 'combates',
    title: 'Combates',
    singular: 'combate',
    icon: '🥊',
    filters: [
      { name: 'id_competencia', label: 'Competencia', source: { path: 'competencias', label: (c) => c.nombre } },
      { name: 'estado', label: 'Estado', options: ESTADOS },
    ],
    fields: [
      {
        name: 'id_competencia',
        label: 'Competencia',
        type: 'select',
        required: true,
        source: { path: 'competencias', label: (c) => `${c.nombre} (${formatDate(c.fecha)})` },
      },
      {
        name: 'id_categoria',
        label: 'Categoría',
        type: 'select',
        required: true,
        source: { path: 'categorias', label: (c) => c.nombre },
      },
      { name: 'ronda', label: 'Ronda', required: true, maxLength: 20, placeholder: 'Ej: Cuartos, Semifinal, Final' },
      {
        name: 'id_taekwondista_rojo',
        label: 'Competidor rojo',
        type: 'select',
        required: true,
        source: { path: 'taekwondistas', label: taekwondistaLabel },
        filter: (t, form) => !form.id_categoria || String(t.id_categoria) === String(form.id_categoria),
      },
      {
        name: 'id_taekwondista_azul',
        label: 'Competidor azul',
        type: 'select',
        required: true,
        source: { path: 'taekwondistas', label: taekwondistaLabel },
        filter: (t, form) =>
          String(t.id) !== String(form.id_taekwondista_rojo) &&
          (!form.id_categoria || String(t.id_categoria) === String(form.id_categoria)),
      },
      { name: 'estado', label: 'Estado', type: 'select', required: true, options: ESTADOS, default: 'pendiente' },
      { name: 'puntos_rojo', label: 'Puntos rojo', type: 'number', required: true, default: 0 },
      { name: 'puntos_azul', label: 'Puntos azul', type: 'number', required: true, default: 0 },
      { name: 'amonestaciones_rojo', label: 'Avisos rojo', type: 'number', min: 0, required: true, default: 0 },
      { name: 'amonestaciones_azul', label: 'Avisos azul', type: 'number', min: 0, required: true, default: 0 },
      {
        name: 'id_taekwondista_ganador',
        label: 'Ganador',
        type: 'select',
        source: { path: 'taekwondistas', label: taekwondistaLabel },
        filter: (t, form) => [String(form.id_taekwondista_rojo), String(form.id_taekwondista_azul)].includes(String(t.id)),
      },
    ],
    columns: [
      { key: 'competencia', label: 'Competencia' },
      { key: 'ronda', label: 'Ronda' },
      { key: 'categoria', label: 'Categoría' },
      {
        key: 'rivales',
        label: 'Rojo vs Azul',
        render: (r) => (
          <span className="whitespace-nowrap">
            <span className="font-semibold text-red-400">{r.taekwondista_rojo}</span>
            <span className="mx-1 text-neutral-500">vs</span>
            <span className="font-semibold text-blue-400">{r.taekwondista_azul}</span>
          </span>
        ),
      },
      {
        key: 'marcador',
        label: 'Marcador',
        render: (r) => (
          <span className="font-mono font-bold">
            {r.puntos_rojo} - {r.puntos_azul}
          </span>
        ),
      },
      { key: 'estado', label: 'Estado', render: (r) => <EstadoBadge estado={r.estado} /> },
      { key: 'taekwondista_ganador', label: 'Ganador' },
    ],
    rowActions: [{ label: 'Marcador', to: (r) => `/combates/${r.id}/marcador`, primary: true }],
  },
  {
    path: 'taekwondistas',
    title: 'Taekwondistas',
    singular: 'taekwondista',
    icon: '🥋',
    filters: [
      { name: 'id_academia', label: 'Academia', source: { path: 'academias', label: (a) => a.nombre } },
      { name: 'id_categoria', label: 'Categoría', source: { path: 'categorias', label: (c) => c.nombre } },
    ],
    fields: [
      { name: 'nombre', label: 'Nombre completo', required: true, maxLength: 150 },
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', required: true },
      { name: 'peso_kg', label: 'Peso (kg)', type: 'number', min: 0, max: 255, required: true },
      {
        name: 'id_academia',
        label: 'Academia',
        type: 'select',
        required: true,
        source: { path: 'academias', label: (a) => a.nombre },
      },
      {
        name: 'id_categoria',
        label: 'Categoría',
        type: 'select',
        required: true,
        source: {
          path: 'categorias',
          label: (c) => `${c.nombre} (${c.edad_minima}-${c.edad_maxima} años, ${c.peso_minimo_kg}-${c.peso_maximo_kg} kg)`,
        },
      },
      { name: 'id_cinta', label: 'Cinta', type: 'select', required: true, source: { path: 'cintas', label: (c) => c.nombre } },
      { name: 'id_dan', label: 'Dan', type: 'select', source: { path: 'danes', label: (d) => d.nombre } },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'academia', label: 'Academia' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'cinta', label: 'Cinta' },
      { key: 'dan', label: 'Dan' },
      { key: 'peso_kg', label: 'Peso', render: (r) => `${r.peso_kg} kg` },
      { key: 'fecha_nacimiento', label: 'Nacimiento', render: (r) => formatDate(r.fecha_nacimiento) },
    ],
  },
  {
    path: 'academias',
    title: 'Academias',
    singular: 'academia',
    icon: '🏫',
    fields: [{ name: 'nombre', label: 'Nombre', required: true, maxLength: 100 }],
    columns: [{ key: 'nombre', label: 'Nombre' }],
    rowActions: [{ label: 'Alumnos', to: (r) => `/taekwondistas?id_academia=${r.id}` }],
  },
  {
    path: 'categorias',
    title: 'Categorías',
    singular: 'categoría',
    icon: '📋',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true, maxLength: 50 },
      { name: 'edad_minima', label: 'Edad mínima', type: 'number', min: 0, max: 255, required: true },
      { name: 'edad_maxima', label: 'Edad máxima', type: 'number', min: 0, max: 255, required: true },
      { name: 'peso_minimo_kg', label: 'Peso mínimo (kg)', type: 'number', min: 0, max: 255, required: true },
      { name: 'peso_maximo_kg', label: 'Peso máximo (kg)', type: 'number', min: 0, max: 255, required: true },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'edad', label: 'Edad', render: (r) => `${r.edad_minima} – ${r.edad_maxima} años` },
      { key: 'peso', label: 'Peso', render: (r) => `${r.peso_minimo_kg} – ${r.peso_maximo_kg} kg` },
    ],
  },
  {
    path: 'cintas',
    title: 'Cintas',
    singular: 'cinta',
    icon: '🎗️',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true, maxLength: 30 },
      { name: 'orden', label: 'Orden', type: 'number', min: 0, max: 255, required: true },
    ],
    columns: [
      { key: 'orden', label: 'Orden' },
      { key: 'nombre', label: 'Nombre' },
    ],
  },
  {
    path: 'danes',
    title: 'Danes',
    singular: 'dan',
    icon: '⭐',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true, maxLength: 20 },
      { name: 'numero', label: 'Número', type: 'number', min: 0, max: 255, required: true },
    ],
    columns: [
      { key: 'numero', label: 'Número' },
      { key: 'nombre', label: 'Nombre' },
    ],
  },
  {
    path: 'usuarios',
    title: 'Usuarios',
    singular: 'usuario',
    icon: '👤',
    adminOnly: true,
    noPagination: true,
    fields: [
      { name: 'nombre', label: 'Nombre', required: true, maxLength: 100 },
      { name: 'email', label: 'Email', type: 'email', required: true, maxLength: 150 },
      {
        name: 'password',
        label: 'Contraseña',
        type: 'password',
        required: true,
        optionalOnEdit: true,
        editPlaceholder: 'Déjala vacía para no cambiarla',
        placeholder: 'Mínimo 8 caracteres',
      },
      {
        name: 'rol',
        label: 'Rol',
        type: 'select',
        required: true,
        default: 'operador',
        options: [
          { value: 'operador', label: 'Operador' },
          { value: 'admin', label: 'Administrador' },
        ],
      },
      { name: 'activo', label: 'Usuario activo', type: 'checkbox', default: true },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'email', label: 'Email' },
      { key: 'rol', label: 'Rol', render: (r) => (r.rol === 'admin' ? 'Administrador' : 'Operador') },
      {
        key: 'activo',
        label: 'Estado',
        render: (r) =>
          r.activo ? <span className="text-emerald-400">Activo</span> : <span className="text-neutral-500">Inactivo</span>,
      },
    ],
  },
];

export const resourceByPath = Object.fromEntries(resources.map((r) => [r.path, r]));

export function RowActionLink({ action, row }) {
  return (
    <Link to={action.to(row)} className={`btn px-3 py-1 ${action.primary ? 'btn-primary' : 'btn-secondary'}`}>
      {action.label}
    </Link>
  );
}
