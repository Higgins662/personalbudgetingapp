/**
 * GroupedExpenseSelect
 *
 * A <select> that groups expense items by category instead of showing
 * a flat list. Used in the Reconcile preview to assign unmatched
 * transactions — much easier to scan than 20+ items in a flat list.
 *
 * Props:
 *   allExpenses  — [...monthly, ...annual] with category_id
 *   categories   — full category list for grouping labels
 *   value        — currently selected expense item id
 *   onChange     — (expenseItemId) => void
 *   placeholder  — optional string (default "Select budget item…")
 */
export default function GroupedExpenseSelect({
  allExpenses,
  categories,
  value = '',
  onChange,
  placeholder = 'Assign to budget item…',
}) {
  // Group expense items by category_id, with an "Uncategorized" fallback
  const groups = {}
  for (const exp of allExpenses) {
    const cat = categories.find(c => c.id === exp.category_id)
    const key = cat?.name ?? 'Uncategorized'
    if (!groups[key]) groups[key] = { color: cat?.color, items: [] }
    groups[key].items.push(exp)
  }

  // Sort groups by category sort_order, then items alphabetically within
  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    const ai = categories.findIndex(c => c.name === a)
    const bi = categories.findIndex(c => c.name === b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  return (
    <select
      className="cell-select grouped-expense-select"
      value={value}
      onChange={e => e.target.value && onChange(e.target.value)}
    >
      <option value="" disabled>{placeholder}</option>
      {sortedGroups.map(([groupName, group]) => (
        <optgroup key={groupName} label={groupName}>
          {group.items
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(exp => (
              <option key={exp.id} value={exp.id}>
                {exp.label}
                {exp.frequency === 'annual' ? ' (yearly)' : ''}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}
