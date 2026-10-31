# Taekwondo ITF · Gestión de competencias

Monorepo con dos proyectos Node.js preparados para desplegar en Vercel:

| Carpeta     | Qué es                                                                  | Stack                                          |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| `backend/`  | API REST con login (JWT) y CRUD de todas las tablas                     | Express 5, PostgreSQL (`pg`), zod, bcryptjs    |
| `frontend/` | SPA con login, CRUDs, inscripciones, llaves y marcadores de matsogi y tul | React 19, Vite, Tailwind CSS 4, React Router |
| `docs/`     | Archivos de referencia                                                  | HTML del marcador original y esquema DBML      |

## Funcionalidades

- **Login** con email y contraseña, sesión con JWT (8 h por defecto) y cambio de contraseña.
- **Configuración inicial**: si la base no tiene usuarios, la pantalla de login permite crear el primer administrador (no hace falta correr scripts en producción).
- **Roles**: `admin` (todo, incluida la gestión de usuarios) y `operador` (todo excepto usuarios). Desactivar un usuario corta su acceso de inmediato.
- **CRUD** de academias, estados, categorías, cintas, danes, tules, competencias, taekwondistas, inscripciones, combates y usuarios, con búsqueda, filtros, paginación y validación con mensajes en español.
- **Dos modalidades**: categorías de **matsogi** (combate; por edad y peso) y de **tul** (formas; por edad y grado). Ambas pueden limitarse por sexo y por rango de cinta o dan.
- **Inscripciones** por competencia y categoría, con validación de sexo, edad a la fecha de la competencia, peso (del pesaje si se cargó) y grado, e **inscripción múltiple** que muestra quién cumple y por qué no.
- **Llaves de eliminación simple** para las dos modalidades: sorteo con byes repartidos, separación opcional de compañeros, ajuste manual, avance automático, combate por el tercer puesto opcional y podio.
- **Estados de Venezuela**: cada taekwondista pertenece a un estado (los 23 estados y el Distrito Capital vienen en el seed).
- **Borrado lógico**: eliminar no borra la fila, la marca con `eliminado_en` y deja de aparecer. Los administradores tienen una **papelera** en cada pantalla para ver lo eliminado y restaurarlo. Un nombre eliminado se puede volver a usar.
- **Integridad**: no se pueden eliminar registros que otros registros activos usan (p. ej. una competencia con combates), no se puede asignar un registro eliminado (p. ej. una academia), los rivales de un combate deben ser distintos y el ganador debe ser uno de ellos, rangos de edad/peso coherentes, etc.
- **Marcador de matsogi** (`/combates/:id/marcador`): versión en React de `docs/marcador-original.html`. Los puntos y avisos se guardan solos en el combate; al iniciar el tiempo el combate pasa a "en curso" y desde el panel del presidente de mesa se finaliza eligiendo ganador y tipo de victoria.
- **Marcador de tul**: sorteo (o elección de la mesa) del tul dentro del rango de la categoría, voto de cada juez por rojo o azul y ganador por mayoría.

## Cómo se organiza una competencia

1. **Categorías**: se crean con su modalidad. En tul se configura el rango de tules permitidos, cuántos tules se ejecutan por encuentro (1 o 2), si los sortea el sistema o los elige la mesa, y la cantidad de jueces (impar, 3 por defecto: no hay votos de empate).
2. **Taekwondistas** y **competencia**.
3. **Inscripciones** (`Inscripciones → Inscripción múltiple`): se elige competencia y categoría y se marca a quiénes inscribir. Un atleta puede estar en una categoría de cada modalidad por competencia. Para casos especiales (fusionar categorías con pocos inscritos) existe la opción **«Fuera de categoría»** en la inscripción individual.
4. **Llave** (`Llaves → Nueva llave`): se sortea con los inscritos activos, se revisa la primera ronda, se pueden intercambiar posiciones tocándolas y se confirma.
5. **Marcador**: desde la llave se abre cada combate. Al finalizarlo, el ganador pasa solo al combate siguiente.

### Reglas de las llaves

