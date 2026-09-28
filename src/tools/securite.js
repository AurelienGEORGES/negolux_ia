// src/tools/securite.js — garde-fous SQL, fonctions pures testables sans base.
// ⚠️ Filet de sécurité applicatif : la vraie protection reste les droits MySQL
// de l'utilisateur `mcp` (GRANT par colonne ou vues).
const { RefusOutil } = require('./_commun');

const LIMITE_LIGNES = 200;

// Identifiants et secrets présents dans la base (admin.PASS_CLAIR, logistique.FTP_PASS,
// lengow_account.TOKEN, market_place_account.PASSWORD, client.MOTDEPASSE...)
const COLONNES_INTERDITES =
  /\b(PASS|PASS_CLAIR|PASSWORD|MOTDEPASSE|TOKEN|KEY_VERIF|LOGIN|FTP_LOGIN|FTP_PASS|SERIAL_DATA|SERIAL_COMPTE_MARKET)\b/i;

// Tables sans intérêt métier et pleines d'identifiants
const TABLES_BLOQUEES = ['boite_mail', 'sms_account', 'lengow_account', 'mirakl_account'];
const TABLES_INTERDITES = new RegExp(`\\b(${TABLES_BLOQUEES.join('|')})\\b`, 'i');

const PREMIER_MOT_AUTORISE = /^(SELECT|WITH|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;
const MOTS_DANGEREUX =
  /\b(INTO\s+(OUTFILE|DUMPFILE)|LOAD_FILE|SLEEP|BENCHMARK|GET_LOCK|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE)\b/i;

const IBAN_MOTIF = String.raw`\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b`;
const IBAN_TEST = new RegExp(IBAN_MOTIF);
const IBAN_REMPLACE = new RegExp(IBAN_MOTIF, 'g');

const sansCommentaires = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/#[^\n]*/g, ' ');

const sansLitteraux = (sql) =>
  sql.replace(/'(?:[^'\\]|\\.|'')*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');

/**
 * Valide une requête et renvoie la version à exécuter.
 * timeoutSecondes > 0 préfixe « SET STATEMENT max_statement_time=… FOR » (MariaDB 10.1+) :
 * à n'activer que si executerLecture accepte ce préfixe.
 * @returns {{ sql: string, avertissements: string[] }}
 * @throws {RefusOutil}
 */
function verifierRequete(requete, { timeoutSecondes = 0 } = {}) {
  if (/\/\*!/.test(requete)) throw new RefusOutil('Commentaires exécutables /*! */ interdits.');

  // On exécute la version sans commentaires : rien ne peut s'y cacher
  let sql = sansCommentaires(requete).trim().replace(/;\s*$/, '');
  const analyse = sansLitteraux(sql);
  const avertissements = [];

  if (analyse.includes(';')) throw new RefusOutil('Une seule instruction SQL par appel.');
  if (!PREMIER_MOT_AUTORISE.test(analyse)) {
    throw new RefusOutil('Seules les lectures sont autorisées (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN).');
  }
  if (MOTS_DANGEREUX.test(analyse)) throw new RefusOutil('Instruction interdite dans la requête.');
  if (TABLES_INTERDITES.test(analyse)) throw new RefusOutil('Table non consultable (identifiants de connexion).');
  if (COLONNES_INTERDITES.test(analyse)) {
    throw new RefusOutil("Colonne non consultable (mot de passe, token ou identifiant). Voir consulter_doc('schema').");
  }
  const sansCount = analyse.replace(/COUNT\s*\(\s*\*\s*\)/gi, 'COUNT(1)');
  if (/(SELECT|,)\s*(DISTINCT\s+)?(`?\w+`?\.)?\*/i.test(sansCount)) {
    throw new RefusOutil('SELECT * interdit : listez les colonnes utiles (voir decrire_table).');
  }

  const estSelection = /^(SELECT|WITH)\b/i.test(analyse);
  if (estSelection && !/\bLIMIT\s+(\d+|\?)/i.test(analyse)) {
    sql += `\nLIMIT ${LIMITE_LIGNES}`;
    avertissements.push(`LIMIT ${LIMITE_LIGNES} ajouté automatiquement.`);
  }
  if (estSelection && timeoutSecondes > 0) {
    sql = `SET STATEMENT max_statement_time=${Number(timeoutSecondes)} FOR ${sql}`;
  }
  return { sql, avertissements };
}

/** Retire les colonnes sensibles, masque les IBAN, tronque. */
function filtrerLignes(lignes, limite = LIMITE_LIGNES) {
  const tableau = Array.isArray(lignes) ? lignes : [];
  let masquees = 0;
  const propres = tableau.slice(0, limite).map((ligne) => {
    const sortie = {};
    for (const [cle, valeur] of Object.entries(ligne)) {
      if (COLONNES_INTERDITES.test(cle)) continue;
      if (typeof valeur === 'string' && IBAN_TEST.test(valeur)) {
        masquees++;
        sortie[cle] = valeur.replace(IBAN_REMPLACE, '[IBAN masqué]');
      } else {
        sortie[cle] = valeur;
      }
    }
    return sortie;
  });
  return { lignes: propres, tronque: tableau.length > limite, masquees };
}

module.exports = {
  LIMITE_LIGNES, COLONNES_INTERDITES, TABLES_BLOQUEES, TABLES_INTERDITES,
  verifierRequete, filtrerLignes,
};
