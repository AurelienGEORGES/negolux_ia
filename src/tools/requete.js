// src/tools/requete.js — executer_requete_sql, avec garde-fous
const { z } = require('zod');
const { executerLecture } = require('../db');
const { json, erreur, outil } = require('./reponse');
const { LECTURE_SEULE, RefusOutil } = require('./_commun');
const { verifierRequete, filtrerLignes } = require('./securite');

// Passer à 15 si executerLecture accepte le préfixe « SET STATEMENT … FOR »
const TIMEOUT_SECONDES = 0;

module.exports = function enregistrerOutilRequete(serveur) {
  serveur.registerTool(
    'executer_requete_sql',
    {
      description:
        "SQL en lecture seule sur l'ERP Negolux (MariaDB 10.3), résultat en JSON. " +
        'Dernier recours : préférer stats_commandes (CA, marge), compter_commandes, rechercher_produit. ' +
        "Avant d'écrire la requête : consulter_doc('requetes_types') et consulter_doc('schema'). " +
        'Règles : lister les colonnes (pas de SELECT *), valeurs via « ? », 200 lignes max.',
      inputSchema: {
        requete: z.string().min(1).describe('Une seule instruction SQL en lecture'),
        parametres: z
          .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .optional()
          .describe('Valeurs des « ? », dans l\'ordre'),
      },
      annotations: LECTURE_SEULE,
    },
    outil('executer_requete_sql', async ({ requete, parametres = [] }) => {
      let verifiee;
      try {
        verifiee = verifierRequete(requete, { timeoutSecondes: TIMEOUT_SECONDES });
      } catch (e) {
        if (e instanceof RefusOutil) return erreur(`Requête refusée : ${e.message}`);
        throw e;
      }
      const { lignes: brutes } = await executerLecture(verifiee.sql, parametres);
      const { lignes, tronque, masquees } = filtrerLignes(brutes);
      const avertissements = [...verifiee.avertissements];
      if (masquees) avertissements.push(`${masquees} valeur(s) de type IBAN masquée(s).`);
      return json({
        nombre_lignes: lignes.length,
        tronque,
        colonnes: lignes[0] ? Object.keys(lignes[0]) : [],
        lignes,
        ...(avertissements.length ? { avertissements } : {}),
      });
    })
  );
};
