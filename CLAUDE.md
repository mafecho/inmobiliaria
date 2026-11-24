# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Proyecto

**Echavarría Grupo Inmobiliario** — landing page de una inmobiliaria familiar
(`echavarria-gi.com`, dominio oficial desde el 2026-11-17; antes había un
subdominio de prueba, `vivantia.enelmapa.co`, ya eliminado — ver más abajo).
Fase 1: una sola página pública con portafolio de ejemplo y un formulario de
contacto. Node.js + Express + EJS, sin bundler, MySQL (`mysql2`) sólo para
guardar los leads del formulario.

Mismo patrón arquitectónico que `enelmapa` (otro proyecto en esta cuenta de
cPanel): composition root en `container.js`, capas `routes/ → services/ →
repositories/` con todo el SQL en `repositories/`, sin singletons a nivel de
módulo. A diferencia de enelmapa, **no hay multi-tenancy ni sesiones/login**
— Echavarría Grupo Inmobiliario es un solo negocio, y Fase 1 no tiene panel
de administración.

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
npm start   # node server.js
npm run dev # node --watch server.js
npm test    # jest --runInBand
```

No hay build ni lint. `npm test` corre `tests/leadService.test.js` (unit,
sin base de datos).

### Variables de entorno

`DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` (ver `.env.example`). Opcionales:
`PORT`, `DOMAIN`, `CONTACTO_WHATSAPP`, `CONTACTO_EMAIL`, `LOG_LEVEL`,
`RATE_LIMIT_WINDOW_MIN`, `RATE_LIMIT_CONTACT_MAX`. Sin `CONTACTO_WHATSAPP` el
botón flotante de WhatsApp simplemente no se renderiza — ver `config/index.js`.

## Arquitectura

`server.js` → `loadConfig()` → `createContainer(config)` → corre
`db/migrate.js` → `createApp(container)` → `listen`. El container es el
único lugar que arma dependencias; `app.js` lo destructura y cada router
recibe sólo lo que usa.

Única tabla de Fase 1: `leads` (`db/migrations/001_leads.sql`), alimentada
por un solo formulario (`/contacto`) que cubre consignar, comprar, arrendar
y cada servicio técnico/legal — el campo `tipo` dice cuál. `services/leadService.js`
valida con `zod` (`validators/index.js`) antes de tocar la base.

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
- Zona/ciudad de cobertura (marcada como "(pendiente)" en el FAQ).
- Fotografías reales de propiedades — hoy las tarjetas de `destacados.ejs`
  usan un placeholder de color, nunca fotos de terceros.

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
