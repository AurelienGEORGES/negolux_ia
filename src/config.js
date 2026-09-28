const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function arreter(message) {
  console.error(`[config] ${message} (voir .env.example)`);
  process.exit(1);
}

function entierPositif(nom, defaut) {
  const brut = process.env[nom];
  if (brut === undefined || brut === '') return defaut;
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur <= 0) arreter(`${nom} doit être un entier positif (reçu : "${brut}")`);
  return valeur;
}

function liste(nom) {
  const valeurs = (process.env[nom] || '').split(',').map((v) => v.trim()).filter(Boolean);
  return valeurs.length ? valeurs : undefined;
}

const manquantes = ['MCP_API_KEY', 'DB_HOST', 'DB_USER', 'DB_NAME'].filter((nom) => !process.env[nom]);
if (manquantes.length) arreter(`Variables d'environnement manquantes : ${manquantes.join(', ')}`);
if (process.env.MCP_API_KEY.length < 32) arreter('MCP_API_KEY doit contenir au moins 32 caractères');

module.exports = {
  port: entierPositif('PORT', 3000),
  host: process.env.HOST || '127.0.0.1',
  allowedHosts: liste('ALLOWED_HOSTS'),
  apiKey: process.env.MCP_API_KEY,
  db: {
    host: process.env.DB_HOST,
    port: entierPositif('DB_PORT', 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
    connectionLimit: entierPositif('DB_CONNECTION_LIMIT', 5),
  },
  sql: {
    maxLignes: entierPositif('SQL_MAX_ROWS', 200),
    timeoutMs: entierPositif('SQL_TIMEOUT_MS', 15000),
  },
};
