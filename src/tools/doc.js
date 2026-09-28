// src/tools/doc.js — consulter_doc : doc métier chargée à la demande
const { readFile } = require('fs/promises');
const path = require('path');
const { z } = require('zod');
const { json, outil } = require('./reponse');
const { LECTURE_SEULE } = require('./_commun');

const DOCS_DIR = path.resolve(__dirname, '../../docs');

const SUJETS = {
  kpis: 'kpis.md',
  regles_metier: 'business-rules.md',
  glossaire: 'glossary.md',
  requetes_types: 'common-queries.md',
  qualite_donnees: 'data-quality.md',
  schema: 'schema.md',
};

function enregistrerOutilDoc(serveur, { docsDir = DOCS_DIR } = {}) {
  serveur.registerTool(
    'consulter_doc',
    {
      description:
        'Documentation métier Negolux. À consulter avant de répondre à une question de définition ' +
        "(CA, marge, taux, pièces, statuts), sur un terme interne, ou avant d'écrire du SQL libre. " +
        'kpis = définitions et formules ; regles_metier = périmètres et pièges ; glossaire = vocabulaire, codes marketplace ; ' +
        'requetes_types = SQL validés ; qualite_donnees = anomalies connues ; schema = tables et jointures.',
      inputSchema: { sujet: z.enum(Object.keys(SUJETS)).describe('Sujet à charger') },
      annotations: LECTURE_SEULE,
    },
    // Relu à chaque appel : modifier un .md ne demande pas de redémarrage
    outil('consulter_doc', async ({ sujet }) =>
      json({ sujet, contenu: await readFile(path.join(docsDir, SUJETS[sujet]), 'utf8') })
    )
  );
}

module.exports = enregistrerOutilDoc;
module.exports.SUJETS = SUJETS;
