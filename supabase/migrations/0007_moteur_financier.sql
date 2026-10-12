-- ============================================================
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
  ('revenus', 'Revenus', 10),
  ('logement', 'Logement', 20),
  ('factures_energie', 'Factures et énergie', 30),
  ('alimentation', 'Alimentation', 40),
  ('transport', 'Transport', 50),
  ('sante', 'Santé', 60),
  ('assurances', 'Assurances', 70),
  ('telecom', 'Télécommunications', 80),
  ('abonnements', 'Abonnements', 90),
  ('restaurants_loisirs', 'Restaurants et loisirs', 100),
  ('shopping', 'Shopping', 110),
  ('famille_enfants', 'Famille et enfants', 120),
  ('credits_dettes', 'Crédits et dettes', 130),
  ('frais_bancaires', 'Frais bancaires', 140),
  ('epargne', 'Épargne', 150),
  ('transferts', 'Transferts entre comptes', 160),
  ('remboursements', 'Remboursements reçus', 170),
  ('autres', 'Autres opérations', 180),
  ('a_verifier', 'Opérations à vérifier', 190);

-- ---------- Catégories : groupe, caractère essentiel, activation ----------
alter table public.categories
  add column group_code text references public.category_groups (code),
  add column is_essential boolean not null default false,
  add column is_active boolean not null default true;

