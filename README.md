# Taekwondo ITF · Gestión de competencias

Monorepo con dos proyectos Node.js preparados para desplegar en Vercel:

| Carpeta     | Qué es                                                                  | Stack                                          |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| `backend/`  | API REST con login (JWT) y CRUD de todas las tablas                     | Express 5, PostgreSQL (`pg`), zod, bcryptjs    |
| `frontend/` | SPA con login, CRUDs, dashboard y marcador en vivo conectado a combates | React 19, Vite, Tailwind CSS 4, React Router   |
| `docs/`     | Archivos de referencia                                                  | HTML del marcador original y esquema DBML      |

## Funcionalidades

- **Login** con email y contraseña, sesión con JWT (8 h por defecto) y cambio de contraseña.
- **Configuración inicial**: si la base no tiene usuarios, la pantalla de login permite crear el primer administrador (no hace falta correr scripts en producción).
- **Roles**: `admin` (todo, incluida la gestión de usuarios) y `operador` (todo excepto usuarios). Desactivar un usuario corta su acceso de inmediato.
- **CRUD** de academias, categorías, cintas, danes, competencias, taekwondistas, combates y usuarios, con búsqueda, filtros, paginación y validación con mensajes en español.
- **Integridad**: no se pueden borrar registros que otros usan (p. ej. una competencia con combates), los rivales de un combate deben ser distintos y el ganador debe ser uno de ellos, rangos de edad/peso coherentes, etc.
- **Marcador** (`/combates/:id/marcador`): versión en React de `docs/marcador-original.html`. Los puntos y avisos se guardan solos en el combate; al iniciar el tiempo el combate pasa a "en curso" y desde el panel del presidente de mesa se finaliza eligiendo ganador.

## Desarrollo local

