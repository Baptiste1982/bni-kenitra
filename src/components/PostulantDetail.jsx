import React, { useState, useEffect, useRef } from 'react'
import { upsertPostulant, updatePostulantStatut, archivePostulant, convertPostulantToMembre } from '../lib/bniService'

const STATUT_OPTS = [
  { v:'contacte',      l:'Contacté',      bg:'#E0E7FF', color:'#3730A3' },
  { v:'rdv_planifie',  l:'RDV planifié',  bg:'#FEF3C7', color:'#92400E' },
  { v:'visiteur',      l:'Visiteur',      bg:'#E9D5FF', color:'#6B21A8' },
  { v:'inscrit',       l:'Inscrit',       bg:'#D1FAE5', color:'#065F46' },
  { v:'refuse',        l:'Refusé',        bg:'#FEE2E2', color:'#991B1B' },
  { v:'abandon',       l:'Abandon',       bg:'#F3F4F6', color:'#4B5563' },
]

export default function PostulantDetail({ postulant, groupes = [], onClose, onUpdated }) {
  const [p, setP] = useState(postulant)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(postulant)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)

  useEffect(() => { setP(postulant); setForm(postulant) }, [postulant])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const r = dragRef.current
      if (!r) return
      setPos({ x: r.baseX + (e.clientX - r.startX), y: r.baseY + (e.clientY - r.startY) })
    }
    const onUp = () => { setDragging(false); dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const handleStatut = async (statut) => {
    try {
      const updated = await updatePostulantStatut(p.id, statut)
      setP(updated); setForm(updated)
      onUpdated?.()
    } catch (e) { setError(e.message) }
  }

  const saveEdit = async () => {
    setSaving(true); setError('')
    try {
      const updated = await upsertPostulant(form)
      setP(updated); setForm(updated); setEditing(false)
      onUpdated?.()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const doArchive = async () => {
    if (!confirm(`Archiver ${p.prenom} ${p.nom} ?`)) return
    try { await archivePostulant(p.id); onUpdated?.(); onClose?.() } catch (e) { setError(e.message) }
  }

  const doConvert = async () => {
    const g = groupes.find(g => g.code === p.groupe_code)
    if (!g) { setError('Groupe introuvable'); return }
    if (!confirm(`Créer un membre ${p.prenom} ${p.nom} dans ${g.code} ?`)) return
    setSaving(true); setError('')
    try {
      await convertPostulantToMembre(p, g.id)
      onUpdated?.(); onClose?.()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const currentStatut = STATUT_OPTS.find(s => s.v === p.statut) || STATUT_OPTS[0]

  const mob = window.innerWidth <= 768
  const lbl = { fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4, display:'block' }
  const inp = { width:'100%', padding:'7px 10px', fontSize:13, border:'1px solid #E5E7EB', borderRadius:6, outline:'none', fontFamily:'inherit', background:'#fff' }
  const ro = { fontSize:13.5, color:'#111827', padding:'7px 0', minHeight:32 }

  const Row = ({ label, value, children }) => (
    <div>
      <label style={lbl}>{label}</label>
      {editing ? children : <div style={ro}>{value || '—'}</div>}
    </div>
  )

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(17,24,39,0.5)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding: mob ? 8 : 24 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'#fff', borderRadius:14, width:'100%', maxWidth: 720, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden',
        transform:`translate(${pos.x}px, ${pos.y}px)`,
        transition: dragging ? 'none' : 'transform 0.2s ease',
        boxShadow: dragging ? '0 24px 80px rgba(0,0,0,0.4)' : '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div
          onMouseDown={(e) => {
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('a')) return
            dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y }
            setDragging(true)
          }}
          onDoubleClick={() => setPos({ x: 0, y: 0 })}
          title="Glisser pour déplacer · Double-clic pour recentrer"
          style={{ background:'#1C1C2E', padding:'16px 22px', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, cursor: dragging ? 'grabbing' : 'grab', userSelect:'none' }}>
          <div>
            <div style={{ fontSize: mob ? 16 : 18, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>{p.prenom} {p.nom}</div>
            <div style={{ fontSize:12, opacity:0.7, marginTop:2 }}>{p.profession || 'Postulant'} · {p.groupe_code}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:10, background:currentStatut.bg, color:currentStatut.color }}>{currentStatut.l}</span>
            <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#fff', fontSize:22, cursor:'pointer', lineHeight:1 }}>✕</button>
          </div>
        </div>

        <div style={{ flex:1, overflow:'auto', padding: mob ? 16 : 22 }}>
          {/* Statut selector */}
          <div style={{ marginBottom:18 }}>
            <div style={lbl}>Changer de statut</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {STATUT_OPTS.map(s => (
                <button key={s.v} onClick={() => handleStatut(s.v)} disabled={saving || p.statut === s.v}
                  style={{
                    padding:'6px 12px', fontSize:12, fontWeight:600, borderRadius:16,
                    border: p.statut === s.v ? `2px solid ${s.color}` : '1px solid #E5E7EB',
                    background: p.statut === s.v ? s.bg : '#fff',
                    color: p.statut === s.v ? s.color : '#6B7280',
                    cursor: p.statut === s.v || saving ? 'default' : 'pointer',
                  }}>{s.l}</button>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap:12 }}>
            <Row label="Email" value={p.email}>
              <input value={form.email || ''} onChange={e => set('email', e.target.value)} style={inp} />
            </Row>
            <Row label="Téléphone" value={p.phone}>
              <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} style={inp} />
            </Row>
            <Row label="Profession" value={p.profession}>
              <input value={form.profession || ''} onChange={e => set('profession', e.target.value)} style={inp} />
            </Row>
            <Row label="Catégorie BNI" value={p.categorie}>
              <input value={form.categorie || ''} onChange={e => set('categorie', e.target.value)} style={inp} />
            </Row>
            <Row label="Entreprise" value={p.entreprise}>
              <input value={form.entreprise || ''} onChange={e => set('entreprise', e.target.value)} style={inp} />
            </Row>
            <Row label="Ville" value={p.ville}>
              <input value={form.ville || ''} onChange={e => set('ville', e.target.value)} style={inp} />
            </Row>
            <Row label="Site web" value={p.site_web ? <a href={p.site_web} target="_blank" rel="noopener noreferrer" style={{ color:'#3B82F6' }}>{p.site_web}</a> : null}>
              <input value={form.site_web || ''} onChange={e => set('site_web', e.target.value)} style={inp} />
            </Row>
            <Row label="LinkedIn" value={p.linkedin ? <a href={p.linkedin} target="_blank" rel="noopener noreferrer" style={{ color:'#3B82F6' }}>Profil</a> : null}>
              <input value={form.linkedin || ''} onChange={e => set('linkedin', e.target.value)} style={inp} />
            </Row>
            <div style={{ gridColumn:'1 / -1' }}>
              <Row label="Parrain / Source" value={p.parrain_nom}>
                <input value={form.parrain_nom || ''} onChange={e => set('parrain_nom', e.target.value)} style={inp} />
              </Row>
            </div>
            <div style={{ gridColumn:'1 / -1' }}>
              <Row label="Notes" value={p.notes && <div style={{ whiteSpace:'pre-wrap' }}>{p.notes}</div>}>
                <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3} style={{ ...inp, resize:'vertical' }} />
              </Row>
            </div>
          </div>

          {p.pdf_url && (
            <div style={{ marginTop:18, padding:'12px 14px', background:'#F7F6F3', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>Fiche PDF jointe</div>
                <div style={{ fontSize:11, color:'#6B7280' }}>Stockée dans Supabase Storage</div>
              </div>
              <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" style={{ padding:'7px 14px', background:'#1C1C2E', color:'#fff', borderRadius:8, fontSize:12, fontWeight:600, textDecoration:'none' }}>Ouvrir le PDF</a>
            </div>
          )}

          {error && (
            <div style={{ marginTop:14, padding:'10px 12px', background:'#FEE2E2', color:'#991B1B', borderRadius:8, fontSize:13 }}>{error}</div>
          )}
        </div>

        <div style={{ padding:'14px 22px', borderTop:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, background:'#FAFAF7', flexWrap:'wrap' }}>
          <button onClick={doArchive} disabled={saving} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #FCA5A5', background:'#fff', color:'#B91C1C', cursor:'pointer', fontSize:13, fontWeight:600 }}>Archiver</button>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {p.statut === 'inscrit' && (
              <button onClick={doConvert} disabled={saving} style={{ padding:'8px 14px', borderRadius:8, border:'none', background:'#059669', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                Convertir en membre
              </button>
            )}
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setForm(p) }} disabled={saving} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>Annuler</button>
                <button onClick={saveEdit} disabled={saving} style={{ padding:'8px 14px', borderRadius:8, border:'none', background:'#C41E3A', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>Modifier</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
