# Cadre réglementaire financier

> Pré-analyse à faire confirmer par un avocat spécialisé (droit bancaire et financier) avant le
> lancement, et à réexaminer avant toute évolution des fonctionnalités.

## Positionnement actuel

Economiz est un **outil d'aide à la gestion budgétaire** : il calcule un bilan à partir de données
fournies par l'utilisateur (saisie ou relevés PDF qu'il télécharge lui-même) et propose des pistes
générales d'économie. Dans sa forme actuelle, il :

| Activité réglementée | Statut requis | Economiz | Pourquoi |
| --- | --- | --- | --- |
| Conseil en investissements financiers | CIF (ORIAS, AMF) | **Non concerné** | Aucune recommandation sur un instrument financier ; le coach a pour consigne explicite de refuser (actions, fonds, crypto-actifs, assurance vie) |
| Intermédiation en opérations de banque (crédit) | IOBSP (ORIAS, ACPR) | **Non concerné** | Aucune offre de crédit présentée ni recommandée ; seules des informations générales (ex. « renseignez-vous sur une renégociation ») |
| Intermédiation en assurance | IAS (ORIAS) | **Non concerné** | Aucune assurance proposée ; conseil générique de comparer ses contrats, sans fournisseur cité |
| Service d'information sur les comptes (agrégation, DSP2) | Prestataire de services de paiement / AISP (ACPR) | **Non concerné** | Aucune connexion aux banques, aucun identifiant bancaire : l'utilisateur dépose ses propres relevés |
| Initiation de paiement, gestion de fonds | PSP / établissement de paiement | **Non concerné** | Aucun paiement ni virement déclenché ; l'abonnement est encaissé par Stripe |
| Conseil en gestion de patrimoine, conseil juridique ou fiscal | Statuts divers | **Non concerné** | Mentions explicites dans les CGU, le pied de page, le bilan PDF et le coach |

## Garde-fous en place

- Mentions : « outil d'aide à la gestion budgétaire, ne fournit pas de conseil en
  investissement » (pied de page), CGU (ni conseil en investissement, ni juridique ou fiscal, ni
  offre de crédit), bilan PDF, coach (« ne déclenche aucune opération et ne garantit aucun
  résultat »).
- Vocabulaire : « coach budgétaire », jamais « conseiller financier ».
- Coach IA : interdiction de citer une marque, une banque, un assureur ou un produit ; refus du
  conseil en investissement, en crédit et en assurance ; renvoi vers un professionnel habilité ou
  un point conseil budget.
- Recommandations : uniquement des actions de gestion courante (plafonds de dépenses, épargne
  automatique, revue des abonnements et des frais), chiffrées comme des estimations.
- Économies affichées comme « potentielles » ; seules celles confirmées par l'utilisateur sont
  présentées comme réalisées.

## Évolutions qui changeraient l'analyse (avis juridique préalable obligatoire)

- Connexion directe aux comptes bancaires (agrégation) → statut AISP ou recours à un agrégateur
  agréé.
- Comparateur ou mise en relation avec des offres de crédit, de rachat de crédits, d'assurance ou
  d'épargne, liens d'affiliation rémunérés → IOBSP / IAS / CIF selon le cas.
- Recommandations d'investissement personnalisées → CIF.
- Virements ou mise de côté automatique d'argent → services de paiement.
- Public mineur, ou offre à destination des professionnels → réexamen des CGU et du RGPD.