Requisitos: Node.js 22+ y PostgreSQL (local, Docker o una base gratuita de [Neon](https://neon.tech)).

```bash
npm install                                  # instala ambos proyectos (npm workspaces)
cp backend/.env.example backend/.env         # y completa DATABASE_URL y JWT_SECRET
npm run db:migrate                           # crea las tablas (se puede repetir sin perder datos)
npm run db:seed                              # opcional: cintas y danes ITF + admin de ADMIN_EMAIL/ADMIN_PASSWORD
npm run dev                                  # API en :3000 y web en http://localhost:5173
```

Vite redirige `/api` al backend local, así que en desarrollo el frontend no necesita configuración.

Si no corres el seed con `ADMIN_EMAIL`, al abrir la web verás la pantalla de **configuración inicial** para crear el administrador.

### Tests

```bash
# TEST_DATABASE_URL debe apuntar a una base SOLO para tests: se borra en cada ejecución
npm test
```

Son tests de integración de la API contra PostgreSQL real (login, permisos, CRUD, validaciones, reglas de combates).

## Despliegue en Vercel

Se crean **dos proyectos de Vercel** apuntando a este mismo repositorio, cambiando el *Root Directory*.

### 1. Base de datos

Crea una base PostgreSQL (Vercel → Storage → Neon, o directamente en neon.tech) y copia la cadena de conexión **pooled**. Aplica el esquema una vez desde tu máquina:

```bash
DATABASE_URL="postgres://..." npm run db:migrate
DATABASE_URL="postgres://..." npm run db:seed     # opcional
```

### 2. Backend

- New Project → este repo → **Root Directory: `backend`** (Framework preset: Other).
- Variables de entorno:
  - `DATABASE_URL`: cadena de conexión pooled.
  - `JWT_SECRET`: valor largo y aleatorio (`openssl rand -hex 32`).
  - `CORS_ORIGINS`: URL del frontend, p. ej. `https://taekwondo-web.vercel.app` (puedes poner varias separadas por coma).
- `backend/vercel.json` envía todas las rutas a `api/index.js`, que exporta la app de Express como función serverless.
- Verifica: `https://<backend>.vercel.app/api/health` → `{"ok":true}`.

### 3. Frontend

- New Project → este repo → **Root Directory: `frontend`** (Vite se detecta solo).
- Variable de entorno: `VITE_API_URL=https://<backend>.vercel.app` (sin `/api`).
- `frontend/vercel.json` hace que todas las rutas carguen `index.html` (necesario para la SPA).

> Alternativa sin CORS: en lugar de `VITE_API_URL`, agrega en `frontend/vercel.json` un rewrite
> `{ "source": "/api/(.*)", "destination": "https://<backend>.vercel.app/api/$1" }` antes del de `index.html`.

## API

Todas las rutas van bajo `/api`. Salvo `auth/login`, `auth/setup` y `health`, requieren el header `Authorization: Bearer <token>`.

| Método | Ruta                  | Descripción                                               |
| ------ | --------------------- | --------------------------------------------------------- |
| POST   | `/auth/login`         | `{ email, password }` → `{ token, user }`                 |
| GET    | `/auth/me`            | Usuario de la sesión                                      |
| PUT    | `/auth/password`      | `{ password_actual, password_nueva }`                     |
| GET    | `/auth/setup`         | `{ needsSetup }`: `true` si aún no hay usuarios           |
| POST   | `/auth/setup`         | Crea el primer admin (solo si no hay usuarios)            |
| CRUD   | `/usuarios`           | Solo `admin`. La contraseña nunca se devuelve             |

CRUD genérico para `academias`, `categorias`, `cintas`, `danes`, `competencias`, `taekwondistas` y `combates`:

| Método | Ruta              | Notas                                                                       |
| ------ | ----------------- | --------------------------------------------------------------------------- |
| GET    | `/<recurso>`      | `?q=` búsqueda, `?limit=` (máx. 500), `?offset=`, filtros por columna        |
| GET    | `/<recurso>/:id`  |                                                                             |
| POST   | `/<recurso>`      | Crea; responde 201 con el registro                                          |
| PUT    | `/<recurso>/:id`  | Reemplaza todos los campos                                                  |
| PATCH  | `/<recurso>/:id`  | Actualiza solo los campos enviados (lo usa el marcador)                     |
| DELETE | `/<recurso>/:id`  | 204; 409 si otros registros dependen de él                                  |

Filtros disponibles: `taekwondistas?id_academia=&id_categoria=&id_cinta=&id_dan=` y `combates?id_competencia=&id_categoria=&estado=`.
Las listas de `taekwondistas` y `combates` incluyen los nombres de los registros relacionados (`academia`, `categoria`, `taekwondista_rojo`, ...).

Errores: `{ error, details? }` con 400 (validación; `details` = `[{ field, message }]`), 401, 403, 404 o 409.

Para agregar una tabla nueva basta con crearla en `backend/db/schema.sql`, definirla en `backend/src/resources.js` y agregar su pantalla en `frontend/src/resources.jsx`.

## Base de datos

`backend/db/schema.sql` implementa `docs/schema-original.dbml` en PostgreSQL con estos ajustes (el esquema resultante está en `docs/schema.dbml`):

- `tinyint` → `smallint` (PostgreSQL no tiene `tinyint`), con `CHECK` de 0 a 255.
- En el DBML original la relación `competencias.id < combates.id` unía los `id` de ambas tablas; se cambió por `combates.id_competencia → competencias.id`.
- Se agregaron las FK de `combates` hacia `taekwondistas` (rojo, azul, ganador), que no estaban en el diagrama.
- Nueva tabla `usuarios` para el login.

## Diseño con Stitch

El frontend usa **Tailwind CSS**, que es lo que exporta [Stitch](https://stitch.withgoogle.com), así que los diseños se pueden integrar sin cambiar de librería:

1. Genera en Stitch la pantalla (p. ej. "pantalla de login para app de competencias de taekwondo, modo oscuro, rojo #d90429, azul #004e98, dorado #ffb703").
2. Exporta el código y copia el HTML dentro del `return` del componente correspondiente en `frontend/src/pages/` (o `components/`).
3. Pásalo a JSX: `class` → `className`, `for` → `htmlFor`, cierra las etiquetas (`<input />`, `<img />`).
4. Conserva la lógica existente: los `value`/`onChange` de los inputs, el `onSubmit` del formulario y las llamadas a `api()`.

Los colores del marcador original ya están disponibles como clases: `bg-tkd-red`, `bg-tkd-blue`, `text-tkd-gold`, `bg-tkd-dark`, y hay clases base en `frontend/src/index.css` (`btn`, `btn-primary`, `input`, `label`, `card`).

| Pantalla        | Archivo                                    |
| --------------- | ------------------------------------------ |
| Login / setup   | `frontend/src/pages/Login.jsx`             |
| Menú lateral    | `frontend/src/components/Layout.jsx`       |
| Inicio          | `frontend/src/pages/Dashboard.jsx`         |
| Listado CRUD    | `frontend/src/pages/CrudPage.jsx`          |
| Formularios     | `frontend/src/components/ResourceForm.jsx` |
| Marcador        | `frontend/src/pages/Marcador.jsx`          |

## Estructura

```
backend/
  api/index.js            entrada serverless para Vercel
  db/schema.sql           esquema PostgreSQL
  scripts/                migrate.js y seed.js
  src/app.js              app Express (rutas y middlewares)
  src/resources.js        definición y validación de cada tabla
  src/lib/crud.js         router CRUD genérico
  src/routes/             auth y usuarios
  test/                   tests de integración
frontend/
  src/resources.jsx       campos y columnas de cada pantalla CRUD
  src/pages/              Login, Dashboard, CrudPage, Marcador
  src/components/         Layout, formularios, modales
  src/auth/               contexto de sesión y rutas protegidas
docs/
  marcador-original.html  marcador entregado originalmente
  schema-original.dbml    esquema entregado originalmente
  schema.dbml             esquema actualizado
```