- Con N inscritos la llave tiene la siguiente potencia de 2 de posiciones; las sobrantes son **pases directos (byes)**, siempre enfrentados a un competidor real y repartidos entre las dos mitades de la llave. Con 5 inscritos: llave de 8, 3 byes y un solo combate real en primera ronda.
- **Separación** (opcional): por academia o por estado. El sorteo ubica a los compañeros para que se crucen lo más tarde posible y avisa de los cruces de primera ronda que no se pudieron evitar.
- **Tercer puesto** (opcional, activado por defecto): los perdedores de semifinal pelean por el bronce. Sin él hay dos bronces. Con 3 inscritos hay una sola semifinal y el bronce va directo a quien la pierde.
- **Reabrir** un combate solo se puede mientras el combate siguiente no haya empezado; la app lo impide si ya se disputó.
- **Retiro**: al marcar una inscripción como retirada, sus combates pendientes se resuelven por **W.O.** Si se reincorpora, se deshacen esos W.O. siempre que nadie haya disputado los combates siguientes.
- Una llave ya generada no incluye a quien se inscriba después: la llave lo avisa y, si todavía no empezó, se puede eliminar y volver a generar.

## Desarrollo local

Requisitos: Node.js 22+ y PostgreSQL (local, Docker o una base gratuita de [Neon](https://neon.tech)).

```bash
npm install                                  # instala ambos proyectos (npm workspaces)
cp backend/.env.example backend/.env         # y completa DATABASE_URL y JWT_SECRET
npm run db:migrate                           # aplica las migraciones pendientes
npm run db:seed                              # cintas, danes, tules, estados + admin de ADMIN_EMAIL/ADMIN_PASSWORD (opcional)
npm run dev                                  # API en :3000 y web en http://localhost:5173
```

Vite redirige `/api` al backend local, así que en desarrollo el frontend no necesita configuración.

Si no corres el seed con `ADMIN_EMAIL`, al abrir la web verás la pantalla de **configuración inicial** para crear el administrador.

### Tests

```bash
# TEST_DATABASE_URL debe apuntar a una base SOLO para tests: se borra en cada ejecución
npm test
```

Incluyen tests unitarios del sorteo y de la elegibilidad, y tests de integración de la API contra PostgreSQL real (login, permisos, CRUD, inscripciones, llaves, tul).

## Migraciones y seed

Los dos comandos son **idempotentes**: se pueden correr todas las veces que quieras sin duplicar ni perder datos.

- **Migraciones** (`npm run db:migrate`): los archivos de `backend/db/migrations/` se aplican en orden y cada uno queda registrado en la tabla `schema_migrations`, así que solo corren los pendientes. Cada migración va en su propia transacción (si falla, no queda a medias) y un lock evita que dos ejecuciones simultáneas choquen.
- **Seed** (`npm run db:seed`): inserta cada cinta, dan, tul (los 24 ITF), estado y el admin solo si no existe uno con el mismo nombre/email, **incluidos los eliminados**. Así no duplica nada y tampoco restaura lo que se haya borrado a propósito desde la aplicación.

Para cambiar el esquema, **no edites una migración ya aplicada**: crea un archivo nuevo con el siguiente número (`003_descripcion.sql`). Conviene escribirlo con `IF NOT EXISTS` / `IF EXISTS`, como los actuales.

> La migración `005` deja obsoletas las columnas `combates.id_taekwondista_rojo/azul/ganador` (los combates ahora apuntan a inscripciones). Se mantienen para que el código anterior siga funcionando durante el despliegue; una migración posterior las eliminará.

> La migración `001` es el esquema original. Las bases creadas antes de que existieran las migraciones ya tienen esas tablas; como `001` está escrita con `IF NOT EXISTS`, en ellas no cambia nada y solo queda registrada.

## Despliegue en Vercel

Se crean **dos proyectos de Vercel** apuntando a este mismo repositorio, cambiando el *Root Directory*.

### 1. Base de datos

Crea una base PostgreSQL (Vercel → Storage → Neon, o directamente en neon.tech) y copia la cadena de conexión **pooled**. Aplica el esquema una vez desde tu máquina:

```bash
DATABASE_URL="postgres://..." npm run db:migrate
DATABASE_URL="postgres://..." npm run db:seed     # opcional
```

Cada vez que se agreguen migraciones o datos al seed, repite esos dos comandos contra la base de producción **antes** de desplegar el código nuevo. Las migraciones están pensadas para que el código anterior siga funcionando con el esquema nuevo, pero el código nuevo no funciona con el esquema anterior.

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

CRUD genérico para `academias`, `estados`, `categorias`, `cintas`, `danes`, `tules`, `competencias`, `taekwondistas`, `inscripciones` y `combates`:

| Método | Ruta              | Notas                                                                       |
| ------ | ----------------- | --------------------------------------------------------------------------- |
| GET    | `/<recurso>`      | `?q=` búsqueda, `?limit=` (máx. 500), `?offset=`, filtros por columna        |
| GET    | `/<recurso>/:id`  |                                                                             |
| POST   | `/<recurso>`      | Crea; responde 201 con el registro                                          |
| PUT    | `/<recurso>/:id`  | Reemplaza todos los campos                                                  |
| PATCH  | `/<recurso>/:id`  | Actualiza solo los campos enviados (lo usa el marcador)                     |
| DELETE | `/<recurso>/:id`  | Borrado lógico. 204; 409 si otros registros activos dependen de él          |
| GET    | `/<recurso>?eliminados=true` | Solo `admin`: la papelera (acepta los mismos filtros)            |
| POST   | `/<recurso>/:id/restaurar`   | Solo `admin`. 409 si ya existe otro activo con el mismo valor único; 400 si apunta a un registro eliminado |

`/usuarios` también tiene `?eliminados=true` y `POST /usuarios/:id/restaurar`. Un usuario eliminado no puede iniciar sesión y su token deja de funcionar.

Filtros disponibles:
`categorias?modalidad=&sexo=`, `taekwondistas?id_academia=&id_categoria=&id_cinta=&id_dan=&id_estado=&sexo=`,
`inscripciones?id_competencia=&id_categoria=&id_taekwondista=&retirado=` y `combates?id_competencia=&id_categoria=&estado=&id_llave=`.
Las listas incluyen los nombres de los registros relacionados (`academia`, `categoria`, `taekwondista_rojo`, ...). El listado de combates no muestra los byes.

Por el CRUD de `combates` se crean los **combates sueltos** y se editan puntos y avisos. En los combates de una llave no se pueden cambiar competidores, categoría ni ronda, ni eliminarlos sueltos.

Rutas propias:

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET    | `/inscripciones/candidatos?id_competencia=&id_categoria=` | Todos los taekwondistas, con `motivos` si no cumplen la categoría e indicando si ya están inscritos |
| POST   | `/inscripciones/lote` | `{ id_competencia, id_categoria, taekwondistas: [ids] }`. Todo o nada: si alguno falla, `details` trae el motivo por taekwondista |
| GET    | `/llaves?id_competencia=&id_categoria=` | Llaves con participantes y estado (`pendiente`, `en_curso`, `finalizada`) |
| GET    | `/llaves/:id` | Llave con sus combates, `podio` e `inscritos_fuera` |
| POST   | `/llaves/sorteo` | `{ id_competencia, id_categoria, separacion }` → propuesta `{ tamano, slots, avisos }`. No guarda nada |
| POST   | `/llaves` | `{ id_competencia, id_categoria, tercer_puesto, separacion, slots }`: crea la llave y sus combates |
| DELETE | `/llaves/:id` | Elimina la llave y sus combates (409 si ya se disputó alguno) |
| POST   | `/combates/:id/finalizar` | `{ ganador: 'rojo' \| 'azul', tipo_victoria }`. En tul solo W.O., descalificación o abandono |
| POST   | `/combates/:id/reabrir` | Vuelve a abrir un combate (409 si el siguiente ya empezó) |
| POST   | `/combates/:id/tules/sorteo` | Sortea los tules del encuentro (categorías con sorteo) |
| PUT    | `/combates/:id/tules` | `{ tules: [ids] }` (categorías con elección manual) |
| POST   | `/combates/:id/votos` | `{ votos: ['rojo', 'azul', ...] }`, uno por juez en orden; finaliza por mayoría |

Tipos de victoria: `puntos`, `decision`, `ko`, `abandono`, `descalificacion`, `wo`, `votos` (tul) y `bye` (pase directo, lo asigna el sistema).

Errores: `{ error, details? }` con 400 (validación; `details` = `[{ field, message }]`), 401, 403, 404 o 409.

Para agregar una tabla nueva: créala en una migración nueva (con su columna `eliminado_en timestamptz`), defínela en `backend/src/resources.js` y agrega su pantalla en `frontend/src/resources.jsx`. Las comprobaciones de relaciones del borrado lógico leen las FK de PostgreSQL, así que no hay que configurarlas.

## Base de datos

Las migraciones de `backend/db/migrations/` implementan `docs/schema-original.dbml` en PostgreSQL con estos ajustes (el esquema resultante está en `docs/schema.dbml`):

- `tinyint` → `smallint` (PostgreSQL no tiene `tinyint`), con `CHECK` de 0 a 255.
- En el DBML original la relación `competencias.id < combates.id` unía los `id` de ambas tablas; se cambió por `combates.id_competencia → competencias.id`.
- Se agregaron las FK de `combates` hacia `taekwondistas` (rojo, azul, ganador), que no estaban en el diagrama.
- Nueva tabla `usuarios` para el login.
- Nueva tabla `estados` y columna `taekwondistas.id_estado`. En la base es nullable para no romper los competidores que ya estaban cargados; la API la exige al crear o editar, así que al editar uno antiguo hay que elegirle el estado.
- Columna `eliminado_en` en todas las tablas (borrado lógico). Los `UNIQUE` pasaron a índices únicos parciales (`WHERE eliminado_en IS NULL`).
- `sexo` en taekwondistas (nullable por los registros anteriores; la API lo exige) y en categorías (`mixto` por defecto).
- Categorías con `modalidad`, rango de grado (cinta y dan) y configuración de tul; el peso pasa a ser obligatorio solo en matsogi. La categoría del taekwondista pasa a ser opcional («categoría habitual»), porque la categoría en la que compite se define en cada inscripción.
- Nuevas tablas `tules`, `inscripciones`, `llaves`, `combate_tules` y `combate_votos`.
- Los combates apuntan a inscripciones (`id_inscripcion_rojo/azul/ganador`) y guardan su posición en la llave y adónde pasan el ganador y el perdedor. Los combates existentes se migraron creando sus inscripciones.

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
| Inscripción múltiple | `frontend/src/pages/InscripcionMultiple.jsx` |
| Llaves          | `frontend/src/pages/Llaves.jsx`, `LlaveNueva.jsx`, `LlaveDetalle.jsx`, `components/Llave.jsx` |
| Marcador matsogi | `frontend/src/pages/Marcador.jsx`         |
| Marcador tul    | `frontend/src/pages/MarcadorTul.jsx`       |

## Estructura

```
backend/
  api/index.js            entrada serverless para Vercel
  db/migrations/          migraciones SQL numeradas
  db/migrator.js          aplica las migraciones pendientes
  db/seeder.js            datos base (cintas, danes, tules, estados)
  scripts/                migrate.js y seed.js (comandos npm)
  src/app.js              app Express (rutas y middlewares)
  src/resources.js        definición y validación de cada tabla
  src/lib/crud.js         router CRUD genérico (con borrado lógico y papelera)
  src/lib/relations.js    comprobaciones de relaciones con registros eliminados
  src/dominio/            reglas de negocio: elegibilidad, inscripciones, sorteo, llaves, combates
  src/routes/             auth, usuarios y rutas propias de inscripciones, llaves y combates
  test/                   tests unitarios y de integración
frontend/
  src/resources.jsx       campos y columnas de cada pantalla CRUD
  src/pages/              Login, Dashboard, CrudPage, inscripción múltiple, llaves y marcadores
  src/components/         Layout, formularios, modales
  src/auth/               contexto de sesión y rutas protegidas
docs/
  marcador-original.html  marcador entregado originalmente
  schema-original.dbml    esquema entregado originalmente
  schema.dbml             esquema actualizado
```
