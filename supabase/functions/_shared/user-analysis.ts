// Chargement des données d'un utilisateur (service role, toujours filtré par
// user_id) et calcul de son analyse avec le moteur métier partagé.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  computeAnalysis,
  setCategoryRegistry,
  setThresholds,
  type ActionStatus,
  type CategoryKind,
  type ExpenseNature,
  type FinancialSituation,
  type ImportRecord,
  type RawTransaction,
  type SubscriptionVerdict,
} from './domain/index.ts'

function rows<T>(res: { data: T[] | null; error: unknown }): T[] {
  if (res.error) throw res.error
  return res.data ?? []
}

/** Charge le référentiel (catégories, règles, seuils) depuis la base. */
export async function loadReference(db: SupabaseClient) {
  const [categories, groups, rules, th] = await Promise.all([
    db.from('categories').select('code, label, kind, nature, group_code, is_debt, is_essential, icon, sort_order').eq('is_active', true),
    db.from('category_groups').select('code, label, sort_order'),
    db.from('category_keyword_rules').select('pattern, category_code, priority').eq('is_active', true),
    db.from('diagnostic_rules').select('key, value'),
  ])
  setCategoryRegistry(
    rows(categories).map((c: { code: string; label: string; kind: CategoryKind; nature: ExpenseNature | null; group_code: string; is_debt: boolean; is_essential: boolean; icon: string; sort_order: number }) => ({
      code: c.code,
      label: c.label,
      kind: c.kind,
      nature: c.nature,
      groupCode: c.group_code,
      isDebt: c.is_debt,
      isEssential: c.is_essential,
      icon: c.icon,
      sortOrder: c.sort_order,
    })),
    rows(groups).map((g: { code: string; label: string; sort_order: number }) => ({ code: g.code, label: g.label, sortOrder: g.sort_order })),
    rows(rules).map((r: { pattern: string; category_code: string; priority: number }) => ({ pattern: r.pattern, categoryCode: r.category_code, priority: r.priority })),
  )
  setThresholds(Object.fromEntries(rows(th).map((t: { key: string; value: number }) => [t.key, Number(t.value)])))
}

async function allTransactions(db: SupabaseClient, userId: string) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const page = rows(
      await db
        .from('transactions')
        .select('id, import_id, op_date, label, amount_cents, currency, is_pending, page, ai_category_code, ai_confidence, user_category_code, user_excluded, user_exceptional, review_status, user_amount_cents, user_op_date, user_label')
        .eq('user_id', userId)
        .order('op_date')
        .order('id')
        .range(from, from + 999),
    )
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

export async function analyzeUser(db: SupabaseClient, userId: string, today: string) {
  await loadReference(db)
  const [entries, situation, imports, transactions, rules, goals, actions, verdicts] = await Promise.all([
    db.from('budget_entries').select('id, category_code, label, amount_cents, frequency, source').eq('user_id', userId),
    db.from('financial_situations').select('*').eq('user_id', userId).maybeSingle(),
    db.from('statement_imports').select('id, account_label, period_start, period_end, closing_balance_cents, created_at, status, balance_check').eq('user_id', userId),
    allTransactions(db, userId),
    db.from('category_rules').select('merchant_key, category_code').eq('user_id', userId),
    db.from('savings_goals').select('id, name, kind, target_cents, saved_cents, monthly_contribution_cents, target_date, goal_contributions(amount_cents)').eq('user_id', userId),
    db.from('recommendation_actions').select('rec_key, status, confirmed_saving_cents').eq('user_id', userId),
    db.from('subscription_reviews').select('merchant_key, verdict').eq('user_id', userId),
  ])

  const s = situation.data as Record<string, unknown> | null
  const fin: FinancialSituation | null = s
    ? {
        savingsAvailable: s.savings_available_cents === null ? null : Number(s.savings_available_cents),
        debtRemaining: s.debt_remaining_cents === null ? null : Number(s.debt_remaining_cents),
        hasPaymentDelays: s.has_payment_delays as boolean | null,
        mainGoal: s.main_goal as FinancialSituation['mainGoal'],
        householdSize: s.household_size as number | null,
      }
    : null

  const importRecords: ImportRecord[] = rows(imports).map((i: Record<string, unknown>) => ({
    id: i.id as string,
    accountKey: (i.account_label as string | null) ?? (i.id as string),
    periodStart: i.period_start as string | null,
    periodEnd: i.period_end as string | null,
    closingBalance: i.closing_balance_cents === null ? null : Number(i.closing_balance_cents),
    createdAt: i.created_at as string,
    status: i.status as ImportRecord['status'],
    balanceCheck: i.balance_check as ImportRecord['balanceCheck'],
  }))

  const raw: RawTransaction[] = transactions.map((r) => ({
    id: r.id as string,
    importId: r.import_id as string,
    opDate: r.op_date as string,
    label: r.label as string,
    amount: Number(r.amount_cents),
    currency: r.currency as string,
    isPending: r.is_pending as boolean,
    page: r.page as number | null,
    aiCategoryCode: r.ai_category_code as string | null,
    aiConfidence: r.ai_confidence as number | null,
    userCategoryCode: r.user_category_code as string | null,
    userExcluded: r.user_excluded as boolean | null,
    userExceptional: r.user_exceptional as boolean | null,
    reviewStatus: r.review_status as RawTransaction['reviewStatus'],
    userAmount: r.user_amount_cents === null ? null : Number(r.user_amount_cents),
    userOpDate: r.user_op_date as string | null,
    userLabel: r.user_label as string | null,
  }))

  const analysis = computeAnalysis({
    declared: rows(entries).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      categoryCode: e.category_code as string,
      label: e.label as string | null,
      amount: Number(e.amount_cents),
      frequency: e.frequency as 'monthly',
      source: e.source as 'manual' | 'off_statement',
    })),
    imports: importRecords,
    transactions: raw,
    rules: new Map(rows(rules).map((r: { merchant_key: string; category_code: string }) => [r.merchant_key, r.category_code])),
    situation: fin,
    goals: rows(goals).map((g: Record<string, unknown>) => ({
      id: g.id as string,
      name: g.name as string,
      kind: g.kind as 'other',
      targetAmount: Number(g.target_cents),
      savedAmount: Number(g.saved_cents),
      contributionsTotal: (g.goal_contributions as { amount_cents: number }[]).reduce((sum, c) => sum + Number(c.amount_cents), 0),
      monthlyContribution: g.monthly_contribution_cents === null ? null : Number(g.monthly_contribution_cents),
      targetDate: g.target_date as string | null,
    })),
    actions: new Map(
      rows(actions).map((a: { rec_key: string; status: ActionStatus; confirmed_saving_cents: number | null }) => [a.rec_key, { status: a.status, confirmedSaving: a.confirmed_saving_cents === null ? null : Number(a.confirmed_saving_cents) }]),
    ),
    subscriptionVerdicts: new Map(rows(verdicts).map((v: { merchant_key: string; verdict: SubscriptionVerdict }) => [v.merchant_key, v.verdict])),
    today,
  })
  return { analysis, situation: fin }
}
