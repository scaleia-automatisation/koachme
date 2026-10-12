-- ============================================================
-- 0005 — Index des clés étrangères (recommandation de l'audit Supabase)
-- ============================================================
create index budget_entries_category_idx on public.budget_entries (category_code);
create index category_rules_category_idx on public.category_rules (category_code);
create index contact_messages_user_idx on public.contact_messages (user_id) where user_id is not null;
create index transactions_ai_category_idx on public.transactions (ai_category_code) where ai_category_code is not null;
create index transactions_user_category_idx on public.transactions (user_category_code) where user_category_code is not null;
