// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis src/domain — ne pas modifier ici.
// Référentiel des catégories financières.
//
// La source de vérité est la base de données (tables category_groups,
// categories et category_keyword_rules) : on peut ajouter ou modifier une
// catégorie sans redéployer l'application. Les valeurs ci-dessous servent de
// référentiel par défaut (amorçage des migrations, tests, page d'accueil) ;
// l'application charge le registre de la base au démarrage (setRegistry).

/**
 * Type d'une catégorie, qui détermine sa place dans les calculs :
 * - income   : revenu (compté dans les revenus)
 * - expense  : dépense réelle
 * - savings  : épargne (ni revenu ni dépense)
 * - transfer : mouvement interne entre comptes (jamais compté)
 * - refund   : remboursement reçu (vient en déduction des dépenses, jamais un revenu)
 * - review   : opération à vérifier (non comptée tant qu'elle n'est pas classée)
 */
export type CategoryKind = 'income' | 'expense' | 'savings' | 'transfer' | 'refund' | 'review'

/**
 * Nature d'une dépense :
 * - fixed     : charge contrainte, difficile à modifier à court terme
 * - variable  : dépense courante nécessaire, ajustable avec de bonnes habitudes
 * - reducible : dépense évitable ou fortement réductible
 */
export type ExpenseNature = 'fixed' | 'variable' | 'reducible'

/** Code de catégorie (extensible : défini par la base de données). */
export type CategoryCode = string

export interface CategoryGroup {
  code: string
  label: string
  sortOrder: number
}

export interface Category {
  code: CategoryCode
  label: string
  kind: CategoryKind
  nature: ExpenseNature | null
  groupCode: string
  isDebt: boolean
  /** Charge essentielle : son non-paiement met en difficulté (logement, énergie, alimentation…). */
  isEssential: boolean
  icon: string
  sortOrder: number
}

export interface KeywordRule {
  /** Expression régulière (syntaxe JavaScript) appliquée au libellé normalisé en majuscules sans accents. */
  pattern: string
  categoryCode: CategoryCode
  /** Ordre d'application : la première règle qui correspond l'emporte. */
  priority: number
}

export const DEFAULT_GROUPS: readonly CategoryGroup[] = [
  { code: 'revenus', label: 'Revenus', sortOrder: 10 },
  { code: 'logement', label: 'Logement', sortOrder: 20 },
  { code: 'factures_energie', label: 'Factures et énergie', sortOrder: 30 },
  { code: 'alimentation', label: 'Alimentation', sortOrder: 40 },
  { code: 'transport', label: 'Transport', sortOrder: 50 },
  { code: 'sante', label: 'Santé', sortOrder: 60 },
  { code: 'assurances', label: 'Assurances', sortOrder: 70 },
  { code: 'telecom', label: 'Télécommunications', sortOrder: 80 },
  { code: 'abonnements', label: 'Abonnements', sortOrder: 90 },
  { code: 'restaurants_loisirs', label: 'Restaurants et loisirs', sortOrder: 100 },
  { code: 'shopping', label: 'Shopping', sortOrder: 110 },
  { code: 'famille_enfants', label: 'Famille et enfants', sortOrder: 120 },
  { code: 'credits_dettes', label: 'Crédits et dettes', sortOrder: 130 },
  { code: 'frais_bancaires', label: 'Frais bancaires', sortOrder: 140 },
  { code: 'epargne', label: 'Épargne', sortOrder: 150 },
  { code: 'transferts', label: 'Transferts entre comptes', sortOrder: 160 },
  { code: 'remboursements', label: 'Remboursements reçus', sortOrder: 170 },
  { code: 'autres', label: 'Autres opérations', sortOrder: 180 },
  { code: 'a_verifier', label: 'Opérations à vérifier', sortOrder: 190 },
]

type Def = [code: string, label: string, kind: CategoryKind, nature: ExpenseNature | null, group: string, flags: { debt?: boolean; essential?: boolean }, icon: string, sort: number]

