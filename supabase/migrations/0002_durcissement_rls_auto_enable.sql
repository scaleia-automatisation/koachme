-- ============================================================
-- 0002 — Durcissement : public.rls_auto_enable()
-- Fonction d'event trigger fournie par Supabase (active la RLS sur chaque
-- nouvelle table du schéma public). On la conserve, mais elle n'a pas à être
-- exécutable par les rôles de l'API. Les event triggers continuent de
-- fonctionner : le droit EXECUTE n'est pas vérifié lors de leur déclenchement.
-- ============================================================
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
