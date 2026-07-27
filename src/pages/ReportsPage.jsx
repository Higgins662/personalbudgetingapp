import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { fmt } from '../lib/format'
import { formatMonthLabel } from '../hooks/usePeriods'
import './ReportsPage.css'

const TREND_MONTHS = 6

/**
 * Reports — the full "good, bad, and ugly" per category.
 * One sortable table for a selected month: budgeted, actual, variance,
 * change vs prior month, and a mini 6-month spending trend.
 */
export default function ReportsPage({ budget, periods }) {
  const { user } = useAuth()
  const { categories, monthly, loading: budgetLoading } = budget

  const [monthData, setMonthData] = useState(null)  // { 'YYYY-MM-01': { item_id: {actual, budgeted} } }
  const [loading,   setLoading]   = useState(true)
  const [sortKey,   setSortKey]   = useState('varAmt') // varAmt | delta | actual | budgeted | name
  const [sortDir,   setSortDir]   = useState('desc')
  const [viewMonth, setViewMonth] = useState(null)

  const availableMonths = periods?.availableMonths ?? []

  // Default to the latest month once periods load
  useEffect(() => {
    if (!viewMonth && availableMonths.length) setViewMonth(availableMonths[0])
  }, [availableMonths, viewMonth])

  // Fetch period_items for all monthly periods in one pass
  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data: allPeriods } = await supabase
        .from('budget_periods')
        .select('id, period_start')
        .eq('user_id', user.id)
        .eq('period_type', 'monthly')
        .order('period_start', { ascending: false })
        .limit(TREND_MONTHS + 1)

      if (!alive) return
      if (!allPeriods?.length) { setMonthData({}); setLoading(false); return }

      const periodIds = allPeriods.map(p => p.id)
      const idToStart = Object.fromEntries(allPeriods.map(p => [p.id, p.period_start]))

      const { data: items } = await supabase
        .from('period_items')
        .select('period_id, item_id, actual, budgeted')
        .in('period_id', periodIds)
        .eq('item_type', 'expense')

      if (!alive) return
      const byMonth = {}
      for (const pi of (items ?? [])) {
        const start = idToStart[pi.period_id]
        if (!byMonth[start]) byMonth[start] = {}
        byMonth[start][pi.item_id] = { actual: pi.actual || 0, budgeted: pi.budgeted || 0 }
      }
      setMonthData(byMonth)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [user])

  // Aggregate item-level month data to category level
  const rows = useMemo(() => {
    if (!monthData || !viewMonth) return []
    const itemToCat = Object.fromEntries(monthly.map(i => [i.id, i.category_id]))
    const monthsAsc = Object.keys(monthData).sort() // ascending for trends
    const viewIdx   = monthsAsc.indexOf(viewMonth)
    const prevMonth = viewIdx > 0 ? monthsAsc[viewIdx - 1] : null

    const catAgg = {} // catId → { bud, act, prevAct, trend: {month: act} }
    for (const [month, items] of Object.entries(monthData)) {
      for (const [itemId, vals] of Object.entries(items)) {
        const catId = itemToCat[itemId]
        if (!catId) continue
        if (!catAgg[catId]) catAgg[catId] = { bud: 0, act: 0, prevAct: 0, trend: {} }
        catAgg[catId].trend[month] = (catAgg[catId].trend[month] || 0) + vals.actual
        if (month === viewMonth) {
          catAgg[catId].bud += vals.budgeted
          catAgg[catId].act += vals.actual
        }
        if (prevMonth && month === prevMonth) {
          catAgg[catId].prevAct += vals.actual
        }
      }
    }

    return Object.entries(catAgg)
      .map(([catId, agg]) => {
        const cat = categories.find(c => c.id === catId)
        if (!cat || cat.is_system) return null
        const varAmt = agg.act - agg.bud
        const varPct = agg.bud > 0 ? Math.round((agg.act / agg.bud) * 100) : null
        const delta  = prevMonth != null ? agg.act - agg.prevAct : null
        const trend  = monthsAsc.slice(-TREND_MONTHS).map(m => agg.trend[m] || 0)
        return { cat, bud: agg.bud, act: agg.act, varAmt, varPct, delta, trend }
      })
      .filter(Boolean)
      .filter(r => r.bud > 0 || r.act > 0)
  }, [monthData, viewMonth, monthly, categories])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name':     return dir * a.cat.name.localeCompare(b.cat.name)
        case 'budgeted': return dir * (a.bud - b.bud)
        case 'actual':   return dir * (a.act - b.act)
        case 'delta':    return dir * ((a.delta ?? -Infinity) - (b.delta ?? -Infinity))
        default:         return dir * (a.varAmt - b.varAmt)
      }
    })
  }, [rows, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const arrow = key => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  const totals = useMemo(() => ({
    bud: rows.reduce((s, r) => s + r.bud, 0),
    act: rows.reduce((s, r) => s + r.act, 0),
  }), [rows])

  if (budgetLoading || loading) {
    return <div className="loading-center"><span className="spinner" /> Loading…</div>
  }

  return (
    <div className="fadein">
      <div className="sec-hdr" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
          <span className="sec-title">📊 Reports</span>
          <span className="sec-hint">
            {fmt(totals.act)} spent of {fmt(totals.bud)} budgeted
            {totals.act > totals.bud
              ? ` · ${fmt(totals.act - totals.bud)} over`
              : ` · ${fmt(totals.bud - totals.act)} under`}
          </span>
        </div>
        <select value={viewMonth ?? ''} onChange={e => setViewMonth(e.target.value)}>
          {availableMonths.map(m => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No spending data for this month</div>
          <div className="empty-state-body">Import a statement in Transactions to populate your reports.</div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('name')}>Category{arrow('name')}</th>
                <th className="r sortable" onClick={() => toggleSort('budgeted')}>Budgeted{arrow('budgeted')}</th>
                <th className="r sortable" onClick={() => toggleSort('actual')}>Actual{arrow('actual')}</th>
                <th className="r sortable" onClick={() => toggleSort('varAmt')}>Variance{arrow('varAmt')}</th>
                <th className="r sortable" onClick={() => toggleSort('delta')}>vs Prior{arrow('delta')}</th>
                <th className="r">Trend ({TREND_MONTHS}mo)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.cat.id}>
                  <td>
                    <span className="cat-dot" style={{ background: r.cat.color }} />
                    <span style={{ marginLeft: '.4rem' }}>{r.cat.name}</span>
                  </td>
                  <td className="r mono">{fmt(r.bud)}</td>
                  <td className="r mono">{fmt(r.act)}</td>
                  <td className={`r mono ${r.varAmt > 0 ? 'v-red' : 'v-green'}`}>
                    {r.varAmt > 0 ? '+' : ''}{fmt(r.varAmt)}
                    {r.varPct != null && <span className="rep-pct"> ({r.varPct}%)</span>}
                  </td>
                  <td className={`r mono ${r.delta == null ? '' : r.delta > 0 ? 'v-red' : 'v-green'}`}>
                    {r.delta == null ? '—' : `${r.delta > 0 ? '↑' : r.delta < 0 ? '↓' : ''} ${fmt(Math.abs(r.delta))}`}
                  </td>
                  <td className="r"><TrendSpark values={r.trend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Inline SVG sparkline bars for a category's recent monthly spend */
function TrendSpark({ values }) {
  const W = 90, H = 26, gap = 2
  const max = Math.max(...values, 1)
  const barW = (W - gap * (values.length - 1)) / values.length
  return (
    <svg width={W} height={H} className="trend-spark" aria-hidden>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * (H - 2))
        const isLast = i === values.length - 1
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={H - h}
            width={barW}
            height={h}
            rx="1.5"
            fill={isLast ? 'var(--gold, #b8860b)' : 'var(--border2, #d8d2c4)'}
          />
        )
      })}
    </svg>
  )
}
