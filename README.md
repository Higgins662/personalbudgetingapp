# Budget — Personal Finance App

**Your budget, built from real numbers. Not guesses.**

Budget is a personal finance web app that builds your spending plan from actual bank statement data. Import a CSV from any bank, and Budget reads your transactions, groups them by merchant, and turns them into a real budget — one that reflects how you actually spend money.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Hosting | Vercel (GitHub-linked deployment) |
| Database | Supabase (Postgres + Row Level Security) |
| Auth | Supabase Auth (email/password + email confirmation) |
| Routing | React Router v6 |

---

## Features

### Transaction-driven onboarding
New users upload their bank statement CSVs during setup. Budget analyzes the transactions, identifies income sources, categorizes spending by payee, and builds a starting budget from real numbers — no manual data entry. Users with no statements can skip and fill in zeroes manually.

### 18 spending categories
17 user-editable categories (Housing, Transport, Food & Groceries, Dining & Restaurants, Utilities, Health, Insurance, Streaming Services, Subscriptions/Memberships, Personal Care, Home Maintenance, Entertainment, Travel, Gifts & Donations, Pet Expenses, Savings, Other) plus one system category (Transfers & Payments) that is excluded from all budget calculations.

### Monthly and yearly budget periods
Income and monthly expenses roll forward each calendar month. Annual expenses roll yearly. Each period carries forward the prior period's budgeted amounts, resets actuals to zero, and flags any category that ran more than 15% over budget last period. Users can manually start a new month or year early if needed.

### CSV import and reconcile
Multi-bank CSV import with automatic column mapping memory per bank. Tiered transaction matching: personal payee rules, then anonymized crowd-sourced patterns, then fuzzy text similarity. Credit card payments, autopay entries, and inter-account transfers are detected automatically and surfaced for exclusion rather than cluttering the budget. Live column-mapping preview shows the first transaction before committing.

### Smart payee learning
Every manual assignment teaches the app. Personal rules take priority over global patterns. Global patterns are contributed anonymously — merchant name and category only, no user ID — and improve matching accuracy for all users over time.

### Budget vs. actual tracking
After importing a statement, users apply matched transactions to their budget with one click. Actuals update atomically across all affected line items. Unmatched transactions surface with the dollar total outstanding so nothing slips through.

### Savings goals
Track short-term and long-term savings goals with target amounts, monthly contributions, current progress, and target dates. Progress bars and months-remaining calculations update automatically.

### Account management
Full data export as a ZIP of CSVs. Account deletion removing all data atomically including the auth record. Budget soft reset wiping all financial data and returning to onboarding while keeping bank account column mappings. Clear month import deleting current month's transactions and resetting actuals without touching budget structure.

---

## Project Structure

