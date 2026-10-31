import { Link } from 'react-router';

// Configuración de las pantallas CRUD. Cada recurso corresponde a /api/<path>.
//
// fields:  campos del formulario (type: text | number | date | select | checkbox | password)
//          - source:  { path, label } para cargar opciones de otra tabla
//          - options: lista fija [{ value, label }]
//          - filter:  (opcion, valoresDelFormulario) => boolean, para limitar opciones
//          - showIf:  (valoresDelFormulario) => boolean, para mostrar el campo solo en algunos casos
//          - help:    texto de ayuda bajo el campo
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

export const MODALIDADES = [
  { value: 'matsogi', label: 'Matsogi (combate)' },
  { value: 'tul', label: 'Tul (formas)' },
];
export const modalidadLabel = (m) => (m === 'tul' ? 'Tul' : 'Matsogi');
export const categoriaLabel = (c) => `${c.nombre} · ${modalidadLabel(c.modalidad)}`;

const SEXOS = [
  { value: 'femenino', label: 'Femenino' },
  { value: 'masculino', label: 'Masculino' },
];
const SEXOS_CATEGORIA = [{ value: 'mixto', label: 'Mixto' }, ...SEXOS];
const sexoLabel = (v) => SEXOS_CATEGORIA.find((s) => s.value === v)?.label ?? '';

const esTul = (form) => form.modalidad === 'tul';
const esMatsogi = (form) => form.modalidad !== 'tul';

