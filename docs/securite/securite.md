# Sécurité d'Economiz

## Principes

- **Isolation par utilisateur** : RLS activée sur toutes les tables `public`, refus par défaut,
  politiques `user_id = auth.uid()`. Écritures limitées colonne par colonne (`grant update (…)`) :
  un utilisateur ne peut pas modifier un montant extrait, un statut d'abonnement ou son offre.
- **Fonctions privilégiées** : `SECURITY DEFINER` avec `search_path = ''`, rôle vérifié dans la
  fonction (`app_private.has_role`), exécution refusée aux visiteurs anonymes.
- **Secrets côté serveur uniquement** : clés OpenAI, Stripe, Resend, clé de service Supabase et
  secret de maintenance sont des secrets des Edge Functions. Le navigateur ne reçoit que l'URL et la
  clé publique Supabase (`VITE_*`). `.env.local` n'est jamais versionné.
- **Aucun identifiant bancaire demandé** : l'utilisateur dépose lui-même ses relevés PDF.

## Fichiers des relevés

- Bucket `statements` **privé**, 10 Mo maximum, type `application/pdf` uniquement, chemin préfixé
  par l'identifiant de l'utilisateur (politiques Storage par dossier).
- Téléchargement par **URL signée valable 60 secondes**, générée à la demande.
- Empreinte SHA-256 pour refuser un fichier déjà importé.
- Le fichier d'un import refusé (limite d'offre, document illisible) est supprimé.
- Seuls les 4 derniers chiffres du numéro de compte sont conservés.

## Validation et anti-abus

| Point d'entrée | Contrôle |
| --- | --- |
| Formulaire de contact | Validation, champ piège, 5 messages par heure et par email (déclencheur en base) |
| Coach IA | 2 à 1 000 caractères, 20 questions par 10 minutes, quota mensuel de l'offre |
| Import de relevé | Taille, type, doublon, quota mensuel de l'offre, 5 tentatives d'analyse par fichier |
| Paiement / portail | 10 sessions de paiement et 20 ouvertures de portail par heure |
| Suppression de compte | Confirmation « SUPPRIMER », 5 tentatives par heure |
| Journal de sécurité client | Liste fermée d'événements, 30 par heure |
| Webhook Stripe | Signature HMAC vérifiée (tolérance de 5 minutes), idempotence par identifiant d'événement |
| Maintenance planifiée | Secret partagé comparé en temps constant |

## Journaux

- `app_logs` : erreurs techniques des services. Les messages passent par `scrub()` (IBAN, emails et
  suites de chiffres — numéros de carte, montants — masqués) ; jamais de contenu de relevé ni de message utilisateur.
  Conservation 90 jours.
- `audit_logs` : opérations sensibles (mot de passe, double authentification, sessions, exports,
  accès de l'assistance, rôles d'équipe, paiements, suppression de compte). Visible par
  l'utilisateur pour son compte et par les administrateurs.

## Navigateur et hébergement

- En-têtes de sécurité de production (`vercel.json`) : CSP stricte (scripts du seul domaine,
  connexions limitées au projet Supabase, aucune intégration en cadre), HSTS, `X-Frame-Options:
  DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Les mêmes en-têtes sont appliqués
  à `vite preview` : les tests sur le build vérifient l'absence de violation de la CSP.
- Erreurs du navigateur remontées dans le journal technique (`log_client_error`, en production
  uniquement), messages nettoyés côté serveur, fréquence limitée.

## Surveillance et alertes

Toutes les 15 minutes (pg_cron → `maintenance` en mode surveillance) : nombre d'erreurs, erreurs
du webhook de paiement, imports en échec. Au-delà des seuils, email à `ALERT_EMAIL` (au plus un
par heure) et trace dans le journal technique.

## Rôles et administration

- Rôles `support` et `admin` stockés dans `user_roles`, modifiables uniquement par un
  administrateur (`admin_set_role`, journalisé) ou par le script serveur `npm run admin:grant`.
  Aucun droit ne dépend d'une valeur modifiable dans le navigateur : l'interface lit `my_roles()`
  pour l'affichage, et chaque requête est de toute façon contrôlée par la base.
- Un administrateur ne peut pas retirer son propre rôle d'administrateur.
- **Double authentification fortement recommandée pour l'équipe** : l'espace d'administration
  affiche une alerte tant qu'elle n'est pas activée.

## Accès exceptionnel de l'assistance

1. L'équipe n'a **aucun accès courant** aux relevés, opérations, montants ou conversations.
2. L'utilisateur peut accorder un accès temporaire (24 h à 7 jours maximum, contrainte en base)
   depuis « Profil et paramètres → Accès de l'assistance », avec un motif. Il peut le retirer à
   tout moment.
3. Pendant cet accès, `support_user_overview` renvoie uniquement des métadonnées techniques :
   statut des imports, erreurs, périodes, nombre d'opérations, contrôle des soldes, nombre de
   lignes de budget et d'objectifs.
4. Chaque accord, retrait et consultation est inscrit dans `audit_logs` et visible par
   l'utilisateur dans son activité de sécurité.

## Voir aussi

- [Conservation et suppression des données](conservation-donnees.md)
- [Sauvegarde et restauration](sauvegarde-restauration.md)
- [Gestion des incidents](incidents.md)

## Conseiller de sécurité Supabase : avertissements acceptés

- `authenticated_security_definer_function_executable` (`admin_*`, `support_user_overview`,
  `my_entitlements`, `my_roles`, `log_security_event`) : ces fonctions doivent lire des tables
  protégées (`auth.users`, abonnements) et **vérifient elles-mêmes le rôle** de l'appelant avant
  toute lecture ; elles sont fermées aux visiteurs anonymes et couvertes par `tests/db/admin.test.ts`.
- `rls_enabled_no_policy` sur `billing_customers` : volontaire, table réservée aux Edge Functions.
- `auth_leaked_password_protection` : nécessite l'offre Supabase Pro ; à activer avec
  `SUPABASE_PLAN_PRO=true npm run auth:config` lors du passage en Pro.
