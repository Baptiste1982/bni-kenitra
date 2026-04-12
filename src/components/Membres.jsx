import React, { useState, useEffect } from 'react'
import { fetchScoresMK01 } from '../lib/bniService'
import { TLBadge, PageHeader, TableWrap } from './ui'
import MembreDetail from './MembreDetail'
import PalmsImport from './PalmsImport'

export default function Membres() {
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tlFilter, setTlFilter] = useState('tous')
  const [selected, setSelected] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const load = () => {
    setLoading(true)
    fetchScoresMK01().then(data => { setScores(data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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
            <thead><tr>{['#','Membre','Société','Score','Traffic Light','Présence','TYFCB','Renouvellement',''].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
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
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
