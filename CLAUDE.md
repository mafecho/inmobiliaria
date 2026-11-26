# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Proyecto

**Echavarría Grupo Inmobiliario** — landing page de una inmobiliaria familiar
(`echavarria-gi.com`, dominio oficial desde el 2026-11-17; antes había un
subdominio de prueba, `vivantia.enelmapa.co`, ya eliminado — ver más abajo).
Node.js + Express + EJS, sin bundler, MySQL (`mysql2`).

- **Fase 1** (octubre 2026): una sola página pública y un formulario de
  contacto que guarda leads.
- **Fase 2** (noviembre 2026): panel de administración en `/admin` con
  cuentas por asesor, CRUD de propiedades con fotos, y catálogo público en
  `/propiedades` donde aparece lo que esté marcado como `disponible`.

Mismo patrón arquitectónico que `enelmapa` (otro proyecto en esta cuenta de
cPanel): composition root en `container.js`, capas `routes/ → services/ →
repositories/` con todo el SQL en `repositories/`, sin singletons a nivel de
módulo. A diferencia de enelmapa, **no hay multi-tenancy** — Echavarría
Grupo Inmobiliario es un solo negocio. Sesiones y login sí hay desde la
Fase 2, con el mismo enfoque que enelmapa pero sin superadmin: sólo dos
roles, `admin` y `asesor`.

**Sobre el nombre:** el proyecto se planeó originalmente como "Vivantia
Bienes Raíces" (de ahí `stitch_vivantia_inmobiliaria_website/`, el
subdominio `vivantia.enelmapa.co`, la base de datos `moralesbilma_vivantia`
y el nombre de la app de Node en el servidor). El 2026-10-21 el cliente
renombró la marca a "Echavarría Grupo Inmobiliario" con una paleta azul
marino + dorado: se actualizó todo el texto y los colores visibles, pero los
identificadores técnicos se dejaron como "vivantia" porque el dominio propio
todavía no se había comprado.

El 2026-11-17 llegó el dominio oficial `echavarria-gi.com` (dominio
adicional en la misma cuenta cPanel) y **se renombró todo lo técnico a
"echavarria"**: docroot, app de Node, base de datos, paquete npm y los
nombres del script y del log de despliegue. El único "vivantia" que queda a
propósito es `stitch_vivantia_inmobiliaria_website/`: es el export del
diseño de la marca original y conserva su nombre para no perder la
procedencia.

El subdominio viejo **era solo una prueba**: no tenía tráfico ni leads que
valiera la pena conservar, así que se borró por completo —sin redirect— con
su base de datos y su app de Node. Si aparece una referencia a
`vivantia.enelmapa.co` en algún lado, es un resto que se puede eliminar sin
pensarlo dos veces.

## Comandos

```
npm start          # node server.js
npm run dev        # node --watch server.js
npm test           # jest --runInBand
npm run crear-admin # crea la PRIMERA cuenta de administrador
```

No hay build ni lint. `npm test` corre cuatro suites unitarias
(`leadService`, `propiedadService`, `authService`, `usuarioService`), todas
sin base de datos: los repositorios se simulan.

`npm run crear-admin` existe porque no hay registro público y la primera
cuenta no la puede crear el panel — habría que estar dentro para entrar. Pide
la contraseña por consola con el eco apagado; nunca se pasa por argumento,
porque los argumentos quedan en el historial del shell y en la lista de
procesos. De ahí en adelante las cuentas se crean desde `/admin/usuarios`.

### Variables de entorno

Obligatorias: `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` (ver
`.env.example`).

**`SESSION_SECRET` es obligatoria en producción.** Sin ella el panel entero
responde 503 y sólo funciona el sitio público — el proceso NO se cae, a
propósito. Tampoco se genera un secreto aleatorio por proceso: bajo Passenger
corren varios workers y cada uno firmaría las cookies distinto, así que la
sesión se caería al azar según qué worker atienda cada petición.

