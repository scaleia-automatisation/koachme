// Génère supabase/migrations/0007_moteur_financier.sql à partir du référentiel
// par défaut de src/domain (catégories, groupes, règles, seuils).
// Usage unique : une migration appliquée ne doit plus être modifiée.
import { writeFileSync } from 'node:fs'

const { DEFAULT_CATEGORIES, DEFAULT_GROUPS, DEFAULT_KEYWORD_RULES } = await import('../src/domain/categories.ts')
const { DEFAULT_THRESHOLDS } = await import('../src/domain/status.ts')

const q = (v) => (v === null ? 'null' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v))
const rows = (list) => list.map((values) => `  (${values.map(q).join(', ')})`).join(',\n')

const DESCRIPTIONS = {
  debtRatioMax: 'Taux d’endettement maximal (part des revenus)',
  fixedChargesRatioWarning: 'Part des charges fixes au-delà de laquelle le budget est rigide',
  savingsRateTarget: 'Taux d’épargne visé',
  safetyMarginRatio: 'Marge mensuelle minimale (part des revenus)',
  budgetOverrunRatio: 'Dépassement toléré du budget prévu d’une catégorie',
  chargeIncreaseRatio: 'Hausse signalée d’une charge récurrente',
  categoryIncreaseRatio: 'Hausse mensuelle signalée d’une catégorie',
  categoryIncreaseMinAmount: 'Montant minimal d’une hausse signalée (centimes)',
  subscriptionsShareWarning: 'Part des revenus consacrée aux abonnements signalée',
  bankFeesMonthlyWarning: 'Frais bancaires mensuels signalés (centimes)',
  goalDeadlineDays: 'Jours avant échéance d’un objectif pour signaler un retard',
  exceptionalExpenseMin: 'Montant minimal d’une dépense exceptionnelle (centimes)',
  exceptionalExpenseRatio: 'Part du revenu régulier pour une dépense exceptionnelle',
  exceptionalIncomeRatio: 'Part du revenu régulier pour un revenu exceptionnel',
  potentialSavingsRatio: 'Part réductible retenue pour les économies potentielles',
  aiMinConfidence: 'Confiance minimale de l’IA sans confirmation',
  importantAmount: 'Montant à partir duquel une catégorie IA est confirmée (centimes)',
  recurringTolerance: 'Écart toléré entre montants récurrents',
  transferMatchDays: 'Écart maximal (jours) entre les deux jambes d’un virement interne',
}

const sql = `-- ============================================================
-- 0007 — Moteur financier (bloc 3)
-- Référentiels extensibles en base (groupes, catégories, règles, seuils),
-- traçabilité des opérations et objectifs d’épargne.
-- Valeurs initiales générées depuis src/domain (scripts/gen-migration-0007.mjs).
-- ============================================================

-- ---------- Groupes de catégories ----------
create table public.category_groups (
  code        text primary key check (code ~ '^[a-z][a-z_]*$'),
  label       text not null check (length(label) between 1 and 60),
  sort_order  integer not null
);
alter table public.category_groups enable row level security;
revoke all on public.category_groups from anon, authenticated;
grant select on public.category_groups to anon, authenticated;
create policy "category_groups_lecture_publique" on public.category_groups for select to anon, authenticated using (true);

insert into public.category_groups (code, label, sort_order) values
${rows(DEFAULT_GROUPS.map((g) => [g.code, g.label, g.sortOrder]))};

-- ---------- Catégories : groupe, caractère essentiel, activation ----------
alter table public.categories
  add column group_code text references public.category_groups (code),
  add column is_essential boolean not null default false,
  add column is_active boolean not null default true;

insert into public.categories (code, label, kind, nature, is_debt, icon, sort_order, group_code, is_essential) values
${rows(DEFAULT_CATEGORIES.map((c) => [c.code, c.label, c.kind, c.nature, c.isDebt, c.icon, c.sortOrder, c.groupCode, c.isEssential]))}
on conflict (code) do update set
  label = excluded.label, kind = excluded.kind, nature = excluded.nature, is_debt = excluded.is_debt,
  icon = excluded.icon, sort_order = excluded.sort_order, group_code = excluded.group_code, is_essential = excluded.is_essential;

alter table public.categories alter column group_code set not null;
create index categories_group_idx on public.categories (group_code);

-- ---------- Règles de catégorisation par mots-clés ----------
create table public.category_keyword_rules (
  id             uuid primary key default gen_random_uuid(),
  pattern        text not null check (length(pattern) between 2 and 500),
  category_code  text not null references public.categories (code),
  priority       integer not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index category_keyword_rules_category_idx on public.category_keyword_rules (category_code);
alter table public.category_keyword_rules enable row level security;
revoke all on public.category_keyword_rules from anon, authenticated;
grant select on public.category_keyword_rules to anon, authenticated;
create policy "keyword_rules_lecture_publique" on public.category_keyword_rules for select to anon, authenticated using (is_active);

insert into public.category_keyword_rules (pattern, category_code, priority) values
${rows(DEFAULT_KEYWORD_RULES.map((r) => [r.pattern, r.categoryCode, r.priority]))};

-- ---------- Seuils du diagnostic ----------
create table public.diagnostic_rules (
  key          text primary key,
  value        numeric not null check (value >= 0),
  description  text not null,
  updated_at   timestamptz not null default now()
);
create trigger diagnostic_rules_updated_at before update on public.diagnostic_rules
  for each row execute function app_private.set_updated_at();
alter table public.diagnostic_rules enable row level security;
revoke all on public.diagnostic_rules from anon, authenticated;
grant select on public.diagnostic_rules to anon, authenticated;
create policy "diagnostic_rules_lecture_publique" on public.diagnostic_rules for select to anon, authenticated using (true);

insert into public.diagnostic_rules (key, value, description) values
${rows(Object.entries(DEFAULT_THRESHOLDS).map(([k, v]) => [k, v, DESCRIPTIONS[k]]))};

-- ---------- Traçabilité des imports et des opérations ----------
alter table public.statement_imports
  add column extraction_method public.extraction_method,
  add column extraction_attempts smallint not null default 0,
  add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column balance_gap_cents bigint;

alter table public.transactions
  add column currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column is_pending boolean not null default false,
  add column page smallint,
  add column user_exceptional boolean,
  add column review_status public.review_status not null default 'auto';

grant update (user_category_code, user_excluded, user_exceptional, review_status) on public.transactions to authenticated;

-- ---------- Objectifs d’épargne ----------
create table public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 80),
  target_cents  bigint not null check (target_cents between 100 and 100000000000),
  saved_cents   bigint not null default 0 check (saved_cents between 0 and 100000000000),
  target_date   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index savings_goals_user_idx on public.savings_goals (user_id);
create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function app_private.set_updated_at();
alter table public.savings_goals enable row level security;
revoke all on public.savings_goals from anon, authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
create policy "savings_goals_all_own" on public.savings_goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
`

writeFileSync('supabase/migrations/0007_moteur_financier.sql', sql)
console.log(`0007 générée : ${DEFAULT_GROUPS.length} groupes, ${DEFAULT_CATEGORIES.length} catégories, ${DEFAULT_KEYWORD_RULES.length} règles, ${Object.keys(DEFAULT_THRESHOLDS).length} seuils.`)
