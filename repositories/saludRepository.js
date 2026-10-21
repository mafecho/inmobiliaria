// Única consulta del chequeo de salud: confirma que la base responde, sin
// scope de negocio porque no lee datos de nadie.
function buildSaludRepository(db) {
  return {
    async ping() {
      await db.query('SELECT 1');
    }
  };
}

module.exports = buildSaludRepository;
