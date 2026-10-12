# Variables d'environnement et secrets

Toutes les valeurs se renseignent dans `.env.local` (jamais versionné, modèle : `.env.example`).
Les secrets serveur sont ensuite envoyés à Supabase par `npm run secrets:sync`, qui affiche aussi
ce qui manque (`npm run secrets:sync -- --check` pour un simple contrôle).

**Règle absolue** : seules les variables préfixées `VITE_` atteignent le navigateur, et ce ne sont
que des valeurs publiques. Aucune clé secrète n'est jamais préfixée `VITE_`.

## Navigateur (build du site)

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | oui | Adresse du projet Supabase (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | oui | Clé publique Supabase (`sb_publishable_…`) : n'ouvre aucun droit sans session, la RLS s'applique |

Chez l'hébergeur du site (Vercel…), ces deux variables sont à déclarer dans les variables de build.

## Secrets des Edge Functions

| Secret | Obligatoire | Rôle | Fonctions |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | oui | Lecture des relevés et coach IA | process-statement, coach |
| `OPENAI_MODEL` | non (`gpt-4.1-mini`) | Modèle de lecture des relevés | process-statement, coach |
| `OPENAI_MODEL_STRONG` | non (`gpt-4.1`) | Seconde lecture d'un relevé dont les soldes ne concordent pas | process-statement |
| `OPENAI_MODEL_COACH` | non (`OPENAI_MODEL`) | Modèle du coach | coach |
| `COACH_GLOBAL_DAILY_TOKENS` | non (3 000 000) | Plafond quotidien de jetons du coach, tous utilisateurs confondus (maîtrise des coûts) | coach |
| `SITE_URL` | oui | Adresse publique du site : liens des emails, retours de paiement | toutes |
| `MAINTENANCE_SECRET` | oui | Authentifie les appels planifiés (maintenance, surveillance) | maintenance |
| `STRIPE_SECRET_KEY` | oui | Paiement (`sk_test_…` puis `sk_live_…`) | billing-checkout, billing-portal, stripe-webhook |
| `STRIPE_WEBHOOK_SECRET` | oui | Vérification de la signature des événements Stripe (`whsec_…`) | stripe-webhook |
| `RESEND_API_KEY` | oui | Emails transactionnels (sans clé : emails ignorés, rien ne bloque) | stripe-webhook, maintenance |
| `RESEND_FROM_EMAIL` | oui | Expéditeur, sur un domaine vérifié chez Resend | idem |
| `ALERT_EMAIL` | oui | Destinataire des alertes de surveillance | maintenance |
| `ALERT_ERROR_THRESHOLD` | non (10) | Nombre d'erreurs en 15 minutes déclenchant une alerte | maintenance |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | automatiques | Fournis par Supabase à chaque fonction | toutes |

## Coffre-fort de la base (vault)

Utilisé par les tâches planifiées (pg_cron), rempli par `npm run secrets:sync` :

| Nom | Valeur |
| --- | --- |
| `project_url` | `VITE_SUPABASE_URL` |
| `maintenance_secret` | `MAINTENANCE_SECRET` |

## Scripts de l'équipe (poste local uniquement)

| Variable | Rôle |
| --- | --- |
| `SUPABASE_PROJECT_REF` | Identifiant du projet (migrations, sauvegardes, documentation) |
| `SUPABASE_ACCESS_TOKEN` | Jeton personnel de l'API de gestion Supabase (`sbp_…`) |
| `SUPABASE_SECRET_KEY` | Clé de service (`sb_secret_…`) : sauvegardes, rôles d'équipe, tests |
| `BACKUP_ENCRYPTION_KEY` | Clé AES-256 des sauvegardes (64 caractères hexadécimaux) — à conserver séparément |
| `BACKUP_RETENTION_DAYS` | Durée de conservation des sauvegardes locales (30 par défaut) |
| `E2E_EMAIL`, `E2E_PASSWORD` | Compte de vérification manuelle (`npm run seed:e2e`) |

## Production

Un projet Supabase distinct est recommandé pour la production (les tests créent et suppriment des
comptes et envoient des événements de paiement simulés). Pour la production : `.env.local` dédié
(ou variables du système d'intégration continue), clés Stripe `sk_live_`, `SITE_URL` du domaine
définitif, puis `npm run secrets:sync`.