const rango = (min, max, sufijo = '') => {
  if (min == null && max == null) return null;
  if (min === max) return `${min}${sufijo}`;
  return `${min ?? '…'} – ${max ?? '…'}${sufijo}`;
};

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
    path: 'inscripciones',
    title: 'Inscripciones',
    singular: 'inscripción',
    icon: '📝',
    headerActions: [{ label: 'Inscripción múltiple', to: '/inscripciones/multiple' }],
    filters: [
      { name: 'id_competencia', label: 'Competencia', source: { path: 'competencias', label: (c) => c.nombre } },
      { name: 'id_categoria', label: 'Categoría', source: { path: 'categorias', label: categoriaLabel } },
      {
        name: 'retirado',
        label: 'Situación',
        options: [
          { value: 'false', label: 'Activos' },
          { value: 'true', label: 'Retirados' },
        ],
      },
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
        name: 'id_taekwondista',
        label: 'Taekwondista',
        type: 'select',
        required: true,
        source: { path: 'taekwondistas', label: taekwondistaLabel },
      },
      {
        name: 'id_categoria',
        label: 'Categoría',
        type: 'select',
        required: true,
        source: { path: 'categorias', label: categoriaLabel },
      },
      {
        name: 'peso_kg',
        label: 'Peso en el pesaje (kg)',
        type: 'number',
        min: 0,
        max: 255,
        help: 'Opcional. Si está vacío se usa el peso registrado del taekwondista.',
      },
      { name: 'retirado', label: 'Retirado: pierde por W.O. los combates que le queden', type: 'checkbox' },
      {
        name: 'fuera_de_categoria',
        label: 'Fuera de categoría: inscribir aunque no cumpla edad, peso, grado o sexo',
        type: 'checkbox',
      },
    ],
    columns: [
      { key: 'competencia', label: 'Competencia' },
      {
        key: 'taekwondista',
        label: 'Taekwondista',
        render: (r) => (
          <span>
            {r.taekwondista}
            {r.fuera_de_categoria && (
              <span className="ml-2 rounded bg-tkd-gold/20 px-1.5 py-0.5 text-xs text-tkd-gold" title="Inscrito fuera de categoría">
                excepción
              </span>
            )}
          </span>
        ),
      },
      { key: 'academia', label: 'Academia' },
      { key: 'categoria', label: 'Categoría', render: (r) => `${r.categoria} · ${modalidadLabel(r.modalidad)}` },
      {
        key: 'peso',
        label: 'Peso',
        render: (r) => (r.modalidad === 'tul' ? null : `${r.peso_efectivo_kg} kg${r.peso_kg != null ? ' (pesaje)' : ''}`),
      },
      {
        key: 'retirado',
        label: 'Situación',
        render: (r) => (r.retirado ? <span className="text-red-300">Retirado</span> : <span className="text-emerald-400">Activo</span>),
      },
    ],
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
      { name: 'id_estado', label: 'Estado', source: { path: 'estados', label: (e) => e.nombre } },
      { name: 'sexo', label: 'Sexo', options: SEXOS },
    ],
    fields: [
      { name: 'nombre', label: 'Nombre completo', required: true, maxLength: 150 },
      { name: 'sexo', label: 'Sexo', type: 'select', required: true, options: SEXOS },
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', required: true },
      { name: 'peso_kg', label: 'Peso (kg)', type: 'number', min: 0, max: 255, required: true },
      {
        name: 'id_academia',
        label: 'Academia',
        type: 'select',
        required: true,
        source: { path: 'academias', label: (a) => a.nombre },
      },
      { name: 'id_estado', label: 'Estado', type: 'select', required: true, source: { path: 'estados', label: (e) => e.nombre } },
      { name: 'id_cinta', label: 'Cinta', type: 'select', required: true, source: { path: 'cintas', label: (c) => c.nombre } },
      { name: 'id_dan', label: 'Dan', type: 'select', source: { path: 'danes', label: (d) => d.nombre } },
      {
        name: 'id_categoria',
        label: 'Categoría habitual',
        type: 'select',
        source: { path: 'categorias', label: categoriaLabel },
        help: 'Opcional. La categoría en la que compite se elige en cada inscripción.',
      },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'sexo', label: 'Sexo', render: (r) => sexoLabel(r.sexo) || null },
      { key: 'academia', label: 'Academia' },
      { key: 'estado', label: 'Estado' },
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
    path: 'estados',
    title: 'Estados',
    singular: 'estado',
    icon: '📍',
    fields: [{ name: 'nombre', label: 'Nombre', required: true, maxLength: 50 }],
    columns: [{ key: 'nombre', label: 'Nombre' }],
    rowActions: [{ label: 'Competidores', to: (r) => `/taekwondistas?id_estado=${r.id}` }],
  },
  {
    path: 'categorias',
    title: 'Categorías',
    singular: 'categoría',
    icon: '📋',
    filters: [
      { name: 'modalidad', label: 'Modalidad', options: MODALIDADES },
      { name: 'sexo', label: 'Sexo', options: SEXOS_CATEGORIA },
    ],
    fields: [
      { name: 'nombre', label: 'Nombre', required: true, maxLength: 50 },
      { name: 'modalidad', label: 'Modalidad', type: 'select', required: true, options: MODALIDADES, default: 'matsogi' },
      { name: 'sexo', label: 'Sexo', type: 'select', required: true, options: SEXOS_CATEGORIA, default: 'mixto' },
      { name: 'edad_minima', label: 'Edad mínima', type: 'number', min: 0, max: 255, required: true },
      { name: 'edad_maxima', label: 'Edad máxima', type: 'number', min: 0, max: 255, required: true },
      {
        name: 'peso_minimo_kg',
        label: 'Peso mínimo (kg)',
        type: 'number',
        min: 0,
        max: 255,
        required: true,
        showIf: esMatsogi,
      },
      {
        name: 'peso_maximo_kg',
        label: 'Peso máximo (kg)',
        type: 'number',
        min: 0,
        max: 255,
        required: true,
        showIf: esMatsogi,
      },
      {
        name: 'id_tul_desde',
        label: 'Tules permitidos: desde',
        type: 'select',
        required: true,
        showIf: esTul,
        source: { path: 'tules', label: (t) => `${t.orden}. ${t.nombre}` },
      },
      {
        name: 'id_tul_hasta',
        label: 'Tules permitidos: hasta',
        type: 'select',
        required: true,
        showIf: esTul,
        source: { path: 'tules', label: (t) => `${t.orden}. ${t.nombre}` },
      },
      {
        name: 'tules_por_encuentro',
        label: 'Tules por encuentro',
        type: 'select',
        required: true,
        showIf: esTul,
        default: '1',
        options: [
          { value: '1', label: '1' },
          { value: '2', label: '2' },
        ],
      },
      {
        name: 'eleccion_tul',
        label: 'Cómo se elige el tul',
        type: 'select',
        required: true,
        showIf: esTul,
        default: 'sorteo',
        options: [
          { value: 'sorteo', label: 'Sorteo automático' },
          { value: 'manual', label: 'Lo elige la mesa' },
        ],
      },
      {
        name: 'jueces',
        label: 'Jueces',
        type: 'number',
        min: 1,
        max: 9,
        step: 2,
        required: true,
        showIf: esTul,
        default: 3,
        help: 'Número impar: no hay votos de empate.',
      },
      {
        name: 'id_cinta_minima',
        label: 'Cinta mínima',
        type: 'select',
        source: { path: 'cintas', label: (c) => c.nombre },
        help: 'Opcional: restringe la categoría por grado.',
      },
      { name: 'id_cinta_maxima', label: 'Cinta máxima', type: 'select', source: { path: 'cintas', label: (c) => c.nombre } },
      { name: 'id_dan_minimo', label: 'Dan mínimo', type: 'select', source: { path: 'danes', label: (d) => d.nombre } },
      { name: 'id_dan_maximo', label: 'Dan máximo', type: 'select', source: { path: 'danes', label: (d) => d.nombre } },
    ],
    columns: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'modalidad', label: 'Modalidad', render: (r) => modalidadLabel(r.modalidad) },
      { key: 'sexo', label: 'Sexo', render: (r) => sexoLabel(r.sexo) },
      { key: 'edad', label: 'Edad', render: (r) => rango(r.edad_minima, r.edad_maxima, ' años') },
      {
        key: 'detalle',
        label: 'Peso / Tules',
        render: (r) =>
          r.modalidad === 'tul'
            ? `${rango(r.tul_desde, r.tul_hasta)} · ${r.jueces} jueces`
            : rango(r.peso_minimo_kg, r.peso_maximo_kg, ' kg'),
      },
      {
        key: 'grado',
        label: 'Grado',
        render: (r) => [rango(r.cinta_minima, r.cinta_maxima), rango(r.dan_minimo, r.dan_maximo)].filter(Boolean).join(' · ') || null,
      },
    ],
  },
  {
    path: 'tules',
    title: 'Tules',
    singular: 'tul',
    icon: '🌀',
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
