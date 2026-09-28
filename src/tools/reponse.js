const LONGUEUR_MAX_TEXTE = 2000;

const LECTURE_SEULE = { 
  readOnlyHint: true, 
  destructiveHint: false, 
  openWorldHint: false 
};

/**
 * Remplaçant pour JSON.stringify : gère les Buffers et textes longs
 * Appelé après toJSON : un Buffer arrive sous la forme { type: 'Buffer', data: [...] }
 */
function remplacer(_cle, valeur) {
  if (valeur && valeur.type === 'Buffer' && Array.isArray(valeur.data)) {
    return valeur.data.length <= 64
      ? `0x${Buffer.from(valeur.data).toString('hex')}`
      : `<binaire, ${valeur.data.length} octets>`;
  }
  
  if (typeof valeur === 'string' && valeur.length > LONGUEUR_MAX_TEXTE) {
    return `${valeur.slice(0, LONGUEUR_MAX_TEXTE)}… [tronqué, ${valeur.length} caractères]`;
  }
  
  return valeur;
}

/**
 * Formatage MCP standard pour une réponse texte (JSON)
 */
function json(donnees) {
  const texte = JSON.stringify(donnees, remplacer, 2);
  return { 
    content: [{ type: 'text', text: texte }] 
  };
}

/**
 * Formatage MCP standard pour une erreur
 */
function erreur(message) {
  return { 
    content: [{ 
      type: 'text', 
      text: `Erreur : ${message}` 
    }],
    isError: true 
  };
}

/**
 * Wrapper pour un handler d'outil : journalise la durée, catch les exceptions
 * @param {string} nom - Nom de l'outil pour les logs
 * @param {Function} handler - Fonction async (args) => résultat MCP
 * @returns {Function} Wrapper async (args) => résultat MCP
 */
function outil(nom, handler) {
  return async (args) => {
    const debut = Date.now();
    try {
      const resultat = await handler(args);
      const duree = Date.now() - debut;
      console.log(`[outil] ✅ ${nom} ok (${duree} ms)`);
      return resultat;
    } catch (err) {
      const duree = Date.now() - debut;
      const message = err.code 
        ? `${err.code} - ${err.message}` 
        : err.message;
      console.error(`[outil] ❌ ${nom} échec (${duree} ms): ${message}`);
      return erreur(message);
    }
  };
}

module.exports = { LECTURE_SEULE, json, erreur, outil };
