# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Proyecto

**Echavarría Grupo Inmobiliario** — landing page de una inmobiliaria familiar
(`vivantia.enelmapa.co`, subdominio temporal mientras se compra el dominio
propio; el nombre técnico del subdominio quedó de la marca anterior del
proyecto, "Vivantia" — ver más abajo). Fase 1: una sola página pública con
portafolio de ejemplo y un formulario de contacto. Node.js + Express + EJS,
sin bundler, MySQL (`mysql2`) sólo para guardar los leads del formulario.

Mismo patrón arquitectónico que `enelmapa` (otro proyecto en esta cuenta de
cPanel): composition root en `container.js`, capas `routes/ → services/ →
repositories/` con todo el SQL en `repositories/`, sin singletons a nivel de
módulo. A diferencia de enelmapa, **no hay multi-tenancy ni sesiones/login**
— Echavarría Grupo Inmobiliario es un solo negocio, y Fase 1 no tiene panel
de administración.

**Sobre el nombre:** el proyecto se planeó originalmente como "Vivantia
Bienes Raíces" (de ahí `stitch_vivantia_inmobiliaria_website/`, el dominio
`vivantia.enelmapa.co`, la base de datos `moralesbilma_vivantia` y el
nombre de la app de Node en el servidor). El 2026-10-21 el cliente decidió
renombrar la marca a "Echavarría Grupo Inmobiliario" con una paleta azul
marino + dorado. Se actualizó todo el texto y los colores visibles, pero
**los identificadores técnicos (subdominio, base de datos, nombre de la app)
se dejaron como "vivantia" a propósito**, para no repetir el proceso de
aprovisionamiento del servidor — cambiarlos es trabajo aparte si algún día
hace falta.

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
hace `git fetch` + `git reset --hard origin/main` y reinicia Passenger. El
subdominio `vivantia.enelmapa.co` y su base de datos MySQL todavía no están
creados en el servidor — ver conversación con el usuario antes de asumir que
existen.
