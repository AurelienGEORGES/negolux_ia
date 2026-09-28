// Vérifie en ligne de commande que le serveur MCP répond, sans passer par MCP Inspector.
// Le serveur doit tourner (npm run dev) ; le script lit le même .env que lui.
//   npm run tester                          -> santé, outils, tables
//   npm run tester -- "SELECT ... LIMIT 5"  -> exécute en plus cette requête
const config = require('../src/config');

const base = `http://127.0.0.1:${config.port}`;
let id = 0;

async function appelerMcp(method, params) {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${method} : ${texte}`);
  // La réponse arrive soit en JSON brut, soit en flux SSE ("data: {...}").
  const json = texte.trim().startsWith('{') ? texte : texte.split('\n').find((l) => l.startsWith('data: '))?.slice(6);
  const message = JSON.parse(json);
  if (message.error) throw new Error(`${method} : ${message.error.message}`);
  return message.result;
}

async function appelerOutil(nom, args = {}) {
  const resultat = await appelerMcp('tools/call', { name: nom, arguments: args });
  const texte = resultat.content[0].text;
  if (resultat.isError) throw new Error(`${nom} : ${texte}`);
  return JSON.parse(texte);
}

async function main() {
  console.log(`Serveur testé : ${base}\n`);

  let sante;
  try {
    sante = await fetch(`${base}/health`);
  } catch {
    throw new Error('serveur injoignable. Lancer d\'abord "npm run dev" dans un autre terminal.');
  }
  if (!sante.ok) throw new Error('le serveur répond mais la base est injoignable (voir le terminal du serveur).');
  console.log('1. Santé          : OK');

  const { tools } = await appelerMcp('tools/list', {});
  console.log(`2. Outils         : ${tools.map((t) => t.name).join(', ')}`);

  const { nombre_tables, tables } = await appelerOutil('lister_tables');
  const apercu = tables.slice(0, 15).map((t) => t.nom).join(', ');
  console.log(`3. Tables         : ${nombre_tables} dans "${config.db.database}"`);
  console.log(`                    ${apercu}${nombre_tables > 15 ? ', …' : ''}`);

  const requete = process.argv.slice(2).join(' ').trim();
  if (requete) {
    const r = await appelerOutil('executer_requete_sql', { requete });
    console.log(`4. Requête        : ${r.nombre_lignes} ligne(s)${r.tronque ? ' (résultat tronqué)' : ''}`);
    console.table(r.lignes);
  }

  console.log('\nTout fonctionne.');
}

main().catch((err) => {
  console.error(`\nÉCHEC : ${err.message}`);
  process.exit(1);
});
