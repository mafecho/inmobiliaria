#!/usr/bin/env node

// Crea la primera cuenta de administrador del panel.
//
//   npm run crear-admin
//
// Existe porque no hay registro público y la primera cuenta no la puede crear
// el panel (haría falta estar dentro para entrar). De ahí en adelante, un
// administrador crea las demás desde /admin/usuarios.
//
// La contraseña se pide por consola con el eco apagado: nunca se pasa por
// argumento ni por variable de entorno, porque los argumentos quedan en el
// historial del shell y en la lista de procesos, donde los puede leer
// cualquier otro usuario del servidor.

const readline = require('readline');

const { loadConfig } = require('../config');
const { createContainer } = require('../container');
const { runMigrations } = require('../db/migrate');
const { usuarioCrearSchema } = require('../validators');

function preguntar(rl, texto) {
  return new Promise((resolve) => rl.question(texto, (r) => resolve(r.trim())));
}

// readline no trae entrada oculta, así que se intercepta la escritura del
// propio readline mientras dura la pregunta.
function preguntarOculto(rl, texto) {
  return new Promise((resolve) => {
    const salidaOriginal = rl.output.write.bind(rl.output);
    let silenciando = false;

    rl.output.write = (chunk, ...resto) => {
      if (silenciando) {
        // Deja pasar el salto de línea para que el cursor avance al enviar.
        if (chunk === '\r\n' || chunk === '\n') return salidaOriginal(chunk, ...resto);
        return true;
      }
      return salidaOriginal(chunk, ...resto);
    };

    rl.question(texto, (respuesta) => {
      silenciando = false;
      rl.output.write = salidaOriginal;
      rl.output.write('\n');
      resolve(respuesta);
    });

    silenciando = true;
  });
}

async function main() {
  const config = loadConfig();
  const container = createContainer(config);
  const { repos, services, logger } = container;

  console.log('\n  Echavarría Grupo Inmobiliario — crear cuenta de administrador');
  console.log('  Base de datos: ' + config.db.database + ' en ' + config.db.host + '\n');

  // Las tablas tienen que existir antes de insertar. runMigrations es
  // idempotente, así que correrlo acá no molesta aunque la app ya las haya
  // aplicado.
  await runMigrations(config.db, logger);

  const yaHayAdmins = await repos.usuarios.contarAdminsActivos();
  if (yaHayAdmins > 0) {
    console.log(`  Ya existen ${yaHayAdmins} cuenta(s) de administrador activas.`);
    console.log('  Las cuentas nuevas se crean desde el panel, en /admin/usuarios.\n');
    await container.close();
    process.exit(0);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const nombre = await preguntar(rl, '  Nombre completo: ');
    const email = await preguntar(rl, '  Correo: ');
    const password = await preguntarOculto(rl, '  Contraseña (no se muestra): ');
    const confirmacion = await preguntarOculto(rl, '  Repetir contraseña: ');

    if (password !== confirmacion) {
      console.error('\n  Las contraseñas no coinciden. No se creó nada.\n');
      process.exitCode = 1;
      return;
    }

    // Se valida con el mismo schema que usa el panel, para que las reglas
    // (incluido el tope de 72 bytes de bcrypt) sean las mismas por los dos
    // caminos.
    const parsed = usuarioCrearSchema.safeParse({ nombre, email, password, rol: 'admin' });
    if (!parsed.success) {
      console.error('\n  ' + parsed.error.issues[0].message + '\n');
      process.exitCode = 1;
      return;
    }

    const id = await services.usuarios.crear(
      { ...parsed.data, rol: 'admin' },
      null
    );

    console.log('\n  Listo. Cuenta de administrador creada (id ' + id + ').');
    console.log('  Entre en https://' + config.domain + '/admin/login\n');
  } finally {
    rl.close();
    await container.close();
  }
}

main().catch((err) => {
  console.error('\n  No se pudo crear la cuenta: ' + err.message + '\n');
  process.exit(1);
});
