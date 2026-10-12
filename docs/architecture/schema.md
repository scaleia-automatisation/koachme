# Schéma de données

Base Postgres (Supabase), migrations versionnées dans `supabase/migrations` (`npm run db:migrate`).
Toutes les tables du schéma `public` ont la RLS activée et refusent tout par défaut ; les droits
d'écriture sont accordés colonne par colonne. Le schéma `app_private` n'est pas exposé par l'API.

## Correspondance avec les entités du cahier des charges

| Entité du cahier des charges | Table(s) | Remarque |
| --- | --- | --- |
| users | `auth.users` (Supabase Auth) | Mots de passe, sessions et second facteur gérés par Supabase Auth. |
| user_profiles | `profiles` | Nom affiché, consentements, préférences, durée de conservation du coach. |
| user_roles | `user_roles` | Rôles d'équipe `support` / `admin` ; un utilisateur sans ligne est un utilisateur standard. |
| subscriptions | `subscriptions` | Écrite uniquement par le webhook Stripe signé. |
| plans | `plans` | Prix, identifiants Stripe et limites, modifiables depuis l'administration. |
| payments | `payments` | Factures Stripe (montant, statut, remboursements, liens de facture). |
| — | `billing_customers` | Lien utilisateur ↔ client Stripe. |
| financial_profiles | `financial_situations` | Situation déclarée (logement, foyer, épargne, dettes…). |
| budget_entries | `budget_entries` | Revenus et charges déclarés (saisie manuelle et compléments hors relevés). |
| categories | `categories`, `category_groups` | Référentiel des catégories et groupes (lecture seule). |
| bank_accounts | `bank_accounts` | Comptes identifiés sur les relevés (4 derniers chiffres seulement). |
| statement_imports | `statement_imports` | Un relevé PDF importé : statut, période, soldes, contrôle de cohérence. |
| transactions | `transactions` | Opérations extraites ; seules la catégorie et les marqueurs sont modifiables par l'utilisateur. |
| categorization_rules | `category_rules` (utilisateur), `category_keyword_rules` (référentiel) | Corrections mémorisées par marchand, mots-clés de classement. |
| recurring_transactions | *calculé* | Détecté à la volée par le moteur déterministe (`src/domain`) ; le verdict de l'utilisateur sur un abonnement est stocké dans `subscription_reviews`. |
| financial_diagnostics | *calculé* + `diagnostic_rules` | Diagnostic recalculé à chaque affichage ; seuils dans `diagnostic_rules`. |
| recommendations | *calculé* + `recommendation_actions` | Recommandations générées par le moteur ; le suivi (à faire, réalisée, économie constatée) est stocké. |
| savings_goals | `savings_goals`, `goal_contributions` | Objectifs et versements confirmés. |
| ai_conversations | `coach_conversations` | Conversations avec le coach, purgées selon `profiles.coach_retention_days`. |
| ai_messages | `coach_messages` | Messages et réponses structurées. |
| monthly_reports | `monthly_reports` | Bilan mensuel figé (instantané JSON versionné). |
| notifications | `notifications` | Notifications dans l'application. |
| support_tickets | `contact_messages` | Demandes de contact et d'assistance (statut, attribution, note interne). |
| audit_logs | `audit_logs` | Journal des opérations sensibles (sans donnée bancaire). |
| — | `app_logs` | Journal technique des services (90 jours). |
| — | `support_access_grants` | Accès temporaire accordé par un utilisateur à l'assistance. |
| — | `faq_items` | FAQ publique éditable. |

Tables internes (`app_private`) : `ai_usage` (consommation IA par jour), `usage_counters`
(quotas mensuels, ex. exports PDF), `rate_limits` (anti-abus), `stripe_events` (idempotence des
webhooks), `schema_migrations`.

## Pourquoi certaines entités sont calculées

Les opérations récurrentes, le diagnostic et les recommandations dépendent de toutes les données
de l'utilisateur et des seuils en vigueur. Les stocker créerait des copies qui se désynchronisent
à chaque correction de catégorie. Le moteur (`src/domain`, partagé avec les Edge Functions par
`scripts/sync-domain.mjs`) les recalcule de façon déterministe ; seules les décisions de
l'utilisateur (verdicts, statuts d'action, économies confirmées) et les bilans mensuels figés sont
enregistrés.

## Droits et offres

- `app_private.plan_of(user)` déduit l'offre **uniquement** de `subscriptions` (statuts `active`,
  `trialing`, `past_due`, ou `canceled` jusqu'à la fin de la période payée). Aucune valeur envoyée
  par le navigateur n'intervient.
- `my_entitlements()` renvoie offre, limites et consommation du mois au client (affichage).
- Les limites sont appliquées côté serveur : déclencheur `enforce_goal_limit` (objectifs),
  Edge Functions `process-statement` (relevés), `coach` (questions), `report-pdf` (exports, via
  `usage_try` atomique).
