import React, { useState } from 'react'
import { MEMBRES_DATA } from '../data/bniData'
import { TLBadge, PageHeader, TableWrap } from './ui'

export default function Membres() {
  const [search, setSearch] = useState('')
  const [tlFilter, setTlFilter] = useState('tous')

  const filtered = MEMBRES_DATA.filter(m => {
    const q = search.toLowerCase()
    const matchQ = !q || `${m.prenom} ${m.nom} ${m.societe || ''} ${m.secteur}`.toLowerCase().includes(q)
    const matchTL = tlFilter === 'tous' || m.tl === tlFilter || (tlFilter === 'aucun' && !m.tl)
    return matchQ && matchTL
  })

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Membres" sub="MK-01 Kénitra Atlantique · 25 membres actifs" />

      {/* Search + filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un membre, société, secteur..."
          style={{ flex:1, padding:'9px 14px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none' }}
        />
        {['tous','vert','orange','rouge','gris'].map(f => (
          <button key={f} onClick={() => setTlFilter(f)} style={{ padding:'9px 14px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:12, background:tlFilter===f?'#C41E3A':'#fff', color:tlFilter===f?'#fff':'#6B7280', borderColor:tlFilter===f?'#C41E3A':'#E8E6E1', fontWeight:tlFilter===f?600:400 }}>
            {f === 'tous' ? 'Tous' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <TableWrap>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>{['#','Membre','Société','Secteur','Score','Traffic Light','P / A','TYFCB','Renouvellement'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}>
                <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:12 }}>{m.rank || '—'}</td>
                <td style={{ padding:'10px 14px', fontWeight:500 }}>{m.prenom} {m.nom}</td>
                <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{m.societe || '—'}</td>
                <td style={{ padding:'10px 14px', fontSize:12 }}>{m.secteur}</td>
                <td style={{ padding:'10px 14px', fontWeight:700 }}>{m.score !== null ? m.score : '—'}</td>
                <td style={{ padding:'10px 14px' }}><TLBadge tl={m.tl} /></td>
                <td style={{ padding:'10px 14px', fontSize:12 }}>
                  <span style={{ color:'#059669' }}>{m.p}P</span>
                  {' / '}
                  <span style={{ color: m.a >= 3 ? '#DC2626' : m.a >= 1 ? '#D97706' : '#9CA3AF' }}>{m.a}A</span>
                </td>
                <td style={{ padding:'10px 14px', fontSize:12, fontWeight:600 }}>{m.tyfcb ? m.tyfcb.toLocaleString('fr-FR') + ' MAD' : '—'}</td>
                <td style={{ padding:'10px 14px', fontSize:12, color: m.renouv==='01/09/2026'?'#DC2626':'inherit', fontWeight: m.renouv==='01/09/2026'?700:400 }}>{m.renouv}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{filtered.length} membre{filtered.length !== 1 ? 's' : ''} affiché{filtered.length !== 1 ? 's' : ''}</div>
      </TableWrap>
    </div>
  )
}