const DEFS: Def[] = [
  // Revenus
  ['salaire', 'Salaires', 'income', null, 'revenus', {}, 'briefcase', 10],
  ['revenus_independants', 'Revenus d’activité indépendante', 'income', null, 'revenus', {}, 'store', 20],
  ['aides_allocations', 'Aides et allocations', 'income', null, 'revenus', {}, 'hand-heart', 30],
  ['pensions_retraites', 'Pensions et retraites', 'income', null, 'revenus', {}, 'landmark', 40],
  ['revenus_locatifs', 'Revenus locatifs', 'income', null, 'revenus', {}, 'key-round', 50],
  ['autres_revenus', 'Autres revenus', 'income', null, 'revenus', {}, 'plus-circle', 90],

  // Charges fixes
  ['logement', 'Logement (loyer, charges)', 'expense', 'fixed', 'logement', { essential: true }, 'home', 110],
  ['credit_immobilier', 'Crédit immobilier', 'expense', 'fixed', 'credits_dettes', { debt: true, essential: true }, 'building', 115],
  ['energie_eau', 'Énergie et eau', 'expense', 'fixed', 'factures_energie', { essential: true }, 'zap', 120],
  ['assurances', 'Assurances', 'expense', 'fixed', 'assurances', { essential: true }, 'shield', 130],
  ['telecom', 'Téléphone et internet', 'expense', 'fixed', 'telecom', {}, 'smartphone', 140],
  ['scolarite_garde', 'Scolarité et garde d’enfants', 'expense', 'fixed', 'famille_enfants', { essential: true }, 'graduation-cap', 150],
  ['impots_taxes', 'Impôts et taxes', 'expense', 'fixed', 'factures_energie', { essential: true }, 'receipt', 160],
  ['credits_consommation', 'Crédits à la consommation', 'expense', 'fixed', 'credits_dettes', { debt: true, essential: true }, 'credit-card', 170],
  ['autres_charges', 'Autres charges régulières', 'expense', 'fixed', 'autres', {}, 'calendar-clock', 180],

  // Dépenses courantes
  ['alimentation', 'Courses alimentaires', 'expense', 'variable', 'alimentation', { essential: true }, 'shopping-basket', 210],
  ['transport', 'Transport et carburant', 'expense', 'variable', 'transport', { essential: true }, 'car', 220],
  ['sante', 'Santé', 'expense', 'variable', 'sante', { essential: true }, 'heart-pulse', 230],
  ['enfants', 'Enfants', 'expense', 'variable', 'famille_enfants', {}, 'baby', 240],
  ['cadeaux_dons', 'Cadeaux et dons', 'expense', 'variable', 'autres', {}, 'gift', 250],
  ['retraits_especes', 'Retraits d’espèces', 'expense', 'variable', 'autres', {}, 'banknote', 260],
  ['autres_depenses', 'Autres dépenses', 'expense', 'variable', 'autres', {}, 'circle-ellipsis', 290],

  // Dépenses réductibles
  ['abonnements', 'Abonnements et services', 'expense', 'reducible', 'abonnements', {}, 'repeat', 310],
  ['restaurants_livraisons', 'Restaurants et livraisons', 'expense', 'reducible', 'restaurants_loisirs', {}, 'utensils', 320],
  ['loisirs_sorties', 'Loisirs et sorties', 'expense', 'reducible', 'restaurants_loisirs', {}, 'ticket', 330],
  ['shopping', 'Shopping et habillement', 'expense', 'reducible', 'shopping', {}, 'shopping-bag', 340],
  ['frais_bancaires', 'Frais bancaires', 'expense', 'reducible', 'frais_bancaires', {}, 'landmark', 350],

  // Mouvements non budgétaires
  ['epargne', 'Épargne et placements', 'savings', null, 'epargne', {}, 'piggy-bank', 410],
  ['transfert_interne', 'Virement entre mes comptes', 'transfer', null, 'transferts', {}, 'arrow-left-right', 510],
  ['remboursement', 'Remboursement reçu', 'refund', null, 'remboursements', {}, 'undo-2', 520],
  ['a_verifier', 'À vérifier', 'review', null, 'a_verifier', {}, 'help-circle', 900],
]

export const DEFAULT_CATEGORIES: readonly Category[] = DEFS.map(([code, label, kind, nature, groupCode, flags, icon, sortOrder]) => ({
  code,
  label,
  kind,
  nature,
  groupCode,
  isDebt: flags.debt ?? false,
  isEssential: flags.essential ?? false,
  icon,
  sortOrder,
}))

