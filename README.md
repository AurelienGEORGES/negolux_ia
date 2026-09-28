# Negolux MCP

Serveur [Model Context Protocol (MCP)](https://modelcontextprotocol.io) donnant aux LLM et agents IA un accès **en lecture seule** à la base MariaDB de l'ERP Negolux.

Le serveur est conçu pour Claude, n8n et tout client compatible avec le transport **Streamable HTTP**. Il combine des outils métier, une documentation embarquée et un accès SQL contrôlé.

> La sécurité principale repose sur le compte MariaDB : il doit être dédié au serveur et limité à `SELECT`. Les contrôles applicatifs sont un garde-fou complémentaire, pas un remplacement des droits de base de données.

## Capacités

### Outils MCP

| Outil | Usage |
|---|---|
| `compter_commandes` | Compte les commandes sur une période, avec détail par statut, SAV, place de marché, jour ou mois. |
| `rechercher_produit` | Recherche un produit par SKU ou désignation et retourne son ID, stock et ventes récentes. |
| `composition_produit` | Affiche les composants d'un produit composé, les produits parents et les composants en rupture. |
| `lister_tables` | Liste les tables et vues disponibles, avec les avertissements connus. |
| `decrire_table` | Décrit les colonnes d'une table, les jointures documentées et les pièges connus. |
| `consulter_doc` | Charge la documentation métier, les définitions KPI, le schéma et les requêtes validées. |
| `executer_requete_sql` | Exécute une requête SQL de lecture paramétrée en dernier recours. |

Deux outils statistiques, `stats_commandes` et `historique_produits`, peuvent aussi être chargés si le module optionnel `src/tools/stats.js` est installé. Dans ce dépôt, ce module n'est pas présent : les outils ne sont donc **pas exposés**.

### Documentation métier

La documentation est disponible dans `docs/` et au travers de `consulter_doc`.

| Sujet de `consulter_doc` | Fichier | Contenu |
|---|---|---|
| `kpis` | `docs/kpis.md` | Définitions de CA, marge, taux, pièces et prix moyen. |
| `regles_metier` | `docs/business-rules.md` | Périmètres de commandes, produits composés et conventions de réponse. |
| `glossaire` | `docs/glossary.md` | Vocabulaire ERP, logistique, SAV et marketplaces. |
| `requetes_types` | `docs/common-queries.md` | Requêtes MariaDB validées et exemples de filtres. |
| `qualite_donnees` | `docs/data-quality.md` | Anomalies et limites connues des données. |
| `schema` | `docs/schema.md` | Tables, jointures conventionnelles et colonnes sensibles. |

## Routes HTTP

| Route | Méthode | Authentification | Usage |
|---|---|---|---|
| `/mcp` | `POST` | Bearer token obligatoire | Point d'entrée MCP Streamable HTTP. |
| `/health` | `GET` | Non | Vérifie que le serveur et la base répondent. |
| `/` | `GET` | Non | Affiche le nom, la version, l'endpoint et les outils chargés. |

Le serveur ne fournit pas de transport SSE (`/sse` / `/messages`).

## Installation locale avec Laragon

### Prérequis

- Node.js 20 ou supérieur ;
- MariaDB/MySQL accessible ;
- une copie locale de la base, recommandée pour le développement, ou un compte de production strictement limité à la lecture.

### Installation

Dans le terminal Laragon, depuis `C:\laragon\www\negolux_mcp` :

```powershell
npm install
Copy-Item .env.example .env
```

Générer ensuite un jeton d'au moins 32 caractères :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Renseigner ce jeton dans `MCP_API_KEY`, puis configurer la connexion dans `.env` :

```dotenv
MCP_API_KEY=<jeton-genere>
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=negolux
```

Pour une base de production distante, préférez une connexion chiffrée (`DB_SSL=true`) ou un tunnel SSH :

```powershell
ssh -N -L 3307:127.0.0.1:3306 utilisateur@serveur-prod
```

Puis utilisez `DB_HOST=127.0.0.1` et `DB_PORT=3307`.

### Démarrage

```powershell
npm run dev
```

Le serveur écoute par défaut sur `http://127.0.0.1:3000`. Vérifiez son état :

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Pour un démarrage sans rechargement automatique :

```powershell
npm start
```

## Tests

Les tests unitaires ne nécessitent pas de base de données :

```powershell
npm test
```

Le test de fumée MCP nécessite un serveur déjà démarré et le même fichier `.env` :

```powershell
node tests/tester.js
node tests/tester.js "SELECT ID, SKU FROM produit LIMIT 5"
```

Il vérifie la santé du serveur, les outils chargés et l'accès aux tables, puis exécute facultativement la requête fournie.

## Connexion d'un client MCP

### MCP Inspector

```powershell
npm run inspector
```

Dans l'interface :

- choisir **Streamable HTTP** ;
- saisir l'URL `http://127.0.0.1:3000/mcp` ;
- fournir `Authorization: Bearer <MCP_API_KEY>` ;
- lancer *Connect*, puis *Tools > List Tools*.

### Claude Code

```powershell
claude mcp add --transport http negolux http://127.0.0.1:3000/mcp --header "Authorization: Bearer <MCP_API_KEY>"
```

### n8n

Sur un nœud **AI Agent**, ajoutez **MCP Client Tool** :

- **Endpoint** : `https://<domaine>/mcp`
- **Server Transport** : `HTTP Streamable`
- **Authentication** : en-tête `Authorization: Bearer <MCP_API_KEY>`

Pour n8n exécuté dans Docker sur le poste local, utilisez `http://host.docker.internal:3000/mcp`. Configurez aussi le serveur avec :

```dotenv
HOST=0.0.0.0
ALLOWED_HOSTS=host.docker.internal,localhost
```

### Appel HTTP minimal

```powershell
$headers = @{
  Authorization = "Bearer <MCP_API_KEY>"
  Accept = "application/json, text/event-stream"
  "Content-Type" = "application/json"
}

$body = @{
  jsonrpc = "2.0"
  id = 1
  method = "tools/call"
  params = @{
    name = "lister_tables"
    arguments = @{}
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod http://127.0.0.1:3000/mcp -Method Post -Headers $headers -Body $body
```

## Bon usage des outils

1. Pour un décompte de commandes, utiliser `compter_commandes` et communiquer le périmètre retourné.
2. Pour un produit, commencer par `rechercher_produit`, puis employer `composition_produit` si nécessaire.
3. Avant une requête SQL libre, consulter au minimum `requetes_types` et `schema`.
4. Ne pas recalculer le CA, la marge ou les pièces avec des requêtes ad hoc tant que les outils statistiques de référence sont absents : signaler la limite de l'installation.
5. Toujours préciser la période, le périmètre appliqué, la devise et le caractère TTC des montants.

## Garde-fous

- Toutes les opérations sont déclarées en lecture seule aux clients MCP.
- Les requêtes passent par une transaction MariaDB `READ ONLY`, annulée ensuite.
- Seuls `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `DESC` et `EXPLAIN` sont acceptés pour le SQL libre.
- Les écritures, requêtes multiples, commentaires exécutables, verrous, exports de fichiers et fonctions coûteuses sont refusés.
- `SELECT *` est refusé ; un `LIMIT 200` est ajouté en l'absence de limite.
- Les tables et colonnes connues pour contenir des identifiants sont bloquées ; les IBAN détectés dans les résultats sont masqués.
- Les résultats, textes et données binaires sont tronqués pour éviter des réponses excessives.

Ces protections ne dispensent pas de limiter les privilèges du compte MariaDB.

## Mise en production

1. Créer un compte MariaDB dédié au serveur, limité aux données nécessaires :

   ```sql
   CREATE USER 'negolux_mcp'@'<ip-serveur-mcp>' IDENTIFIED BY '<mot-de-passe-fort>';
   GRANT SELECT ON negolux.* TO 'negolux_mcp'@'<ip-serveur-mcp>';
   ```

   Pour limiter l'exposition des données sensibles, préférez des droits table par table ou, mieux, des vues dédiées ne contenant aucune colonne confidentielle.

2. Exposer le serveur uniquement derrière un reverse proxy HTTPS.
3. Définir `ALLOWED_HOSTS` avec le ou les noms de domaine publics attendus.
4. Utiliser `DB_SSL=true` lorsque la base est distante et que TLS est configuré.
5. Conserver `.env` hors du dépôt, faire tourner régulièrement `MCP_API_KEY` et le mot de passe MariaDB.
6. Superviser `/health`, les logs applicatifs et la saturation du pool de connexions.

## Configuration

Consultez `.env.example` pour la liste complète. Les variables obligatoires sont :

| Variable | Description |
|---|---|
| `MCP_API_KEY` | Jeton Bearer, 32 caractères minimum. |
| `DB_HOST` | Hôte MariaDB/MySQL. |
| `DB_USER` | Utilisateur MariaDB dédié. |
| `DB_NAME` | Base ERP à consulter. |

Les variables `SQL_MAX_ROWS` et `SQL_TIMEOUT_MS` contrôlent respectivement la taille maximale des résultats et la durée maximale d'une requête.
