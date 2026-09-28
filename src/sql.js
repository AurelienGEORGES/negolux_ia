// Filtre appliqué au SQL libre envoyé par un LLM. C'est un garde-fou, pas la barrière de sécurité :
// celle-ci repose sur le compte MySQL limité à SELECT et sur la transaction READ ONLY (src/db.js).

const INSTRUCTIONS_AUTORISEES = /^(select|with|show|describe|desc|explain)\b/i;

const MOTIFS_INTERDITS = [
  [/\/\*!/, 'commentaires exécutables MySQL (/*! ... */)'],
  [/\binto\s+(outfile|dumpfile)\b/i, 'INTO OUTFILE / INTO DUMPFILE'],
  [/\bload_file\s*\(/i, 'LOAD_FILE()'],
  [/\bfor\s+(update|share)\b/i, 'lectures verrouillantes (FOR UPDATE / FOR SHARE)'],
  [/\block\s+in\s+share\s+mode\b/i, 'LOCK IN SHARE MODE'],
];

const COMMENTAIRE_EN_TETE = /^(--[^\n]*(\n|$)|#[^\n]*(\n|$)|\/\*(?!!)[\s\S]*?\*\/)\s*/;

/** Renvoie la requête nettoyée, ou lève une erreur si elle n'est pas une lecture autorisée. */
function verifierRequeteLecture(requete) {
  let sql = requete.trim();
  let precedent;
  do {
    precedent = sql;
    sql = sql.replace(COMMENTAIRE_EN_TETE, '');
  } while (sql !== precedent);
  sql = sql.replace(/[;\s]+$/, '');

  if (!sql) throw new Error('Requête vide');
  if (!INSTRUCTIONS_AUTORISEES.test(sql)) {
    throw new Error('Seules les requêtes en lecture sont autorisées : SELECT, WITH, SHOW, DESCRIBE, EXPLAIN');
  }
  for (const [motif, libelle] of MOTIFS_INTERDITS) {
    if (motif.test(sql)) throw new Error(`Non autorisé : ${libelle}`);
  }
  return sql;
}

module.exports = { verifierRequeteLecture };
