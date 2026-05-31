# Budget App

A multi-tenant personal budgeting app built with React + Vite + Supabase.

## Stack

- **Frontend:** React 18, React Router 6, Vite
- **Backend/Auth/DB:** Supabase (Postgres + Auth + RLS)
- **Hosting:** Vercel (recommended)

---

## Setup

### 1. Supabase project

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New query**, paste the contents of `supabase-schema.sql`, and run it
3. Go to **Settings → API** and copy your **Project URL** and **anon public** key

### 2. Local environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Install and run

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`.

---

## Supabase Auth settings

In your Supabase dashboard → **Authentication → Settings**:

- **Email confirmations:** Enable (recommended for production)
- **Site URL:** `http://localhost:5173` for dev; your Vercel URL for production
- **Redirect URLs:** Add your production URL

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add environment variables in the Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Project structure

```
src/
  components/
    layout/       Nav, ProtectedRoute
    ui/           EditableCell, CategoryBadge, BudgetTable
  hooks/          useAuth, useBudget, useTransactions
  lib/            supabase, seed, seedData, csvParser, fuzzyMatch, format
  pages/          Login, Signup, Onboarding, AppShell
                  Dashboard, IncomePage, MonthlyPage, AnnualPage
                  CategoriesPage, ReconcilePage, PayeesPage
  styles/         global.css
```

---

## What's built

- ✅ Auth (signup, login, email confirmation)
- ✅ Protected routes + first-login onboarding
- ✅ Default budget data seeded on signup
- ✅ Dashboard with summary cards + category progress bars
- ✅ Income, Monthly, Annual expense tables with inline editing
- ✅ Category manager with color picker
- ✅ Multi-bank CSV import with column mapping (saved per bank)
- ✅ Fuzzy transaction matching to budget items
- ✅ Payees page aggregating debit history
- ✅ Mobile-responsive throughout

## Coming next (Phase 2)

- [ ] Plaid bank connections for automatic transaction download
- [ ] Learned payee rules (auto-categorize on import)
- [ ] Month selector (track actuals per month)
- [ ] Export to CSV / PDF
