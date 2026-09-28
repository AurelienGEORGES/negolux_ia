const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: config.db.ssl ? {} : undefined,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  charset: 'utf8mb4',
  // Dates, BIGINT et DECIMAL renvoyés en chaînes : pas de fuseau horaire ni de perte de précision dans le JSON.
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

const connexionsPreparees = new WeakSet();

// Limite la durée d'exécution côté serveur, une fois par connexion physique.
// MySQL : max_execution_time (ms, SELECT uniquement) ; MariaDB : max_statement_time (s).
async function preparerConnexion(conn) {
  if (connexionsPreparees.has(conn.connection)) return;
  try {
    await conn.query('SET SESSION max_execution_time = ?', [config.sql.timeoutMs]);
  } catch {
    try {
      await conn.query('SET SESSION max_statement_time = ?', [config.sql.timeoutMs / 1000]);
    } catch {
      // Ni l'un ni l'autre n'est supporté : seul le timeout côté client s'applique.
    }
  }
  connexionsPreparees.add(conn.connection);
}

// Lit les lignes en flux et s'arrête dès que maxLignes est dépassé,
// pour ne jamais charger en mémoire un résultat entier trop gros.
function lireEnFlux(connexion, sql, valeurs, maxLignes) {
  return new Promise((resolve, reject) => {
    const lignes = [];
    let colonnes = [];
    let termine = false;

    const requete = connexion.query({ sql, values: valeurs, timeout: config.sql.timeoutMs });
    requete.on('fields', (champs) => {
      if (champs) colonnes = champs.map((champ) => champ.name);
    });
    requete.on('result', (ligne) => {
      if (termine) return;
      if (lignes.length >= maxLignes) {
        termine = true;
        resolve({ colonnes, lignes, tronque: true });
        return;
      }
      lignes.push(ligne);
    });
    requete.on('error', (err) => {
      if (termine) return;
      termine = true;
      reject(err);
    });
    requete.on('end', () => {
      if (termine) return;
      termine = true;
      resolve({ colonnes, lignes, tronque: false });
    });
  });
}

/**
 * Seul point d'accès à la base : exécute une requête dans une transaction READ ONLY,
 * annulée ensuite. Renvoie { colonnes, lignes, tronque }.
 */
async function executerLecture(sql, valeurs = [], { maxLignes = config.sql.maxLignes } = {}) {
  const conn = await pool.getConnection();
  let reutilisable = true;
  try {
    await preparerConnexion(conn);
    await conn.query('START TRANSACTION READ ONLY');
    const resultat = await lireEnFlux(conn.connection, sql, valeurs, maxLignes);
    // Le reste du résultat est encore en transit : on jette la connexion plutôt que de le lire.
    if (resultat.tronque) reutilisable = false;
    return resultat;
  } catch (err) {
    if (err.fatal || err.code === 'PROTOCOL_SEQUENCE_TIMEOUT') reutilisable = false;
    throw err;
  } finally {
    if (reutilisable) {
      await conn.query('ROLLBACK').catch(() => {
        reutilisable = false;
      });
    }
    if (reutilisable) conn.release();
    else conn.destroy();
  }
}

async function ping() {
  await executerLecture('SELECT 1');
}

function fermer() {
  return pool.end();
}

module.exports = { executerLecture, ping, fermer };
