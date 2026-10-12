-- ============================================================
-- 0013 — admin_find_user journalise la recherche : la fonction ne peut pas
-- être déclarée STABLE (lecture seule).
-- ============================================================
alter function public.admin_find_user(text) volatile;