```
src/
  components/
    layout/
      Nav.jsx                  — sticky nav with tab bar and user avatar dropdown
    ui/
      BudgetTable.jsx          — desktop table + mobile card view for income/expense rows
      CategoryBadge.jsx        — category color chip with popover picker
      PaymentMethodBadge.jsx   — bank account assignment badge
      PopoverPortal.jsx        — createPortal-based popover, escapes table overflow
      EditableCell.jsx         — click-to-edit inline cell
      GroupedExpenseSelect.jsx — select with optgroup for category-grouped assignment
      FlagBadge.jsx            — over-budget warning chip from period rollover
      TransferPanel.jsx        — collapsible panel for detected credit card payments
      ClearMonthModal.jsx      — two-click confirmation modal for clearing an import
      PeriodSelector.jsx       — MonthSelector and YearSelector navigation components
    wizard/
      WizardCsvStep.jsx        — multi-bank CSV upload staging
      WizardIncomeStep.jsx     — income identification with transfer auto-detection
      WizardExpenseStep.jsx    — payee categorization with 4-column chip palette
      WizardBudgetStep.jsx     — savings slider + per-category budget overrides
      StepTrack.jsx            — full-width wizard step indicator
  hooks/
    useAuth.js                 — Supabase auth state and helpers
    useBudget.js               — income/expense template data + period-aware merge
    useTransactions.js         — transaction CRUD + bank account management
    useGoals.js                — savings goals CRUD
    usePeriods.js              — period state, rollover, month/year navigation
    usePayeeRules.js           — personal payee rule management and learning
    useGlobalPatterns.js       — anonymized global pattern read and contribute
    useReset.js                — clearMonth + softReset shared logic
  lib/
    supabase.js                — Supabase client
    seed.js                    — seedCategories, seedFallbackBudget, seedFromTransactions
    seedData.js                — 18 category definitions, fallback expense rows
    csvParser.js               — CSV parsing, header detection, transaction extraction
    fuzzyMatch.js              — text similarity matching + pattern normalization
    transactionAnalysis.js     — groupByPayee, tagLikelyIncome, collapseToCategories,
                                  calculateBudgets, estimateMonths, randomCategoryColor
    transferDetection.js       — ~30 credit card payment / transfer detection patterns
    exportUtils.js             — toCSV, downloadFile, downloadZip via JSZip
    format.js                  — currency formatting
    goalSeedData.js            — 5 sample savings goals
  pages/
    Login.jsx                  — sign in
    Register.jsx               — create account
    Onboarding.jsx             — 6-step setup wizard
    AppShell.jsx               — top-level shell with tab routing
    Dashboard.jsx              — summary cards, category bars, savings goals progress
    IncomePage.jsx             — income items with period selector
    MonthlyPage.jsx            — monthly expenses with period selector
    AnnualPage.jsx             — yearly subscriptions with year selector
    GoalsPage.jsx              — savings goals card grid
    CategoriesPage.jsx         — category editor (system categories read-only)
    ReconcilePage.jsx          — CSV import wizard + recent transactions
    PayeesPage.jsx             — payee aggregation across all transactions
    SettingsPage.jsx           — export, reset, account deletion
```

---

## Database Schema

### Core tables

```
categories          id, user_id, name, color, description, enabled, is_system, sort_order
income_items        id, user_id, label, note, bank_account_id, enabled, sort_order
expense_items       id, user_id, label, category_id, note, frequency, bank_account_id, enabled, sort_order
bank_accounts       id, user_id, name, col_date, col_desc, col_amount, amount_sign
transactions        id, user_id, bank_account_id, date, description, amount,
                    matched_expense_id, matched_source, applied, ignored
payee_rules         id, user_id, pattern, expense_item_id, hit_count
global_payee_patterns  pattern, category_name, hit_count  (no user_id)
savings_goals       id, user_id, name, type, target, saved, monthly, target_date, sort_order
budget_periods      id, user_id, period_type, period_start, created_at
period_items        id, period_id, user_id, item_id, item_type, budgeted, actual,
                    flagged, flag_variance, created_at
```

### RPC functions (all SECURITY DEFINER, auth.uid() validated)

| Function | Description |
|---|---|
| `get_or_create_period(user_id, period_type, period_start)` | Auto-rolls periods forward, carries budgeted amounts, flags rows over 15% variance |
| `ensure_period_item(user_id, item_id, item_type, frequency)` | Creates a period_items row for a newly-added item mid-period |
| `apply_transactions_to_budget(user_id)` | Sums matched transactions into current period_items actuals, marks transactions applied |
| `contribute_payee_pattern(pattern, category_name)` | Anonymous global pattern contribution, upserts hit count |
| `delete_user_account(user_id)` | Deletes all user data and auth record atomically |
| `clear_month_import(user_id, month_start)` | Deletes month's transactions, resets period_items actuals to 0 |
| `soft_reset_budget(user_id)` | Wipes all financial data, keeps bank_accounts and auth |

### Export views

`export_transactions`, `export_budget`, `export_goals`, `export_categories` — human-readable joins used by the data export feature. RLS on underlying tables ensures each view returns only the calling user's data.

---

