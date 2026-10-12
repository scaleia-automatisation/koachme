# Avant l'ouverture au public

**État au 12 octobre 2026 : le produit n'est pas prêt à être commercialisé.** L'application est
complète et testée, mais des intégrations essentielles ne sont pas configurées (paiement réel,
emails) et des validations juridiques restent à faire. Chaque point ci-dessous est bloquant sauf
mention contraire.

## 1. Intégrations à configurer

| Élément | Ce qui manque | Comment | Vérification |
| --- | --- | --- | --- |
| Paiement Stripe (test) | Clé `sk_test_…` | `.env.local` → `npm run stripe:setup` → copier le secret du webhook → `npm run secrets:sync` | Paiement test `4242…`, échec `4000 0000 0000 0341`, changement de formule et résiliation depuis le portail ; le scénario D se relance alors avec un vrai passage par Stripe Checkout |
| Paiement Stripe (réel) | Clé `sk_live_…`, compte Stripe activé (identité, IBAN) | Même procédure avec la clé de production | Premier paiement réel puis remboursement |
| Réglages Stripe | Rappel de renouvellement 30 jours, identité et mentions des factures, Stripe Tax selon le régime de TVA, emails de reçu | Tableau de bord Stripe | Facture de test conforme |
| Emails (Resend) | Clé `re_…`, domaine vérifié (SPF, DKIM, DMARC), expéditeur | `.env.local` → `npm run secrets:sync` → `npm run auth:config` | Réception réelle de chaque email de [la liste](emails.md), dont l'inscription |
| Alertes | `ALERT_EMAIL` | `.env.local` → `npm run secrets:sync` | Alerte reçue (provoquer des erreurs en recette) |
| Projet de production | Projet Supabase distinct (offre Pro, Francfort), restauration à un instant précis (PITR) | [Déploiement](deploiement.md) étapes 1 à 4, 8 | `npm run db:migrate -- --status`, `npm run secrets:sync -- --check`, `npm run docs:rls` |
| Protection des mots de passe compromis | Offre Pro | `SUPABASE_PLAN_PRO=true npm run auth:config` | Conseiller de sécurité Supabase sans avertissement |
| Hébergement du site | Compte Vercel (ou autre), nom de domaine | [Déploiement](deploiement.md) étape 7 ; adapter la CSP si l'adresse Supabase change | `npm run e2e:perf` contre le domaine, en-têtes visibles dans le navigateur |
| Sauvegardes | Planification quotidienne de `npm run backup` vers un stockage externe chiffré ; clé conservée séparément | Tâche planifiée du poste ou de l'intégration continue | `npm run restore:test` mensuel, date consignée |
| Comptes d'équipe | Premier administrateur, double authentification | `npm run admin:grant` | Alerte « double authentification » absente de l'administration |

## 2. Informations et validations juridiques

| Élément | Où | Statut |
| --- | --- | --- |
| Identité de l'éditeur (raison sociale, forme, capital, SIREN, TVA, adresse, directeur de publication, contacts, hébergeur du site) | `src/config/legal.ts` (champs `[à compléter]`, affichés en clair sur les pages légales) | À fournir |
| Médiateur de la consommation | `src/config/legal.ts` | Adhésion à faire |
| Relecture des CGU, CGV (abonnement, rétractation), politique de confidentialité, cookies | `src/features/public/legal-pages.tsx` | Juriste |
| Validation des tarifs (5,99 €/mois, 59,90 €/an) et des limites des offres | Administration → Offres et limites | Décision commerciale |
| Régime de TVA et mentions de facturation | [facturation et TVA](conformite/facturation-tva.md) | Expert-comptable |
| Registre des traitements | [registre](conformite/registre-traitements.md) | À compléter et valider |
| Analyse d'impact (AIPD) — **requise** | [pré-analyse](conformite/aipd.md) | À réaliser et signer |
| Contrats des sous-traitants (DPA) et option « zero data retention » OpenAI | [sous-traitants](conformite/sous-traitants.md) | À signer / archiver |
| Positionnement réglementaire (pas de CIF / IOBSP / IAS / AISP) | [cadre réglementaire](conformite/reglementaire.md) | Avocat spécialisé |
| Procédure de violation de données : responsables et contacts | [incidents](securite/incidents.md) | Noms à compléter |
| Relecture des textes du diagnostic par un professionnel de l'accompagnement budgétaire | Moteur de recommandations | Recommandé |

## 3. Vérifications de recette (sur l'environnement de production)

- [ ] Inscription avec une vraie adresse : réception de l'email de confirmation, lien fonctionnel
- [ ] Mot de passe oublié : email reçu, réinitialisation
- [ ] Import d'un vrai relevé de chacune des principales banques françaises (au moins 5) ; contrôle
      des soldes « ok » ; corrections et validation
- [ ] Paiement réel, facture conforme, résiliation en 3 clics, email de confirmation
- [ ] Export des données et suppression du compte
- [ ] Tableau d'administration : indicateurs cohérents, demande d'assistance traitée
- [ ] Alertes reçues, journal technique sans erreur inattendue
- [ ] Sauvegarde et restauration de la production testées

## 4. Points non bloquants à suivre

- Vérifier l'accessibilité avec un lecteur d'écran réel (NVDA / VoiceOver) en complément des
  contrôles automatiques axe-core.
- Surveiller les coûts OpenAI (Administration → Usage de l'IA) et ajuster les quotas.
- Lancer les tests de bout en bout sur un projet de recette distinct : ils créent des comptes et
  simulent des événements de paiement (dont des erreurs volontaires qui déclenchent la
  surveillance).
- Un test interrompu peut laisser des comptes `economiz-test-…@example.com` / `economiz-e2e-…` :
  les supprimer avec `npm run user:delete`.
