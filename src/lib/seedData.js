/**
 * Default budget data seeded for every new user.
 * Mirrors the hardcoded data in the original HTML.
 * user_id is injected at seed time.
 */

export const DEFAULT_CATEGORIES = [
  { name: 'Housing',       color: '#1a6b3a', description: 'Rent, mortgage, HOA', enabled: true, sort_order: 0 },
  { name: 'Transport',     color: '#1a3a6b', description: 'Car, gas, insurance',  enabled: true, sort_order: 1 },
  { name: 'Food',          color: '#b8860b', description: 'Groceries & dining',   enabled: true, sort_order: 2 },
  { name: 'Utilities',     color: '#4a1a6b', description: 'Electric, water, gas', enabled: true, sort_order: 3 },
  { name: 'Health',        color: '#8b1a1a', description: 'Insurance, meds, gym', enabled: true, sort_order: 4 },
  { name: 'Subscriptions', color: '#0f7090', description: 'Streaming, software',  enabled: true, sort_order: 5 },
  { name: 'Personal',      color: '#6b4a1a', description: 'Clothing, haircuts',   enabled: true, sort_order: 6 },
  { name: 'Savings',       color: '#2d6b1a', description: 'Emergency, retirement',enabled: true, sort_order: 7 },
  { name: 'Other',         color: '#4a4a4a', description: 'Miscellaneous',        enabled: true, sort_order: 8 },
]

export const DEFAULT_INCOME = [
  { label: 'Primary Salary',  budgeted: 5000, actual: 0, note: '', sort_order: 0 },
  { label: 'Side Income',     budgeted: 500,  actual: 0, note: '', sort_order: 1 },
]

export const DEFAULT_MONTHLY_EXPENSES = [
  { label: 'Rent / Mortgage', budgeted: 1500, actual: 0, note: '', category_name: 'Housing',       sort_order: 0 },
  { label: 'Groceries',       budgeted: 400,  actual: 0, note: '', category_name: 'Food',          sort_order: 1 },
  { label: 'Electricity',     budgeted: 120,  actual: 0, note: '', category_name: 'Utilities',     sort_order: 2 },
  { label: 'Internet',        budgeted: 60,   actual: 0, note: '', category_name: 'Utilities',     sort_order: 3 },
  { label: 'Car Payment',     budgeted: 350,  actual: 0, note: '', category_name: 'Transport',     sort_order: 4 },
  { label: 'Gas',             budgeted: 100,  actual: 0, note: '', category_name: 'Transport',     sort_order: 5 },
  { label: 'Car Insurance',   budgeted: 120,  actual: 0, note: '', category_name: 'Transport',     sort_order: 6 },
  { label: 'Health Insurance',budgeted: 200,  actual: 0, note: '', category_name: 'Health',        sort_order: 7 },
  { label: 'Netflix',         budgeted: 16,   actual: 0, note: '', category_name: 'Subscriptions', sort_order: 8 },
  { label: 'Spotify',         budgeted: 10,   actual: 0, note: '', category_name: 'Subscriptions', sort_order: 9 },
  { label: 'Dining Out',      budgeted: 200,  actual: 0, note: '', category_name: 'Food',          sort_order: 10 },
  { label: 'Personal Care',   budgeted: 80,   actual: 0, note: '', category_name: 'Personal',      sort_order: 11 },
  { label: 'Emergency Fund',  budgeted: 200,  actual: 0, note: '', category_name: 'Savings',       sort_order: 12 },
]

export const DEFAULT_ANNUAL_EXPENSES = [
  { label: 'Car Registration', budgeted: 200,  actual: 0, note: '', category_name: 'Transport', sort_order: 0 },
  { label: 'Amazon Prime',     budgeted: 139,  actual: 0, note: '', category_name: 'Subscriptions', sort_order: 1 },
  { label: 'Domain / Hosting', budgeted: 100,  actual: 0, note: '', category_name: 'Subscriptions', sort_order: 2 },
  { label: 'Holiday Gifts',    budgeted: 500,  actual: 0, note: '', category_name: 'Personal',   sort_order: 3 },
  { label: 'Clothing',         budgeted: 600,  actual: 0, note: '', category_name: 'Personal',   sort_order: 4 },
]
