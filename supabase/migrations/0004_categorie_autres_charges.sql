-- ============================================================
-- 0004 — Catégorie « Autres charges régulières » (étape charges fixes)
-- ============================================================
insert into public.categories (code, label, kind, nature, is_debt, icon, sort_order)
values ('autres_charges', 'Autres charges régulières', 'expense', 'fixed', false, 'calendar-clock', 180);
