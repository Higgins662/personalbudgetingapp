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
  // Group expense items by category_id, with an "Uncategorized" fallback.
  // Also build a name-based fallback map in case category_id points to a
  // duplicate row that was removed by dedup (id mismatch but same name).
  const catById   = Object.fromEntries((categories ?? []).map(c => [c.id,   c]))
  const catByName = Object.fromEntries((categories ?? []).map(c => [c.name, c]))

  const groups = {}
  for (const exp of allExpenses) {
    const cat = catById[exp.category_id] ?? catByName[exp.category_name] ?? null
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

  // If every group has exactly one item and its label matches the group name,
  // skip the optgroup wrapper — it just looks like a duplicated parent/child.
  const useFlat = sortedGroups.every(([name, g]) =>
    g.items.length === 1 && g.items[0].label === name
  )

  return (
    <select
      className="cell-select grouped-expense-select"
      value={value}
      onChange={e => e.target.value && onChange(e.target.value)}
    >
      <option value="" disabled>{placeholder}</option>
      {useFlat
        ? sortedGroups.map(([groupName, group]) => {
            const exp = group.items[0]
            return (
              <option key={exp.id} value={exp.id}>
                {groupName}{exp.frequency === 'annual' ? ' (yearly)' : ''}
              </option>
            )
          })
        : sortedGroups.map(([groupName, group]) => (
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
          ))
      }
    </select>
  )
}
