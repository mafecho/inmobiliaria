// Única tabla de Fase 1: todo el SQL de leads vive acá, nada en routes/.
function buildLeadRepository(db) {
  return {
    async create({ tipo, nombre, telefono, email, mensaje }) {
      const [result] = await db.query(
        'INSERT INTO leads (tipo, nombre, telefono, email, mensaje) VALUES (?, ?, ?, ?, ?)',
        [tipo, nombre, telefono, email || null, mensaje || null]
      );
      return result.insertId;
    }
  };
}

module.exports = buildLeadRepository;
