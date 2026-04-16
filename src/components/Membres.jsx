import React, { useState, useEffect, useRef } from 'react'
import { fetchScoresMK01, fetchPalmsHebdoMois, fetchPalmsMK01, recalculateScores } from '../lib/bniService'
import { supabase } from '../lib/supabase'
import { TLBadge, TrendArrow, PageHeader, TableWrap, AccordionPanel, fullName } from './ui'
import MembreDetail from './MembreDetail'
import PalmsImport from './PalmsImport'

export default function Membres({ profil, groupeCode = 'MK-01' }) {
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tlFilter, setTlFilter] = useState('tous')
  // Tri des colonnes : null = ordre par defaut (rank), sinon { key, dir:'asc'|'desc' }
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showPalms, setShowPalms] = useState(false)
  const [showPalmsMenu, setShowPalmsMenu] = useState(false)
  const [reunionsSaisies, setReunionsSaisies] = useState(0)
  const [reunionsProvisoires, setReunionsProvisoires] = useState(0)
  const [hebdoDates, setHebdoDates] = useState([])
  const menuRef = useRef(null)

  useEffect(() => {
    if (!showPalmsMenu) return
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowPalmsMenu(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPalmsMenu])
  const [previsions, setPrevisions] = useState({})
  const [palmsData, setPalmsData] = useState({})
  const [showExtra, setShowSociete] = useState(window.innerWidth > 768)

  const now = new Date()
  const mois = now.getMonth() + 1
  const annee = now.getFullYear()
  const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
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
    const premierJour = `${annee}-${String(mois).padStart(2,'0')}-01`
    const dernierJour = finMois.toISOString().split('T')[0]
    Promise.all([fetchScoresMK01(groupeCode), fetchPalmsHebdoMois(mois, annee, groupeCode), fetchPalmsMK01(groupeCode), supabase.from('palms_hebdo').select('date_reunion, is_provisoire').gte('date_reunion', premierJour).lte('date_reunion', dernierJour)])
      .then(([scoresData, hebdoData, palmsRaw, hebdoRes]) => {
        // Réunions consolidées vs provisoires du mois en cours
        const datesConsolidees = new Set((hebdoRes?.data || []).filter(r => !r.is_provisoire).map(r => r.date_reunion))
        const datesProvisoires = new Set((hebdoRes?.data || []).filter(r => r.is_provisoire).map(r => r.date_reunion))
        setReunionsSaisies(datesConsolidees.size)
        setReunionsProvisoires(datesProvisoires.size)
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
        // Barème BNI officiel pour le score prévisionnel
        // TàT/Refs = per week (données mensuelles), reste = 6 mois glissants
        const bniScore = (rateTat, rateRefs, ratePres, prevInv, prevMpb, rateUeg, sponsorScore) => {
          // Attendance /10 (6 mois) : >=95%→10, >=88%→5, <88%→0
          const sPres = ratePres >= 0.95 ? 10 : ratePres >= 0.88 ? 5 : 0
          // 1-2-1s /20 (per week) : >=1→20, >=0.75→15, >=0.5→10, >=0.25→5, <0.25→0
          const sTat = rateTat >= 1 ? 20 : rateTat >= 0.75 ? 15 : rateTat >= 0.5 ? 10 : rateTat >= 0.25 ? 5 : 0
          // Referrals /25 (per week) : >=1.25→25, >=1→20, >=0.75→15, >=0.50→10, >=0.25→5, <0.25→0
          const sRefs = rateRefs >= 1.25 ? 25 : rateRefs >= 1 ? 20 : rateRefs >= 0.75 ? 15 : rateRefs >= 0.50 ? 10 : rateRefs >= 0.25 ? 5 : 0
          // Visitors /25 (6 mois glissants) : 5+→25, 4→20, 3→15, 2→10, 1→5, 0→0
          const sInv = prevInv >= 5 ? 25 : prevInv >= 4 ? 20 : prevInv >= 3 ? 15 : prevInv >= 2 ? 10 : prevInv >= 1 ? 5 : 0
          // TYFCB /5 (6 mois) : >=300→5, 150-<300→4, 50-<150→3, 20-<50→2, >0-<20→1, 0→0
          const sTyfcb = prevMpb >= 300 ? 5 : prevMpb >= 150 ? 4 : prevMpb >= 50 ? 3 : prevMpb >= 20 ? 2 : prevMpb > 0 ? 1 : 0
          // CEU /10 (per week, 6 mois) : >0.5→10, >0→5, 0→0
          const sUeg = rateUeg > 0.5 ? 10 : rateUeg > 0 ? 5 : 0
          // Sponsors /5 : 1+→5, 0→0
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
          const prevMpb = m.cumul.mpb + (m.derniere.mpb * reunionsRestantes)
          const prevUeg = m.cumul.ueg + (m.derniere.ueg * reunionsRestantes)
          // TàT et Refs : taux par semaine sur le mois (total prévu / nb jeudis du mois)
          const rateTat = nbJeudis > 0 ? prevTat / nbJeudis : 0
          const rateRefs = nbJeudis > 0 ? prevRefs / nbJeudis : 0
          const ratePres = m.cumul.total > 0 ? m.cumul.presences / m.cumul.total : 1
          const rateUeg = nbJeudis > 0 ? prevUeg / nbJeudis : 0
          // Score sponsors du consolidé
          const consolidé = scoresData.find(s => s.membre_id === id)
          const sponsorScore = consolidé ? Number(consolidé.sponsor_score) || 0 : 0
          // Visiteurs : déjà calculé sur 6 mois glissants dans scores_bni (table invites)
          const totalInv = consolidé ? Number(consolidé.visitors) || 0 : 0
          const totalMpb = (consolidé ? Number(consolidé.tyfcb) || 0 : 0) + prevMpb
          const { score, tl } = bniScore(rateTat, rateRefs, ratePres, totalInv, totalMpb, rateUeg, sponsorScore)
          prev[id] = { tat: prevTat, refs: prevRefs, score, tl, cumulTat: m.cumul.tat, cumulRefs: m.cumul.refs, cumul: m.cumul }
        })
        setPrevisions(prev)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    // Recalcul auto des scores au chargement puis affichage
    recalculateScores(groupeCode).catch(() => {}).finally(() => load())
  }, [groupeCode])

  const prevColor = (val, obj) => val >= obj ? '#059669' : val >= obj * 0.6 ? '#D97706' : '#DC2626'
  const nameColor = (score) => Number(score||0) >= 70 ? '#065F46' : Number(score||0) >= 50 ? '#854D0E' : Number(score||0) >= 30 ? '#991B1B' : '#6B7280'
  const hasPrevisions = Object.keys(previsions).length > 0

  // Couleurs de fond style Traffic Light BNI
  const tlBg = (level) => ({
    vert: { bg: '#D1FAE5', color: '#065F46' },
    jaune: { bg: '#FEF9C3', color: '#854D0E' },
    orange: { bg: '#FEF9C3', color: '#854D0E' },
    rouge: { bg: '#FEE2E2', color: '#991B1B' },
    gris: { bg: '#F3F4F6', color: '#4B5563' },
  }[level] || { bg: '#F3F4F6', color: '#4B5563' })
  const scoreBg = (score) => score >= 70 ? tlBg('vert') : score >= 50 ? tlBg('jaune') : score >= 30 ? tlBg('rouge') : tlBg('gris')
  const presBg = (rate) => rate >= 0.95 ? tlBg('vert') : rate >= 0.88 ? tlBg('jaune') : tlBg('rouge')
  const rateBg = (rate) => rate >= 1 ? tlBg('vert') : rate >= 0.5 ? tlBg('jaune') : rate >= 0.25 ? tlBg('orange') : tlBg('rouge')
  const tyfcbBg = (val) => val >= 300000 ? tlBg('vert') : val >= 50000 ? tlBg('jaune') : val >= 20000 ? tlBg('orange') : val > 0 ? tlBg('rouge') : tlBg('gris')

  // Cellule KPI avec score en petit + tooltip au survol
  const KpiCell = ({ value, pts, max, bg, tooltip }) => (
    <td title={tooltip || ''} style={{ padding:'6px 10px', background:bg.bg, textAlign:'center', position:'relative', cursor: tooltip ? 'help' : 'default' }}>
      <div style={{ fontSize:12, fontWeight:600, color:bg.color }}>{value}</div>
      <div style={{ fontSize:8, color:bg.color, opacity:0.6, textAlign:'right', marginTop:1 }}>{pts}/{max}</div>
    </td>
  )

  const filteredUnsorted = scores.filter(s => {
    const m = s.membres || {}
    const q = `${m.prenom||''} ${m.nom||''} ${m.societe||''} ${m.secteur_activite||''}`.toLowerCase()
    const matchQ = !search || q.includes(search.toLowerCase())
    const matchTL = tlFilter === 'tous' || s.traffic_light === tlFilter || (tlFilter === 'aucun' && !s.traffic_light)
    return matchQ && matchTL
  })

  // Extracteur de la valeur de tri pour une colonne donnee
  const getSortValue = (s, key) => {
    const m = s.membres || {}
    const h = previsions[s.membre_id] || {}
    switch (key) {
      case 'rank': return Number(s.rank) || 9999
      case 'nom': return `${m.nom || ''} ${m.prenom || ''}`.toLowerCase()
      case 'societe': return (m.societe || '').toLowerCase()
      case 'total_score': return Number(s.total_score) || 0
      case 'traffic_light': return { vert:3, orange:2, rouge:1, gris:0 }[s.traffic_light] || 0
      case 'attendance_rate': return Number(s.attendance_rate) || 0
      case 'cumulTat': return Number(h.cumulTat) || 0
      case 'cumulRefs': return Number(h.cumulRefs) || 0
      case 'visitors': return Number(s.visitors) || 0
      case 'sponsors': return Number(s.sponsors) || 0
      case 'tyfcb': return Number(s.tyfcb) || 0
      case 'ceu_rate': return Number(s.ceu_rate) || 0
      case 'date_renouvellement': return m.date_renouvellement || ''
      default: return 0
    }
  }

  const filtered = sortBy
    ? [...filteredUnsorted].sort((a, b) => {
        const va = getSortValue(a, sortBy)
        const vb = getSortValue(b, sortBy)
        if (typeof va === 'string' && typeof vb === 'string') {
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
        }
        return sortDir === 'asc' ? va - vb : vb - va
      })
    : filteredUnsorted

  // Mapping des en-tetes de colonnes vers leur cle de tri
  const colSort = {
    '#': 'rank',
    'Membre': 'nom',
    'Société': 'societe',
    'Score': 'total_score',
    'Traffic Light': 'traffic_light',
    'Présence': 'attendance_rate',
    '1-2-1': 'cumulTat',
    'Reco.': 'cumulRefs',
    'Visiteurs': 'visitors',
    'Parr.': 'sponsors',
    'TYFCB': 'tyfcb',
    'CEU': 'ceu_rate',
    'Renouvellement': 'date_renouvellement',
  }
  const handleSort = (col) => {
    const key = colSort[col]
    if (!key) return
    if (sortBy === key) {
      // Toggle : desc -> asc -> reset
      if (sortDir === 'desc') setSortDir('asc')
      else { setSortBy(null); setSortDir('desc') }
    } else {
      setSortBy(key); setSortDir('desc')
    }
  }

  const mob = typeof window !== 'undefined' && window.innerWidth <= 768

  return (
    <div style={{ padding: mob ? '16px' : '28px 32px', animation:'fadeIn 0.25s ease' }}>
      <style>{`
        tr.membre-row {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                      filter 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                      background-color 0.2s ease;
        }
        tr.membre-row > td {
          border-bottom: 1px solid rgba(0,0,0,0.08);
          transition: border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        tr.membre-row:hover {
          background-color: transparent !important;
          transform: scale(1.008);
          filter: drop-shadow(0 6px 16px rgba(0,0,0,0.12)) brightness(1.04);
          position: relative;
          z-index: 5;
        }
        tr.membre-row:hover > td {
          background-color: var(--row-bg);
        }
        tr.membre-row:hover td:first-child {
          border-top-left-radius: 24px;
          border-bottom-left-radius: 24px;
        }
        tr.membre-row:hover td:last-child {
          border-top-right-radius: 24px;
          border-bottom-right-radius: 24px;
        }
      `}</style>
      <PageHeader
        title="Membres"
        sub={`${groupeCode} · ${scores.length} membres scorés`}
        right={
          <div style={{ position:'relative' }}>
            <div onClick={() => { setShowImport(!showImport); setShowPalms(false); setShowPalmsMenu(false) }}
              style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:12, padding: mob ? '8px 12px' : '12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap: mob ? 8 : 12, minWidth: mob ? 0 : 180, transition:'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize: mob ? 9 : 10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>Dernier import PALMS</div>
                <div style={{ fontSize: mob ? 13 : 16, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>
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
                    <div onClick={async e => { e.stopPropagation(); setShowPalms(!showPalms); setShowImport(false); setShowPalmsMenu(false); if (!showPalms) { const { data } = await supabase.from('palms_hebdo').select('date_reunion, groupe_id').order('date_reunion', { ascending:false }); const seen = new Set(); setHebdoDates((data||[]).filter(d => { if (seen.has(d.date_reunion)) return false; seen.add(d.date_reunion); return true })) } }}
                      style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
                      onMouseEnter={e => e.currentTarget.style.background='#F7F6F3'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      📊 PALMS consolidé
                      <span style={{ fontSize:9, padding:'1px 6px', borderRadius:6, background:'#D1FAE5', color:'#065F46', fontWeight:600, marginLeft:'auto' }}>Définitif</span>
                    </div>
                    <div onClick={e => { e.stopPropagation(); setShowImport(!showImport); setShowPalms(false); setShowPalmsMenu(false) }}
                      style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderTop:'1px solid #F3F2EF' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F7F6F3'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      📥 Importer Excel
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        }
      />

      {/* PALMS Import */}
      <AccordionPanel open={showImport}>
        <div style={{ marginBottom:20 }}>
          <PalmsImport onImportDone={() => { load(); setShowImport(false) }} groupeCode={groupeCode} />
        </div>
      </AccordionPanel>

      {/* PALMS Consultation — vue combinée définitif | provisoire */}
      <AccordionPanel open={showPalms}>
        <div style={{ marginBottom:20, display:'flex', gap:0, border:'1px solid #E8E6E1', borderRadius:12, overflow:'hidden', background:'#fff' }}>
          {/* Colonne gauche : Import Excel (Définitif) */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ padding:'12px 16px', background:'#F9F8F6', borderBottom:'1px solid #E8E6E1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, fontWeight:600 }}>📊 PALMS Consolidé</span>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'#D1FAE5', color:'#065F46', fontWeight:600 }}>Définitif</span>
              </div>
              {Object.keys(palmsData).length > 0 && (
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {(() => {
                    const first = Object.values(palmsData)[0]
                    if (!first?.periode_debut) return null
                    return <span style={{ fontSize:10, color:'#6B7280' }}>{new Date(first.periode_debut).toLocaleDateString('fr-FR')} → {new Date(first.periode_fin).toLocaleDateString('fr-FR')}</span>
                  })()}
                  <div onClick={async () => {
                    if (!window.confirm('Supprimer les données PALMS consolidées ?')) return
                    const grpId = Object.values(palmsData)[0]?.groupe_id
                    if (grpId) { await supabase.from('palms_imports').delete().eq('groupe_id', grpId); load() }
                  }}
                    style={{ fontSize:10, color:'#DC2626', cursor:'pointer', padding:'2px 6px', borderRadius:4 }}
                    onMouseEnter={e => e.currentTarget.style.background='#FEE2E2'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    title="Supprimer cet import">🗑</div>
                </div>
              )}
            </div>
            {Object.keys(palmsData).length > 0 ? (
              <div style={{ overflowX:'auto', maxHeight:400, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['Membre','P','A','RDI','RDE','RRI','RRE','Inv.','TàT','MPB'].map(h => (
                    <th key={h} style={{ background:'#F9F8F6', padding:'6px 8px', textAlign: h === 'Membre' ? 'left' : 'center', fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase', borderBottom:'1px solid #E8E6E1', position:'sticky', top:0 }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {Object.values(palmsData).sort((a, b) => (b.tat || 0) - (a.tat || 0)).map((p, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}
                        onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <td style={{ padding:'6px 8px', fontSize:11, fontWeight:500, whiteSpace:'nowrap' }}>{fullName(p.membres?.prenom, p.membres?.nom)}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center', color:'#059669', fontWeight:600 }}>{p.presences||0}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center', color: p.absences > 0 ? '#DC2626' : '#9CA3AF' }}>{p.absences||0}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center' }}>{p.rdi||0}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center' }}>{p.rde||0}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center' }}>{p.rri||0}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center' }}>{p.rre||0}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center' }}>{p.invites||0}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center', fontWeight:600 }}>{Number(p.tat||0)}</td>
                        <td style={{ padding:'6px 8px', fontSize:11, textAlign:'center', fontWeight:600 }}>{Number(p.mpb||0).toLocaleString('de-DE')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding:24, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>Aucun import Excel</div>
            )}
          </div>

          {/* Trait vertical séparateur */}
          <div style={{ width:3, background:'linear-gradient(to bottom, #D1FAE5, #E8E6E1 30%, #E8E6E1 70%, #FEF3C7)', flexShrink:0 }} />

          {/* Colonne droite : Saisies Hebdo (Provisoire) */}
          <div style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'12px 16px', background:'#F9F8F6', borderBottom:'1px solid #E8E6E1', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>📝 Saisies Hebdo</span>
              <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'#FEF3C7', color:'#92400E', fontWeight:600 }}>Provisoire</span>
            </div>
            <div style={{ flex:1, padding:12, overflowY:'auto', maxHeight:400 }}>
              {hebdoDates.length === 0 ? (
                <div style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>Aucune saisie hebdo</div>
              ) : hebdoDates.map(h => {
                const date = new Date(h.date_reunion + 'T12:00:00')
                const isThursday = date.getDay() === 4
                return (
                  <div key={h.date_reunion} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', marginBottom:6, borderRadius:8, background:'#FFFBEB', border:'1px solid #FEF3C7' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#D97706', flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#1C1C2E' }}>
                        {date.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })}
                      </div>
                      <div style={{ fontSize:9, color:'#92400E' }}>
                        {isThursday ? 'Jeudi · Réunion' : '⚠ Pas un jeudi'}
                      </div>
                    </div>
                    <div onClick={async (e) => {
                      e.stopPropagation()
                      if (!window.confirm(`Supprimer la saisie du ${date.toLocaleDateString('fr-FR')} ?`)) return
                      await supabase.from('palms_hebdo').delete().eq('date_reunion', h.date_reunion)
                      setHebdoDates(prev => prev.filter(d => d.date_reunion !== h.date_reunion))
                      load()
                    }}
                      style={{ width:22, height:22, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#DC2626', cursor:'pointer', flexShrink:0 }}
                      onMouseEnter={e => e.currentTarget.style.background='#FEE2E2'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                      title="Supprimer cette saisie">🗑</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </AccordionPanel>

      {/* Mois en cours */}
      <div style={{ display:'flex', alignItems:'center', padding: window.innerWidth <= 768 ? '10px 14px' : '14px 20px', background:'#1C1C2E', borderRadius:12, marginBottom:20, color:'#fff', gap: window.innerWidth <= 768 ? 8 : 16 }}>
        <div style={{ fontSize: window.innerWidth <= 768 ? 16 : 22, fontWeight:700, fontFamily:'DM Sans, sans-serif', textTransform:'capitalize', whiteSpace:'nowrap' }}>{moisLabel}</div>
        <div style={{ fontSize: window.innerWidth <= 768 ? 10 : 12, opacity:0.6, whiteSpace:'nowrap' }}>{reunionsSaisies + reunionsProvisoires}/{nbJeudis}</div>
        <div style={{ display:'flex', gap:3 }}>
          {Array.from({length:nbJeudis}).map((_,i) => (
            <div key={i} style={{ width: window.innerWidth <= 768 ? 8 : 10, height: window.innerWidth <= 768 ? 8 : 10, borderRadius:'50%', background: i < reunionsSaisies ? '#059669' : i < reunionsSaisies + reunionsProvisoires ? '#F59E0B' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ display:'flex', gap: mob ? 6 : 10, marginBottom:16, flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre..." style={{ flex:1, minWidth: mob ? '100%' : 200, padding:'9px 14px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none' }} />
        {['tous','vert','orange','rouge','gris'].map(f => (
          <button key={f} onClick={() => setTlFilter(f)} style={{ padding: mob ? '7px 10px' : '9px 14px', border:'1px solid #E8E6E1', borderRadius:8, fontSize: mob ? 11 : 12, background:tlFilter===f?'#C41E3A':'#fff', color:tlFilter===f?'#fff':'#6B7280', borderColor:tlFilter===f?'#C41E3A':'#E8E6E1', fontWeight:tlFilter===f?600:400, cursor:'pointer' }}>
            {f === 'tous' ? (mob ? `Tous ${scores.length}` : `Tous (${scores.length})`) : f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Chargement depuis Supabase...</div>
      ) : (<>
        {!mob && (
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
            <button onClick={()=>setShowSociete(!showExtra)} style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:6, border:'1px solid #E8E6E1', background:showExtra?'#1C1C2E':'#fff', color:showExtra?'#fff':'#6B7280', cursor:'pointer', fontFamily:'DM Sans, sans-serif', display:'flex', alignItems:'center', gap:4 }}>
              {showExtra ? '⊟ Moins de colonnes' : '⊞ Plus de colonnes'}
            </button>
          </div>
        )}
        <TableWrap>
          <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
            <thead><tr>{['#','Membre', ...(showExtra ? ['Société'] : []),'Score', ...(showExtra ? ['Traffic Light'] : []),'Présence','1-2-1','Reco.','Visiteurs','Parr.','TYFCB','CEU', ...(hasPrevisions ? ['Prévi. Score','Prévi. TL','Manque TàT','Manque Réf.'] : []), ...(showExtra ? ['Renouvellement'] : [])].map(h => {
              const sortKey = colSort[h]
              const isSortable = !!sortKey
              const isActive = isSortable && sortBy === sortKey
              const arrow = isActive ? (sortDir === 'desc' ? ' ▼' : ' ▲') : (isSortable ? '' : '')
              return (
                <th key={h}
                  onClick={isSortable ? () => handleSort(h) : undefined}
                  title={isSortable ? 'Cliquer pour trier' : undefined}
                  style={{ background: isActive ? '#EDE9FE' : '#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight: isActive ? 700 : 600, color: isActive ? '#5B21B6' : h.startsWith('Prévi') ? '#C41E3A' : '#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1', cursor: isSortable ? 'pointer' : 'default', userSelect:'none', whiteSpace:'nowrap' }}>
                  {h}{arrow}
                </th>
              )
            })}</tr></thead>
            <tbody>
              {filtered.map((s, i) => {
                const m = s.membres || {}
                const renouv = m.date_renouvellement ? new Date(m.date_renouvellement) : null
                const isUrgent = renouv && (renouv - new Date()) < 90 * 24 * 60 * 60 * 1000
                const rowBg = { vert:'#D1FAE5', orange:'#FEF9C3', rouge:'#FEE2E2', gris:'#F9FAFB' }[s.traffic_light] || '#fff'
                return (
                  <tr key={i} className="membre-row" onClick={() => setSelected(s)}
                    style={{
                      cursor:'pointer',
                      backgroundColor: rowBg,
                      '--row-bg': rowBg,
                    }}>
                    <td style={{ padding: mob ? '8px 8px' : '10px 14px', color:'#9CA3AF', fontSize:12 }}>{s.rank || '—'}</td>
                    <td style={{ padding: mob ? '8px 8px' : '10px 14px', fontWeight:600, color:nameColor(s.total_score), fontSize: mob ? 12 : 13, whiteSpace: mob ? 'nowrap' : 'normal', overflow: mob ? 'hidden' : 'visible', textOverflow: mob ? 'ellipsis' : 'clip', maxWidth: mob ? 120 : 'none' }}>{fullName(m.prenom, m.nom)}</td>
                    {showExtra && <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{m.societe || '—'}</td>}
                    {(() => { const bg = scoreBg(Number(s.total_score||0)); return <td style={{ padding:'10px 14px', fontWeight:700, background:bg.bg, color:bg.color, textAlign:'center' }}>{s.total_score ? Number(s.total_score).toFixed(0) : '0'}</td> })()}
                    {showExtra && (() => { const bg = tlBg(s.traffic_light || 'gris'); return <td style={{ padding:'10px 14px', background:bg.bg, textAlign:'center' }}><TLBadge tl={s.traffic_light} /></td> })()}
                    {(() => {
                      const att = Number(s.attendance_rate||0)
                      const attPts = Number(s.attendance_score||0)
                      const manquePres = attPts >= 10 ? '✓ Max atteint' : att >= 0.88 ? `${Math.round((0.95 - att)*100)}% de plus pour 10pts` : `${Math.round((0.88 - att)*100)}% de plus pour 5pts`
                      return <KpiCell value={att ? `${Math.round(att*100)}%` : '0%'} pts={attPts} max={10} bg={presBg(att)} tooltip={`Présence: ${Math.round(att*100)}% sur 6 mois\n${manquePres}\n>=95%→10 | >=88%→5 | <88%→0`} />
                    })()}
                    {(() => {
                      const h = previsions[s.membre_id]
                      // 1-2-1 et Reco : mois en cours uniquement (palms_hebdo), remis à 0 chaque mois
                      const totalTat = h?.cumulTat || 0
                      const totalRefs = h?.cumulRefs || 0
                      // TàT et Refs : taux per week (total du mois / nb jeudis du mois)
                      const rateTat = nbJeudis > 0 ? totalTat / nbJeudis : 0
                      const rateRefs = nbJeudis > 0 ? totalRefs / nbJeudis : 0
                      const tatBgC = rateBg(rateTat)
                      const refsBgC = rateBg(rateRefs)
                      // Barème per week
                      const ptsTat = rateTat >= 1 ? 20 : rateTat >= 0.75 ? 15 : rateTat >= 0.5 ? 10 : rateTat >= 0.25 ? 5 : 0
                      const ptsRefs = rateRefs >= 1.25 ? 25 : rateRefs >= 1 ? 20 : rateRefs >= 0.75 ? 15 : rateRefs >= 0.50 ? 10 : rateRefs >= 0.25 ? 5 : 0
                      // Ce qu'il manque pour le score max
                      const objTat = nbJeudis, objRefs = Math.ceil(nbJeudis * 1.25)
                      const manqueTat = Math.max(0, objTat - totalTat)
                      const manqueRefs = Math.max(0, objRefs - totalRefs)
                      return <>
                        <KpiCell value={totalTat} pts={ptsTat} max={20} bg={tatBgC} tooltip={`${rateTat.toFixed(2)}/sem (${totalTat}/${nbJeudis} jeudis)\n${manqueTat === 0 ? '✓ Max' : `+${manqueTat} pour 20pts`}\n>=1→20 | >=0.75→15 | >=0.5→10 | >=0.25→5`} />
                        <KpiCell value={totalRefs} pts={ptsRefs} max={25} bg={refsBgC} tooltip={`${rateRefs.toFixed(2)}/sem (${totalRefs}/${nbJeudis} jeudis)\n${manqueRefs === 0 ? '✓ Max' : `+${manqueRefs} pour 25pts`}\n>=1.25→25 | >=1→20 | >=0.75→15 | >=0.50→10`} />
                      </>
                    })()}
                    {(() => {
                      const vis = Number(s.visitors||0)
                      const visBg = vis >= 5 ? tlBg('vert') : vis >= 3 ? tlBg('jaune') : vis >= 1 ? tlBg('orange') : tlBg('gris')
                      const manqueVis = Math.max(0, 5 - vis)
                      return <KpiCell value={vis} pts={Number(s.visitor_score||0)} max={25} bg={visBg} tooltip={`${vis} visiteurs en 6 mois\n${manqueVis > 0 ? `Il manque ${manqueVis} visiteur(s) pour 25pts` : '✓ Max atteint'}\n5+→25 | 4→20 | 3→15 | 2→10 | 1→5`} />
                    })()}
                    {(() => {
                      const sp = Number(s.sponsors||0)
                      return <KpiCell value={sp} pts={Number(s.sponsor_score||0)} max={5} bg={sp >= 1 ? tlBg('vert') : tlBg('gris')} tooltip={`${sp} parrainage(s) en 6 mois\n${sp === 0 ? 'Il manque 1 parrainage pour 5pts' : '✓ Max atteint'}\n1+→5 | 0→0`} />
                    })()}
                    {(() => {
                      const tyfcb = Number(s.tyfcb||0)
                      const manqueTyfcb = tyfcb >= 300000 ? '✓ Max atteint' : tyfcb >= 150000 ? `+${(300000-tyfcb).toLocaleString('de-DE')} MAD pour 5pts` : tyfcb >= 50000 ? `+${(150000-tyfcb).toLocaleString('de-DE')} MAD pour 4pts` : tyfcb >= 20000 ? `+${(50000-tyfcb).toLocaleString('de-DE')} MAD pour 3pts` : `+${(20000-tyfcb).toLocaleString('de-DE')} MAD pour 2pts`
                      return <KpiCell value={tyfcb.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' MAD'} pts={Number(s.tyfcb_score||0)} max={5} bg={tyfcbBg(tyfcb)} tooltip={`TYFCB sur 6 mois glissants\n${manqueTyfcb}\n>=300k→5 | >=150k→4 | >=50k→3 | >=20k→2 | >0→1`} />
                    })()}
                    {(() => {
                      // CEU : 6 mois glissants (palms_imports + tout hebdo)
                      const ceuRate = Number(s.ceu_rate||0)
                      const ceuPts = Number(s.ceu_score||0)
                      const ceuBgC = ceuRate > 0.5 ? tlBg('vert') : ceuRate > 0 ? tlBg('jaune') : tlBg('gris')
                      return <KpiCell value={ceuRate.toFixed(2)} pts={ceuPts} max={10} bg={ceuBgC} tooltip={`${ceuRate.toFixed(2)} CEU/sem sur 6 mois\n${ceuPts >= 10 ? '✓ Max atteint' : ceuRate > 0 ? '+CEU pour 10pts (>0.5/sem)' : 'Aucun CEU'}\n>0.5→10 | >0→5 | 0→0`} />
                    })()}
                    {hasPrevisions && (() => {
                      const pr = previsions[s.membre_id]
                      // Mois en cours uniquement
                      const totalTat = pr?.cumulTat || 0
                      const totalRefs = pr?.cumulRefs || 0
                      // Objectifs : 1 TàT/sem = nbJeudis/mois, 1.25 refs/sem
                      const manqueTat = Math.max(0, nbJeudis - totalTat)
                      const manqueRefs = Math.max(0, Math.ceil(nbJeudis * 1.25) - totalRefs)
                      return <>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontSize:13, fontWeight:700, color: pr ? (pr.score >= 70 ? '#059669' : pr.score >= 50 ? '#D97706' : pr.score >= 30 ? '#DC2626' : '#9CA3AF') : '#9CA3AF' }}>{pr ? pr.score : '0'}</span>
                            {pr && <TrendArrow from={s.total_score} to={pr.score} />}
                          </span>
                        </td>
                        <td style={{ padding:'10px 14px' }}>{pr ? <TLBadge tl={pr.tl} /> : <TLBadge tl="gris" />}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: manqueTat === 0 ? '#059669' : manqueTat <= 2 ? '#D97706' : '#DC2626' }}>{manqueTat === 0 ? '✓' : manqueTat}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color: manqueRefs === 0 ? '#059669' : manqueRefs <= 2 ? '#D97706' : '#DC2626' }}>{manqueRefs === 0 ? '✓' : manqueRefs}</td>
                      </>
                    })()}
                    {showExtra && <td style={{ padding:'10px 14px', fontSize:12, color:isUrgent?'#DC2626':'inherit', fontWeight:isUrgent?700:400 }}>
                      {renouv ? renouv.toLocaleDateString('fr-FR') : '—'} {isUrgent ? '⚠️' : ''}
                    </td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{filtered.length} membre{filtered.length!==1?'s':''} · Cliquez sur un membre pour voir le détail</div>
        </TableWrap>
      </>)}

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
