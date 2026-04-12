import React, { useState, useEffect, useRef } from 'react'
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
  const [showPalmsMenu, setShowPalmsMenu] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!showPalmsMenu) return
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowPalmsMenu(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPalmsMenu])
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
  const nameColor = (score) => Number(score||0) >= 70 ? '#065F46' : Number(score||0) >= 50 ? '#854D0E' : Number(score||0) >= 30 ? '#991B1B' : '#6B7280'
  const hasPrevisions = Object.keys(previsions).length > 0

  // Couleurs de fond style Traffic Light BNI
  const tlBg = (level) => ({
    vert: { bg: '#D1FAE5', color: '#065F46' },
    jaune: { bg: '#FEF9C3', color: '#854D0E' },
    orange: { bg: '#FFEDD5', color: '#9A3412' },
    rouge: { bg: '#FEE2E2', color: '#991B1B' },
    gris: { bg: '#F3F4F6', color: '#4B5563' },
  }[level] || { bg: '#F3F4F6', color: '#4B5563' })
  const scoreBg = (score) => score >= 70 ? tlBg('vert') : score >= 50 ? tlBg('jaune') : score >= 30 ? tlBg('rouge') : tlBg('gris')
  const presBg = (rate) => rate >= 0.95 ? tlBg('vert') : rate >= 0.88 ? tlBg('jaune') : tlBg('rouge')
  const rateBg = (rate) => rate >= 1 ? tlBg('vert') : rate >= 0.5 ? tlBg('jaune') : rate >= 0.25 ? tlBg('orange') : tlBg('rouge')
  const tyfcbBg = (val) => val >= 300000 ? tlBg('vert') : val >= 50000 ? tlBg('jaune') : val >= 20000 ? tlBg('orange') : val > 0 ? tlBg('rouge') : tlBg('gris')

  // Cellule KPI avec score en petit en bas à droite
  const KpiCell = ({ value, pts, max, bg }) => (
    <td style={{ padding:'6px 10px', background:bg.bg, textAlign:'center', position:'relative' }}>
      <div style={{ fontSize:12, fontWeight:600, color:bg.color }}>{value}</div>
      <div style={{ fontSize:8, color:bg.color, opacity:0.6, textAlign:'right', marginTop:1 }}>{pts}/{max}</div>
    </td>
  )

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
          <div style={{ position:'relative' }}>
            <div onClick={() => { setShowImport(!showImport); setShowPalms(false); setShowPalmsMenu(false) }}
              style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:12, padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12, minWidth:180, transition:'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>Dernier import PALMS</div>
                <div style={{ fontSize:16, fontWeight:700, color:'#1C1C2E', fontFamily:'Playfair Display, serif' }}>
                  {(() => {
                    const first = Object.values(palmsData)[0]
                    if (!first?.created_at) return '—'
                    return new Date(first.created_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })
                  })()}
                </div>
              </div>
              <div ref={menuRef} style={{ position:'relative' }}>
                <div onClick={e => { e.stopPropagation(); setShowPalmsMenu(!showPalmsMenu) }}
                  style={{ width:24, height:24, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, cursor:'pointer', borderRadius:4 }}
                  onMouseEnter={e => e.currentTarget.style.background='#F3F2EF'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                </div>
                {showPalmsMenu && (
                  <div style={{ position:'absolute', right:0, top:28, background:'#fff', border:'1px solid #E8E6E1', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', zIndex:10, minWidth:160, overflow:'hidden' }}>
                    <div onClick={e => { e.stopPropagation(); setShowPalms(!showPalms); setShowImport(false); setShowPalmsMenu(false) }}
                      style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
                      onMouseEnter={e => e.currentTarget.style.background='#F7F6F3'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      📊 Voir PALMS
                    </div>
                    <div onClick={e => { e.stopPropagation(); setShowImport(!showImport); setShowPalms(false); setShowPalmsMenu(false) }}
                      style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderTop:'1px solid #F3F2EF' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F7F6F3'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      📥 Importer PALMS
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                const countJ = (from, to) => { let c=0; const d=new Date(from+'T12:00:00'), e=new Date(to+'T12:00:00'); while(d<=e){if(d.getDay()===4)c++;d.setDate(d.getDate()+1)} return c }
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
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{Number(p.mpb || 0).toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 })}</td>
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
            <thead><tr>{['#','Membre','Société','Score','Traffic Light','Présence','1-2-1','Reco.','Visiteurs','Parr.','TYFCB', ...(hasPrevisions ? ['Prévi. Score','Prévi. TL','Manque TàT','Manque Réf.'] : []),'Renouvellement'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color: h.startsWith('Prévi') ? '#C41E3A' : '#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {filtered.map((s, i) => {
                const m = s.membres || {}
                const renouv = m.date_renouvellement ? new Date(m.date_renouvellement) : null
                const isUrgent = renouv && (renouv - new Date()) < 90 * 24 * 60 * 60 * 1000
                const rowBg = { vert:'rgba(5,150,105,0.06)', orange:'rgba(217,119,6,0.06)', rouge:'rgba(220,38,38,0.06)', gris:'rgba(156,163,175,0.04)' }[s.traffic_light] || 'transparent'
                return (
                  <tr key={i} onClick={() => setSelected(s)} style={{ borderBottom:'1px solid #F3F2EF', cursor:'pointer', background:rowBg }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background=rowBg}>
                    <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:12 }}>{s.rank || '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600, color:nameColor(s.total_score) }}>{m.prenom} {m.nom}</td>
                    <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{m.societe || '—'}</td>
                    {(() => { const bg = scoreBg(Number(s.total_score||0)); return <td style={{ padding:'10px 14px', fontWeight:700, background:bg.bg, color:bg.color, textAlign:'center' }}>{s.total_score ? Number(s.total_score).toFixed(0) : '0'}</td> })()}
                    {(() => { const bg = tlBg(s.traffic_light || 'gris'); return <td style={{ padding:'10px 14px', background:bg.bg, textAlign:'center' }}><TLBadge tl={s.traffic_light} /></td> })()}
                    <KpiCell value={s.attendance_rate ? `${Math.round(Number(s.attendance_rate)*100)}%` : '0%'} pts={Number(s.attendance_score||0)} max={10} bg={presBg(Number(s.attendance_rate||0))} />
                    {(() => {
                      const p = palmsData[s.membre_id]
                      const h = previsions[s.membre_id]
                      // PALMS consolidés (avril) + hebdo
                      const palmsTat = p ? Number(p.tat || 0) : 0
                      const palmsRefs = p ? (p.rdi || 0) + (p.rde || 0) : 0
                      const totalTat = palmsTat + (h?.cumulTat || 0)
                      const totalRefs = palmsRefs + (h?.cumulRefs || 0)
                      // Nb de jeudis couverts par les PALMS consolidés
                      const palmsJeudis = p?.periode_debut && p?.periode_fin ? (() => {
                        const today = new Date().toISOString().split('T')[0]
                        let c=0; const d=new Date(p.periode_debut+'T12:00:00'), e=new Date(today+'T12:00:00')
                        while(d<=e){if(d.getDay()===4)c++;d.setDate(d.getDate()+1)}; return c
                      })() : 0
                      const totalJeudis = palmsJeudis + (h?.nbSemaines || 0)
                      const rateTat = totalJeudis > 0 ? totalTat / totalJeudis : 0
                      const rateRefs = totalJeudis > 0 ? totalRefs / totalJeudis : 0
                      const tatBgC = rateBg(rateTat)
                      const refsBgC = rateBg(rateRefs)
                      return <>
                        <KpiCell value={totalTat} pts={Number(s.score_121||0)} max={20} bg={tatBgC} />
                        <KpiCell value={totalRefs} pts={Number(s.referrals_given_score||0)} max={25} bg={refsBgC} />
                      </>
                    })()}
                    {(() => { const vis = Number(s.visitors||0); const visBg = vis >= 5 ? tlBg('vert') : vis >= 3 ? tlBg('jaune') : vis >= 1 ? tlBg('orange') : tlBg('gris'); return <KpiCell value={vis} pts={Number(s.visitor_score||0)} max={25} bg={visBg} /> })()}
                    {(() => { const sp = Number(s.sponsors||0); return <KpiCell value={sp} pts={Number(s.sponsor_score||0)} max={5} bg={sp >= 1 ? tlBg('vert') : tlBg('gris')} /> })()}
                    {(() => { const tyfcb = Number(s.tyfcb||0); return <KpiCell value={tyfcb.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' MAD'} pts={Number(s.tyfcb_score||0)} max={5} bg={tyfcbBg(tyfcb)} /> })()}
                    {hasPrevisions && (() => {
                      const pr = previsions[s.membre_id]
                      const pm = palmsData[s.membre_id]
                      // Total = PALMS consolidés + hebdo
                      const totalTat = (pm ? Number(pm.tat || 0) : 0) + (pr?.cumulTat || 0)
                      const totalRefs = (pm ? (pm.rdi || 0) + (pm.rde || 0) : 0) + (pr?.cumulRefs || 0)
                      const objTat = nbJeudis, objRefs = Math.ceil(nbJeudis * 1.25)
                      const manqueTat = Math.max(0, objTat - totalTat)
                      const manqueRefs = Math.max(0, objRefs - totalRefs)
                      return <>
                        <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color: pr ? (pr.score >= 70 ? '#059669' : pr.score >= 50 ? '#D97706' : pr.score >= 30 ? '#DC2626' : '#9CA3AF') : '#9CA3AF' }}>{pr ? pr.score : '0'}</td>
                        <td style={{ padding:'10px 14px' }}>{pr ? <TLBadge tl={pr.tl} /> : <TLBadge tl="gris" />}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: manqueTat === 0 ? '#059669' : manqueTat <= 2 ? '#D97706' : '#DC2626' }}>{manqueTat === 0 ? '✓' : manqueTat}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: manqueRefs === 0 ? '#059669' : manqueRefs <= 2 ? '#D97706' : '#DC2626' }}>{manqueRefs === 0 ? '✓' : manqueRefs}</td>
                      </>
                    })()}
                    <td style={{ padding:'10px 14px', fontSize:12, color:isUrgent?'#DC2626':'inherit', fontWeight:isUrgent?700:400 }}>
                      {renouv ? renouv.toLocaleDateString('fr-FR') : '—'} {isUrgent ? '⚠️' : ''}
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
