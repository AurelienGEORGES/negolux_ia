const config = require('./src/config');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { creerServeurMcp } = require('./src/mcp');
const { exigerJeton } = require('./src/auth');
const db = require('./src/db');
const { version } = require('./package.json');

const app = createMcpExpressApp({
  host: config.host,
  allowedHosts: config.allowedHosts
});

const authentifier = exigerJeton(config.apiKey);

function erreurJsonRpc(res, statut, code, message) {
  res.status(statut).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

/**
 * Interroge une instance du serveur MCP pour connaître les outils RÉELLEMENT enregistrés
 * (plus de liste en dur). Même chemin qu'un client : si ça marche ici, ça marche pour n8n.
 */
async function listerOutilsCharges() {
  const serveur = creerServeurMcp();
  const client = new Client({ name: 'negolux-autotest', version });
  const [cote_client, cote_serveur] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([serveur.connect(cote_serveur), client.connect(cote_client)]);
    const { tools } = await client.listTools();
    return tools.map((t) => ({ nom: t.name, description: (t.description || '').split('. ')[0] }));
  } finally {
    await client.close().catch(() => {});
    await serveur.close().catch(() => {});
  }
}

// Calculé une fois au démarrage (les outils ne changent pas sans redémarrage)
let outilsCharges = [];

app.get('/health', async (req, res) => {
  const outils = outilsCharges.map((o) => o.nom);
  try {
    await db.ping();
    res.json({ status: 'ok', version, database: 'ok', tools: outils });
  } catch (err) {
    res.status(503).json({ status: 'error', version, database: err.message, tools: outils });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Negolux MCP Server',
    version,
    endpoint: '/mcp (POST, Streamable HTTP, Bearer)',
    tools: outilsCharges,
  });
});

app.post('/mcp', authentifier, async (req, res) => {
  // Une instance neuve par requête (mode sans session) : jamais partagée
  const serveur = creerServeurMcp();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close().catch(() => {});
    serveur.close().catch(() => {});
  });

  try {
    await serveur.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp]', err.message);
    if (!res.headersSent) {
      erreurJsonRpc(res, 500, -32603, 'Erreur interne');
    }
  }
});

app.all('/mcp', (req, res) => {
  erreurJsonRpc(res, 405, -32000, 'Utiliser POST');
});

async function demarrer() {
  // 1. Outils : si un module plante, on le sait AVANT d'ouvrir le port
  try {
    outilsCharges = await listerOutilsCharges();
  } catch (err) {
    console.error('✗ Chargement des outils impossible :', err);
    process.exit(1);
  }

  // 2. HTTP
  const serveurHttp = app.listen(config.port, config.host, () => {
    const titre = `Negolux MCP v${version} — Démarré ✓`.padEnd(37);
    console.log(`
╔════════════════════════════════════════╗
║   ${titre}║
╚════════════════════════════════════════╝

  🌐 http://${config.host}:${config.port}/mcp
  ✅ ${outilsCharges.length} outils chargés :
${outilsCharges.map((o) => `    - ${o.nom}`).join('\n')}
`);

    // 3. BDD : une panne ne doit pas arrêter le serveur (le /health la signale)
    db.ping()
      .then(() => console.log(`✓ BDD OK: ${config.db.database}`))
      .catch((err) => console.error(`✗ BDD KO: ${err.message} (le serveur reste démarré)`));
  });

  serveurHttp.on('error', (err) => {
    console.error(`✗ Impossible d'écouter sur ${config.host}:${config.port} : ${err.message}`);
    process.exit(1);
  });

  async function shutdown(signal) {
    console.log(`\n[${signal}] Arrêt...`);
    serveurHttp.close(async () => {
      try {
        await db.fermer();
      } catch (err) {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 30000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});
// Une promesse rejetée non gérée (ex. pool MySQL) : on la journalise au lieu de tuer le serveur
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

demarrer();
