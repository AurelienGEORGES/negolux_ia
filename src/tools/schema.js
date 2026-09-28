// src/tools/schema.js — lister_tables et decrire_table
// La base ne déclare AUCUNE clé étrangère : les jointures viennent de docs/schema.md.
const { z } = require('zod');
const { executerLecture } = require('../db');
const { json, erreur, outil } = require('./reponse');
const { LECTURE_SEULE } = require('./_commun');
const { COLONNES_INTERDITES, TABLES_BLOQUEES } = require('./securite');

// Jointures conventionnelles, vérifiées sur la base le 25/09/2026
const JOINTURES = [
  ['commande_produit.ID_COMMANDE', 'commande.ID'],
  ['commande_produit.ID_PRODUIT', 'produit.ID'],
  ['commande.ID_CLIENT', 'client.ID'],
  ['commande.ID_ETAT', 'commande_etat.ID'],
  ['commande.ID_MARKET_PLACE', 'market_place.ID'],
  ['commande.ID_MARKET_PLACE_ACCOUNT', 'market_place_account.ID'],
  ['commande.ID_LENGOW_MARKET', 'lengow_market.ID'],
  ['commande.ID_SOCIETE', 'compta_societe.ID'],
  ['commande.ID_TRANSPORTEUR', 'transporteur.ID'],
  ['commande.ID_DEPOT_STOCK', 'depot_stock.ID'],
  ['produit.ID_FOURNISSEUR', 'fournisseur.ID'],
  ['produit.ID_TYPE_PRODUIT', 'type_produit.ID'],
  ['produit.ID_DESIGNATION', 'texte.ID_TXT (+ ID_LANG = 1 AND ACTUEL = 1)'],
  ['produit_compose.ID_PRODUIT_PARENT', 'produit.ID (produit composé)'],
  ['produit_compose.ID_PRODUIT', 'produit.ID (composant)'],
  ['client.ID_PAYS', 'pays.ID'],
];

// Avertissements attachés aux tables
const NOTES_TABLES = {
  commande_facture: 'Obsolète : utiliser compta_facture.',
  produit_stat: '60 M de lignes : passer par historique_produits, pas par SQL.',
  commande_retard_denjean: 'Inaccessible (droits sur la fonction jours_ouvres).',
  texte: 'Versionnée : toujours filtrer ID_LANG = 1 AND ACTUEL = 1.',
  commande: 'Statut = ID_ETAT (la colonne ETAT est vide). Dates vides = 0000-00-00, pas NULL.',
};

// Avertissements attachés aux colonnes (table.COLONNE)
const NOTES_COLONNES = {
  'commande.ETAT': 'VIDE, ne pas utiliser : voir ID_ETAT.',
  'commande.ID_ETAT': 'Libellés dans commande_etat (10 = Annulée).',
  'commande.SUP': 'Suppression logique : filtrer SUP = 0.',
  'produit.SUP': 'Suppression logique : filtrer SUP = 0.',
  'produit.STATUT': '< 0 = archivé (~117 000 fiches).',
  'produit.STOCK_INDIC': 'Pas utilisé.',
};

// Vues de contrôle interne, sans intérêt métier
const BRUIT = /^(0_verif_|a_bug_)/;
const BLOQUEES = new Set(TABLES_BLOQUEES);

const jointuresDe = (table) =>
  JOINTURES.filter(([a, b]) => a.split('.')[0] === table || b.split('.')[0] === table)
    .map(([a, b]) => `${a} → ${b}`);