insert into public.categories (code, label, kind, nature, is_debt, icon, sort_order, group_code, is_essential) values
  ('salaire', 'Salaires', 'income', null, false, 'briefcase', 10, 'revenus', false),
  ('revenus_independants', 'Revenus d’activité indépendante', 'income', null, false, 'store', 20, 'revenus', false),
  ('aides_allocations', 'Aides et allocations', 'income', null, false, 'hand-heart', 30, 'revenus', false),
  ('pensions_retraites', 'Pensions et retraites', 'income', null, false, 'landmark', 40, 'revenus', false),
  ('revenus_locatifs', 'Revenus locatifs', 'income', null, false, 'key-round', 50, 'revenus', false),
  ('autres_revenus', 'Autres revenus', 'income', null, false, 'plus-circle', 90, 'revenus', false),
  ('logement', 'Logement (loyer, charges)', 'expense', 'fixed', false, 'home', 110, 'logement', true),
  ('credit_immobilier', 'Crédit immobilier', 'expense', 'fixed', true, 'building', 115, 'credits_dettes', true),
  ('energie_eau', 'Énergie et eau', 'expense', 'fixed', false, 'zap', 120, 'factures_energie', true),
  ('assurances', 'Assurances', 'expense', 'fixed', false, 'shield', 130, 'assurances', true),
  ('telecom', 'Téléphone et internet', 'expense', 'fixed', false, 'smartphone', 140, 'telecom', false),
  ('scolarite_garde', 'Scolarité et garde d’enfants', 'expense', 'fixed', false, 'graduation-cap', 150, 'famille_enfants', true),
  ('impots_taxes', 'Impôts et taxes', 'expense', 'fixed', false, 'receipt', 160, 'factures_energie', true),
  ('credits_consommation', 'Crédits à la consommation', 'expense', 'fixed', true, 'credit-card', 170, 'credits_dettes', true),
  ('autres_charges', 'Autres charges régulières', 'expense', 'fixed', false, 'calendar-clock', 180, 'autres', false),
  ('alimentation', 'Courses alimentaires', 'expense', 'variable', false, 'shopping-basket', 210, 'alimentation', true),
  ('transport', 'Transport et carburant', 'expense', 'variable', false, 'car', 220, 'transport', true),
  ('sante', 'Santé', 'expense', 'variable', false, 'heart-pulse', 230, 'sante', true),
  ('enfants', 'Enfants', 'expense', 'variable', false, 'baby', 240, 'famille_enfants', false),
  ('cadeaux_dons', 'Cadeaux et dons', 'expense', 'variable', false, 'gift', 250, 'autres', false),
  ('retraits_especes', 'Retraits d’espèces', 'expense', 'variable', false, 'banknote', 260, 'autres', false),
  ('autres_depenses', 'Autres dépenses', 'expense', 'variable', false, 'circle-ellipsis', 290, 'autres', false),
  ('abonnements', 'Abonnements et services', 'expense', 'reducible', false, 'repeat', 310, 'abonnements', false),
  ('restaurants_livraisons', 'Restaurants et livraisons', 'expense', 'reducible', false, 'utensils', 320, 'restaurants_loisirs', false),
  ('loisirs_sorties', 'Loisirs et sorties', 'expense', 'reducible', false, 'ticket', 330, 'restaurants_loisirs', false),
  ('shopping', 'Shopping et habillement', 'expense', 'reducible', false, 'shopping-bag', 340, 'shopping', false),
  ('frais_bancaires', 'Frais bancaires', 'expense', 'reducible', false, 'landmark', 350, 'frais_bancaires', false),
  ('epargne', 'Épargne et placements', 'savings', null, false, 'piggy-bank', 410, 'epargne', false),
  ('transfert_interne', 'Virement entre mes comptes', 'transfer', null, false, 'arrow-left-right', 510, 'transferts', false),
  ('remboursement', 'Remboursement reçu', 'refund', null, false, 'undo-2', 520, 'remboursements', false),
  ('a_verifier', 'À vérifier', 'review', null, false, 'help-circle', 900, 'a_verifier', false)
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
  ('\b(VIR(EMENT)? (INTERNE|PERMANENT|DE COMPTE A COMPTE)|ENTRE (MES )?COMPTES|VERS (MON|LE) COMPTE|DE MON COMPTE)\b', 'transfert_interne', 10),
  ('\b(LIVRET|LDDS|LEP|PEL|CEL|EPARGNE|ASSURANCE VIE)\b', 'epargne', 20),
  ('\b(REMBOURSEMENT|REMB|AVOIR|RETOUR ACHAT|CPAM|AMELI|MUTUELLE REMB|REMBT)\b', 'remboursement', 30),
  ('\b(DEBIT DIFFERE|FACTURE CARTE|RELEVE CB|TOTAL CARTE)\b', 'a_verifier', 40),
  ('\b(SALAIRE|PAIE|REMUNERATION)\b', 'salaire', 50),
  ('\b(CAF|FRANCE TRAVAIL|POLE EMPLOI|ALLOCATION|APL|RSA|PRIME D''ACTIVITE)\b', 'aides_allocations', 60),
  ('\b(CARSAT|CNAV|AGIRC|ARRCO|RETRAITE|PENSION)\b', 'pensions_retraites', 70),
  ('\b(CREDIT IMMO|PRET IMMO|PRET HABITAT)\b', 'credit_immobilier', 80),
  ('\b(CETELEM|COFIDIS|SOFINCO|FLOA|ONEY|FRANFINANCE|YOUNITED|CREDIT CONSO|PRET PERSO)\b', 'credits_consommation', 90),
  ('\b(LOYER|FONCIA|NEXITY|CITYA|SYNDIC|OPAC|HLM)\b', 'logement', 100),
  ('\b(EDF|ENGIE|TOTALENERGIES|TOTAL ENERGIES|ENI|VEOLIA|SUEZ|SAUR|EKWATEUR|OHM ENERGIE|GAZ|ELECTRICITE)\b', 'energie_eau', 110),
  ('\b(ORANGE|SOSH|SFR|RED BY SFR|BOUYGUES|B&YOU|FREE MOBILE|FREE TELECOM|FREE)\b', 'telecom', 120),
  ('\b(AXA|MAAF|MACIF|MATMUT|GMF|MAIF|ALLIANZ|GROUPAMA|GENERALI|MUTUELLE|ASSURANCE|HARMONIE|ALAN)\b', 'assurances', 130),
  ('\b(DGFIP|IMPOT|IMPOTS|TRESOR PUBLIC|TAXE)\b', 'impots_taxes', 140),
  ('\b(CRECHE|CANTINE|ECOLE|PERISCOLAIRE|NOUNOU|PAJEMPLOI)\b', 'scolarite_garde', 150),
  ('\b(NETFLIX|SPOTIFY|DEEZER|DISNEY|CANAL|PRIME VIDEO|AMAZON PRIME|APPLE COM|ICLOUD|YOUTUBE|DAZN|BASIC FIT|FITNESS PARK)\b', 'abonnements', 160),
  ('\b(UBER EATS|DELIVEROO|JUST EAT|MCDONALD|MC DONALD|MCDO|BURGER KING|KFC|RESTAURANT|BRASSERIE|PIZZ|SUSHI|STARBUCKS|BOULANGERIE)\b', 'restaurants_livraisons', 170),
  ('\b(CARREFOUR|LECLERC|AUCHAN|LIDL|INTERMARCHE|MONOPRIX|FRANPRIX|CASINO|ALDI|SUPER U|HYPER U|U EXPRESS|PICARD|GRAND FRAIS|NETTO|LEADER PRICE|BIOCOOP)\b', 'alimentation', 180),
  ('\b(SNCF|RATP|NAVIGO|TCL|BLABLACAR|UBER|BOLT|ESSO|SHELL|BP|AVIA|TOTAL|AUTOROUTE|PEAGE|VINCI|SANEF|APRR|PARKING)\b', 'transport', 190),
  ('\b(PHARMACIE|DOCTOLIB|MEDECIN|DOCTEUR|DENTISTE|OPTIC|HOPITAL|CLINIQUE|LABORATOIRE|KINE)\b', 'sante', 200),
  ('\b(ZARA|H&M|PRIMARK|KIABI|DECATHLON|FNAC|DARTY|AMAZON|CDISCOUNT|SHEIN|ZALANDO|IKEA|SEPHORA|ACTION)\b', 'shopping', 210),
  ('\b(CINEMA|PATHE|UGC|GAUMONT|STEAM|PLAYSTATION|NINTENDO|BILLETTERIE)\b', 'loisirs_sorties', 220),
  ('\b(RETRAIT|DAB|GAB)\b', 'retraits_especes', 230),
  ('\b(FRAIS|COMMISSION|AGIOS|COTISATION CARTE|COTIS|INTERETS DEBITEURS)\b', 'frais_bancaires', 240);

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
  ('debtRatioMax', 0.35, 'Taux d’endettement maximal (part des revenus)'),
  ('fixedChargesRatioWarning', 0.6, 'Part des charges fixes au-delà de laquelle le budget est rigide'),
  ('savingsRateTarget', 0.1, 'Taux d’épargne visé'),
  ('safetyMarginRatio', 0.05, 'Marge mensuelle minimale (part des revenus)'),
  ('budgetOverrunRatio', 0.15, 'Dépassement toléré du budget prévu d’une catégorie'),
  ('chargeIncreaseRatio', 0.05, 'Hausse signalée d’une charge récurrente'),
  ('categoryIncreaseRatio', 0.25, 'Hausse mensuelle signalée d’une catégorie'),
  ('categoryIncreaseMinAmount', 3000, 'Montant minimal d’une hausse signalée (centimes)'),
  ('subscriptionsShareWarning', 0.05, 'Part des revenus consacrée aux abonnements signalée'),
  ('bankFeesMonthlyWarning', 1000, 'Frais bancaires mensuels signalés (centimes)'),
  ('goalDeadlineDays', 60, 'Jours avant échéance d’un objectif pour signaler un retard'),
  ('exceptionalExpenseMin', 30000, 'Montant minimal d’une dépense exceptionnelle (centimes)'),
  ('exceptionalExpenseRatio', 0.25, 'Part du revenu régulier pour une dépense exceptionnelle'),
  ('exceptionalIncomeRatio', 0.3, 'Part du revenu régulier pour un revenu exceptionnel'),
  ('potentialSavingsRatio', 0.3, 'Part réductible retenue pour les économies potentielles'),
  ('aiMinConfidence', 0.6, 'Confiance minimale de l’IA sans confirmation'),
  ('importantAmount', 30000, 'Montant à partir duquel une catégorie IA est confirmée (centimes)'),
  ('recurringTolerance', 0.2, 'Écart toléré entre montants récurrents'),
  ('transferMatchDays', 3, 'Écart maximal (jours) entre les deux jambes d’un virement interne');

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
