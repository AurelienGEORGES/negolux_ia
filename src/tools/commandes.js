// src/tools/commandes.js — compter_commandes : volumes de commandes, périmètre explicite
const { z } = require('zod');
const { executerLecture } = require('../db');
const { json, erreur, outil } = require('./reponse');
const { DATE_JOUR, LECTURE_SEULE, RefusOutil } = require('./_commun');

// Axe de regroupement → expression SQL (liste fermée, jamais d'entrée utilisateur)
const AXES = {
  aucun: "'total'",
  statut: "COALESCE(e.LIBELLE, CONCAT('ID_ETAT ', c.ID_ETAT))",
  statut_sav: "IF(c.STATUT_SAV = '', 'aucun', c.STATUT_SAV)",
  place: "COALESCE(mp.NOM, 'inconnue')",
  regroupement_places: "COALESCE(mp.PREF, 'inconnu')",
  jour: "DATE_FORMAT(c.DATE_COMMANDE, '%Y-%m-%d')",
  mois: "DATE_FORMAT(c.DATE_COMMANDE, '%Y-%m')",
};
const AXES_TEMPORELS = new Set(['jour', 'mois']);

/** Construit la requête (fonction pure, testable). */
function construireRequeteCommandes({
  date_debut, date_fin,
  regroupement = 'aucun',
  inclure_sav = true,
  inclure_annulees = false,
  inclure_fulfillment = false,
  limite = 50,
}) {
  if (date_fin < date_debut) throw new RefusOutil('date_fin est avant date_debut.');
  const axe = AXES[regroupement];
  if (!axe) throw new RefusOutil(`Regroupement inconnu : ${regroupement}`);

  const filtres = [
    'c.DATE_COMMANDE >= ?',
    'c.DATE_COMMANDE < DATE_ADD(?, INTERVAL 1 DAY)',
    'c.DATE_COMMANDE <= NOW()', // exclut les commandes datées dans le futur (tests)
    'c.SUP = 0',
  ];
  const perimetre = ['commandes supprimées exclues', 'commandes datées dans le futur exclues'];

  if (!inclure_fulfillment) {
    filtres.push('c.IS_FULFILLMENT = 0');
    perimetre.push('fulfillment exclu');
  }
  if (!inclure_annulees) {
    filtres.push("NOT (c.ID_ETAT = 10 AND c.DATE_EXPEDITION < '2000-01-01')");
    perimetre.push('annulées non expédiées exclues (comme stats_commandes)');
  }
  if (!inclure_sav) {
    filtres.push("c.STATUT_SAV = ''");
    perimetre.push('commandes SAV / renvoi / avarie / retour exclues');
  } else {
    perimetre.push('commandes SAV / renvoi / avarie / retour incluses');
  }

  const sql = `
SELECT ${axe} AS groupe,
       COUNT(*) AS nb_commandes,
       SUM(c.STATUT_SAV <> '') AS dont_sav,
       SUM(c.ID_ETAT = 10) AS dont_annulees,
       SUM(c.DATE_EXPEDITION > '2000-01-01') AS dont_expediees
FROM commande c
LEFT JOIN commande_etat e ON e.ID = c.ID_ETAT
LEFT JOIN market_place mp ON mp.ID = c.ID_MARKET_PLACE
WHERE ${filtres.join('\n  AND ')}
GROUP BY groupe
ORDER BY ${AXES_TEMPORELS.has(regroupement) ? 'groupe ASC' : 'nb_commandes DESC'}
LIMIT ?`;

  return { sql, parametres: [date_debut, date_fin, limite], perimetre };
}

const nombre = (v) => Number(v ?? 0);

function enregistrerOutilsCommandes(serveur) {
  serveur.registerTool(
    'compter_commandes',
    {
      description:
        'Nombre de commandes sur une période, éventuellement détaillé par statut, statut SAV, place de marché, ' +
        'regroupement de places, jour ou mois. Périmètre par défaut identique à stats_commandes ' +
        '(hors supprimées, hors fulfillment, hors annulées non expédiées, SAV inclus). ' +
        'Toujours annoncer le périmètre renvoyé. Pour le CA ou la marge : stats_commandes.',
      inputSchema: {
        date_debut: DATE_JOUR.describe('Premier jour inclus (AAAA-MM-JJ)'),
        date_fin: DATE_JOUR.describe('Dernier jour inclus (AAAA-MM-JJ)'),
        regroupement: z.enum(Object.keys(AXES)).default('aucun').describe('Axe de détail (défaut : aucun, total seul)'),
        inclure_sav: z.boolean().default(true).describe('Inclure les commandes SAV, renvoi, avarie, retour'),
        inclure_annulees: z.boolean().default(false).describe('Inclure les annulées non expédiées'),
        inclure_fulfillment: z.boolean().default(false).describe('Inclure le fulfillment'),
        limite: z.number().int().min(1).max(400).default(50).describe('Lignes de détail max'),
      },
      annotations: LECTURE_SEULE,
    },
    outil('compter_commandes', async (args) => {
      let requete;
      try {
        requete = construireRequeteCommandes(args);
      } catch (e) {
        if (e instanceof RefusOutil) return erreur(e.message);
        throw e;
      }
      const { sql, parametres, perimetre } = requete;
      const { lignes: brutes } = await executerLecture(sql, parametres);
      const lignes = brutes.map((l) => ({
        groupe: l.groupe,
        nb_commandes: nombre(l.nb_commandes),
        dont_sav: nombre(l.dont_sav),
        dont_annulees: nombre(l.dont_annulees),
        dont_expediees: nombre(l.dont_expediees),
      }));
      const regroupement = args.regroupement || 'aucun';
      const total = lignes.reduce(
        (t, l) => ({ nb_commandes: t.nb_commandes + l.nb_commandes, dont_sav: t.dont_sav + l.dont_sav }),
        { nb_commandes: 0, dont_sav: 0 }
      );
      const tronque = regroupement !== 'aucun' && lignes.length >= parametres[2];
      return json({
        periode: { du: args.date_debut, au: args.date_fin },
        perimetre,
        ...(tronque ? { attention: 'Détail tronqué : le total ne couvre que les lignes affichées.' } : { total }),
        ...(regroupement === 'aucun' ? {} : { detail: lignes }),
      });
    })
  );
}

module.exports = enregistrerOutilsCommandes;
module.exports.construireRequeteCommandes = construireRequeteCommandes;
