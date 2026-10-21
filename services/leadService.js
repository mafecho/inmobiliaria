const { leadSchema } = require('../validators');
const { ValidationError } = require('../errors');

function leadService({ repos }) {
  return {
    async submit(input) {
      const parsed = leadSchema.safeParse(input);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message || 'Datos inválidos');
      }
      return repos.leads.create(parsed.data);
    }
  };
}

module.exports = leadService;
