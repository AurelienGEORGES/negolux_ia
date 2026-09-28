# Règles métier Negolux

Définitions chiffrées (CA, marge, taux) : voir `kpis`. Ce fichier couvre les conventions et les pièges.

## Quel outil pour quelle question
1. **CA, marge, pièces, comparaison de périodes** → `stats_commandes`. C'est la référence, identique à l'écran ERP « Statistiques commandes v2 ».
2. **Évolution d'un produit dans le temps, stock, ruptures, prix** → `historique_produits` (logistique DENJEAN uniquement).
3. **Tout le reste** (statuts, SAV, délais, clients, canaux…) → `executer_requete_sql`, en s'appuyant sur `requetes_types` et `schema`.
4. Si un chiffre SQL diffère de `stats_commandes`, c'est `stats_commandes` qui fait foi. Signaler l'écart plutôt que de le masquer.

## Périmètre des commandes
- Toujours exclure `SUP = 1` (supprimées) et, sauf demande contraire, `IS_FULFILLMENT = 1`.
- Annulées : `ID_ETAT = 10`. Elles sont exclues des stats sauf si elles ont été expédiées.
- **Les SAV, renvois et avaries sont des commandes à part entière** (`STATUT_SAV` non vide) : environ 900 en juin 2026, sur ~6 000. Un « nombre de commandes » les inclut par défaut. **À CONFIRMER** : le chiffre attendu par la direction les exclut-il ? Si oui, utiliser `type_commandes = sauf_sav`.
- Commandes scindées (`IS_SPLIT = 1`) : une commande client peut être répartie en plusieurs lignes `commande`. **À CONFIRMER** : faut-il les compter une ou plusieurs fois ?

## Produits
- `TYPE_COMPOSE` :
  - ARTSIM : article simple, vendu et stocké tel quel.
  - PRODCOMPUNI, PRODCOMPGEN : produit composé vendu (ex. un salon de jardin), qui compte pour 1 pièce.
  - ARTCOMPUNI, ARTCOMPGEN : composant physique d'un produit composé (ex. la table, les chaises).
  - SPAREPART : pièce détachée, quasiment toujours à prix 0 (envoi SAV). À exclure des classements de ventes.
- Les composants apparaissent aussi dans `commande_produit`, avec un prix. Additionner `QTY` sur toutes les lignes **surcompte les pièces**. **À CONFIRMER** : composants vendus seuls, ou éclatement du composé ?
- Univers : `garden` (jardin) et `home` (maison). Les pièces détachées ont un univers vide.
- En 2026, toutes les lignes vendues sont en logistique **DENJEAN**. Les autres logistiques (MORIN, BENOIST, CONFORTLUXE…) sont historiques.

## Sociétés du groupe (compta_societe)
1 Negolux (active, DENJEAN) · 2 JFB Services · 3 3W Distribution · 4 Caubell (supprimée) · 5 Varistocks (supprimée).
**À CONFIRMER** : quelles sociétés portent encore du CA en 2026 ?

## Dates et périodes
- Date de référence = `DATE_COMMANDE`. Utiliser la date d'expédition seulement si la question porte sur les expéditions.
- Périodes : bornes inclusives au jour (`date_debut`, `date_fin`). En SQL : `>= '2026-06-01' AND < '2026-07-01'`.
- « Ce mois-ci », « l'an dernier » : se baser sur la date du jour fournie dans le prompt, jamais sur une date supposée.
- Le mois en cours est toujours partiel : le préciser dans la réponse.

## Confidentialité
- Ne jamais afficher de données personnelles client (nom, email, téléphone, adresse) sauf demande explicite portant sur une commande précise. Répondre en agrégats.
- Ne jamais lire ni restituer les mots de passe, identifiants de comptes marketplace ou coordonnées bancaires (voir `schema`).

## Façon de répondre
- Toujours préciser : la période, le périmètre (filtres appliqués), la devise et « TTC ».
- Question ambiguë (« meilleur », « performance ») : annoncer le critère choisi, et donner l'alternative si le classement change.
- Donnée absente ou incertaine : le dire. Ne jamais compléter avec une supposition.
- Chiffres arrondis à l'euro dans les phrases, exacts dans les tableaux.