**`UPLOAD_DIR` debe apuntar fuera del docroot en producción** (ver la sección
de despliegue). Si se omite, en desarrollo cae en `public/uploads`, que está
en `.gitignore`.

Opcionales: `PORT`, `DOMAIN`, `CONTACTO_WHATSAPP`, `CONTACTO_EMAIL`,
`LOG_LEVEL`, `SESSION_HORAS`, `UPLOAD_MAX_MB`, `UPLOAD_MAX_FOTOS`,
`RATE_LIMIT_WINDOW_MIN`, `RATE_LIMIT_CONTACT_MAX`, `RATE_LIMIT_LOGIN_MAX`.
Sin `CONTACTO_WHATSAPP` el botón flotante de WhatsApp simplemente no se
renderiza — ver `config/index.js`.

## Arquitectura

`server.js` → `loadConfig()` → `createContainer(config)` →
`createApp(container)` → `listen`, y `db/migrate.js` corre **después** del
`listen`, en paralelo. El container es el único lugar que arma
dependencias; `app.js` lo destructura y cada router recibe sólo lo que usa.

Ese orden es deliberado y cambió el 2026-11-24: antes las migraciones
bloqueaban el `listen` y cualquier falla hacía `process.exit(1)`. Como la
landing se renderiza sólo con valores de config y no toca la base (sólo
`POST /contacto` y `/salud` la necesitan), un problema de MySQL dejaba caída
una página que no lee MySQL — y en Passenger, con varios workers arrancando
a la vez, el candado de migraciones podía hacer esperar 30s a los que
pierden la carrera y pasarse del tiempo de arranque tolerado. Ahora una
falla de migraciones se registra en el log y `/salud` responde 503, que es
el canal correcto para avisar; el proceso no se cae.

Tablas (`db/migrations/`, se aplican solas al arrancar, en orden alfabético):

| Migración | Tabla | Para qué |
|---|---|---|
| `001_leads.sql` | `leads` | Formulario único de contacto. `tipo` dice qué botón lo disparó. |
| `002_usuarios.sql` | `usuarios` | Cuentas del panel. Roles `admin` y `asesor`. |
| `003_propiedades.sql` | `propiedades` | El catálogo. `estado` decide qué se publica. |
| `004_propiedad_fotos.sql` | `propiedad_fotos` | Galería. Guarda el nombre del archivo, no la ruta. |
| `005_sesiones.sql` | `sesiones` | Store de `express-session`, escrito a mano. |

Todo lo que entra se valida con `zod` (`validators/index.js`) antes de tocar
la base.

**El interruptor del negocio es `propiedades.estado`:** sólo `disponible` se
publica en el sitio. `borrador` deja cargar una propiedad a medias sin que
salga al aire; `reservada` y `cerrada` la sacan de la web sin perder el
histórico ni las fotos. Las consultas públicas de
`repositories/propiedadRepository.js` filtran por ese estado **dentro del
propio repositorio**, y no existe un "listar todo" que una ruta pública pueda
llamar por descuido.

**El slug se genera al crear y nunca se regenera al editar.** Si cambiara con
el título, cada corrección de texto rompería los enlaces ya compartidos por
WhatsApp y lo que Google tenga indexado. Hay un test que lo fija
(`tests/propiedadService.test.js`).

### Decisiones de dependencias

Dos elecciones deliberadas, las dos por el mismo motivo — un hosting
compartido con poca memoria donde una compilación fallida deja el sitio caído:

- **`bcryptjs` y no `bcrypt`**: la versión nativa necesita compilarse al
  instalar. Cuesta ~90 ms por verificación en vez de ~10 ms, que con el
  límite de intentos de `routes/auth.js` es un precio aceptable.
- **Sin `sharp`**: no se redimensionan las fotos. Se limita el peso por
  archivo (`UPLOAD_MAX_MB`) y se sirven con caché de un año. Si el catálogo
  se pone pesado, redimensionar es la mejora pendiente.
