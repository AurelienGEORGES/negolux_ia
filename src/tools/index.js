// src/tools/index.js — enregistre tous les outils Negolux
const enregistrerOutilsSchema = require('./schema');
const enregistrerOutilRequete = require('./requete');
const enregistrerOutilsCommandes = require('./commandes');
const enregistrerOutilsProduits = require('./produits');
const enregistrerOutilDoc = require('./doc');

// Module de stats_commandes et historique_produits (code récupéré de la prod).
// ⚠️ Adapter le chemin au nom réel du fichier.
const CHEMIN_MODULE_STATS = './stats';

function chargerModuleStats() {
  try {
    return require(CHEMIN_MODULE_STATS);
  } catch (e) {
    // Seule l'absence du fichier lui-même est tolérée ; toute autre erreur doit remonter
    if (e.code === 'MODULE_NOT_FOUND' && e.message.includes(`'${CHEMIN_MODULE_STATS}'`)) return null;
    throw e;
  }
}

const enregistrerOutilsStats = chargerModuleStats();
if (!enregistrerOutilsStats && process.env.NODE_ENV !== 'test') {
  console.warn(`[outils] ⚠️ ${CHEMIN_MODULE_STATS}.js introuvable : stats_commandes et historique_produits NON exposés`);
}

function enregistrerTousLesOutils(serveur) {
  enregistrerOutilsSchema(serveur);    // lister_tables, decrire_table
  enregistrerOutilRequete(serveur);    // executer_requete_sql
  enregistrerOutilsCommandes(serveur); // compter_commandes
  enregistrerOutilsProduits(serveur);  // rechercher_produit, composition_produit
  enregistrerOutilDoc(serveur);        // consulter_doc
  if (enregistrerOutilsStats) enregistrerOutilsStats(serveur); // stats_commandes, historique_produits
}

module.exports = enregistrerTousLesOutils;
module.exports.statsDisponibles = Boolean(enregistrerOutilsStats);
