# Qualité des données — anomalies connues

Constats faits le 25/09/2026 sur la base de production. À lire avant de conclure sur un chiffre surprenant.

## Colonnes trompeuses
- **`commande.ETAT` est vide** sur toutes les commandes 2026. Le vrai statut est `ID_ETAT`. Un filtre `ETAT = 'annule'` ne renvoie rien et fausse silencieusement le résultat.
- **Dates vides = `0000-00-00`, pas NULL.** `IS NULL` ne trouve rien. Exemple : 2 342 commandes 2026 sans date d'expédition, 0 NULL.
- **Aucune clé étrangère déclarée** : l'intégrité référentielle n'est pas garantie. Préférer `LEFT JOIN` pour ne pas perdre de lignes silencieusement.
- **`texte` est versionné** : sans `ACTUEL = 1`, doublons et désignations vides.

## Incohérences constatées
- **Commandes datées dans le futur** : 3 commandes avec `DATE_COMMANDE` au 26, 27 et 28/09/2026, créées le 23/09. Probablement des tests ou des commandes programmées. Borner les requêtes à la date du jour.
- **Livrées sans expédition** : en juin 2026, 31 commandes « Livrée au client » (`ID_ETAT = 8`) n'ont pas de `DATE_EXPEDITION`. Un filtre par date d'expédition les exclut.
- **Annulées mais expédiées** : quelques cas par mois (2 en juin 2026). Elles sont comptées dans les stats, c'est voulu.
- **Commandes sans client** (`ID_CLIENT = 0`) : 3 en 2026.
- **Pièces détachées à prix 0** : 524 lignes SPAREPART sur 527 en juin 2026. Elles gonflent le nombre de lignes, pas le CA.
- **Composants avec prix** : des lignes ARTCOMPUNI et ARTCOMPGEN portent un prix. Risque de double comptage des pièces (voir `regles_metier`).

## Fraîcheur des données
- La description de `stats_commandes` et `historique_produits` indique « base copiée chaque nuit, pas de données du jour ».
- **Pourtant**, la base interrogée contient des commandes du 25/09/2026 à 13h44, donc du jour même.
- **À CONFIRMER** : la connexion MCP de production pointe-t-elle sur la base live ou sur une copie ? Selon la réponse, corriger soit la description des outils, soit la configuration.
- `produit_stat` (historique produits) est alimentée chaque nuit : données jusqu'à la veille au mieux.

## Accès et droits
- Vue `commande_retard_denjean` : erreur de droit (fonction `jours_ouvres` non autorisée pour l'utilisateur `mcp`).
- Fonctions JSON d'agrégation indisponibles (MariaDB 10.3).
- **L'utilisateur `mcp` peut lire des colonnes sensibles** : `client.MOTDEPASSE`, `market_place_account.LOGIN` et `.PASSWORD`, l'IBAN dans `compta_societe.ADRESSE`. Voir `schema` : colonnes interdites.

## Réflexes
- Chiffre qui paraît anormal : vérifier `SUP`, `IS_FULFILLMENT`, `ID_ETAT` et les dates `0000-00-00` avant de conclure.
- Écart entre SQL et `stats_commandes` : c'est l'outil qui fait foi ; signaler l'écart.
- Anomalie nouvelle : la mentionner dans la réponse, sans la corriger ni l'extrapoler.
