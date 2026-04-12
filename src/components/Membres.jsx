import React, { useState, useEffect } from 'react'
import { fetchScoresMK01, fetchPalmsHebdoMois, fetchPalmsMK01 } from '../lib/bniService'
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
  const [palmsData, setPalmsData] = useState({})

  const now = new Date()
  const mois = now.getMonth() + 1
  const annee = now.getFullYear()
  const finMois = new Date(annee, mois, 0)
  const semainesRestantes = Math.max(0, Math.round((finMois - now) / (1000 * 60 * 60 * 24 * 7)))

  const load = () => {
    setLoading(true)
    Promise.all([fetchScoresMK01(), fetchPalmsHebdoMois(mois, annee), fetchPalmsMK01()])
      .then(([scoresData, hebdoData, palmsRaw]) => {
        // Indexer les PALMS consolidés par membre_id
        const pMap = {}
        palmsRaw.forEach(p => { if (p.membre_id) pMap[p.membre_id] = p })
        setPalmsData(pMap)
        setScores(scoresData)
        // Agréger les prévisions par membre (tous les KPI)
        const map = {}
        const dates = [...new Set(hebdoData.filter(r => r.membre_id).map(r => r.date_reunion))].sort()
        const lastDate = dates[dates.length - 1] || null
        const nbSemaines = dates.length || 1
        hebdoData.filter(r => r.membre_id).forEach(r => {
          if (!map[r.membre_id]) map[r.membre_id] = {
            cumul: { tat: 0, refs: 0, invites: 0, mpb: 0, ueg: 0, presences: 0, total: 0 },
            derniere: { tat: 0, refs: 0, invites: 0, mpb: 0, ueg: 0 },
          }
          const m = map[r.membre_id]
          const refs = (r.rdi || 0) + (r.rde || 0)
          m.cumul.tat += r.tat || 0
          m.cumul.refs += refs
          m.cumul.invites += r.invites || 0
          m.cumul.mpb += Number(r.mpb) || 0
          m.cumul.ueg += r.ueg || 0
          m.cumul.total++
          if (r.palms === 'P') m.cumul.presences++
          if (r.date_reunion === lastDate) {
            m.derniere = { tat: r.tat || 0, refs, invites: r.invites || 0, mpb: Number(r.mpb) || 0, ueg: r.ueg || 0 }
          }
        })
        // Barème BNI exact pour le score prévisionnel
        // On part des scores consolidés et on projette avec les données hebdo
        const bniScore = (rateTat, rateRefs, ratePres, prevInv, prevMpb, rateUeg, sponsorScore) => {
          // Attendance /10 : >=95% → 10, >=88% → 5, <88% → 0
          const sPres = ratePres >= 0.95 ? 10 : ratePres >= 0.88 ? 5 : 0
          // 1-2-1s /20 (par semaine) : >=1 → 20, >=0.75 → 15, >=0.5 → 10, >=0.25 → 5, <0.25 → 0
          const sTat = rateTat >= 1 ? 20 : rateTat >= 0.75 ? 15 : rateTat >= 0.5 ? 10 : rateTat >= 0.25 ? 5 : 0
          // Referrals /25 (par semaine) : >=1.25 → 25, >=1 → 20, >=0.75 → 15, >=0.50 → 10, >=0.25 → 5, <0.25 → 0
          const sRefs = rateRefs >= 1.25 ? 25 : rateRefs >= 1 ? 20 : rateRefs >= 0.75 ? 15 : rateRefs >= 0.50 ? 10 : rateRefs >= 0.25 ? 5 : 0
          // Visitors /25 (6 mois) : 5+ → 25, 4 → 20, 3 → 15, 2 → 10, 1 → 5, 0 → 0
          const sInv = prevInv >= 5 ? 25 : prevInv >= 4 ? 20 : prevInv >= 3 ? 15 : prevInv >= 2 ? 10 : prevInv >= 1 ? 5 : 0
          // TYFCB /5 : >=30 → 5, >=15 → 4, >=5 → 3, >=2 → 2, >0 → 1, 0 → 0
          const sTyfcb = prevMpb >= 30 ? 5 : prevMpb >= 15 ? 4 : prevMpb >= 5 ? 3 : prevMpb >= 2 ? 2 : prevMpb > 0 ? 1 : 0
          // CEU /10 (par semaine) : >0.5 → 10, >0 → 5, 0 → 0
          const sUeg = rateUeg > 0.5 ? 10 : rateUeg > 0 ? 5 : 0
          // Sponsors /5 : on garde le score consolidé
          const total = sPres + sTat + sRefs + sInv + sTyfcb + sUeg + (sponsorScore || 0)
          const tl = total >= 70 ? 'vert' : total >= 50 ? 'orange' : total >= 30 ? 'rouge' : 'gris'
          return { score: total, tl }
        }

        const prev = {}
        Object.entries(map).forEach(([id, m]) => {
          const totalSem = nbSemaines + semainesRestantes
          const prevTat = m.cumul.tat + (m.derniere.tat * semainesRestantes)
          const prevRefs = m.cumul.refs + (m.derniere.refs * semainesRestantes)
          const prevInv = m.cumul.invites + (m.derniere.invites * semainesRestantes)
          const prevMpb = m.cumul.mpb + (m.derniere.mpb * semainesRestantes)
          const prevUeg = m.cumul.ueg + (m.derniere.ueg * semainesRestantes)
          // Taux par semaine
          const rateTat = totalSem > 0 ? prevTat / totalSem : 0
          const rateRefs = totalSem > 0 ? prevRefs / totalSem : 0
          const ratePres = m.cumul.total > 0 ? m.cumul.presences / m.cumul.total : 1
          const rateUeg = totalSem > 0 ? prevUeg / totalSem : 0
          // Score sponsors du consolidé
          const consolidé = scoresData.find(s => s.membre_id === id)
          const sponsorScore = consolidé ? Number(consolidé.sponsor_score) || 0 : 0
          // Pour visiteurs et TYFCB, combiner consolidé + hebdo
          const totalInv = (consolidé ? Number(consolidé.visitors) || 0 : 0) + prevInv
          const totalMpb = (consolidé ? Number(consolidé.tyfcb) || 0 : 0) + prevMpb
          const { score, tl } = bniScore(rateTat, rateRefs, ratePres, totalInv, totalMpb, rateUeg, sponsorScore)
          prev[id] = { tat: prevTat, refs: prevRefs, score, tl }
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
            <thead><tr>{['#','Membre','Société','Score','Traffic Light','Présence','1-2-1','Réf.','TYFCB', ...(hasPrevisions ? ['Prévi. Score','Prévi. TL','Prévi. TàT','Prévi. Réf.'] : []),'Renouvellement',''].map(h => (
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
                    <td style={{ padding:'10px 14px', fontWeight:700, color: s.total_score ? (Number(s.total_score) >= 70 ? '#059669' : Number(s.total_score) >= 50 ? '#D97706' : Number(s.total_score) >= 30 ? '#DC2626' : '#9CA3AF') : '#9CA3AF' }}>{s.total_score ? Number(s.total_score).toFixed(0) : '—'}</td>
                    <td style={{ padding:'10px 14px' }}><TLBadge tl={s.traffic_light} /></td>
                    <td style={{ padding:'10px 14px', fontSize:12 }}>{s.attendance_rate ? `${Math.round(Number(s.attendance_rate)*100)}%` : '—'}</td>
                    {(() => { const p = palmsData[s.membre_id]; return <>
                    <td style={{ padding:'10px 14px', fontSize:12 }}>{p ? Number(p.tat || 0) : '—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:12 }}>{p ? (p.rdi || 0) + (p.rde || 0) : '—'}</td>
                    </> })()}
                    <td style={{ padding:'10px 14px', fontSize:12, fontWeight:600 }}>{s.tyfcb ? Number(s.tyfcb).toLocaleString('fr-FR')+' MAD' : '—'}</td>
                    {hasPrevisions && (() => {
                      const p = previsions[s.membre_id]
                      return <>
                        <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color: p ? (p.score >= 70 ? '#059669' : p.score >= 50 ? '#D97706' : p.score >= 30 ? '#DC2626' : '#9CA3AF') : '#9CA3AF' }}>{p ? p.score : '—'}</td>
                        <td style={{ padding:'10px 14px' }}>{p ? <TLBadge tl={p.tl} /> : '—'}</td>
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
