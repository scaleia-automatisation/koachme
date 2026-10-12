# Règles de sécurité de la base (RLS)

Document généré par `npm run docs:rls` le 2026-10-12 à partir de la base réelle — ne pas modifier à la main.

Principes : RLS activée sur toutes les tables, refus par défaut ; l’utilisateur ne voit que ses lignes (`user_id = auth.uid()`) ;
les rôles d’équipe sont vérifiés par `app_private.has_role` ; les écritures sensibles (opérations extraites, abonnements, paiements,
journaux) passent par les Edge Functions avec la clé de service, jamais par le navigateur.

## Tables

| Table | RLS | Droits visiteur | Droits connecté | Colonnes modifiables (connecté) |
| --- | --- | --- | --- | --- |
| `app_logs` | ✓ | — | SELECT | — |
| `audit_logs` | ✓ | — | SELECT | — |
| `bank_accounts` | ✓ | — | DELETE, SELECT | UPDATE (label) |
| `billing_customers` | ✓ | — | — | — |
| `budget_entries` | ✓ | — | DELETE, INSERT, SELECT, UPDATE | — |
| `categories` | ✓ | SELECT | SELECT | — |
| `category_groups` | ✓ | SELECT | SELECT | — |
| `category_keyword_rules` | ✓ | SELECT | SELECT | — |
| `category_rules` | ✓ | — | DELETE, INSERT, SELECT, UPDATE | — |
| `coach_conversations` | ✓ | — | DELETE, SELECT | — |
| `coach_messages` | ✓ | — | SELECT | — |
| `contact_messages` | ✓ | — | SELECT | INSERT (email, message, name, topic) ; UPDATE (assigned_to, internal_note, resolved_at, status) |
| `diagnostic_rules` | ✓ | SELECT | SELECT | — |
| `faq_items` | ✓ | SELECT | DELETE, INSERT, SELECT, UPDATE | — |
| `financial_situations` | ✓ | — | DELETE, INSERT, SELECT, UPDATE | — |
| `goal_contributions` | ✓ | — | DELETE, INSERT, SELECT | — |
| `monthly_reports` | ✓ | — | DELETE, INSERT, SELECT, UPDATE | — |
| `notifications` | ✓ | — | DELETE, SELECT | UPDATE (read_at) |
| `payments` | ✓ | — | SELECT | — |
| `plans` | ✓ | SELECT | SELECT | UPDATE (features, highlighted, is_active, limits, monthly_price_cents, name, sort_order, stripe_price_monthly, stripe_price_yearly, tagline, yearly_price_cents) |
| `profiles` | ✓ | — | SELECT | UPDATE (coach_retention_days, currency, display_name, locale, notify_email, notify_monthly_reminder, onboarding_completed_at, onboarding_path, terms_accepted_at, terms_version) |
| `recommendation_actions` | ✓ | — | DELETE, INSERT, SELECT, UPDATE | — |
| `savings_goals` | ✓ | — | DELETE, INSERT, SELECT, UPDATE | — |
| `statement_imports` | ✓ | — | DELETE, SELECT | INSERT (file_name, file_path, file_sha256, file_size) ; UPDATE (account_label, confirmed_at, status) |
| `subscription_reviews` | ✓ | — | DELETE, INSERT, SELECT, UPDATE | — |
| `subscriptions` | ✓ | — | SELECT | — |
| `support_access_grants` | ✓ | — | INSERT, SELECT | UPDATE (revoked_at) |
| `transactions` | ✓ | — | SELECT | UPDATE (review_status, user_amount_cents, user_category_code, user_exceptional, user_excluded, user_label, user_op_date) |
| `user_roles` | ✓ | — | SELECT | — |

## Politiques


### `public.app_logs`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| app_logs_staff_select | SELECT | connecté | `( SELECT app_private.has_role('support'::staff_role) AS has_role)` | `—` |

### `public.audit_logs`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| audit_logs_select | SELECT | connecté | `((actor_id = ( SELECT auth.uid() AS uid)) OR (target_user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_role('admin'::staff_role) AS has_role))` | `—` |

### `public.bank_accounts`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| bank_accounts_delete_own | DELETE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| bank_accounts_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| bank_accounts_update_own | UPDATE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.budget_entries`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| budget_entries_all_own | ALL | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.categories`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| categories_lecture_publique | SELECT | visiteur, connecté | `true` | `—` |

### `public.category_groups`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| category_groups_lecture_publique | SELECT | visiteur, connecté | `true` | `—` |

### `public.category_keyword_rules`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| keyword_rules_lecture_publique | SELECT | visiteur, connecté | `is_active` | `—` |

### `public.category_rules`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| category_rules_all_own | ALL | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.coach_conversations`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| coach_conversations_delete_own | DELETE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| coach_conversations_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |

### `public.coach_messages`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| coach_messages_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |

### `public.contact_messages`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| contact_insert | INSERT | visiteur, connecté | `—` | `((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))` |
| contact_staff_select | SELECT | connecté | `( SELECT app_private.has_role('support'::staff_role) AS has_role)` | `—` |
| contact_staff_update | UPDATE | connecté | `( SELECT app_private.has_role('support'::staff_role) AS has_role)` | `( SELECT app_private.has_role('support'::staff_role) AS has_role)` |

### `public.diagnostic_rules`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| diagnostic_rules_lecture_publique | SELECT | visiteur, connecté | `true` | `—` |

### `public.faq_items`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| faq_admin_delete | DELETE | connecté | `( SELECT app_private.has_role('admin'::staff_role) AS has_role)` | `—` |
| faq_admin_insert | INSERT | connecté | `—` | `( SELECT app_private.has_role('admin'::staff_role) AS has_role)` |
| faq_public_select | SELECT | visiteur, connecté | `(is_published OR ( SELECT app_private.has_role('admin'::staff_role) AS has_role))` | `—` |
| faq_admin_update | UPDATE | connecté | `( SELECT app_private.has_role('admin'::staff_role) AS has_role)` | `( SELECT app_private.has_role('admin'::staff_role) AS has_role)` |

### `public.financial_situations`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| situations_all_own | ALL | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.goal_contributions`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| goal_contributions_delete_own | DELETE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| goal_contributions_insert_own | INSERT | connecté | `—` | `((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM savings_goals g WHERE ((g.id = goal_contributions.goal_id) AND (g.user_id = ( SELECT auth.uid() AS uid))))) AND ((transaction_id IS NULL) OR (EXISTS ( SELECT 1 FROM transactions t WHERE ((t.id = goal_contributions.transaction_id) AND (t.user_id = ( SELECT auth.uid() AS uid)))))))` |
| goal_contributions_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |

### `public.monthly_reports`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| monthly_reports_all_own | ALL | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.notifications`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| notifications_delete_own | DELETE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| notifications_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| notifications_update_own | UPDATE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `storage.objects`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| statements_delete_own | DELETE | connecté | `((bucket_id = 'statements'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))` | `—` |
| statements_insert_own | INSERT | connecté | `—` | `((bucket_id = 'statements'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))` |
| statements_select_own | SELECT | connecté | `((bucket_id = 'statements'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))` | `—` |

### `public.payments`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| payments_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |

### `public.plans`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| plans_lecture | SELECT | connecté | `(is_active OR ( SELECT app_private.has_role('admin'::staff_role) AS has_role))` | `—` |
| plans_lecture_anon | SELECT | visiteur | `is_active` | `—` |
| plans_admin_update | UPDATE | connecté | `( SELECT app_private.has_role('admin'::staff_role) AS has_role)` | `( SELECT app_private.has_role('admin'::staff_role) AS has_role)` |

### `public.profiles`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| profiles_select_own | SELECT | connecté | `(id = ( SELECT auth.uid() AS uid))` | `—` |
| profiles_update_own | UPDATE | connecté | `(id = ( SELECT auth.uid() AS uid))` | `(id = ( SELECT auth.uid() AS uid))` |

### `public.recommendation_actions`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| recommendation_actions_all_own | ALL | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.savings_goals`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| savings_goals_all_own | ALL | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.statement_imports`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| imports_delete_own | DELETE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| imports_insert_own | INSERT | connecté | `—` | `((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'uploaded'::import_status))` |
| imports_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| imports_update_own | UPDATE | connecté | `((user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['needs_review'::import_status, 'confirmed'::import_status])))` | `((user_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['needs_review'::import_status, 'confirmed'::import_status])))` |

### `public.subscription_reviews`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| subscription_reviews_all_own | ALL | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.subscriptions`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| subscriptions_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |

### `public.support_access_grants`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| grants_insert_own | INSERT | connecté | `—` | `((user_id = ( SELECT auth.uid() AS uid)) AND (expires_at > now()))` |
| grants_select | SELECT | connecté | `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_role('support'::staff_role) AS has_role))` | `—` |
| grants_revoke_own | UPDATE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.transactions`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| transactions_select_own | SELECT | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `—` |
| transactions_update_own | UPDATE | connecté | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `public.user_roles`

| Politique | Action | Rôles | Condition (USING) | Contrôle (WITH CHECK) |
| --- | --- | --- | --- | --- |
| user_roles_select | SELECT | connecté | `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.has_role('admin'::staff_role) AS has_role))` | `—` |

## Stockage

| Bucket | Public | Taille max | Types autorisés |
| --- | --- | --- | --- |
| `statements` | non (privé) | 10 Mo | {application/pdf} |

## Fonctions SQL exposées par l’API

| Fonction | Privilèges du propriétaire | Visiteur | Connecté |
| --- | --- | --- | --- |
| `admin_ai_usage` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `admin_failed_imports` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `admin_find_user` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `admin_overview` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `admin_set_role` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `admin_signups_series` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `admin_staff` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `log_client_error` | oui (contrôles internes : rôle, fréquence) | ✓ | ✓ |
| `log_security_event` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `my_entitlements` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `my_roles` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
| `support_user_overview` | oui (contrôles internes : rôle, fréquence) | — | ✓ |
