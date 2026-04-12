import React, { useState, useEffect } from 'react'
import { fetchScoresMK01, fetchPalmsHebdoMois } from '../lib/bniService'
import { TLBadge, PageHeader, TableWrap } from './ui'
import MembreDetail from './MembreDetail'
import PalmsImport from './PalmsImport'

export default function Membres({ profil }) {
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tlFilter, setTlFilter] = useState('tous')
  const [selected, setSelected] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [previsions, setPrevisions] = useState({})

  const now = new Date()
  const mois = now.getMonth() + 1
  const annee = now.getFullYear()
  const finMois = new Date(annee, mois, 0)
  const semainesRestantes = Math.max(0, Math.round((finMois - now) / (1000 * 60 * 60 * 24 * 7)))

  const load = () => {
    setLoading(true)
    Promise.all([fetchScoresMK01(), fetchPalmsHebdoMois(mois, annee)])
      .then(([scoresData, hebdoData]) => {
        setScores(scoresData)
        // Agréger les prévisions par membre
        const map = {}
        const dates = [...new Set(hebdoData.filter(r => r.membre_id).map(r => r.date_reunion))].sort()
        const lastDate = dates[dates.length - 1] || null
        hebdoData.filter(r => r.membre_id).forEach(r => {
          if (!map[r.membre_id]) map[r.membre_id] = { cumul: { tat: 0, refs: 0 }, derniere: { tat: 0, refs: 0 } }
          const m = map[r.membre_id]
          m.cumul.tat += r.tat || 0
          m.cumul.refs += (r.rdi || 0) + (r.rde || 0)
          if (r.date_reunion === lastDate) {
            m.derniere.tat = r.tat || 0
            m.derniere.refs = (r.rdi || 0) + (r.rde || 0)
          }
        })
        // Calculer prévisions
        const prev = {}
        Object.entries(map).forEach(([id, m]) => {
          prev[id] = {
            tat: m.cumul.tat + (m.derniere.tat * semainesRestantes),
            refs: m.cumul.refs + (m.derniere.refs * semainesRestantes),
          }
        })
        setPrevisions(prev)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const prevColor = (val, obj) => val >= obj ? '#059669' : val >= obj * 0.6 ? '#D97706' : '#DC2626'
  const hasPrevisions = Object.keys(previsions).length > 0

  const filtered = scores.filter(s => {
    const m = s.membres || {}
    const q = `${m.prenom||''} ${m.nom||''} ${m.societe||''} ${m.secteur_activite||''}`.toLowerCase()
    const matchQ = !search || q.includes(search.toLowerCase())
    const matchTL = tlFilter === 'tous' || s.traffic_light === tlFilter || (tlFilter === 'aucun' && !s.traffic_light)
    return matchQ && matchTL
  })

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Membres"
        sub={`MK-01 Kénitra Atlantique · ${scores.length} membres scorés`}
        right={
          <button onClick={() => setShowImport(!showImport)} style={{ padding:'9px 16px', background:showImport?'#1C1C2E':'#fff', color:showImport?'#fff':'#1C1C2E', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
            {showImport ? '✕ Fermer import' : '📥 Importer PALMS'}
          </button>
        }
      />

      {/* PALMS Import */}
      {showImport && (
        <div style={{ marginBottom:20 }}>
          <PalmsImport onImportDone={() => { load(); setShowImport(false) }} />
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre..." style={{ flex:1, minWidth:200, padding:'9px 14px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none' }} />
        {['tous','vert','orange','rouge','gris'].map(f => (
          <button key={f} onClick={() => setTlFilter(f)} style={{ padding:'9px 14px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:12, background:tlFilter===f?'#C41E3A':'#fff', color:tlFilter===f?'#fff':'#6B7280', borderColor:tlFilter===f?'#C41E3A':'#E8E6E1', fontWeight:tlFilter===f?600:400, cursor:'pointer' }}>
            {f === 'tous' ? `Tous (${scores.length})` : f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Chargement depuis Supabase...</div>
      ) : (
        <TableWrap>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['#','Membre','Société','Score','Traffic Light','Présence','TYFCB', ...(hasPrevisions ? ['Prévi. TàT','Prévi. Réf.'] : []),'Renouvellement',''].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color: h.startsWith('Prévi') ? '#C41E3A' : '#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {filtered.map((s, i) => {
                const m = s.membres || {}
                const renouv = m.date_renouvellement ? new Date(m.date_renouvellement) : null
                const isUrgent = renouv && (renouv - new Date()) < 90 * 24 * 60 * 60 * 1000
                return (
                  <tr key={i} onClick={() => setSelected(s)} style={{ borderBottom:'1px solid #F3F2EF', cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:12 }}>{s.rank || '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:500 }}>{m.prenom} {m.nom}</td>
                    <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{m.societe || '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700 }}>{s.total_score ? Number(s.total_score).toFixed(0) : '—'}</td>
                    <td style={{ padding:'10px 14px' }}><TLBadge tl={s.traffic_light} /></td>
                    <td style={{ padding:'10px 14px', fontSize:12 }}>{s.attendance_rate ? `${Math.round(Number(s.attendance_rate)*100)}%` : '—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, fontWeight:600 }}>{s.tyfcb ? Number(s.tyfcb).toLocaleString('fr-FR')+' MAD' : '—'}</td>
                    {hasPrevisions && (() => {
                      const p = previsions[s.membre_id]
                      return <>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: p ? prevColor(p.tat, 4) : '#9CA3AF' }}>{p ? p.tat : '—'}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: p ? prevColor(p.refs, 4) : '#9CA3AF' }}>{p ? p.refs : '—'}</td>
                      </>
                    })()}
                    <td style={{ padding:'10px 14px', fontSize:12, color:isUrgent?'#DC2626':'inherit', fontWeight:isUrgent?700:400 }}>
                      {renouv ? renouv.toLocaleDateString('fr-FR') : '—'} {isUrgent ? '⚠️' : ''}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir →</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{filtered.length} membre{filtered.length!==1?'s':''} · Cliquez sur un membre pour voir le détail</div>
        </TableWrap>
      )}

      {/* Member detail modal */}
      {selected && (
        <MembreDetail
          membre={selected.membres || {}}
          score={selected}
          profil={profil}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
