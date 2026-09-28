// src/tools/produits.js — rechercher_produit et composition_produit
const { z } = require('zod');
const { executerLecture } = require('../db');
const { json, erreur, outil } = require('./reponse');
const { LECTURE_SEULE } = require('./_commun');

// Désignation : table texte versionnée, français, version actuelle
const JOINTURE_DESIGNATION =
  'LEFT JOIN texte t ON t.ID_TXT = p.ID_DESIGNATION AND t.ID_LANG = 1 AND t.ACTUEL = 1';

const COLONNES_PRODUIT = `p.ID AS id, p.SKU AS sku, t.VALUE AS designation, p.TYPE_COMPOSE AS type,
  p.UNIVERS AS univers, p.COLLECTION AS collection, p.LOGIST AS logistique, p.STATUT AS statut,
  p.STOCK_DISPO AS stock_dispo, p.STOCK_DISPO_EXT AS stock_dispo_ext, p.ETAT_STOCK AS etat_stock,
  p.NB_VENTE_30J AS ventes_30j`;

module.exports = function enregistrerOutilsProduits(serveur) {
  serveur.registerTool(
    'rechercher_produit',
    {
      description:
        'Trouve des produits par SKU (exact ou partiel) ou par mot de la désignation (ex. collection « marbella »). ' +
        'Renvoie ID, SKU, désignation, type, univers, collection, stock et ventes 30 jours. ' +
        "À utiliser pour obtenir l'ID d'un produit avant stats_commandes ou historique_produits.",
      inputSchema: {
        texte: z.string().min(2).describe('SKU ou mot de la désignation'),
        inclure_archives: z.boolean().default(false)
          .describe('Inclure les produits archivés (STATUT < 0, ~117 000 fiches)'),
        limite: z.number().int().min(1).max(50).default(20),
      },
      annotations: LECTURE_SEULE,
    },
    outil('rechercher_produit', async ({ texte, inclure_archives = false, limite = 20 }) => {
      const terme = texte.trim();
      const { lignes } = await executerLecture(
        `SELECT ${COLONNES_PRODUIT}
FROM produit p
${JOINTURE_DESIGNATION}
WHERE p.SUP = 0
  ${inclure_archives ? '' : 'AND p.STATUT >= 0'}
  AND (p.SKU LIKE CONCAT('%', ?, '%') OR t.VALUE LIKE CONCAT('%', ?, '%'))
ORDER BY (p.SKU = ?) DESC, COALESCE(p.NB_VENTE_30J, 0) DESC
LIMIT ?`,
        [terme, terme, terme, limite]
      );
      return json({
        nombre: lignes.length,
        produits: lignes,
        ...(lignes.length === 0 && !inclure_archives
          ? { suggestion: 'Aucun produit actif : réessayer avec inclure_archives = true.' }
          : {}),
      });
    })
  );

  serveur.registerTool(
    'composition_produit',
    {
      description:
        "Nomenclature d'un produit : ses composants (si c'est un produit composé) avec leur stock, " +
        "et les produits composés qui l'utilisent (si c'est un composant). " +
        "Utile pour expliquer une rupture : un composé est en rupture dès qu'un composant l'est.",
      inputSchema: {
        id_produit: z.number().int().optional().describe('ID du produit'),
        sku: z.string().optional().describe("SKU exact, si l'ID n'est pas connu"),
      },
      annotations: LECTURE_SEULE,
    },
    outil('composition_produit', async ({ id_produit, sku }) => {
      if (!id_produit && !sku) return erreur('Fournir id_produit ou sku.');

      const { lignes: [produit] } = await executerLecture(
        `SELECT ${COLONNES_PRODUIT}
FROM produit p
${JOINTURE_DESIGNATION}
WHERE ${id_produit ? 'p.ID = ?' : 'p.SKU = ?'} AND p.SUP = 0
LIMIT 1`,
        [id_produit ?? sku]
      );
      if (!produit) return erreur('Produit introuvable. Essayer rechercher_produit.');

      const { lignes: composants } = await executerLecture(
        `SELECT ${COLONNES_PRODUIT}, pc.QTY_PRODUIT AS quantite
FROM produit_compose pc
JOIN produit p ON p.ID = pc.ID_PRODUIT
${JOINTURE_DESIGNATION}
WHERE pc.ID_PRODUIT_PARENT = ? AND pc.SUP = 0
LIMIT 50`,
        [produit.id]
      );
      const { lignes: utilise_dans } = await executerLecture(
        `SELECT ${COLONNES_PRODUIT}, pc.QTY_PRODUIT AS quantite
FROM produit_compose pc
JOIN produit p ON p.ID = pc.ID_PRODUIT_PARENT
${JOINTURE_DESIGNATION}
WHERE pc.ID_PRODUIT = ? AND pc.SUP = 0 AND p.SUP = 0
LIMIT 50`,
        [produit.id]
      );
      const en_rupture = composants.filter((c) => c.etat_stock === 'rupture').map((c) => c.sku);
      return json({
        produit,
        composants,
        utilise_dans,
        ...(en_rupture.length ? { composants_en_rupture: en_rupture } : {}),
      });
    })
  );
};
