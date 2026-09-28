# CLAUDE.md

Ce fichier donne des indications à Claude Code (claude.ai/code) pour travailler sur le code de ce dépôt.

## Présentation

Negolux MCP : serveur MCP (Model Context Protocol) donnant un accès **en lecture seule** à la base MySQL de production de l'ERP Negolux (Concept-Usine). Il est utilisé par des LLM (Claude…) et par les agents IA de n8n (nœud « MCP Client Tool »). Installation, tests locaux avec Laragon et configuration des clients : voir `README.md`.

Node.js ≥ 20 en CommonJS (la prod tourne en v20.17). Code, commentaires, descriptions d'outils et logs sont en français.

## Commandes

- `npm install`
- `npm run dev` : lance le serveur avec `node --watch`
- `npm start`
- `npm run tester [-- "SELECT …"]` : test de bout en bout du serveur lancé (santé, outils, tables, requête optionnelle), avec le même `.env`
- `npm run inspector` : MCP Inspector (choisir le transport Streamable HTTP, sinon erreur STDIO `mcp-server-everything ENOENT`)

Pas de build, de linter ni de tests automatisés. La config est lue depuis `.env` (modèle commenté : `.env.example`) ; le serveur s'arrête au démarrage si une variable obligatoire manque.

## Architecture

- `server.js` : point d'entrée HTTP. `createMcpExpressApp` (SDK) parse le JSON et valide l'en-tête Host : seul `localhost` est accepté, sauf si `ALLOWED_HOSTS` est défini (obligatoire derrière un domaine).
  - `POST /mcp` : Streamable HTTP **sans état**, un `McpServer` et un transport neufs par requête (GET/DELETE → 405).
  - `GET /sse` + `POST /messages` : ancien transport SSE ; sessions en mémoire, donc un seul processus.
  - `GET /health` : ping de la base, sans authentification. Toutes les autres routes passent par `exigerJeton` (`src/auth.js`).
- `src/mcp.js` : `creerServeurMcp()` crée le serveur, fixe les `instructions` envoyées au client et enregistre les modules de `src/tools/`. Ne jamais partager une instance entre connexions (le SDK lève « Already connected to a transport »).
- `src/db.js` : pool `mysql2`. `executerLecture(sql, valeurs, { maxLignes })` est **le seul point d'accès à la base** : transaction `READ ONLY` puis `ROLLBACK`, limite de durée côté serveur (`max_execution_time` MySQL, repli `max_statement_time` MariaDB), lecture en flux coupée au-delà de `maxLignes` (la connexion est alors détruite au lieu d'être rendue au pool).
- `src/sql.js` : `verifierRequeteLecture()` filtre le SQL libre venant du LLM. C'est un garde-fou ; la vraie barrière est le compte MySQL limité à `SELECT` plus la transaction `READ ONLY`.
- `src/tools/reponse.js` : `outil(nom, handler)` (durée, logs, exceptions converties en résultat `isError`), `json()` (résume les Buffers, tronque les textes longs), annotations `LECTURE_SEULE`.

## Ajouter un outil

- Écrire un module dans `src/tools/` qui exporte `function (serveur)` et l'ajouter à `MODULES_OUTILS` dans `src/mcp.js`.
- `serveur.registerTool(nom, { title, description, inputSchema: { ...forme zod v4 }, annotations: LECTURE_SEULE }, outil(nom, async (args) => ...))`.
- Toujours passer par `executerLecture()` avec des `?` pour les valeurs, jamais de concaténation.
- La description est lue par le LLM : dire quand utiliser l'outil et ce qu'il renvoie.
- Une fois le schéma de l'ERP connu, préférer des outils métier (SAV, stock, clients…) au SQL libre.

## Données de l'ERP (base `negolux`)

- Code source de l'ERP (PHP) : `C:\laragon\www\negolux`. Requêtes des écrans dans `z/zamback/classe/model/` (ex. `commandestatv2.php`), crons dans `z/zamback/module/import_export/`. Pour créer un outil métier, partir de la requête et des filtres de l'écran correspondant.
- Types de produits (`produit.TYPE_COMPOSE`) : `ARTSIM` article simple, `PRODCOMPUNI` / `PRODCOMPGEN` produits composés vendus, `ARTCOMPUNI` / `ARTCOMPGEN` articles composants. Composition dans `produit_compose` (`ID_PRODUIT_PARENT`, `ID_PRODUIT`, `QTY_PRODUIT`). Le prix est porté par le produit vendu, le stock par les articles.
- Filtre « vente » de l'ERP : `commande_produit cp` joint à `commande c` avec `cp.SUP != 1`, `c.SUP != 1`, `c.ID_ETAT != 10`, `c.IS_FULFILLMENT = 0`, `c.TOTAL_TTC != 1`, sur `c.DATE_COMMANDE`. CA d'une ligne = `QTY * PRIX_UNIT + TOTAL_TRANSPORT`.
- `produit_stat` : une ligne par produit et par jour (la veille), calculée par le cron `DIVERS/calcul_stock_vente_produit.php`, uniquement pour les produits `LOGIST = 'DENJEAN'`. Table très volumineuse en prod avec seulement des index simples (`ID_PRODUIT`, `SKU`, `DATE`) : toujours imposer une plage de dates et agréger en SQL.
  - **Ne jamais additionner `CA_VENTE` / `MARGE_VENTE` sur toutes les lignes** : la ligne d'un composant reprend le CA complet de la ligne du produit composé parent (non proratisé), d'où un double comptage (31 M€ au lieu d'environ 12 M€ sur 2026). CA et marge : lignes des produits vendus (`ARTSIM`, `PRODCOMPUNI`, `PRODCOMPGEN`) uniquement, vérifié à ±3 % contre les commandes.
  - `NB_VENTE` : sur les articles (`ARTSIM`, `ARTCOMP*`), pièces physiques y compris via les produits composés ; sur les produits vendus, unités vendues. Ne pas mélanger les deux.
  - `STOCK*`, `PRIX_*`, `TAUX_AVARIE` / `TAUX_CANCEL` (30 jours glissants) sont des photos : prendre la valeur à la dernière date, ne jamais additionner.
  - `MARGE_VENTE` = CA − commission marketplace − `QTY * PRIX_CRMV_TTC` (coût d'achat).

## Pièges

- Options `dateStrings` et `bigNumberStrings` : les dates, les `BIGINT` (y compris les littéraux et expressions entières, ex. `SELECT 1`) et les `DECIMAL` arrivent en chaînes.
- `/mcp` étant sans état, aucune donnée n'est conservée entre deux appels et le serveur ne peut pas envoyer de notifications au client.
- `.env.example` est versionné grâce à une exception dans `.gitignore`.
- Déploiement sur un serveur Linux dans `/home/negoluxmcp/public_html`. `pm2` est dans les dépendances.

## Documentation de la base

- Structure des tables : docs/schema.md
- Règles métier : docs/business-rules.md
- Vocabulaire : docs/glossary.md
- Requêtes courantes : docs/common-queries.md
- Qualité des données : docs/data-quality.md
- KPIs : docs/kpis.md
