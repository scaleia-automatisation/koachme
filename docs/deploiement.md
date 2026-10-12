# Déploiement

Economiz se compose de :

- un **site statique** (React, construit par Vite dans `dist/`), hébergeable sur Vercel, Netlify,
  Cloudflare Pages… — la configuration fournie vise **Vercel** (`vercel.json`) ;
- un **projet Supabase** (Postgres, Auth, Storage, Edge Functions, tâches planifiées) ;
- des services externes : **OpenAI** (lecture des relevés, coach), **Stripe** (paiement),
  **Resend** (emails).

Prérequis sur le poste de l'équipe : Node.js 24, npm, Google Chrome (tests de bout en bout).
Aucune installation de la CLI Supabase n'est nécessaire (elle est appelée par `npx`).

## 1. Projet Supabase

Créer un projet (région **eu-central-1, Francfort**, pour héberger les données dans l'UE), offre
**Pro** recommandée pour la production (sauvegardes quotidiennes, protection des mots de passe
compromis, pas de mise en veille). Récupérer :

- l'identifiant du projet et l'URL (`https://<ref>.supabase.co`) ;
- la clé publique (`sb_publishable_…`) et la clé secrète (`sb_secret_…`) — Paramètres → API ;
- un jeton d'accès personnel (`sbp_…`) — Compte → Access Tokens.

Les renseigner dans `.env.local` (modèle : `.env.example`, détail : [variables](variables-environnement.md)).

## 2. Base de données

```bash
npm run db:migrate
```

Applique les migrations de `supabase/migrations` dans l'ordre (contrôle d'intégrité par
empreinte : une migration déjà appliquée ne peut pas être modifiée). Elles créent le schéma, les
règles RLS, le stockage privé des relevés, les offres, la FAQ initiale et les tâches planifiées
(pg_cron : maintenance quotidienne à 3 h UTC, surveillance toutes les 15 minutes, purge des
messages d'assistance).

`npm run db:migrate -- --status` affiche l'état sans rien appliquer.

## 3. Authentification

```bash
npm run auth:config
```

Applique la configuration versionnée : URL du site, mots de passe (8 caractères, lettres et
chiffres), double authentification TOTP, confirmation de l'email. Si `RESEND_API_KEY` et
`RESEND_FROM_EMAIL` sont renseignées, configure aussi le SMTP Resend et les modèles d'email en
français (confirmation, réinitialisation, changement d'adresse, réauthentification). Avec
`SUPABASE_PLAN_PRO=true` : refus des mots de passe compromis (HaveIBeenPwned).

`npm run auth:config -- --check` compare sans modifier.

## 4. Secrets et fonctions serveur

```bash
npm run secrets:sync
npm run functions:deploy
```

`secrets:sync` envoie les secrets renseignés dans `.env.local` aux Edge Functions et remplit le
coffre-fort de la base (adresse du projet, secret de maintenance) ; il liste ce qui manque.
`functions:deploy` synchronise le moteur de calcul partagé (`src/domain` → fonctions) puis déploie
les 8 fonctions : `process-statement`, `coach`, `report-pdf`, `delete-account`,
`billing-checkout`, `billing-portal`, `stripe-webhook`, `maintenance`.

## 5. Stripe

1. Renseigner `STRIPE_SECRET_KEY` (`sk_test_…` d'abord) dans `.env.local`.
2. `npm run stripe:setup` : crée le produit Premium, les prix mensuel et annuel (montants de la
   table `plans`), enregistre leurs identifiants dans `plans`, crée le webhook vers
   `…/functions/v1/stripe-webhook` avec les événements nécessaires et configure le portail client
   (moyen de paiement, factures, changement de formule, résiliation en fin de période).
3. Copier le secret du webhook affiché dans `STRIPE_WEBHOOK_SECRET`, puis `npm run secrets:sync`.
4. Dans le tableau de bord Stripe : rappels de renouvellement **30 jours** avant l'échéance
   (Facturation → Abonnements et emails), identité de l'entreprise et mentions des factures,
   Stripe Tax si assujetti à la TVA (voir [facturation et TVA](conformite/facturation-tva.md)).
5. Tester un paiement avec la carte `4242 4242 4242 4242` (mode test), un échec avec
   `4000 0000 0000 0341`, puis une résiliation depuis « Mon abonnement ».

Pour la production : refaire les étapes 1 à 4 avec la clé `sk_live_`.

## 6. Emails (Resend)

Créer un compte Resend, vérifier le domaine d'envoi (enregistrements SPF, DKIM et DMARC chez le
registraire), créer une clé d'API, renseigner `RESEND_API_KEY` et `RESEND_FROM_EMAIL`
(`Economiz <bonjour@votre-domaine.fr>`), puis `npm run secrets:sync` et `npm run auth:config`.
Liste des emails : [emails transactionnels](emails.md).

## 7. Site (Vercel)

1. Importer le dépôt dans Vercel (framework : Vite ; build : `npm run build` ; sortie : `dist`).
2. Variables de build : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Domaine personnalisé, puis `SITE_URL=https://votre-domaine.fr` dans `.env.local`,
   `npm run auth:config`, `npm run secrets:sync`.
4. `vercel.json` fournit la réécriture des routes vers `index.html` et les en-têtes de sécurité
   (CSP stricte, HSTS, anti-clickjacking, Referrer-Policy, Permissions-Policy). Si l'adresse du
   projet Supabase change, mettre à jour la directive `connect-src` de la CSP.

Autre hébergeur : reproduire la réécriture (toute route → `/index.html`, sauf `/assets/*`) et les
en-têtes de `vercel.json`.

## 8. Premier administrateur

Créer son compte depuis le site, puis :

```bash
npm run admin:grant -- vous@votre-domaine.fr admin
```

Les autres membres sont ensuite gérés depuis « Administration → Équipe ». Activer la double
authentification sur chaque compte d'équipe.

## 9. Vérifications après déploiement

```bash
npm run check              # types, lint, tests unitaires et d'intégration, build
npm run e2e                # scénarios de bout en bout (contre le serveur local et le projet Supabase)
npm run e2e:perf           # performances et CSP sur le build de production
npm run docs:rls           # régénère docs/architecture/rls.md depuis la base
npm run backup && npm run restore:test
```

Puis, sur le site déployé : inscription réelle (réception de l'email), import d'un relevé,
paiement en mode test, résiliation, export et suppression du compte.

## Mises à jour

1. `npm run check` et `npm run e2e` en local.
2. Nouvelles migrations : `npm run db:migrate` (avant le déploiement du site si le code en dépend).
3. Fonctions modifiées : `npm run functions:deploy`.
4. Site : déploiement automatique par Vercel à chaque push sur la branche principale.
5. Sauvegarde préalable recommandée : `npm run backup`.