- **Store de sesiones propio** (`services/sessionStore.js` +
  `repositories/sesionRepository.js`) en vez de `express-mysql-session`: ese
  paquete fija `mysql2` en la versión 3.10.2 exacta, que arrastra dos
  vulnerabilidades altas y no se puede parchear sin que el paquete publique
  una versión nueva. Además abría su propio pool, en contra del principio de
  `container.js`. `npm audit --omit=dev` da cero vulnerabilidades.

### Seguridad del panel

- Contraseñas con bcrypt, 10 rondas. El tope de la contraseña son **72
  bytes**, no caracteres: bcrypt ignora en silencio lo que pase de ahí, así
  que sin ese límite dos contraseñas largas con los mismos 72 primeros bytes
  abrirían la misma cuenta.
- Un correo inexistente y una contraseña incorrecta devuelven **el mismo
  mensaje y tardan lo mismo** (`authService` compara contra un hash de
  descarte), para que no se pueda averiguar qué correos tienen cuenta.
- El ID de sesión se **regenera al entrar** (anti session fixation).
- CSRF por token de sesión en todo `/admin` (`middleware/csrf.js`). Ojo: en
  los formularios con archivos la verificación va **después** de multer,
  porque es multer quien llena `req.body` en un envío multipart.
- Las fotos se verifican **leyendo sus primeros bytes**, no por la extensión
  ni el `Content-Type`, que los pone el cliente. El nombre del archivo lo
  genera el servidor, aleatorio: el que manda el navegador nunca se usa.
- Desactivar una cuenta **cierra sus sesiones abiertas** de inmediato, y no
  se puede dejar el panel sin ningún administrador activo.

## Diseño

Tipografía y estructura de componentes tomadas de
`stitch_vivantia_inmobiliaria_website/DESIGN.md` (diseño de referencia de la
marca "Vivantia" original, fuera de este repo), volcadas como variables CSS
en `public/css/styles.css`. La paleta de color se actualizó para la marca
"Echavarría Grupo Inmobiliario": azul marino profundo `#10254A` + dorado
satinado `#C9A24C` (antes verde esmeralda `#0F382C` del diseño original),
tipografía Playfair Display (titulares) + Plus Jakarta Sans (cuerpo). Ver
`brand/echavarria-grupo-inmobiliario/` para la referencia visual del logo
actual.

**Pendiente antes de publicar (no inventar estos datos):**
- Logo definitivo en SVG/PNG con fondo transparente — hoy `views/partials/brand.ejs`
  usa un ícono geométrico provisional dibujado en SVG inline (la referencia
  en `brand/echavarria-grupo-inmobiliario/logo-referencia.jpg` es un render
  de presentación, no un archivo usable directamente en la web).
- `CONTACTO_WHATSAPP` / `CONTACTO_EMAIL` reales.
- Zona/ciudad de cobertura (marcada como "(pendiente)" en el FAQ). Ojo: las
  zonas de las propiedades **no** son una lista fija en el código justamente
  por esto — son texto libre, y los filtros del catálogo se arman con los
  valores que existan en la base.
- Fotografías reales de propiedades. Desde la Fase 2 esto ya **no es un
  pendiente de código**: los asesores las suben desde el panel. Lo que falta
  es contenido. Mientras una propiedad no tenga fotos, su tarjeta muestra el
  placeholder de color — nunca fotos de terceros.

## Despliegue

Mismo mecanismo que enelmapa: cron (no webhook) corriendo
`deploy/deploy.sh` cada 5 minutos en la cuenta cPanel `moralesbilma`, que
hace `git fetch` + `git reset --hard origin/main` y reinicia Passenger.

Rutas en el servidor, aprovisionadas el 2026-11-17 en reemplazo de las del
subdominio de prueba (`public_html/vivantia.enelmapa.co`):

- docroot / application root: `/home/moralesbilma/public_html/echavarria-gi.com`
- nodevenv: `/home/moralesbilma/nodevenv/public_html/echavarria-gi.com/22/bin`
- script que corre el cron: `/home/moralesbilma/deploy-echavarria.sh`
  (copia fuera del docroot; se auto-actualiza desde `deploy/deploy.sh`)
