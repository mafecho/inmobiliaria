#!/bin/bash
#
# Deploy por cron para el hosting de cPanel/Passenger — mismo mecanismo que
# enelmapa.co en la misma cuenta. Esta copia está versionada para revisarla;
# la que CORRE vive fuera del docroot, en /home/<user>/deploy-echavarria.sh,
# porque cualquier cosa dentro de public_html/echavarria-gi.com es
# alcanzable por URL y este script ejecuta git y npm.
#
# Instalación (una sola vez):
#   cp deploy/deploy.sh /home/<user>/deploy-echavarria.sh && chmod 755 /home/<user>/deploy-echavarria.sh
#   cron cada 5 minutos:  */5 * * * * /home/<user>/deploy-echavarria.sh
#
set -eo pipefail

APP=/home/moralesbilma/public_html/echavarria-gi.com
VENV=/home/moralesbilma/nodevenv/public_html/echavarria-gi.com/22/bin
BAK=/home/moralesbilma/.htaccess.echavarria.produccion
BAK_DIRECTIVAS=/home/moralesbilma/.htaccess.echavarria.antes-directivas
SELF=/home/moralesbilma/deploy-echavarria.sh
LOG=/home/moralesbilma/deploy-echavarria.log
URL=https://echavarria-gi.com/

cd "$APP"

git fetch origin main --quiet

ANTES=$(git rev-parse HEAD)
REMOTO=$(git rev-parse origin/main)

if [ "$ANTES" = "$REMOTO" ]; then
  exit 0
fi

{
  echo "========================================"
  echo "$(date -Is) desplegando ${ANTES:0:7} -> ${REMOTO:0:7}"
} >> "$LOG"

# El .htaccess de producción no está en el repo: lleva el bloque de Passenger.
if [ -f .htaccess ]; then
  cp -p .htaccess "$BAK"
fi

git reset --hard origin/main >> "$LOG" 2>&1

if [ ! -f .htaccess ] && [ -f "$BAK" ]; then
  cp -p "$BAK" .htaccess
  echo "$(date -Is) .htaccess restaurado desde el respaldo" >> "$LOG"
fi

# Apache atiende "/" con mod_autoindex antes de pasarle la petición a
# Passenger, así que sin estas directivas la raíz muestra un listado del
# código fuente en vez de la landing. cPanel no las escribe al crear la app
# de Node, y el .htaccess no está en el repo, así que las garantizamos acá.
# Se agregan al final porque en Apache la última directiva gana.
asegurar_directiva_htaccess() {
  local directiva="$1"

  if [ ! -f .htaccess ]; then
    return 0
  fi

  if grep -qiF "$directiva" .htaccess; then
    return 0
  fi

  # Respaldo único de cómo venía el .htaccess de cPanel, por si una de estas
  # directivas no está permitida por el AllowOverride del servidor.
  if [ ! -f "$BAK_DIRECTIVAS" ]; then
    cp -p .htaccess "$BAK_DIRECTIVAS"
  fi

  printf '\n%s\n' "$directiva" >> .htaccess
  echo "$(date -Is) .htaccess: agregada la directiva '$directiva'" >> "$LOG"
}

asegurar_directiva_htaccess 'DirectoryIndex disabled'
asegurar_directiva_htaccess 'Options -Indexes'

if ! git diff --quiet "$ANTES" "$REMOTO" -- package.json package-lock.json; then
  echo "$(date -Is) cambiaron las dependencias, instalando" >> "$LOG"
  export PATH="$VENV:$PATH"
  if ! npm install --omit=dev >> "$LOG" 2>&1; then
    {
      echo "$(date -Is) !!! npm install FALLÓ — DEPLOY INCOMPLETO"
      echo "$(date -Is) !!! Node NO se reinició: sigue corriendo el código viejo."
    } >> "$LOG"
    exit 1
  fi
fi

echo "$(date -Is) reiniciando Node" >> "$LOG"
pkill -f "Passenger NodeApp: $APP" || true

sleep 2
curl -s -o /dev/null --max-time 60 "$URL" || true

# Auto-actualización: el script que corre es una copia fuera del repo.
if [ -f deploy/deploy.sh ]; then
  cp deploy/deploy.sh "$SELF.nuevo"
  mv "$SELF.nuevo" "$SELF"
  chmod 755 "$SELF"
fi

echo "$(date -Is) OK — ahora en $(git rev-parse --short HEAD)" >> "$LOG"
