/**
 * Default seed data.
 *
 * Categories are always seeded (18 total — 17 budget + 1 system).
 * Income/expense rows are only seeded as a fallback for users who skip
 * the CSV upload during onboarding — all amounts start at 0.
 */

export const DEFAULT_CATEGORIES = [
  { name: 'Mortgage/Rent',                  color: '#1a6b3a', description: 'Mortgage, rent, HOA fees',              enabled: true,  is_system: false, sort_order: 0  },
  { name: 'Fuel/Gas',                color: '#1a3a6b', description: 'Gas, fuel, tolls, parking',              enabled: true,  is_system: false, sort_order: 1  },
  { name: 'Food & Groceries',         color: '#b8860b', description: 'Supermarket & grocery spending',   enabled: true,  is_system: false, sort_order: 2  },
  { name: 'Dining & Restaurants',     color: '#c0530a', description: 'Eating out, coffee, takeout',      enabled: true,  is_system: false, sort_order: 3  },
  { name: 'Utilities',                color: '#4a1a6b', description: 'Electric, water, gas, internet',   enabled: true,  is_system: false, sort_order: 4  },
  { name: 'Health/Medical',                   color: '#8b1a1a', description: 'Doctor, prescriptions, gym, dental',     enabled: true,  is_system: false, sort_order: 5  },
  { name: 'Insurance',                color: '#5a3a0a', description: 'Car, home, life insurance',        enabled: true,  is_system: false, sort_order: 6  },
  { name: 'Streaming Services',       color: '#0f4a6b', description: 'Netflix, Spotify, Disney+, etc.',  enabled: true,  is_system: false, sort_order: 7  },
  { name: 'Subscriptions/Memberships',color: '#0f7090', description: 'Software, clubs, Amazon Prime',   enabled: true,  is_system: false, sort_order: 8  },
  { name: 'Personal Care',            color: '#6b4a1a', description: 'Clothing, haircuts, cosmetics',    enabled: true,  is_system: false, sort_order: 9  },
  { name: 'Home Maintenance',         color: '#3a6b1a', description: 'Repairs, lawn, cleaning, HOA',    enabled: true,  is_system: false, sort_order: 10 },
  { name: 'Entertainment',            color: '#6b1a5a', description: 'Movies, concerts, games, sports',  enabled: true,  is_system: false, sort_order: 11 },
  { name: 'Travel',                   color: '#1a5a6b', description: 'Flights, hotels, Airbnb',          enabled: true,  is_system: false, sort_order: 12 },
  { name: 'Gifts & Donations',        color: '#6b1a1a', description: 'Gifts, charity, tithing',         enabled: true,  is_system: false, sort_order: 13 },
  { name: 'Pet Expenses',             color: '#4a6b1a', description: 'Vet, food, grooming, supplies',    enabled: true,  is_system: false, sort_order: 14 },
  { name: 'Savings',                  color: '#2d6b1a', description: 'Emergency fund, retirement',       enabled: true,  is_system: false, sort_order: 15 },
  { name: 'Other/Unplanned',                    color: '#4a4a4a', description: 'Unplanned or miscellaneous expenses',                    enabled: true,  is_system: false, sort_order: 16 },
  { name: 'Clothing',            color: '#c06090', description: 'Clothing, shoes, accessories',         enabled: true,  is_system: false, sort_order: 17 },
  { name: 'Home Furnishings',    color: '#8b6914', description: 'Furniture, decor, appliances',            enabled: true,  is_system: false, sort_order: 18 },
  { name: 'Vehicle Payments',    color: '#2a5a8a', description: 'Car loan, lease payments',                enabled: true,  is_system: false, sort_order: 19 },
  { name: 'Vehicle Maintenance',       color: '#5a7a2a', description: 'Repairs, tires, oil changes, car wash',   enabled: true,  is_system: false, sort_order: 20 },
  { name: 'Vehicle Taxes/Registration', color: '#3a6a9a', description: 'Registration fees, property tax, tags', enabled: true,  is_system: false, sort_order: 21 },
  // System category — excluded from all budget calculations
  { name: 'Transfers & Payments',     color: '#888888', description: 'Credit card payments, loan payments, inter-account transfers. Excluded from budget totals.', enabled: false, is_system: true, sort_order: 999 },
]

export const DEFAULT_INCOME = [
  { label: 'Primary Income', budgeted: 0, actual: 0, note: '', sort_order: 0 },
  { label: 'Other Income',   budgeted: 0, actual: 0, note: '', sort_order: 1 },
]

export const DEFAULT_MONTHLY_EXPENSES = [
  { label: 'Mortgage/Rent',                  budgeted: 0, actual: 0, note: '', category_name: 'Mortgage/Rent',                  sort_order: 0  },
  { label: 'Fuel/Gas',           budgeted: 0, actual: 0, note: '', category_name: 'Fuel/Gas',                sort_order: 1  },
  { label: 'Food & Groceries',         budgeted: 0, actual: 0, note: '', category_name: 'Food & Groceries',         sort_order: 2  },
  { label: 'Dining & Restaurants',     budgeted: 0, actual: 0, note: '', category_name: 'Dining & Restaurants',     sort_order: 3  },
  { label: 'Utilities',                budgeted: 0, actual: 0, note: '', category_name: 'Utilities',                sort_order: 4  },
  { label: 'Health/Medical',                   budgeted: 0, actual: 0, note: '', category_name: 'Health/Medical',                   sort_order: 5  },
  { label: 'Insurance',                budgeted: 0, actual: 0, note: '', category_name: 'Insurance',                sort_order: 6  },
  { label: 'Streaming Services',       budgeted: 0, actual: 0, note: '', category_name: 'Streaming Services',       sort_order: 7  },
  { label: 'Subscriptions/Memberships',budgeted: 0, actual: 0, note: '', category_name: 'Subscriptions/Memberships',sort_order: 8  },
  { label: 'Personal Care',            budgeted: 0, actual: 0, note: '', category_name: 'Personal Care',            sort_order: 9  },
  { label: 'Home Maintenance',         budgeted: 0, actual: 0, note: '', category_name: 'Home Maintenance',         sort_order: 10 },
  { label: 'Entertainment',            budgeted: 0, actual: 0, note: '', category_name: 'Entertainment',            sort_order: 11 },
  { label: 'Travel',                   budgeted: 0, actual: 0, note: '', category_name: 'Travel',                   sort_order: 12 },
  { label: 'Gifts & Donations',        budgeted: 0, actual: 0, note: '', category_name: 'Gifts & Donations',        sort_order: 13 },
  { label: 'Pet Expenses',             budgeted: 0, actual: 0, note: '', category_name: 'Pet Expenses',             sort_order: 14 },
  { label: 'Savings',                  budgeted: 0, actual: 0, note: '', category_name: 'Savings',                  sort_order: 15 },
  { label: 'Other/Unplanned',                    budgeted: 0, actual: 0, note: '', category_name: 'Other/Unplanned',                    sort_order: 16 },
]

export const DEFAULT_ANNUAL_EXPENSES = []
