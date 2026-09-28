# Schéma ERP Negolux — tables clés

Base MariaDB **10.3** (`negolux`), 167 tables et vues. **Aucune clé étrangère n'est déclarée** : les jointures ci-dessous sont des conventions à respecter, `decrire_table` ne les montrera pas.

## Tables principales

| Table | Rôle | Volume |
|---|---|---|
| `commande` | En-tête de commande (statut, canal, totaux, dates, SAV) | ~800 k |
| `commande_produit` | Lignes de commande (produit, qté, prix, marge) | ~865 k |
| `produit` | Catalogue (SKU, logistique, stock, prix, type) | ~122 k |
| `produit_compose` | Nomenclature : produit composé → composants | ~5,6 k |
| `produit_stat` | Historique quotidien produit (DENJEAN uniquement) | ~60 M, passer par `historique_produits` |
| `client` | Clients (données personnelles) | ~727 k |
| `texte` | Textes multilingues et versionnés (désignations, titres) | ~1,3 M |
| `commande_etat` | Libellés des statuts de commande | 12 |
| `market_place` | Places de marché (Veepee, Amazon…) | 107 |
| `market_place_account` | Comptes par place et société | 101 |
| `lengow_market` | Flux Lengow | 147 |
| `compta_societe` | Sociétés du groupe | 5 |
| `compta_facture`, `compta_facture_produit` | Factures (remplacent `commande_facture`) | ~610 k |
| `fournisseur`, `type_produit`, `pays`, `transporteur`, `depot_stock` | Référentiels | petits |

## Jointures

```
commande_produit.ID_COMMANDE      → commande.ID
commande_produit.ID_PRODUIT       → produit.ID
commande.ID_CLIENT                → client.ID
commande.ID_ETAT                  → commande_etat.ID
commande.ID_MARKET_PLACE          → market_place.ID
commande.ID_MARKET_PLACE_ACCOUNT  → market_place_account.ID   (peut être NULL)
commande.ID_LENGOW_MARKET         → lengow_market.ID           (0 = aucun)
commande.ID_SOCIETE               → compta_societe.ID
commande.ID_TRANSPORTEUR          → transporteur.ID
commande.ID_DEPOT_STOCK           → depot_stock.ID
commande.SAV_ID_COMMANDE          → commande.ID  (commande d'origine d'un SAV — À CONFIRMER)
produit.ID_FOURNISSEUR            → fournisseur.ID
produit.ID_TYPE_PRODUIT           → type_produit.ID   (= « famille »)
produit_compose.ID_PRODUIT_PARENT → produit.ID (composé) ; produit_compose.ID_PRODUIT → produit.ID (composant)
client.ID_PAYS                    → pays.ID
```

### Désignation d'un produit
Le nom n'est pas dans `produit`, il est dans `texte`, qui est versionné :
```sql
JOIN texte t ON t.ID_TXT = p.ID_DESIGNATION AND t.ID_LANG = 1 AND t.ACTUEL = 1
```
Sans `ACTUEL = 1`, on obtient plusieurs lignes par produit, dont d'anciennes versions vides. Même principe pour `type_produit.ID_TITRE`.

## Colonnes à connaître

### commande
- Statut : **`ID_ETAT`** (→ `commande_etat`). La colonne `ETAT` (enum) est **vide et inutilisée**.
- Suppression logique : `SUP = 1`. Toujours filtrer `SUP = 0`.
- `IS_FULFILLMENT`, `IS_DOUBLON`, `IS_SPLIT` (commande scindée).
- `STATUT_SAV` : '', RENVOI, RETOUR, SAV, AVARIE, DESTOCKSAV.
- Dates : `DATE_COMMANDE` (référence), `DATE_EXPEDITION`, `DATE_LIVRAISON`, `DATE_ANNULATION`.
- Totaux : `TOTAL_TTC`, `TOTAL_MARGE`, `TOTAL_COMMISSION`, `TOTAL_AVOIR`, `MONTANT_REMISE`. Pour le CA et la marge, préférer `stats_commandes`.

### commande_produit
`QTY`, `PRIX_UNIT` (TTC), `PRIX_CRMV_TTC` (coût d'achat), `MARGE_VALEUR`, `MARGE_TAUX`, `TOTAL_TRANSPORT`, `TOTAL_REMISE`, `TOTAL_AVOIR`, `MARKET_TAUX_COMMISSION`, `SUP`.

### produit
`SKU`, `LOGIST`, `TYPE_COMPOSE` (ARTSIM, ARTCOMPUNI, ARTCOMPGEN, PRODCOMPUNI, PRODCOMPGEN, SPAREPART), `UNIVERS` (garden, home), `COLLECTION`, `COULEUR`, `ID_TYPE_PRODUIT`, `ID_FOURNISSEUR`, stocks (`STOCK`, `STOCK_DISPO`, `STOCK_DISPO_EXT`, `FULL_STOCK`…), ventes pré-calculées (`NB_VENTE_7J/30J/90J/365J`), `ETAT_STOCK` (stock, rupture, alert), `SUP`.

### commande_etat (valeurs de ID_ETAT)
2 En attente de traitement · 3 En attente de stock · 4 Envoi immédiat à la logistique · 5 Transmise à la logistique · 6 En cours de préparation · 7 Expédiée depuis la logistique · 8 Livrée au client · 9 Archivée · 10 Annulée · 11 SAV impossible · 12 En attente de réappro · 13 Standby

## Tables et vues à éviter
- `commande_facture` : obsolète, remplacée par `compta_facture`.
- `commande.ETAT` : vide, utiliser `ID_ETAT`.
- Vue `commande_retard_denjean` : inaccessible (droit refusé sur la fonction `jours_ouvres`).
- `produit_stat` en SQL direct : 60 M de lignes, passer par `historique_produits`.
- Vues `0_verif_*` et `a_bug_*` : contrôles internes, pas des données métier.

## Colonnes interdites (ne jamais sélectionner)
`client.MOTDEPASSE`, `market_place_account.LOGIN`, `.PASSWORD`, `.KEY_VERIF`, `compta_societe.ADRESSE*` (contient l'IBAN). Jamais de `SELECT *` sur `client`, `market_place_account` ou `compta_societe`.
