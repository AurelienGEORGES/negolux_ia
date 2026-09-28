const { z } = require('zod');
const { executerLecture } = require('../db');
const { json, erreur, outil } = require('./reponse');

module.exports = function enregistrerOutilQueryErp(serveur) {
  serveur.registerTool(
    'query-erp',
    {
      description: 'Requête SQL SELECT sur l\'ERP (lecture seule).',
      inputSchema: {
        query: z.string().describe('Requête SQL SELECT')
      }
    },
    outil('query-erp', async ({ query }) => {
      const queryUpper = query.trim().toUpperCase();
      const interdit = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE'];

      for (const cmd of interdit) {
        if (queryUpper.startsWith(cmd)) {
          return erreur(`❌ ${cmd} interdit`);
        }
      }

      try {
        const { lignes } = await executerLecture(query, []);
        return json({ succes: true, nombre_lignes: lignes.length, donnees: lignes });
      } catch (err) {
        return erreur(`Erreur SQL: ${err.message}`);
      }
    })
  );
  console.log('[outil] query-erp enregistré ✓');
};
