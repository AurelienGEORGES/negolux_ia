# Glossaire Negolux

Les entrées marquées **(probable)** sont déduites des données et restent à valider.

## Organisation
- **Negolux** : société principale (Toulouse), e-commerce de mobilier jardin et maison. `compta_societe.ID = 1`.
- **Concept Usine** : marque et site associés à Negolux.
- **JFB Services**, **3W Distribution** : autres sociétés du groupe dans l'ERP.

## Logistique
- **DENJEAN** : prestataire logistique principal ; seule logistique active en 2026.
- **Logistique** (`LOGIST`) : entrepôt ou prestataire qui stocke et expédie un produit.
- **Fulfillment** : commande expédiée pour le compte d'un tiers ou par une marketplace. Exclue des stats.
- **Dépôt** (`depot_stock`) : lieu de stock rattaché à une commande.
- **MR** : Mondial Relay. **Agediss** : transporteur messagerie (colis lourds).
- **Stock dispo / ext** : stock disponible chez DENJEAN / stock externe (chez le fournisseur ou un autre dépôt).
- **Rupture** : stock disponible + externe ≤ 0.
- **Réappro** : réapprovisionnement fournisseur.

## Produits
- **SKU** : référence produit unique (ex. `LY-S24699 GR/DG DBLB`).
- **Désignation** : nom commercial, stocké dans `texte` (ex. « MARBELLA - LY-S24699 GR/DG DBLB »).
- **Famille** : `produit.ID_TYPE_PRODUIT` → `type_produit`.
- **Univers** : `garden` (jardin) ou `home` (maison).
- **Collection** : gamme commerciale (ex. MARBELLA).
- **ARTSIM / PRODCOMP / ARTCOMP / SPAREPART** : types de produit, voir `regles_metier`.
- **UNI / GEN** : **À CONFIRMER** (composé unique ou générique ?).
- **CRMV** : coût de revient marchandise, TTC (`PRIX_CRMV_TTC`). C'est le coût d'achat utilisé dans la marge **(probable)**.
- **FOB** : prix d'achat fournisseur départ usine, en USD (`PRIX_FOB_USD`).
- **Prix public** : prix de vente affiché ; **prix barré** : prix de référence avant promo.

## Canaux de vente
- **Place de marché** (`market_place`) : site sur lequel la commande est passée. **PREF** = code de regroupement.
- Principaux PREF (volume juin 2026) :
  - **VP** : Veepee (FR, BE, NL, DE, ES) et Privalia IT, regroupés.
  - **LM** : Leroy Merlin **(probable)**.
  - **MM** : Maisons du Monde (« MdM ») **(probable)**.
  - **AM** : Amazon.
  - **SH** : Shopify (site en propre).
  - **SR** : Showroomprivé (« SRP ») **(probable)**.
  - **ND** : Nature & Découvertes **(probable)**.
  - **BO** : Brico Marché · **GP** : Groupon · **MA** : ManoMano **(probable)** · **CD** : Cdiscount · **CT** : Castorama · **JG** : Jardiland · **BT** : But · **VU** : VenteU.
- **Compte marketplace** : compte vendeur sur une place, rattaché à une société.
- **Lengow** : agrégateur de flux marketplace ; **flux Lengow** = `lengow_market`.
- **Mirakl** : plateforme marketplace (comptes dans `mirakl_account`).
- **Commission** : part prélevée par la marketplace sur le CA.

## SAV et incidents
- **SAV** : service après-vente ; crée une commande dédiée.
- **Renvoi** : réexpédition au client (produit perdu, erreur…).
- **Retour** : produit renvoyé par le client.
- **Avarie** : produit abîmé au transport.
- **DESTOCKSAV** : déstockage lié au SAV **(probable)**.
- **Responsable SAV** (`SAV_RESPONSABLE`) : « à qui la faute » (transporteur, logistique, fournisseur…).
- **Avoir** : remboursement partiel ou total, déduit du CA.
- **Litige** : réclamation transport (`gestion_litiges`).
- **Standby** : commande mise en pause manuellement.

## Indicateurs
Voir `kpis` pour : CA brut, CA, marge, taux de marque, taux de marge, pièces, prix moyen, taux d'avarie, taux d'annulation.
