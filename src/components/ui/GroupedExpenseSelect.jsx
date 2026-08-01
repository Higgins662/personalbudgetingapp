/**
 * GroupedExpenseSelect
 *
 * A <select> listing one flat option per category — never per payee.
 * Yearly subscriptions each get their own dedicated expense_item behind the
 * scenes (see annualConversion.js), but that's an implementation detail for
 * tracking, not something the user should have to pick between here: assign
 * a transaction to a category, then use the separate "Yearly" checkbox if it
 * should be tracked as its own annual line.
 *
 * Selecting a category always targets that category's monthly item. If the
 * transaction is currently matched to one of the category's annual items,
 * the select still shows that category as selected (so re-picking the same
 * category is a no-op instead of silently blanking out).
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

  // The id to select when the user picks this category — prefer the
  // monthly (non-annual) item, since that's the category's canonical line.
  // Falls back to the first item if a category somehow has only annual ones.
  const repIdByGroup = {}
  // Maps every item id (monthly or annual) back to its group's rep id, so an
  // annual match still shows its parent category as selected.
  const repIdByItemId = {}
  for (const [groupName, group] of sortedGroups) {
    const monthlyItem = group.items.find(exp => exp.frequency !== 'annual')
    const repId = monthlyItem?.id ?? group.items[0]?.id ?? ''
    repIdByGroup[groupName] = repId
    for (const exp of group.items) repIdByItemId[exp.id] = repId
  }

  const displayValue = repIdByItemId[value] ?? value

  return (
    <select
      className="cell-select grouped-expense-select"
      value={displayValue}
      onChange={e => e.target.value && onChange(e.target.value)}
    >
      <option value="" disabled>{placeholder}</option>
      {sortedGroups.map(([groupName]) => (
        <option key={groupName} value={repIdByGroup[groupName]}>
          {groupName}
        </option>
      ))}
    </select>
  )
}
