/**
 * GroupedExpenseSelect
 *
 * A <select> listing one flat option per category, for categories that have
 * a monthly item to serve as a safe default target. Yearly subscriptions
 * each get their own dedicated expense_item behind the scenes (see
 * annualConversion.js), but that's an implementation detail for tracking,
 * not something the user should have to pick between here: assign a
 * transaction to a category, then use the separate "Yearly" checkbox if it
 * should be tracked as its own annual line.
 *
 * If a category has been promoted to all-annual — every item in it is a
 * yearly line, nothing monthly left — there's no safe single target to
 * collapse to, so that category's items are listed individually instead
 * under an optgroup. Picking an arbitrary annual item as "the category"
 * would silently misfile unrelated transactions onto it (and burn that
 * wrong mapping into a learned rule via learnRule) — this is worse than a
 * longer list, so we only collapse when it's actually safe to.
 *
 * Selecting a category always targets that category's monthly item. If the
 * transaction is currently matched to one of the category's annual items,
 * the select still shows that category as selected (so re-picking the same
 * category is a no-op instead of silently blanking out) — except in the
 * all-annual case, where the specific matched item is shown selected.
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

  // The id to select when the user picks this category — the monthly
  // (non-annual) item, since that's the category's canonical line. Only
  // set when one actually exists; all-annual categories fan out instead.
  const repIdByGroup = {}
  // Maps every item id (monthly or annual) back to its group's rep id, so an
  // annual match still shows its parent category as selected — except for
  // all-annual groups, where each item maps to itself.
  const repIdByItemId = {}
  for (const [groupName, group] of sortedGroups) {
    const monthlyItem = group.items.find(exp => exp.frequency !== 'annual')
    if (monthlyItem) {
      repIdByGroup[groupName] = monthlyItem.id
      for (const exp of group.items) repIdByItemId[exp.id] = monthlyItem.id
    } else {
      for (const exp of group.items) repIdByItemId[exp.id] = exp.id
    }
  }

  const displayValue = repIdByItemId[value] ?? value

  return (
    <select
      className="cell-select grouped-expense-select"
      value={displayValue}
      onChange={e => e.target.value && onChange(e.target.value)}
    >
      <option value="" disabled>{placeholder}</option>
      {sortedGroups.map(([groupName, group]) => {
        const hasMonthlyItem = groupName in repIdByGroup
        if (hasMonthlyItem) {
          return (
            <option key={groupName} value={repIdByGroup[groupName]}>
              {groupName}
            </option>
          )
        }
        const sorted = [...group.items].sort((a, b) => a.label.localeCompare(b.label))
        return (
          <optgroup key={groupName} label={groupName}>
            {sorted.map(exp => (
              <option key={exp.id} value={exp.id}>{exp.label} (yearly)</option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
