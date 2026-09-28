# Requêtes types — ERP Negolux

Toutes les requêtes ont été exécutées avec succès sur la base de production le 25/09/2026.
**Contraintes MariaDB 10.3** : pas de `JSON_ARRAYAGG` ni de `JSON_OBJECTAGG` (utiliser `GROUP_CONCAT`). Les CTE (`WITH`) et les fonctions de fenêtre sont disponibles. Toujours mettre un `LIMIT` et passer les valeurs par `?`.

> Pour le CA, la marge ou les pièces vendues, utiliser `stats_commandes`, pas ces requêtes.

## Commandes par statut sur une période
```sql
SELECT c.ID_ETAT, e.LIBELLE, c.STATUT_SAV, COUNT(*) AS nb
FROM commande c
LEFT JOIN commande_etat e ON e.ID = c.ID_ETAT
WHERE c.DATE_COMMANDE >= ? AND c.DATE_COMMANDE < ?
  AND c.SUP = 0 AND c.IS_FULFILLMENT = 0
GROUP BY c.ID_ETAT, e.LIBELLE, c.STATUT_SAV
ORDER BY nb DESC
LIMIT 50
```
Juin 2026 : 6 275 commandes hors fulfillment, dont 4 481 expédiées sans SAV.

## Nombre de commandes (périmètre des stats)
```sql
SELECT COUNT(*) AS nb
FROM commande
WHERE DATE_COMMANDE >= ? AND DATE_COMMANDE < ?
  AND SUP = 0 AND IS_FULFILLMENT = 0
  AND NOT (ID_ETAT = 10 AND DATE_EXPEDITION < '2000-01-01')
LIMIT 1
```
Juin 2026 : ≈ 6 029. Claude Code a trouvé 6 027 avec un filtre supplémentaire « montant significatif ». **À CONFIRMER** : définition officielle du nombre de commandes (avec ou sans SAV, voir `regles_metier`).

## Commandes par place de marché
```sql
SELECT mp.PREF, mp.NOM, COUNT(c.ID) AS nb
FROM commande c
JOIN market_place mp ON mp.ID = c.ID_MARKET_PLACE
WHERE c.DATE_COMMANDE >= ? AND c.DATE_COMMANDE < ?
  AND c.SUP = 0 AND c.IS_FULFILLMENT = 0
GROUP BY mp.PREF, mp.NOM
ORDER BY nb DESC
LIMIT 30
```
Pour regrouper par famille de canal (tout Veepee ensemble), grouper sur `mp.PREF` seul.

## Retrouver un produit et sa désignation
```sql
SELECT p.ID, p.SKU, p.TYPE_COMPOSE, p.UNIVERS, p.COLLECTION, t.VALUE AS designation
FROM produit p
LEFT JOIN texte t ON t.ID_TXT = p.ID_DESIGNATION AND t.ID_LANG = 1 AND t.ACTUEL = 1
WHERE p.SKU = ?          -- ou : t.VALUE LIKE CONCAT('%', ?, '%')
  AND p.SUP = 0
LIMIT 20
```

## Composants d'un produit composé
```sql
SELECT pc.ID_PRODUIT, p.SKU, pc.QTY_PRODUIT
FROM produit_compose pc
JOIN produit p ON p.ID = pc.ID_PRODUIT
WHERE pc.ID_PRODUIT_PARENT = ? AND pc.SUP = 0
LIMIT 50
```

## Répartition des lignes vendues par type de produit
```sql
SELECT p.TYPE_COMPOSE, COUNT(*) AS nb_lignes,
       SUM(cp.PRIX_UNIT = 0) AS nb_prix_zero,
       ROUND(AVG(cp.PRIX_UNIT), 2) AS prix_moyen
FROM commande_produit cp
JOIN produit p ON p.ID = cp.ID_PRODUIT
WHERE cp.DATE >= ? AND cp.DATE < ? AND cp.SUP = 0
GROUP BY p.TYPE_COMPOSE
LIMIT 10
```

## Taux de SAV d'une période
```sql
SELECT COUNT(*) AS total,
       SUM(STATUT_SAV <> '') AS avec_sav,
       ROUND(100 * SUM(STATUT_SAV <> '') / COUNT(*), 1) AS pct_sav,
       SUM(STATUT_SAV = 'AVARIE') AS avaries
FROM commande
WHERE DATE_COMMANDE >= ? AND DATE_COMMANDE < ?
  AND SUP = 0 AND IS_FULFILLMENT = 0
LIMIT 1
```
**À CONFIRMER** : le taux de SAV « officiel » se calcule-t-il sur les commandes d'origine ou sur les commandes SAV créées ?

## Tester une date « vide »
Les dates non renseignées valent `'0000-00-00 00:00:00'`, pas `NULL`.
- Renseignée : `col > '2000-01-01'`
- Vide : `col < '2000-01-01'`
