/**
 * Sample savings goals seeded for every new user (or via the
 * "Add sample goals" button if they've deleted all of theirs).
 * Ported verbatim from budget_wizard.html.
 */
export const DEFAULT_GOALS = [
  { name: 'Emergency Fund',   target: 10000, saved: 0, monthly: 300, target_date: 'Dec 2026', type: 'Short-Term', sort_order: 0 },
  { name: 'Vacation Fund',    target: 3000,  saved: 0, monthly: 150, target_date: 'Jun 2026', type: 'Short-Term', sort_order: 1 },
  { name: 'Home Renovation',  target: 15000, saved: 0, monthly: 200, target_date: 'Dec 2027', type: 'Long-Term',  sort_order: 2 },
  { name: 'College Savings',  target: 50000, saved: 0, monthly: 250, target_date: 'Dec 2035', type: 'Long-Term',  sort_order: 3 },
  { name: 'New Vehicle',      target: 30000, saved: 0, monthly: 200, target_date: 'Dec 2028', type: 'Long-Term',  sort_order: 4 },
]
