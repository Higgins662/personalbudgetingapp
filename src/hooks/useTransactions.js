import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useTransactions() {
  const { user } = useAuth()

  const [bankAccounts,  setBankAccounts]  = useState([])
  const [transactions,  setTransactions]  = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [baRes, txRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }),
    ])
    const err = baRes.error || txRes.error
    if (err) { setError(err.message); setLoading(false); return }
    setBankAccounts(baRes.data ?? [])
    setTransactions(txRes.data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // ── Bank accounts ──────────────────────────────────────────────────────────
  async function addBankAccount(row) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert({ ...row, user_id: user.id })
      .select().single()
    if (!error) setBankAccounts(prev => [...prev, data])
    return { data, error }
  }

  async function updateBankAccount(id, fields) {
    setBankAccounts(prev => prev.map(b => b.id === id ? { ...b, ...fields } : b))
    const { error } = await supabase.from('bank_accounts').update(fields).eq('id', id)
    if (error) load()
    return { error }
  }

  async function deleteBankAccount(id) {
    setBankAccounts(prev => prev.filter(b => b.id !== id))
    // Cascade deletes transactions via DB FK or delete manually
    await supabase.from('transactions').delete().eq('bank_account_id', id)
    await supabase.from('bank_accounts').delete().eq('id', id)
  }

  // ── Transactions ───────────────────────────────────────────────────────────
  async function insertTransactions(rows) {
    const tagged = rows.map(r => ({ ...r, user_id: user.id }))
    const BATCH_SIZE = 500
    const allData = []
    for (let i = 0; i < tagged.length; i += BATCH_SIZE) {
      const batch = tagged.slice(i, i + BATCH_SIZE)
      const { data, error } = await supabase
        .from('transactions')
        .insert(batch)
        .select()
      if (error) return { data: null, error }
      allData.push(...(data ?? []))
    }
    setTransactions(prev => [...allData, ...prev])
    return { data: allData, error: null }
  }

  async function updateTransaction(id, fields) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t))
    const { error } = await supabase.from('transactions').update(fields).eq('id', id)
    if (error) load()
    return { error }
  }

  async function deleteTransaction(id) {
    setTransactions(prev => prev.filter(t => t.id !== id))
    await supabase.from('transactions').delete().eq('id', id)
  }

  // ── Payee aggregation ──────────────────────────────────────────────────────
  function getPayees() {
    const map = {}
    for (const tx of transactions) {
      if (tx.amount >= 0 || tx.ignored) continue // only debits
      const key = tx.description?.trim().toUpperCase() ?? 'UNKNOWN'
      if (!map[key]) map[key] = { description: tx.description, total: 0, count: 0, matched: 0 }
      map[key].total  += Math.abs(tx.amount)
      map[key].count  += 1
      if (tx.matched_expense_id) map[key].matched += 1
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }

  return {
    bankAccounts, transactions,
    loading, error, reload: load,
    addBankAccount, updateBankAccount, deleteBankAccount,
    insertTransactions, updateTransaction, deleteTransaction,
    getPayees,
  }
}
