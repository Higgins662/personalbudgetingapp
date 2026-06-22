import { useState } from 'react'
import EditableCell from '../components/ui/EditableCell'
import './CategoriesPage.css'

const PRESET_COLORS = [
  '#1a6b3a','#1a3a6b','#b8860b','#4a1a6b',
  '#8b1a1a','#0f7090','#6b4a1a','#2d6b1a',
  '#4a4a4a','#c0392b','#2980b9','#8e44ad',
  '#16a085','#d35400','#27ae60','#2c3e50',
]

export default function CategoriesPage({ budget }) {
  const { categories, updateCategory, addCategory, deleteCategory, loading } = budget

  const [showAdd,  setShowAdd]  = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newDesc,  setNewDesc]  = useState('')

  if (loading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  async function handleAdd() {
    if (!newName.trim()) return
    await addCategory({ name: newName.trim(), color: newColor, description: newDesc.trim(), enabled: true })
    setNewName(''); setNewDesc(''); setNewColor(PRESET_COLORS[0]); setShowAdd(false)
  }

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Categories &amp; Colors</span>
        <span className="sec-hint">Color-code your expenses</span>
      </div>

      <div className="cat-page-grid">
        {categories.map(cat => (
          <div key={cat.id} className="cat-card card">
            <div className="cat-card-top">
              {/* Color swatch — clicking opens native color picker */}
              <label className="color-swatch" style={{ background: cat.color }} title="Change color">
                <input
                  type="color"
                  value={cat.color}
                  onChange={e => updateCategory(cat.id, 'color', e.target.value)}
                  className="color-input"
                />
              </label>

              <div className="cat-card-body">
                <EditableCell
                  value={cat.name}
                  onSave={v => updateCategory(cat.id, 'name', v)}
                  className="cat-card-name"
                />
                <EditableCell
                  value={cat.description || ''}
                  onSave={v => updateCategory(cat.id, 'description', v)}
                  className="cat-card-desc"
                />
              </div>

              <div className="cat-card-actions">
                <button
                  className="del-btn"
                  onClick={() => deleteCategory(cat.id)}
                  title="Delete category"
                >×</button>
              </div>
            </div>
          </div>
        ))}

        {!showAdd && (
          <button className="cat-add-card" onClick={() => setShowAdd(true)}>
            <span className="cat-add-icon">+</span>
            <span>Add category</span>
          </button>
        )}
      </div>

      {showAdd && (
        <div className="add-form fadein" style={{ marginTop: '1.5rem' }}>
          <div className="fgrid">
            <div className="fg">
              <label>Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Entertainment"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="fg">
              <label>Description</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="fg" style={{ marginBottom: '.75rem' }}>
            <label>Color</label>
            <div className="color-presets">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={`color-preset${newColor === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
              <label className="color-custom" title="Custom color">
                <input
                  type="color"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  className="color-input"
                />
                ✎
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-p" onClick={handleAdd}>Add category</button>
            <button className="btn btn-g" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
