const crypto = require('node:crypto');

/** Middleware Express : exige l'en-tête "Authorization: Bearer <jeton>". */
function exigerJeton(jeton) {
  const attendu = Buffer.from(jeton);
  return (req, res, next) => {
    const correspondance = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    const recu = Buffer.from(correspondance ? correspondance[1].trim() : '');
    if (recu.length === attendu.length && crypto.timingSafeEqual(recu, attendu)) return next();
    res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Non autorisé' }, id: null });
  };
}

module.exports = { exigerJeton };