module.exports = function enregistrerOutilsSchema(serveur) {
  serveur.registerTool(
    'lister_tables',
    {
      description:
        "Liste les tables et vues de l'ERP Negolux (nom, lignes estimées, avertissements). " +
        "Pour l'exploration seulement : les questions courantes ont des outils dédiés " +
        "(stats_commandes, compter_commandes, rechercher_produit) et consulter_doc('schema') décrit les tables clés.",
      inputSchema: {
        recherche: z.string().optional().describe("Sous-chaîne du nom de table (ex. 'commande')"),
      },
      annotations: LECTURE_SEULE,
    },
    outil('lister_tables', async ({ recherche }) => {
      const { lignes } = await executerLecture(
        `SELECT TABLE_NAME AS nom, TABLE_TYPE AS type, TABLE_ROWS AS lignes_estimees, TABLE_COMMENT AS commentaire
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?
          ORDER BY TABLE_NAME`,
        [recherche ? `%${recherche}%` : '%']
      );

      const tables = lignes
        .filter((t) => !BRUIT.test(t.nom) && !BLOQUEES.has(t.nom))
        .map((t) => ({
          nom: t.nom,
          ...(t.type === 'VIEW' ? { vue: true } : { lignes_estimees: Number(t.lignes_estimees ?? 0) }),
          // Le commentaire d'une vue vaut « VIEW » ou un message d'erreur : on l'ignore
          ...(t.type !== 'VIEW' && t.commentaire ? { commentaire: t.commentaire } : {}),
          ...(NOTES_TABLES[t.nom] ? { attention: NOTES_TABLES[t.nom] } : {}),
        }));

      return json({ nombre_tables: tables.length, tables });
    })
  );

  serveur.registerTool(
    'decrire_table',
    {
      description:
        "Colonnes d'une table (type, clé, commentaire), jointures connues et pièges. " +
        "À utiliser avant d'écrire du SQL sur une table peu courante. Noms réels au singulier : " +
        "commande, commande_produit, produit, client. Les colonnes de secrets ne sont jamais affichées.",
      inputSchema: {
        table: z.string().min(1).describe('Nom exact de la table (ex. commande)'),
        filtre_colonnes: z.string().optional()
          .describe("Sous-chaîne pour ne garder que certaines colonnes (ex. 'STOCK', 'DATE') : produit en a plus de 200"),
      },
      annotations: LECTURE_SEULE,
    },
    outil('decrire_table', async ({ table, filtre_colonnes }) => {
      if (BLOQUEES.has(table)) return erreur(`Table "${table}" non consultable (identifiants de connexion).`);

      const { lignes } = await executerLecture(
        `SELECT COLUMN_NAME AS colonne, COLUMN_TYPE AS type, COLUMN_KEY AS cle, COLUMN_COMMENT AS commentaire
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION`,
        [table]
      );

      if (lignes.length === 0) {
        const { lignes: proches } = await executerLecture(
          `SELECT TABLE_NAME AS nom FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ? ORDER BY TABLE_NAME LIMIT 10`,
          [`%${table.replace(/s$/, '')}%`]
        );
        return erreur(
          `Table "${table}" introuvable.` +
            (proches.length ? ` Tables proches : ${proches.map((p) => p.nom).join(', ')}.` : ' Voir lister_tables.')
        );
      }

      const visibles = lignes.filter((c) => !COLONNES_INTERDITES.test(c.colonne));
      const masquees = lignes.length - visibles.length;
      const filtre = filtre_colonnes ? filtre_colonnes.toUpperCase() : null;

      const colonnes = visibles
        .filter((c) => !filtre || c.colonne.toUpperCase().includes(filtre))
        .map((c) => {
          const note = NOTES_COLONNES[`${table}.${c.colonne}`];
          return {
            colonne: c.colonne,
            type: c.type,
            ...(c.cle ? { cle: c.cle } : {}),
            ...(c.commentaire ? { commentaire: c.commentaire } : {}),
            ...(note ? { attention: note } : {}),
          };
        });

      const jointures = jointuresDe(table);
      return json({
        table,
        nombre_colonnes: visibles.length,
        ...(filtre ? { filtre: filtre_colonnes, colonnes_affichees: colonnes.length } : {}),
        colonnes,
        jointures: jointures.length ? jointures : 'Aucune jointure documentée : aucune clé étrangère déclarée dans la base.',
        ...(NOTES_TABLES[table] ? { attention: NOTES_TABLES[table] } : {}),
        ...(masquees ? { colonnes_masquees: `${masquees} colonne(s) sensible(s) non affichée(s)` } : {}),
      });
    })
  );
};
