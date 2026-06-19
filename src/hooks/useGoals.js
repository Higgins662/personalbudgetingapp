import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { seedSampleGoals } from '../lib/seed'

export function useGoals() {
  const { user } = useAuth()

  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')

    if (error) { setError(error.message); setLoading(false); return }
    setGoals(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function updateGoal(id, field, value) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g))
    const { error } = await supabase.from('savings_goals').update({ [field]: value }).eq('id', id)
    if (error) load()
    return { error }
  }

  async function addGoal(row) {
    const newRow = {
      name: '', type: 'Short-Term', target: 0, saved: 0, monthly: 0, target_date: '',
      ...row,
      user_id: user.id,
      sort_order: goals.length,
    }
    const { data, error } = await supabase.from('savings_goals').insert(newRow).select().single()
    if (!error) setGoals(prev => [...prev, data])
    return { data, error }
  }

  async function deleteGoal(id) {
    setGoals(prev => prev.filter(g => g.id !== id))
    await supabase.from('savings_goals').delete().eq('id', id)
  }

  /** Repopulate the 5 sample goals — useful if the user cleared all of theirs */
  async function addSampleGoals() {
    const { error } = await seedSampleGoals(user.id)
    if (!error) load()
    return { error }
  }

  const totalMonthly = goals.reduce((s, g) => s + (g.monthly || 0), 0)
  const totalSaved   = goals.reduce((s, g) => s + (g.saved   || 0), 0)
  const totalTarget  = goals.reduce((s, g) => s + (g.target  || 0), 0)

  return {
    goals, loading, error, reload: load,
    updateGoal, addGoal, deleteGoal, addSampleGoals,
    totals: { totalMonthly, totalSaved, totalTarget },
  }
}
