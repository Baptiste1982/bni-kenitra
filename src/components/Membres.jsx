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
  const [showPalms, setShowPalms] = useState(false)
  const [previsions, setPrevisions] = useState({})
  const [palmsData, setPalmsData] = useState({})

  const now = new Date()
  const mois = now.getMonth() + 1
  const annee = now.getFullYear()
  const finMois = new Date(annee, mois, 0)
  const semainesRestantes = Math.max(0, Math.round((finMois - now) / (1000 * 60 * 60 * 24 * 7)))

  // Nombre de jeudis dans le mois (= nombre de réunions)
  const nbJeudis = (() => {
    let count = 0
    for (let d = 1; d <= finMois.getDate(); d++) {
      if (new Date(annee, mois - 1, d).getDay() === 4) count++
    }
    return count
  })()

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
          m.cumul.total += r.nb_reunions || 1
          if (r.palms === 'P') m.cumul.presences += r.nb_reunions || 1
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
        let maxReunionsSaisies = 0
        Object.values(map).forEach(v => { if (v.cumul.total > maxReunionsSaisies) maxReunionsSaisies = v.cumul.total })
        const reunionsRestantes = Math.max(0, nbJeudis - maxReunionsSaisies)

        Object.entries(map).forEach(([id, m]) => {
          const prevTat = m.cumul.tat + (m.derniere.tat * reunionsRestantes)
          const prevRefs = m.cumul.refs + (m.derniere.refs * reunionsRestantes)
          const prevInv = m.cumul.invites + (m.derniere.invites * reunionsRestantes)
          const prevMpb = m.cumul.mpb + (m.derniere.mpb * reunionsRestantes)
          const prevUeg = m.cumul.ueg + (m.derniere.ueg * reunionsRestantes)
          // Taux par semaine (sur le mois complet = nbJeudis)
          const rateTat = nbJeudis > 0 ? prevTat / nbJeudis : 0
          const rateRefs = nbJeudis > 0 ? prevRefs / nbJeudis : 0
          const ratePres = m.cumul.total > 0 ? m.cumul.presences / m.cumul.total : 1
          const rateUeg = nbJeudis > 0 ? prevUeg / nbJeudis : 0
          // Score sponsors du consolidé
          const consolidé = scoresData.find(s => s.membre_id === id)
          const sponsorScore = consolidé ? Number(consolidé.sponsor_score) || 0 : 0
          // Pour visiteurs et TYFCB, combiner consolidé + hebdo
          const totalInv = (consolidé ? Number(consolidé.visitors) || 0 : 0) + prevInv
          const totalMpb = (consolidé ? Number(consolidé.tyfcb) || 0 : 0) + prevMpb
          const { score, tl } = bniScore(rateTat, rateRefs, ratePres, totalInv, totalMpb, rateUeg, sponsorScore)
          prev[id] = { tat: prevTat, refs: prevRefs, score, tl, cumulTat: m.cumul.tat, cumulRefs: m.cumul.refs, nbSemaines: nbSemaines }
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
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setShowPalms(!showPalms); if (!showPalms) setShowImport(false) }} style={{ padding:'9px 16px', background:showPalms?'#1C1C2E':'#fff', color:showPalms?'#fff':'#1C1C2E', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
              {showPalms ? '✕ Fermer PALMS' : '📊 Voir PALMS'}
            </button>
            <button onClick={() => { setShowImport(!showImport); if (!showImport) setShowPalms(false) }} style={{ padding:'9px 16px', background:showImport?'#1C1C2E':'#fff', color:showImport?'#fff':'#1C1C2E', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
              {showImport ? '✕ Fermer import' : '📥 Importer PALMS'}
            </button>
          </div>
        }
      />

      {/* PALMS Import */}
      {showImport && (
        <div style={{ marginBottom:20 }}>
          <PalmsImport onImportDone={() => { load(); setShowImport(false) }} />
        </div>
      )}

      {/* PALMS Consultation */}
      {showPalms && Object.keys(palmsData).length > 0 && (
        <div style={{ marginBottom:20 }}>
          <TableWrap>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:600 }}>📊 Données PALMS importées</div>
              {(() => {
                const first = Object.values(palmsData)[0]
                if (!first?.periode_debut || !first?.periode_fin) return null
                const countJ = (from, to) => { let c=0; const d=new Date(from), e=new Date(to); while(d<=e){if(d.getDay()===4)c++;d.setDate(d.getDate()+1)} return c }
                const totalJ = countJ(first.periode_debut, first.periode_fin)
                return (
                  <div style={{ fontSize:11, color:'#6B7280' }}>
                    Période : {new Date(first.periode_debut).toLocaleDateString('fr-FR')} → {new Date(first.periode_fin).toLocaleDateString('fr-FR')} · {totalJ} jeudis
                  </div>
                )
              })()}
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['Membre','P','A','L','M','S','RDI','RDE','RRI','RRE','Inv.','TàT','MPB'].map(h => (
                  <th key={h} style={{ background:'#F9F8F6', padding:'8px 10px', textAlign: h === 'Membre' ? 'left' : 'center', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {Object.values(palmsData).sort((a, b) => (b.tat || 0) - (a.tat || 0)).map((p, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}
                      onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'8px 10px', fontSize:12, fontWeight:500 }}>{p.membres?.prenom} {p.membres?.nom}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', color:'#059669', fontWeight:600 }}>{p.presences || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', color: p.absences > 0 ? '#DC2626' : '#9CA3AF', fontWeight:600 }}>{p.absences || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', color:'#9CA3AF' }}>{p.late || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', color:'#9CA3AF' }}>{p.makeup || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', color:'#9CA3AF' }}>{p.substitut || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{p.rdi || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{p.rde || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{p.rri || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{p.rre || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{p.invites || 0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{Number(p.tat || 0)}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{Number(p.mpb || 0).toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableWrap>
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
            <thead><tr>{['#','Membre','Société','Score','Traffic Light','Présence','1-2-1','Réf.','TYFCB', ...(hasPrevisions ? ['Prévi. Score','Prévi. TL','Manque TàT','Manque Réf.'] : []),'Renouvellement',''].map(h => (
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
                    {(() => {
                      const att = s.attendance_rate ? Number(s.attendance_rate) : null
                      const attColor = att === null ? '#9CA3AF' : att >= 0.95 ? '#059669' : att >= 0.88 ? '#D97706' : '#DC2626'
                      return <td style={{ padding:'10px 14px', fontSize:12, fontWeight:600, color: attColor }}>{att !== null ? `${Math.round(att*100)}%` : '—'}</td>
                    })()}
                    {(() => {
                      const h = previsions[s.membre_id]
                      // Données du mois en cours = uniquement hebdo
                      const totalTat = h?.cumulTat || 0
                      const totalRefs = h?.cumulRefs || 0
                      const nbSem = h?.nbSemaines || 0
                      // Taux par semaine du mois en cours
                      const rateTat = nbSem > 0 ? totalTat / nbSem : 0
                      const rateRefs = nbSem > 0 ? totalRefs / nbSem : 0
                      // Couleur barème BNI : >=1/sem→vert, >=0.5→orange, <0.5→rouge
                      const tatColor = nbSem === 0 ? '#9CA3AF' : rateTat >= 1 ? '#059669' : rateTat >= 0.5 ? '#D97706' : '#DC2626'
                      const refsColor = nbSem === 0 ? '#9CA3AF' : rateRefs >= 1 ? '#059669' : rateRefs >= 0.5 ? '#D97706' : '#DC2626'
                      return <>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:600, color: tatColor }}>{nbSem > 0 ? totalTat : '—'}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:600, color: refsColor }}>{nbSem > 0 ? totalRefs : '—'}</td>
                      </>
                    })()}
                    {(() => {
                      const tyfcb = s.tyfcb ? Number(s.tyfcb) : null
                      const tyfcbColor = tyfcb === null ? '#9CA3AF' : tyfcb >= 30000 ? '#059669' : tyfcb >= 5000 ? '#D97706' : '#DC2626'
                      return <td style={{ padding:'10px 14px', fontSize:12, fontWeight:600, color: tyfcbColor }}>{tyfcb !== null ? tyfcb.toLocaleString('fr-FR')+' MAD' : '—'}</td>
                    })()}
                    {hasPrevisions && (() => {
                      const p = previsions[s.membre_id]
                      // Objectif max/mois basé sur le nombre de jeudis
                      // TàT : 1 par semaine = nbJeudis, Réf : 1.25 par semaine
                      const objTat = nbJeudis, objRefs = Math.ceil(nbJeudis * 1.25)
                      const manqueTat = p ? Math.max(0, objTat - p.cumulTat) : objTat
                      const manqueRefs = p ? Math.max(0, objRefs - p.cumulRefs) : objRefs
                      return <>
                        <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color: p ? (p.score >= 70 ? '#059669' : p.score >= 50 ? '#D97706' : p.score >= 30 ? '#DC2626' : '#9CA3AF') : '#9CA3AF' }}>{p ? p.score : '—'}</td>
                        <td style={{ padding:'10px 14px' }}>{p ? <TLBadge tl={p.tl} /> : '—'}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: manqueTat === 0 ? '#059669' : manqueTat <= 2 ? '#D97706' : '#DC2626' }}>{p ? (manqueTat === 0 ? '✓' : manqueTat) : '—'}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: manqueRefs === 0 ? '#059669' : manqueRefs <= 2 ? '#D97706' : '#DC2626' }}>{p ? (manqueRefs === 0 ? '✓' : manqueRefs) : '—'}</td>
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