## Deployment

### Prerequisites

- Node.js 18+
- Supabase project (free tier is sufficient)
- Vercel account linked to the GitHub repo

### Environment variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Set both in Vercel → Project Settings → Environment Variables.

### vercel.json (required)

Without this file, direct URL navigation and page refreshes return 404:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Database setup

Run each SQL migration in order in Supabase → SQL Editor:

1. Core schema — tables, RLS policies, grants
2. `supabase-migration-budget-periods.sql`
3. `supabase-migration-apply-to-period.sql`
4. `supabase-migration-account-management.sql`
5. `supabase-migration-transfer-category.sql`
6. `supabase-migration-reset-functions.sql`

### Deploy

```bash
git add .
git commit -m "initial deploy"
git push
```

Vercel detects the push and deploys automatically.

---

## Key architectural decisions

**Income and expense items are templates, not data.** The `income_items` and `expense_items` tables store labels, categories, bank accounts, and enabled state. Budgeted and actual amounts live in `period_items`, one row per item per period. This lets the budget evolve month to month without losing history, and lets the same item appear in multiple periods with different numbers.

**Period rollover is lazy.** New periods are created on the first app load of a new calendar month, not via a scheduled server job. If a user doesn't log in during a month, that month is silently skipped — the next active period carries forward from the last one. This is acceptable for a personal finance tool. Users who want strict month-by-month history should log in at least once per month. A pg_cron pre-creation job is on the roadmap.

**Popovers use React portals.** Category and payment method badge pickers are rendered via `createPortal()` to `document.body`. The budget table rows use `overflow: hidden`, which would clip any absolutely-positioned child — portals bypass this entirely.

**Global payee patterns are anonymized by design.** The `global_payee_patterns` table has no `user_id` column. The contribution function is SECURITY DEFINER and strips all identity before upserting. No individual user's assignments can ever be reconstructed from this table.

**Transfer detection is heuristic, not deterministic.** The pattern list in `transferDetection.js` catches around 80% of credit card payments and inter-account transfers from common US banks. False positives are handled by the user in the TransferPanel UI. Nothing is silently discarded — every transaction is accounted for as either imported, excluded (ignored: true), or unmatched.

---

## Privacy and compliance

- Privacy Policy lives at `/privacy`
- Terms of Service lives at `/terms`
- Supabase and Vercel Data Processing Agreements must be signed before accepting real users (10 minutes each, free)
- GDPR Article 17 (right to erasure) — account deletion implemented
- GDPR Article 20 (right to portability) — data export implemented
- Global payee pattern contributions are disclosed in the Privacy Policy and in Settings
- Payee pattern opt-out: email `privacy@[your-domain.com]` — UI toggle planned for v1.1

---

## Known limitations in v1.0

**No bank sync.** Import is CSV only. Plaid or similar direct bank connection is a post-1.0 roadmap item.

**Single user per account.** Joint household budgeting with multiple logins sharing one budget is not implemented. Workaround: share login credentials.

**iOS grouped dropdowns.** The native `<select>` with `<optgroup>` used for unmatched transaction assignment renders as an iOS wheel picker. Grouping is present but visually less clear than on desktop.

**Period rollover is login-triggered.** See architectural decisions. Gap months are skipped silently rather than backfilled.

**15% variance flag threshold is hardcoded.** Change it by editing the `v_variance_pct > 15` condition in the `get_or_create_period()` Postgres function.

**Payee pattern opt-out has no UI.** Users must contact support. Toggle planned for v1.1.

---

## Roadmap (post-1.0)

- Plaid bank connection (automatic import, no CSV required)
- Joint household / multi-user support with separate logins
- Mobile apps (iOS and Android via React Native)
- Month-over-month trend charts per category
- Budget templates by household type
- Recurring transaction detection and payment reminders
- Payee pattern opt-out toggle in Settings
- pg_cron server-side period pre-creation (login-independent rollover)
- EU data residency option (Supabase EU region)
