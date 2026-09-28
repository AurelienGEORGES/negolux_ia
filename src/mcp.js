const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { version } = require('../package.json');
const enregistrerTousLesOutils = require('./tools/index');
const { statsDisponibles } = require('./tools/index');

// Instructions envoyées au client à la connexion (lues par Claude.ai, Claude Desktop, Claude Code).
// Courtes volontairement : le détail est dans docs/, chargé à la demande par consulter_doc.
const INSTRUCTIONS = `
Serveur MCP de l'ERP Negolux (e-commerce mobilier jardin et maison). Accès en lecture seule.

Choix de l'outil, dans cet ordre :
${statsDisponibles
    ? '- CA, marge, pièces vendues, comparaison de périodes : stats_commandes (référence, identique à l\'écran ERP).\n- Évolution d\'un produit, stock, ruptures : historique_produits.'
    : '- CA et marge : outil stats_commandes indisponible sur ce serveur, le signaler plutôt que de recalculer en SQL.'}
- Nombre de commandes : compter_commandes.
- Trouver un produit ou son ID : rechercher_produit. Nomenclature et ruptures de composants : composition_produit.
- Définitions, règles métier, vocabulaire : consulter_doc (sujets kpis, regles_metier, glossaire).
- Sinon seulement : executer_requete_sql, après consulter_doc('requetes_types') et consulter_doc('schema').
  lister_tables et decrire_table servent à explorer une table peu courante.

Règles de réponse :
- Montants en euros TTC : toujours écrire « TTC ».
- Taux de marque = marge / CA ; taux de marge = marge / achat. Ne pas les confondre.
- Toujours préciser la période et le périmètre (SAV inclus ou non, annulées, fulfillment).
- Question ambiguë (« meilleur produit ») : annoncer le critère retenu.
- Ne jamais inventer une donnée absente des résultats ; signaler les anomalies.
- Pas de données personnelles de clients sauf demande explicite sur une commande précise.
`.trim();

/**
 * Crée une instance neuve du serveur MCP : une par connexion ou requête, jamais partagée.
 */
function creerServeurMcp() {
  const serveur = new McpServer({ name: 'negolux-mcp', version }, { instructions: INSTRUCTIONS });
  enregistrerTousLesOutils(serveur);
  return serveur;
}

module.exports = { creerServeurMcp, INSTRUCTIONS };
