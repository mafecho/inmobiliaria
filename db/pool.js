const mysql = require('mysql2/promise');

// Factory, no singleton: quién crea el pool y con qué config es decisión del
// composition root (container.js), nunca de un require a nivel de módulo.
function createPool(dbConfig) {
  return mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
  });
}

module.exports = { createPool };