/** Règles par mots-clés par défaut. L'ordre (priority) compte : la première règle qui correspond l'emporte. */
export const DEFAULT_KEYWORD_RULES: readonly KeywordRule[] = [
  // Mouvements à ne jamais compter comme revenu ou dépense
  ['\\b(VIR(EMENT)? (INTERNE|PERMANENT|DE COMPTE A COMPTE)|ENTRE (MES )?COMPTES|VERS (MON|LE) COMPTE|DE MON COMPTE)\\b', 'transfert_interne'],
  ['\\b(LIVRET|LDDS|LEP|PEL|CEL|EPARGNE|ASSURANCE VIE)\\b', 'epargne'],
  ['\\b(REMBOURSEMENT|REMB|AVOIR|RETOUR ACHAT|CPAM|AMELI|MUTUELLE REMB|REMBT)\\b', 'remboursement'],
  ['\\b(DEBIT DIFFERE|FACTURE CARTE|RELEVE CB|TOTAL CARTE)\\b', 'a_verifier'],
  // Revenus
  ['\\b(SALAIRE|PAIE|REMUNERATION)\\b', 'salaire'],
  ['\\b(CAF|FRANCE TRAVAIL|POLE EMPLOI|ALLOCATION|APL|RSA|PRIME D\'ACTIVITE)\\b', 'aides_allocations'],
  ['\\b(CARSAT|CNAV|AGIRC|ARRCO|RETRAITE|PENSION)\\b', 'pensions_retraites'],
  // Charges
  ['\\b(CREDIT IMMO|PRET IMMO|PRET HABITAT)\\b', 'credit_immobilier'],
  ['\\b(CETELEM|COFIDIS|SOFINCO|FLOA|ONEY|FRANFINANCE|YOUNITED|CREDIT CONSO|PRET PERSO)\\b', 'credits_consommation'],
  ['\\b(LOYER|FONCIA|NEXITY|CITYA|SYNDIC|OPAC|HLM)\\b', 'logement'],
  ['\\b(EDF|ENGIE|TOTALENERGIES|TOTAL ENERGIES|ENI|VEOLIA|SUEZ|SAUR|EKWATEUR|OHM ENERGIE|GAZ|ELECTRICITE)\\b', 'energie_eau'],
  ['\\b(ORANGE|SOSH|SFR|RED BY SFR|BOUYGUES|B&YOU|FREE MOBILE|FREE TELECOM|FREE)\\b', 'telecom'],
  ['\\b(AXA|MAAF|MACIF|MATMUT|GMF|MAIF|ALLIANZ|GROUPAMA|GENERALI|MUTUELLE|ASSURANCE|HARMONIE|ALAN)\\b', 'assurances'],
  ['\\b(DGFIP|IMPOT|IMPOTS|TRESOR PUBLIC|TAXE)\\b', 'impots_taxes'],
  ['\\b(CRECHE|CANTINE|ECOLE|PERISCOLAIRE|NOUNOU|PAJEMPLOI)\\b', 'scolarite_garde'],
  ['\\b(NETFLIX|SPOTIFY|DEEZER|DISNEY|CANAL|PRIME VIDEO|AMAZON PRIME|APPLE COM|ICLOUD|YOUTUBE|DAZN|BASIC FIT|FITNESS PARK)\\b', 'abonnements'],
  ['\\b(UBER EATS|DELIVEROO|JUST EAT|MCDONALD|MC DONALD|MCDO|BURGER KING|KFC|RESTAURANT|BRASSERIE|PIZZ|SUSHI|STARBUCKS|BOULANGERIE)\\b', 'restaurants_livraisons'],
  ['\\b(CARREFOUR|LECLERC|AUCHAN|LIDL|INTERMARCHE|MONOPRIX|FRANPRIX|CASINO|ALDI|SUPER U|HYPER U|U EXPRESS|PICARD|GRAND FRAIS|NETTO|LEADER PRICE|BIOCOOP)\\b', 'alimentation'],
  ['\\b(SNCF|RATP|NAVIGO|TCL|BLABLACAR|UBER|BOLT|ESSO|SHELL|BP|AVIA|TOTAL|AUTOROUTE|PEAGE|VINCI|SANEF|APRR|PARKING)\\b', 'transport'],
  ['\\b(PHARMACIE|DOCTOLIB|MEDECIN|DOCTEUR|DENTISTE|OPTIC|HOPITAL|CLINIQUE|LABORATOIRE|KINE)\\b', 'sante'],
  ['\\b(ZARA|H&M|PRIMARK|KIABI|DECATHLON|FNAC|DARTY|AMAZON|CDISCOUNT|SHEIN|ZALANDO|IKEA|SEPHORA|ACTION)\\b', 'shopping'],
  ['\\b(CINEMA|PATHE|UGC|GAUMONT|STEAM|PLAYSTATION|NINTENDO|BILLETTERIE)\\b', 'loisirs_sorties'],
  ['\\b(RETRAIT|DAB|GAB)\\b', 'retraits_especes'],
  ['\\b(FRAIS|COMMISSION|AGIOS|COTISATION CARTE|COTIS|INTERETS DEBITEURS)\\b', 'frais_bancaires'],
].map(([pattern, categoryCode], i) => ({ pattern, categoryCode, priority: (i + 1) * 10 }))

