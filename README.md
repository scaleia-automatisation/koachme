# Economiz

> Votre argent, en clair.

Application SaaS de gestion financière personnelle : bilan budgétaire, dépenses réductibles, objectifs d'épargne et coach IA.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · composants style shadcn/ui · React Query · Supabase (Postgres, Auth, Storage, Edge Functions) · Vitest.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis compléter les valeurs
npm run dev                  # http://localhost:5180
```

**Documentation complète (déploiement, administration, sécurité, conformité, éléments restant à valider) : [docs/README.md](docs/README.md).**

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement (port 5180) |
| `npm run check` | Typecheck + lint + tous les tests + build : à lancer avant de valider un bloc |
| `npm test` | Tests unitaires, composants, fonctions et intégration Supabase |
| `npm run db:migrate` | Applique les migrations en attente (`-- --status` pour l'état) |
| `npm run db:query` | Requête SQL ponctuelle lue sur l'entrée standard (inspection) |
| `npm run auth:config` | Applique la configuration Supabase Auth versionnée (`-- --check` pour comparer) |
| `npm run functions:deploy` | Déploie les Edge Functions |
| `npm run seed:e2e` | Crée / réinitialise le compte de test (identifiants dans `.env.local`) |
| `npm run fixtures` | Régénère les relevés PDF fictifs de test |
| `npm run backup` | Sauvegarde chiffrée (tables, comptes, fichiers des relevés) dans `backups/` |
| `npm run restore:test` | Teste la restauration de la dernière sauvegarde dans un schéma temporaire |
| `npm run admin:grant -- email admin|support [--revoke]` | Attribue ou retire un rôle d'équipe (amorçage du premier administrateur) |
| `npm run user:delete -- email --confirm` | Suppression d'un compte par l'équipe (fichiers compris) |
| `npm run e2e` | Scénarios de bout en bout A à E et contrôle qualité (Playwright, Chrome installé) |
| `npm run e2e:perf` | Performances et CSP sur le build de production |
| `npm run secrets:sync` | Envoie les secrets serveur à Supabase (`-- --check` pour l'état) |
| `npm run stripe:setup` | Crée produit, prix, webhook et portail Stripe (clé requise) |
| `npm run docs:rls` | Régénère la documentation des règles RLS depuis la base |

## Architecture

```
src/
  app/              routeur, providers (React Query, session)
  domain/           règles métier pures et testées : catégories, statuts, seuils,
                    montants (centimes), fréquences, moteur budgétaire,
                    analyse des relevés, fusion des sources, fiabilité
  components/       ui/ (primitives), feedback/ (états), layout/ (public, espace)
  features/
    public/         pages publiques et légales
    auth/           inscription, connexion, MFA, mot de passe
    app/            bienvenue, saisie guidée, relevés, vérification, bilan, compte,
                    abonnement, encarts Premium (premium.tsx)
    admin/          espace d'administration (/admin) : indicateurs, assistance,
                    erreurs, IA, offres et limites, FAQ, sécurité, équipe
    finance/        accès aux données (api.ts), offres et droits (billing.ts),
                    analyse unique (use-analysis.ts)
  config/           informations légales, FAQ et offres par défaut (secours d'affichage)
  lib/              client Supabase, session, utilitaires
supabase/
  migrations/       schéma versionné (RLS deny-by-default)
  functions/        process-statement, coach, report-pdf, delete-account,
                    billing-checkout, billing-portal, stripe-webhook, maintenance
docs/               schéma (architecture/) et sécurité (securite/)
tests/              intégration Supabase (RLS, import réel, suppression), fonctions
```

## Règles

- **Calculs** : uniquement dans `src/domain`, en centimes entiers. L'IA ne fait que suggérer une catégorie ; la décision suit un ordre déterministe (correction utilisateur > historique > virement détecté entre comptes > mots-clés > IA > « à vérifier »).
- **Référentiels en base** : catégories (`categories`, `category_groups`), règles de catégorisation (`category_keyword_rules`) et seuils du diagnostic (`diagnostic_rules`) sont lus au démarrage de l'espace connecté : on peut les modifier en base sans redéployer. `src/domain` contient le référentiel par défaut (repli et amorçage).
- **Règles financières** : un crédit n'est pas forcément un revenu, un débit pas forcément une dépense ; virements internes jamais comptés ; remboursements déduits des dépenses ; opérations en attente et « à vérifier » isolées ; revenus et dépenses exceptionnels hors moyennes ; économies toujours présentées comme potentielles ; solde affiché après engagements connus.
- **Diagnostic** : `diagnose()` (src/domain/diagnosis.ts) — chaque constat a un niveau, une explication, un indicateur et une action. Rouge uniquement pour : budget négatif, charges essentielles non couvertes, retard déclaré, risque de découvert.
- **Imports** : un relevé en écart de solde n'est compté qu'après validation explicite ; un scan n'est lu par OCR qu'avec l'accord de l'utilisateur ; un fichier déjà importé est reconnu par son empreinte SHA-256 ; téléchargement par lien signé de 60 s.
- **Un seul moteur, côté client et serveur** : `computeAnalysis` (src/domain/analysis.ts) est copié dans `supabase/functions/_shared/domain` par `scripts/sync-domain.mjs` (automatique au déploiement, vérifié par un test). Le coach IA calcule donc exactement les mêmes chiffres que l'interface.
- **Coach IA** (`supabase/functions/coach`) : contexte agrégé et minimisé, réponse structurée (faits / estimations / suggestions / actions / liens internes autorisés), quota mensuel lu dans la table `plans` (0 = coach non inclus), plafond global de jetons, délai de 30 s, réponse de secours déterministe. Modèle configurable (`OPENAI_MODEL_COACH`).
- **Recommandations** : trois priorités au maximum (urgence > dépense récurrente évitable > amélioration). Une économie n'est « confirmée » que si l'utilisateur marque l'action réalisée ET saisit le montant constaté.
- **Suivi mensuel** : un instantané du bilan (`monthly_reports`) est enregistré chaque mois ; « Ma progression » compare les mois et chaque bilan est imprimable / exportable en PDF (`src/config/features.ts`).
- **Deux parcours, un moteur** : relevés importés et montants déclarés passent par `useAnalysis`. Les relevés font foi pour les catégories qu'ils couvrent ; les revenus « absents des relevés » s'ajoutent toujours (pas de double comptage).
- **Sécurité** : RLS sur toutes les tables, accès limité au propriétaire, écritures sensibles réservées aux Edge Functions. Les relevés sont masqués (identité, IBAN, numéros, coordonnées) avant tout envoi au LLM. Seules les variables `VITE_*` publiques atteignent le navigateur.
- **Offres et droits** : prix et limites dans la table `plans`, modifiables dans « Administration → Offres et limites ». L'offre d'un compte se déduit uniquement des abonnements écrits par le webhook Stripe signé ; l'interface ne fait qu'afficher `my_entitlements()`, les limites sont appliquées par la base et les Edge Functions. Détail : [docs/architecture/schema.md](docs/architecture/schema.md).
- **Administration** : rôles `support` / `admin` vérifiés côté base ; aucun accès courant aux relevés ; accès d'assistance accordé par l'utilisateur, limité à 7 jours et journalisé. Voir [docs/securite/securite.md](docs/securite/securite.md).
- **Migrations** : jamais modifiées une fois appliquées (contrôle par checksum).
- **Page `/design`** : référence des composants, disponible uniquement en développement.

## Avant la mise en ligne

- Renseigner les informations de l'éditeur dans `src/config/legal.ts` (champs `[à compléter]`).
- Configurer un SMTP dédié (Resend) dans Supabase, puis `npm run auth:config` pour activer les emails en français.
- Définir `SITE_URL` (domaine de production) dans `.env.local` et relancer `npm run auth:config`.
- Stripe : créer le produit Premium et ses deux prix (mensuel, annuel), renseigner les identifiants `price_…` dans « Administration → Offres et limites », définir les secrets `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` des Edge Functions, déclarer le webhook `…/functions/v1/stripe-webhook` (événements `checkout.session.completed`, `customer.subscription.*`, `invoice.*`, `charge.refunded`) et activer le portail client.
- Resend : secrets `RESEND_API_KEY` et `RESEND_FROM_EMAIL` des Edge Functions pour les emails de paiement, de rappel et d'inactivité.
- Activer la double authentification sur tous les comptes d'équipe ; activer la restauration à un instant précis (PITR) Supabase.
- Planifier `npm run backup` chaque jour vers un stockage externe, et `npm run restore:test` chaque mois ([procédure](docs/securite/sauvegarde-restauration.md)).
