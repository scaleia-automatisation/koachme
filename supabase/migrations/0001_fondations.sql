-- ============================================================
-- 0001 — Fondations Economiz
-- Types métier, fonctions utilitaires, référentiel des catégories.
-- Principe : RLS activée partout, aucun accès par défaut (deny-by-default).
-- ============================================================

-- ---------- Types métier (miroir de src/domain) ----------
create type public.category_kind as enum ('income', 'expense', 'savings');
create type public.expense_nature as enum ('fixed', 'variable', 'reducible');
create type public.budget_frequency as enum ('weekly', 'monthly', 'quarterly', 'yearly');
create type public.financial_status as enum ('favorable', 'vigilance', 'prioritaire');

-- ---------- Fonctions utilitaires (schéma privé, non exposé par l'API) ----------
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Référentiel des catégories ----------
create table public.categories (
  code        text primary key check (code ~ '^[a-z][a-z_]*$'),
  label       text not null check (length(label) between 1 and 80),
  kind        public.category_kind not null,
  nature      public.expense_nature,
  is_debt     boolean not null default false,
  icon        text not null,
  sort_order  integer not null,
  created_at  timestamptz not null default now(),
  constraint categories_nature_only_for_expenses
    check ((kind = 'expense') = (nature is not null)),
  constraint categories_debt_only_for_expenses
    check (not is_debt or kind = 'expense')
);

comment on table public.categories is
  'Référentiel des catégories financières. Source : src/domain/categories.ts. Lecture seule pour les clients.';

alter table public.categories enable row level security;

-- Lecture publique (données de référence non sensibles), aucune écriture côté client.
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;

create policy "categories_lecture_publique"
  on public.categories for select
  to anon, authenticated
  using (true);

insert into public.categories (code, label, kind, nature, is_debt, icon, sort_order) values
  ('salaire', 'Salaires', 'income', null, false, 'briefcase', 10),
  ('revenus_independants', 'Revenus d’activité indépendante', 'income', null, false, 'store', 20),
  ('aides_allocations', 'Aides et allocations', 'income', null, false, 'hand-heart', 30),
  ('pensions_retraites', 'Pensions et retraites', 'income', null, false, 'landmark', 40),
  ('revenus_locatifs', 'Revenus locatifs', 'income', null, false, 'key-round', 50),
  ('autres_revenus', 'Autres revenus', 'income', null, false, 'plus-circle', 90),
  ('logement', 'Logement (loyer, charges)', 'expense', 'fixed', false, 'home', 110),
  ('credit_immobilier', 'Crédit immobilier', 'expense', 'fixed', true, 'building', 115),
  ('energie_eau', 'Énergie et eau', 'expense', 'fixed', false, 'zap', 120),
  ('assurances', 'Assurances', 'expense', 'fixed', false, 'shield', 130),
  ('telecom', 'Téléphone et internet', 'expense', 'fixed', false, 'smartphone', 140),
  ('scolarite_garde', 'Scolarité et garde d’enfants', 'expense', 'fixed', false, 'graduation-cap', 150),
  ('impots_taxes', 'Impôts et taxes', 'expense', 'fixed', false, 'receipt', 160),
  ('credits_consommation', 'Crédits à la consommation', 'expense', 'fixed', true, 'credit-card', 170),
  ('alimentation', 'Courses alimentaires', 'expense', 'variable', false, 'shopping-basket', 210),
  ('transport', 'Transport et carburant', 'expense', 'variable', false, 'car', 220),
  ('sante', 'Santé', 'expense', 'variable', false, 'heart-pulse', 230),
  ('enfants', 'Enfants', 'expense', 'variable', false, 'baby', 240),
  ('cadeaux_dons', 'Cadeaux et dons', 'expense', 'variable', false, 'gift', 250),
  ('autres_depenses', 'Autres dépenses', 'expense', 'variable', false, 'circle-ellipsis', 290),
  ('abonnements', 'Abonnements et services', 'expense', 'reducible', false, 'repeat', 310),
  ('restaurants_livraisons', 'Restaurants et livraisons', 'expense', 'reducible', false, 'utensils', 320),
  ('loisirs_sorties', 'Loisirs et sorties', 'expense', 'reducible', false, 'ticket', 330),
  ('shopping', 'Shopping et habillement', 'expense', 'reducible', false, 'shopping-bag', 340),
  ('frais_bancaires', 'Frais bancaires', 'expense', 'reducible', false, 'landmark', 350),
  ('epargne', 'Épargne et placements', 'savings', null, false, 'piggy-bank', 410);