// ---------------------------------------------------------------------------
// Registre courant (remplacé par celui de la base au démarrage de l'application)
// ---------------------------------------------------------------------------

export interface CompiledRule {
  regex: RegExp
  categoryCode: CategoryCode
}

interface CategoryRegistry {
  categories: readonly Category[]
  groups: readonly CategoryGroup[]
  byCode: ReadonlyMap<string, Category>
  groupByCode: ReadonlyMap<string, CategoryGroup>
  rules: readonly CompiledRule[]
}

function compile(categories: readonly Category[], groups: readonly CategoryGroup[], rules: readonly KeywordRule[]): CategoryRegistry {
  const byCode = new Map(categories.map((c) => [c.code, c]))
  const compiled: CompiledRule[] = []
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (!byCode.has(r.categoryCode)) continue
    try {
      compiled.push({ regex: new RegExp(r.pattern), categoryCode: r.categoryCode })
    } catch {
      // Règle invalide ignorée : une erreur de saisie en base ne doit pas bloquer l'analyse.
    }
  }
  return {
    categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    groups: [...groups].sort((a, b) => a.sortOrder - b.sortOrder),
    byCode,
    groupByCode: new Map(groups.map((g) => [g.code, g])),
    rules: compiled,
  }
}

let registry = compile(DEFAULT_CATEGORIES, DEFAULT_GROUPS, DEFAULT_KEYWORD_RULES)

/** Remplace le référentiel courant (chargé depuis la base de données). */
export function setCategoryRegistry(categories: readonly Category[], groups: readonly CategoryGroup[], rules: readonly KeywordRule[]) {
  registry = compile(categories, groups, rules)
}

export function resetCategoryRegistry() {
  registry = compile(DEFAULT_CATEGORIES, DEFAULT_GROUPS, DEFAULT_KEYWORD_RULES)
}

export function allCategories(): readonly Category[] {
  return registry.categories
}

export function allGroups(): readonly CategoryGroup[] {
  return registry.groups
}

export function keywordRules(): readonly CompiledRule[] {
  return registry.rules
}

const UNKNOWN: Omit<Category, 'code'> = {
  label: 'Catégorie inconnue',
  kind: 'review',
  nature: null,
  groupCode: 'a_verifier',
  isDebt: false,
  isEssential: false,
  icon: 'help-circle',
  sortOrder: 9999,
}

export function getCategory(code: string): Category {
  const category = registry.byCode.get(code)
  if (!category) throw new Error(`Catégorie inconnue : ${code}`)
  return category
}

/** Variante tolérante pour l'affichage : une catégorie supprimée de la base s'affiche « à vérifier ». */
export function findCategory(code: string): Category {
  return registry.byCode.get(code) ?? { code, ...UNKNOWN }
}

export function getGroup(code: string): CategoryGroup {
  return registry.groupByCode.get(code) ?? { code, label: code, sortOrder: 9999 }
}

export function isCategoryCode(code: string): boolean {
  return registry.byCode.has(code)
}

export function categoriesOfKind(kind: CategoryKind): Category[] {
  return registry.categories.filter((c) => c.kind === kind)
}

/** Catégories « budgétaires » pouvant être déclarées dans la saisie guidée. */
export function isBudgetKind(kind: CategoryKind): boolean {
  return kind === 'income' || kind === 'expense' || kind === 'savings'
}

export const EXPENSE_NATURE_LABELS: Record<ExpenseNature, string> = {
  fixed: 'Charges fixes',
  variable: 'Dépenses courantes',
  reducible: 'Dépenses réductibles',
}

export const KIND_LABELS: Record<CategoryKind, string> = {
  income: 'Revenu',
  expense: 'Dépense',
  savings: 'Épargne',
  transfer: 'Mouvement interne',
  refund: 'Remboursement',
  review: 'À vérifier',
}
