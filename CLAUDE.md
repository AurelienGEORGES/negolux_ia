# Guide de contribution — Negolux MCP

## Objet

Negolux MCP est un serveur [Model Context Protocol](https://modelcontextprotocol.io) qui donne aux LLM et aux agents IA un accès **en lecture seule** à la base MariaDB de l'ERP Negolux (Concept-Usine).

Le projet utilise Node.js 20 ou supérieur, CommonJS, `@modelcontextprotocol/sdk`, `mysql2` et Zod v4. Le code, les messages affichés aux clients et les journaux sont en français.

Le serveur doit toujours protéger les données de production. Les droits MariaDB du compte utilisé restent la barrière principale : ils doivent être limités à `SELECT`, idéalement table par table ou via des vues dédiées.

## Commandes

Depuis `C:\laragon\www\negolux_mcp` :

```powershell
npm install
npm run dev
npm start
npm test
node tests/tester.js
npm run inspector
```

- `npm run dev` démarre le serveur avec rechargement automatique.
- `npm start` démarre le serveur sans surveillance des fichiers.
- `npm test` lance les tests Jest sans base de données.
- `node tests/tester.js` est le test de fumée MCP : le serveur doit déjà être démarré et le fichier `.env` doit être configuré. Une requête facultative peut être passée en argument.
- `npm run inspector` démarre MCP Inspector. Choisir **Streamable HTTP**, jamais STDIO.

`package.json` contient actuellement un script `npm run tester` pointant vers `scripts/tester.js`, qui n'existe pas. Utiliser `node tests/tester.js` tant que ce script n'est pas corrigé.

## Architecture

### Entrée HTTP

`server.js` crée l'application Express MCP.

- `POST /mcp` est l'unique endpoint MCP. Il utilise Streamable HTTP, avec authentification Bearer.
- Une nouvelle instance de `McpServer` et un nouveau transport sont créés pour chaque requête : ne jamais partager une instance entre connexions, sinon le SDK renvoie `Already connected to a transport`.
- `GET /health` effectue un ping de base de données sans authentification.
- `GET /` expose les métadonnées et les outils chargés.
- Le transport SSE (`/sse`, `/messages`) n'est pas implémenté.
- `createMcpExpressApp` contrôle l'en-tête `Host` avec `ALLOWED_HOSTS`. Cette variable doit être renseignée derrière un domaine ou un reverse proxy.

### Configuration et authentification

- `src/config.js` charge `.env`, valide les variables obligatoires et les limites numériques.
- `src/auth.js` vérifie `Authorization: Bearer <MCP_API_KEY>` avec une comparaison à temps constant.
- Les variables obligatoires sont `MCP_API_KEY`, `DB_HOST`, `DB_USER` et `DB_NAME`.
- Ne jamais versionner `.env`. Le modèle versionné est `.env.example`.

### Accès MariaDB

`src/db.js` est l'unique point d'accès à la base.

- Toujours appeler `executerLecture(sql, valeurs, options)` ; ne jamais créer de connexion ni appeler le pool depuis un outil.
- Les valeurs SQL passent par les paramètres `?`, jamais par concaténation.
- Les requêtes sont exécutées dans une transaction `READ ONLY`, puis annulées.
- Les résultats sont lus en flux et coupés à `SQL_MAX_ROWS`. Une connexion dont le flux est coupé est détruite, car elle peut encore contenir des paquets non lus.
- Une durée maximale est configurée côté client et, lorsque disponible, côté serveur MariaDB/MySQL.
- `dateStrings` et `bigNumberStrings` font revenir dates, `BIGINT` et `DECIMAL` sous forme de chaînes. Ne pas les convertir implicitement si la précision est importante.

### Serveur MCP et outils

`src/mcp.js` crée une nouvelle instance MCP et porte les instructions envoyées aux clients. Elles doivent rester courtes et orienter vers les outils et la documentation.

`src/tools/index.js` enregistre les outils disponibles :

| Module | Outils |
|---|---|
| `schema.js` | `lister_tables`, `decrire_table` |
| `requete.js` | `executer_requete_sql` |
| `commandes.js` | `compter_commandes` |
| `produits.js` | `rechercher_produit`, `composition_produit` |
| `doc.js` | `consulter_doc` |

Le module facultatif `src/tools/stats.js` peut enregistrer `stats_commandes` et `historique_produits`. Il est absent de ce dépôt : ces outils ne sont donc pas exposés. Ne pas les citer comme disponibles dans une interface ou une documentation sans vérifier `statsDisponibles`.

Tous les outils doivent :

1. définir un `inputSchema` Zod précis ;
2. définir les annotations `LECTURE_SEULE` ;
3. passer par `outil(nom, handler)` de `src/tools/reponse.js` ;
4. retourner `json(...)` ou `erreur(...)` ;
5. fournir une description destinée à un LLM : quand employer l'outil, ce qu'il renvoie et ses limites métier ;
6. expliciter la période, le périmètre et les avertissements dans leur réponse lorsqu'ils manipulent des données métier.

### SQL libre et données sensibles

`executer_requete_sql` est un dernier recours. Les outils métier doivent être privilégiés chaque fois que le besoin est couvert.

- `src/tools/securite.js` est le validateur effectivement utilisé : il interdit les écritures, les requêtes multiples, `SELECT *`, les verrous, exports, fonctions coûteuses et objets connus pour contenir des secrets.
- Il supprime les commentaires avant analyse, masque les IBAN détectés dans les résultats et filtre les colonnes sensibles.
- `src/sql.js` est un ancien validateur non utilisé par l'outil SQL. Ne pas l'étendre indépendamment de `src/tools/securite.js` ; fusionner ou supprimer ce code avant toute évolution de la politique SQL.
- Les filtres applicatifs sont volontairement défensifs, mais ne remplacent jamais les droits MariaDB.

## Documentation métier

Les documents de référence sont dans `docs/` :

| Fichier | Sujet MCP | Contenu |
|---|---|---|
| `kpis.md` | `kpis` | CA, marge, taux, pièces et conventions de calcul. |
| `business-rules.md` | `regles_metier` | Périmètres de commande et pièges produits. |
| `glossary.md` | `glossaire` | Vocabulaire ERP, logistique, SAV et marketplaces. |
| `common-queries.md` | `requetes_types` | Requêtes MariaDB validées. |
| `data-quality.md` | `qualite_donnees` | Anomalies et limites connues. |
| `schema.md` | `schema` | Tables, jointures et colonnes interdites. |

Avant d'ajouter un outil métier, consulter les règles et requêtes documentées, puis vérifier le comportement dans le code de l'ERP si nécessaire :

- écrans et modèles : `C:\laragon\www\negolux\z\zamback\classe\model\` ;
- tâches planifiées : `C:\laragon\www\negolux\z\zamback\module\import_export\`.

Les documents contiennent des points marqués **À CONFIRMER**. Ne pas transformer ces hypothèses en règles codées sans validation métier.

`consulter_doc` lit un fichier entier, mais le sérialiseur de réponse tronque les textes longs. Pour ajouter de la documentation consommable par les LLM, préférer des sections courtes et structurées ; une évolution souhaitable est d'ajouter recherche ou pagination à cet outil.

## Conventions métier importantes

- Tous les montants métier sont en euros **TTC**.
- La date de référence des commandes est `DATE_COMMANDE`, sauf question explicite sur les expéditions.
- Le périmètre de statistiques usuel exclut les commandes supprimées, le fulfillment et les annulées non expédiées ; les SAV sont inclus par défaut.
- `commande.ETAT` est inutilisée. Utiliser `commande.ID_ETAT`.
- Les dates vides sont représentées par `0000-00-00 00:00:00`, pas par `NULL`.
- La table `texte` est versionnée : utiliser `ID_LANG = 1 AND ACTUEL = 1` pour les désignations françaises.
- Éviter le SQL direct sur `produit_stat`, très volumineuse. Le module statistique prévu doit en borner les périodes et agréger en base.
- Ne jamais additionner indistinctement le CA ou la marge de `produit_stat` : les composants peuvent reproduire le CA du produit composé.
- Ne jamais sélectionner des mots de passe, identifiants marketplace, tokens ou coordonnées bancaires. Éviter aussi les données personnelles client sauf demande explicitement justifiée sur une commande précise.

## Ajouter ou modifier un outil

1. Chercher d'abord si un outil existant ou une requête type répond déjà au besoin.
2. Créer ou modifier un module dans `src/tools/`, puis l'enregistrer dans `src/tools/index.js`.
3. Employer Zod pour borner les entrées, notamment dates, limites, énumérations et regroupements.
4. Utiliser des listes fermées pour les identifiants SQL non paramétrables, comme les axes de regroupement.
5. Ajouter des tests unitaires sans dépendance réseau ni MariaDB, sur le modèle de `tests/outils.test.js` et `tests/securite.test.js`.
6. Mettre à jour `README.md`, les instructions MCP et les documents de `docs/` lorsque le comportement, la disponibilité ou le périmètre évolue.
7. Lancer `npm test`.

## Déploiement

- Déployer derrière un reverse proxy HTTPS.
- Définir `ALLOWED_HOSTS` pour chaque hôte public attendu.
- Activer `DB_SSL=true` pour une base distante lorsque TLS est disponible.
- Utiliser un compte MariaDB dédié et à privilèges minimaux.
- Ne pas exposer directement la base de données ni les fichiers `.env`.
- Surveiller `/health`, les erreurs d'outils et la saturation du pool MariaDB.