- log: `/home/moralesbilma/deploy-echavarria.log`
- base de datos: `moralesbilma_echavarria`

El `.htaccess` de producción no está en el repo (lleva el bloque de
Passenger y las variables de entorno reales); `deploy.sh` lo respalda en
`/home/moralesbilma/.htaccess.echavarria.produccion` antes de cada
`git reset`.

### Las fotos NO van dentro del docroot

`deploy.sh` corre `git reset --hard` en cada despliegue. Git no borra
archivos sin trackear, así que hoy unas fotos en `public/uploads/`
sobrevivirían — pero basta un `git clean -fd` futuro, o alguien
reaprovisionando el docroot como se hizo el 2026-11-17, para llevarse el
inventario fotográfico completo sin forma de recuperarlo.

Por eso `UPLOAD_DIR` en producción apunta fuera del docroot, y Express las
sirve desde ahí con su propio `express.static` montado en `/fotos` (ver
`app.js`). Apache no las puede servir directamente como hace con `/css` o
`/js`, justamente porque están fuera de su alcance.

Hace falta crear esa carpeta una vez, con permisos de escritura para la
cuenta de cPanel. `server.js` intenta crearla al arrancar y, si no puede, lo
deja dicho en el log: el sitio funciona, pero no se pueden subir fotos.

**Cuidado al eliminar propiedades:** las filas de `propiedad_fotos` se van
solas por el `ON DELETE CASCADE`, pero los archivos del disco no — el disco
no sabe de claves foráneas. Quien los borra es `services/fotoService.js`, y
`propiedadService.eliminar` lo llama **antes** del `DELETE`, para que un
fallo deje archivos visibles en el panel en vez de huérfanos que nadie sabe
que existen.

### Puesta en marcha en cPanel (hecha el 2026-11-24)

Crear las rutas y la base **no** basta para que el sitio responda: hay que
registrar la app en **cPanel → Setup Node.js App** (application root
`public_html/echavarria-gi.com`, startup file `server.js`, Node 22, modo
`Production`). Ese paso es el que escribe el bloque de Passenger en el
`.htaccess`; sin él Apache no tiene handler de Node.

Dos cosas que el registro de la app **no** resuelve, y que fueron la causa
de que el dominio no mostrara nada:

- **`node_modules` no se instala solo.** Está en `.gitignore`, así que el
  clon del docroot llega sin dependencias y el primer `require('express')`
  tumba el arranque: Passenger responde 500 en todas las rutas con "Web
  application could not be started". Lo instala `deploy.sh` cuando cambia
  `package.json`, o el botón *Run NPM Install*.
- **La raíz mostraba el listado del código fuente.** `mod_autoindex` de
  Apache atiende `/` antes de pasarle la petición a Passenger, y cPanel no
  escribe nada que lo evite. Ahora `deploy.sh` garantiza `DirectoryIndex
  disabled` y `Options -Indexes` de forma idempotente, con respaldo en
  `/home/moralesbilma/.htaccess.echavarria.antes-directivas`.

**Diagnóstico remoto sin acceso a cPanel:** Passenger sobre Apache sirve
directamente cualquier archivo que exista en disco, así que el código de
respuesta delata el estado del servidor — un archivo del repo da 200 y una
ruta inexistente cae a Passenger. Con la app caída, eso hace que
`/node_modules/express/package.json` devolviendo 500 (igual que un archivo
inventado) sea prueba de que las dependencias no están instaladas.

Consecuencia de ese mismo comportamiento, pendiente de cerrar: el fuente es
legible por HTTP (`/server.js`, `/package.json`). No es algo propio de este
proyecto —`enelmapa.co` se comporta igual— pero conviene arreglarlo. Ojo al
hacerlo: un `FilesMatch` por extensión `.js` bloquearía `/js/main.js`, que
Express sirve desde `public/` y la landing necesita.
