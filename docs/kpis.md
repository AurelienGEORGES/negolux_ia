# KPIs Negolux — définitions de référence

Source de vérité : l'écran ERP « Statistiques commandes v2 », reproduit par l'outil `stats_commandes`.

## Convention générale
- Tous les montants sont en **euros TTC**, y compris le coût d'achat (`PRIX_CRMV_TTC`). Toujours écrire « TTC » à côté d'un montant.
- Fraîcheur : les outils annoncent une copie nocturne, mais la base contient des commandes du jour. **À CONFIRMER** (voir `qualite_donnees`). Dans le doute, considérer le jour en cours comme incomplet.
- Date par défaut = date de commande. Utiliser `type_date = expedition` seulement si la question parle d'expéditions.

## Commandes retenues
Non supprimées, hors fulfillment, non annulées (ou annulées mais expédiées).
Nombre de commandes : juin 2026 = 6 275 hors fulfillment, ≈ 6 029 après exclusion des annulées non expédiées. Requête dans `requetes_types`. Les commandes SAV, renvoi et avarie y sont incluses (~900). **À CONFIRMER** : le chiffre officiel les inclut-il ?

## Chiffre d'affaires
- `ca_brut` = quantité × prix unitaire + transport
- `ca` = ca_brut − remises − avoirs → **c'est « le CA » par défaut**
- `historique_produits` donne un CA hors remises et avoirs, limité à la logistique DENJEAN : ne pas l'utiliser pour le CA de référence.

## Marge
- `marge` = ca − commission marketplace − achat
- **Taux de marque** = marge / ca (ex. 10 394 / 74 996 = 13,86 %)
- **Taux de marge** = marge / achat
- Ne jamais appeler « taux de marge » un rapport marge / CA.
- Taux à afficher par défaut : **À CONFIRMER** (usage interne Negolux).

## Pièces et prix moyen
- `pieces` = unités vendues des produits commandés ; un produit composé compte pour 1.
- Prix moyen = ca / pieces.
- Pièces physiques (composants ARTCOMPUNI, ARTCOMPGEN) : uniquement via `historique_produits`.

## Types de produits
ARTSIM (article simple), PRODCOMPUNI, PRODCOMPGEN (produits composés vendus), ARTCOMPUNI, ARTCOMPGEN (composants). **À CONFIRMER** : différence UNI / GEN.

## Questions ambiguës
- « Meilleur produit » sans critère = classement par `ca`. Donner aussi le n°1 en marge € s'il est différent, et le signaler.
- Comparaison de périodes : un seul appel `stats_commandes` avec `comparer_avec`.
- « Ce mois-ci », « le mois dernier » : se baser sur la date du jour fournie dans le prompt.

## Rupture et stock (historique_produits)
- Rupture = stock disponible + stock externe ≤ 0
- Valeurs `_fin` = photo au dernier jour de la période
- Taux d'avarie et d'annulation : calculés sur 30 jours glissants
