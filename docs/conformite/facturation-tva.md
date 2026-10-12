# Facturation, TVA, vente en ligne et résiliation

> Points à valider avec un expert-comptable et un juriste selon la structure de l'entreprise.

## Ce qui est en place dans l'application

| Obligation | Mise en œuvre |
| --- | --- |
| Prix affichés TTC | Pages Tarifs, Abonnement, CGV : montants issus de la table `plans` ; prix Stripe créés en `tax_behavior: inclusive` par `npm run stripe:setup` |
| Information précontractuelle (L221-5 C. conso.) | Page « Abonnement et résiliation », CGU, mention du droit de rétractation à côté du bouton de souscription |
| Droit de rétractation de 14 jours (L221-18) | Exercice par le formulaire de contact (sujet « Mon abonnement ») ; remboursement depuis Stripe |
| Exécution immédiate pendant le délai (L221-25) | **Case obligatoire** avant la souscription (demande expresse et reconnaissance de la retenue au prorata) ; vérifiée par le serveur ; horodatage conservé dans la session de paiement Stripe et le journal d'audit |
| Résiliation en ligne simple (L215-1-1, « résiliation en 3 clics ») | Bouton « Résilier mon abonnement » dans « Mon abonnement », qui ouvre directement l'écran de résiliation ; confirmation affichée, notification et email |
| Information avant reconduction tacite (L215-1, loi Chatel) | Abonnement annuel : rappel (notification + email) à réception de l'événement Stripe `invoice.upcoming` ; régler Stripe pour l'envoyer **30 jours** avant l'échéance |
| Confirmation sur support durable | Emails d'activation, de changement de formule et de résiliation ; factures Stripe |
| Paiement sécurisé | Stripe Checkout (3-D Secure / DSP2) ; aucune donnée de carte chez Economiz |
| Échec de paiement | Accès maintenu pendant les relances Stripe, notification et email, statut « Paiement en attente » |

## À configurer / décider avant la vente

1. **Régime de TVA** de l'entreprise :
   - franchise en base (micro-entreprise sous les seuils) : mention « TVA non applicable,
     art. 293 B du CGI » sur les factures, prix TTC = HT ;
   - sinon TVA à 20 % pour les clients français ; pour les particuliers d'autres pays de l'UE,
     TVA du pays du client au-delà de 10 000 € de ventes intra-UE par an, déclarée via le guichet
     unique **OSS**. **Stripe Tax** peut calculer et collecter la TVA (activer, immatriculer la
     France, renseigner le numéro OSS).
2. **Mentions obligatoires des factures** (Stripe → Paramètres → Factures) : raison sociale,
   adresse, SIREN/SIRET, forme juridique, numéro de TVA intracommunautaire, numérotation
   continue, date, désignation, prix HT, taux et montant de TVA, TTC.
3. **Médiateur de la consommation** : adhésion obligatoire, coordonnées à indiquer dans
   `src/config/legal.ts` (affichées dans les CGU et mentions légales).
4. **CGU / CGV** : relecture juridique des textes (`src/features/public/legal-pages.tsx`),
   notamment les clauses de responsabilité et de rétractation.
5. **Conservation comptable** : 10 ans (pièces justificatives) — assurée par Stripe ; exporter
   régulièrement les factures vers la comptabilité.
6. Facture électronique : suivre le calendrier de la réforme française (réception obligatoire en
   2026, émission selon la taille de l'entreprise) — concerne surtout les ventes B2B.
