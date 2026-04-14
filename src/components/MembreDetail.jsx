import React, { useState, useEffect } from 'react'
import { TLBadge, fullName } from './ui'
import { MembreRadarChart } from './ScoresChart'
import { BNI_SYSTEM_PROMPT } from '../data/bniData'
import { supabase } from '../lib/supabase'

export default function MembreDetail({ membre, score, profil, onClose }) {
  const [tab, setTab] = useState('profil')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailContent, setEmailContent] = useState('')
  const [emailType, setEmailType] = useState('relance')
  const [expandedKpi, setExpandedKpi] = useState(null)
  const [hebdoData, setHebdoData] = useState([])
  const [hebdoLoaded, setHebdoLoaded] = useState(false)

  const m = membre
  const s = score || {}
  const renouv = m.date_renouvellement ? new Date(m.date_renouvellement) : null
  const daysToRenew = renouv ? Math.round((renouv - new Date()) / (1000*60*60*24)) : null
  const isUrgent = daysToRenew !== null && daysToRenew < 90

  const criteria = [
    { label:'Présence', rate: s.attendance_rate, score: s.attendance_score, max:10, format: v => `${Math.round(v*100)}%` },
    { label:'1-2-1s', rate: s.rate_121, score: s.score_121, max:20, format: v => `${Number(v).toFixed(2)}/sem` },
    { label:'Recommandations', rate: s.referrals_given_rate, score: s.referrals_given_score, max:25, format: v => `${Number(v).toFixed(2)}/sem` },
    { label:'Visiteurs', rate: s.visitors, score: s.visitor_score, max:25, format: v => `${v} en 6 mois` },
    { label:'Parrainages', rate: s.sponsors, score: s.sponsor_score, max:5, format: v => `${v} en 6 mois` },
    { label:'TYFCB', rate: s.tyfcb, score: s.tyfcb_score, max:5, format: v => `${Number(v).toLocaleString('fr-FR')} MAD` },
    { label:'CEU', rate: s.ceu_rate, score: s.ceu_score, max:10, format: v => `${Number(v).toFixed(2)}/sem` },
  ]

  // Charger les données hebdo du membre pour les détails
  useEffect(() => {
    if (!score?.membre_id) return
    supabase.from('palms_hebdo').select('*').eq('membre_id', score.membre_id).order('date_reunion')
      .then(({ data }) => { setHebdoData(data || []); setHebdoLoaded(true) })
  }, [score?.membre_id])

  const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })

  const generateEmail = async () => {
    setEmailLoading(true)
    setEmailContent('')

    // Objectifs BNI mensuels (~4 semaines)
    const now = new Date()
    const moisActuel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    const finDuMois = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const semainesRestantes = Math.max(1, Math.round((finDuMois - now) / (1000*60*60*24*7)))

    const objectifs = {
      '1-2-1s': { cibleMois: 4, unite: 'tête-à-tête ce mois', importance: 'Les tête-à-tête sont le cœur du réseautage BNI. C\'est lors de ces rencontres que se construisent la confiance et les recommandations qualifiées. Sans tête-à-tête, pas de références.' },
      'Recommandations': { cibleMois: 4, unite: 'recommandations données ce mois', importance: 'Donner des recommandations, c\'est activer le principe du Givers Gain. Plus tu donnes, plus tu reçois. C\'est le moteur de ton retour sur investissement BNI.' },
      'Visiteurs': { cibleMois: 1, unite: 'visiteur invité ce mois', importance: 'Inviter des visiteurs renforce le groupe et montre ton engagement. Chaque visiteur est un membre potentiel qui élargit ton réseau.' },
      'Présence': { cibleMois: 4, unite: 'réunions sur 4 ce mois', importance: 'La présence est la base de tout. Sans présence régulière, impossible de construire la confiance avec les autres membres ni de recevoir des références.' },
      'CEU': { cibleMois: 4, unite: 'CEU ce mois', importance: 'La formation continue te rend plus efficace en réseautage et montre ta volonté de progresser au sein du groupe.' },
      'Parrainages': { cibleMois: 0, unite: '', importance: 'Parrainer un nouveau membre montre ton leadership et contribue directement à la croissance du groupe.' },
    }

    // Construire le détail des KPI avec écarts mensuels
    const kpiDetails = criteria.map(c => {
      const obj = objectifs[c.label]
      const scoreNum = Number(c.score) || 0
      const rateNum = Number(c.rate) || 0
      const pct = Math.round(scoreNum / c.max * 100)
      let detail = `- ${c.label}: ${scoreNum}/${c.max} pts (${pct}%) — rythme actuel: ${c.format(rateNum)}`
      if (obj && obj.cibleMois > 0) {
        const manquant = Math.max(0, Math.ceil(obj.cibleMois - (rateNum * semainesRestantes)))
        if (pct < 50) detail += ` — ⚠️ OBJECTIF CE MOIS: ${obj.cibleMois} ${obj.unite}, il en manque ~${manquant} d'ici fin ${moisActuel}`
        else detail += ` — ✅ en bonne voie`
      }
      return detail
    }).join('\n')

    const weakKpis = criteria.filter(c => Number(c.score) < c.max * 0.5 && objectifs[c.label])
    const kpiImportance = weakKpis
      .map(c => `- ${c.label}: ${objectifs[c.label].importance}`)
      .join('\n')

    const scoreGap = 70 - (Number(s.total_score) || 0)

    const kpiContext = `
SITUATION ACTUELLE DE ${m.prenom} ${m.nom} — ${moisActuel}:
Score: ${s.total_score}/100 (objectif BNI: 70/100, il manque ${scoreGap > 0 ? scoreGap : 0} points)
Traffic Light: ${s.traffic_light}
Rang: ${s.rank || '—'}/20
Semaines restantes ce mois: ${semainesRestantes}
${renouv ? `Renouvellement: ${renouv.toLocaleDateString('fr-FR')} (dans ${daysToRenew} jours)` : ''}

DÉTAIL DES KPIs ET OBJECTIFS DU MOIS:
${kpiDetails}

${kpiImportance ? `POURQUOI CES KPIs SONT IMPORTANTS:\n${kpiImportance}` : ''}`

    // Signature dynamique basée sur le profil connecté
    const p = profil || {}
    const signature = `${p.prenom || 'Jean Baptiste'} ${p.nom || 'CHIOTTI'}\n${p.titre || 'Directeur Exécutif BNI Kénitra'}${p.email ? '\n📧 ' + p.email : ''}${p.telephone ? '\nTel : ' + p.telephone : ''}`

    const prompts = {
      relance: `Génère un email de relance professionnel et personnalisé pour ${m.prenom} ${m.nom} (${m.societe || m.secteur_activite}).
${kpiContext}

CONSIGNES:
- Concentre-toi sur les objectifs du mois en cours (${moisActuel}): combien de tête-à-tête, références, visiteurs manquants d'ici la fin du mois
- Pour chaque KPI faible, donne un objectif chiffré pour le mois (ex: "il te reste ${semainesRestantes} semaines pour faire X tête-à-tête")
- Rappelle brièvement pourquoi chaque KPI compte pour son business
- Propose 2-3 actions concrètes à faire CETTE SEMAINE
- Ton motivant et bienveillant, pas condescendant
- En conclusion seulement, mentionne la perspective du renouvellement si pertinent
- Signe avec:\n${signature}`,
      renouvellement: `Génère un email de rappel de renouvellement pour ${m.prenom} ${m.nom} (${m.societe || m.secteur_activite}).
${kpiContext}

CONSIGNES:
- Date de renouvellement: ${renouv?.toLocaleDateString('fr-FR')} (dans ${daysToRenew} jours)
- Valorise ce que BNI lui a apporté (TYFCB: ${Number(s.tyfcb || 0).toLocaleString('fr-FR')} MAD de chiffre d'affaires généré)
- Mentionne les KPIs à améliorer ce mois-ci pour arriver au renouvellement dans les meilleures conditions
- Chaleureux et valorisant
- Signe avec:\n${signature}`,
      felicitations: `Génère un email de félicitations pour ${m.prenom} ${m.nom} (${m.societe || m.secteur_activite}).
${kpiContext}

CONSIGNES:
- Félicite pour les KPIs forts (score >= 50% du max)
- Mentionne le rang ${s.rank}/20 et le score ${s.total_score}/100
- Encourage à maintenir l'effort ce mois de ${moisActuel} pour viser le Traffic Light vert (70+ pts)
- Valorise l'impact positif sur le groupe
- Signe avec:\n${signature}`
    }
    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { system: BNI_SYSTEM_PROMPT, max_tokens: 800, messages: [{ role: 'user', content: prompts[emailType] }] }
      })
      if (error) throw error
      setEmailContent(data.content?.[0]?.text || '')
    } catch { setEmailContent('Erreur lors de la génération.') }
    setEmailLoading(false)
  }

  const tlColor = { vert:'#059669', orange:'#D97706', rouge:'#DC2626', gris:'#9CA3AF' }[s.traffic_light] || '#9CA3AF'
  const totalScore = s.total_score ? Number(s.total_score).toFixed(0) : '—'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#F7F6F3', borderRadius:16, width:'100%', maxWidth:740, maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'#1C1C2E', padding:'18px 24px', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:tlColor+'33', border:`2px solid ${tlColor}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:tlColor, flexShrink:0 }}>
            {(m.prenom?.[0]||'?')}{(m.nom?.[0]||'?')}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:'#fff', fontSize:17, fontWeight:600 }}>{fullName(m.prenom, m.nom)}</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginTop:2 }}>{m.societe} · {m.secteur_activite}</div>
          </div>
          <div style={{ textAlign:'right', marginRight:8 }}>
            <div style={{ fontSize:26, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:tlColor }}>{totalScore}</div>
            <TLBadge tl={s.traffic_light} />
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'rgba(255,255,255,0.7)', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ background:'#fff', borderBottom:'1px solid #E8E6E1', display:'flex' }}>
          {[['profil','👤 Profil'],['scores','📊 Scores'],['radar','🎯 Radar'],['email','✉️ Email IA']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding:'11px 18px', border:'none', background:'transparent', fontSize:12, fontWeight:tab===id?600:400, color:tab===id?'#C41E3A':'#6B7280', borderBottom:tab===id?'2px solid #C41E3A':'2px solid transparent', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>

          {tab === 'profil' && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                {[['Société', m.societe||'—'],["Secteur", m.secteur_activite||'—'],['Statut', m.statut||'actif'],['Renouvellement', renouv?.toLocaleDateString('fr-FR')||'—'],['Rang classement', s.rank?`#${s.rank}`:'—'],['TYFCB généré', s.tyfcb?Number(s.tyfcb).toLocaleString('fr-FR')+' MAD':'—']].map(([label, value]) => (
                  <div key={label} style={{ background:'#fff', borderRadius:8, padding:'12px 14px', border:'1px solid #E8E6E1' }}>
                    <div style={{ fontSize:10, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{value}</div>
                  </div>
                ))}
              </div>
              {isUrgent && (
                <div style={{ padding:14, borderRadius:10, background:'#FEF2F2', border:'1px solid #FEE2E2', marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#DC2626' }}>⚠️ Renouvellement dans {daysToRenew} jours</div>
                  <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>Appel à planifier selon la règle des 3 mois.</div>
                  <button onClick={() => { setTab('email'); setEmailType('renouvellement') }} style={{ marginTop:8, padding:'6px 14px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                    Générer l'email →
                  </button>
                </div>
              )}
              <div style={{ background:'#fff', borderRadius:10, padding:16, border:'1px solid #E8E6E1' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>Score global</div>
                  <div style={{ fontSize:13, fontWeight:700, color:tlColor }}>{totalScore} / 100</div>
                </div>
                <div style={{ height:10, background:'#F3F2EF', borderRadius:5 }}>
                  <div style={{ height:10, width:`${Math.min(100, Number(s.total_score)||0)}%`, background:tlColor, borderRadius:5, transition:'width 0.6s ease' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:10, color:'#9CA3AF' }}>
                  <span>0</span><span style={{ color:'#DC2626' }}>30</span><span style={{ color:'#D97706' }}>50</span><span style={{ color:'#059669' }}>70</span><span>100</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'scores' && (
            <div>
              {criteria.map((c, i) => {
                const pct = Math.min(100, (Number(c.score)||0) / c.max * 100)
                const cardBg = pct >= 70 ? { bg:'#D1FAE5', border:'#A7F3D0', color:'#065F46', bar:'#059669' } : pct >= 40 ? { bg:'#FEF9C3', border:'#FDE68A', color:'#854D0E', bar:'#D97706' } : pct > 0 ? { bg:'#FEE2E2', border:'#FECACA', color:'#991B1B', bar:'#DC2626' } : { bg:'#F3F4F6', border:'#E5E7EB', color:'#4B5563', bar:'#9CA3AF' }
                const isExpanded = expandedKpi === c.label

                // Détails par réunion pour ce KPI
                const kpiField = { 'Présence':'palms', '1-2-1s':'tat', 'Recommandations':'refs', 'Visiteurs':'invites', 'Parrainages':null, 'TYFCB':'mpb', 'CEU':'ueg' }[c.label]

                return (
                  <div key={i} style={{ marginBottom:8 }}>
                    <div style={{ background:cardBg.bg, borderRadius: isExpanded ? '10px 10px 0 0' : 10, padding:'12px 14px', border:`1px solid ${cardBg.border}`, borderBottom: isExpanded ? 'none' : `1px solid ${cardBg.border}`, cursor:'pointer', transition:'transform 0.1s' }}
                      onClick={() => setExpandedKpi(isExpanded ? null : c.label)}
                      onMouseEnter={e => e.currentTarget.style.transform='scale(1.01)'}
                      onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:cardBg.color }}>{c.label} <span style={{ fontSize:10, opacity:0.5 }}>{isExpanded ? '▲' : '▼'}</span></div>
                          <div style={{ fontSize:11, color:cardBg.color, opacity:0.7, marginTop:1 }}>{c.rate !== undefined && c.rate !== null ? c.format(c.rate) : '—'}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:18, fontWeight:700, color:cardBg.color }}>{Number(c.score)||0}</div>
                          <div style={{ fontSize:10, color:cardBg.color, opacity:0.6 }}>/ {c.max} pts</div>
                        </div>
                      </div>
                      <div style={{ height:6, background:'rgba(255,255,255,0.5)', borderRadius:3 }}>
                        <div style={{ height:6, width:`${pct}%`, background:cardBg.bar, borderRadius:3, transition:'width 0.5s ease' }} />
                      </div>
                    </div>

                    {/* Détails dépliés */}
                    {isExpanded && hebdoLoaded && (() => {
                      // Barème BNI pour chaque KPI
                      const bareme = {
                        'Présence': [{ seuil:'≥ 95%', pts:10 }, { seuil:'≥ 88%', pts:5 }, { seuil:'< 88%', pts:0 }],
                        '1-2-1s': [{ seuil:'≥ 1/sem', pts:20 }, { seuil:'≥ 0.75', pts:15 }, { seuil:'≥ 0.5', pts:10 }, { seuil:'≥ 0.25', pts:5 }, { seuil:'< 0.25', pts:0 }],
                        'Recommandations': [{ seuil:'≥ 1.25/sem', pts:25 }, { seuil:'≥ 1', pts:20 }, { seuil:'≥ 0.75', pts:15 }, { seuil:'≥ 0.5', pts:10 }, { seuil:'≥ 0.25', pts:5 }],
                        'Visiteurs': [{ seuil:'5+', pts:25 }, { seuil:'4', pts:20 }, { seuil:'3', pts:15 }, { seuil:'2', pts:10 }, { seuil:'1', pts:5 }],
                        'Parrainages': [{ seuil:'3+', pts:5 }, { seuil:'2', pts:3 }, { seuil:'1', pts:1 }, { seuil:'0', pts:0 }],
                        'TYFCB': [{ seuil:'≥ 300k', pts:5 }, { seuil:'≥ 150k', pts:4 }, { seuil:'≥ 50k', pts:3 }, { seuil:'≥ 20k', pts:2 }, { seuil:'> 0', pts:1 }],
                        'CEU': [{ seuil:'> 0.5/sem', pts:10 }, { seuil:'> 0', pts:5 }, { seuil:'0', pts:0 }],
                      }[c.label] || []

                      // Prochain palier à atteindre
                      const currentPts = Number(c.score) || 0
                      const nextTier = bareme.find(b => b.pts > currentPts)
                      const prevTier = [...bareme].reverse().find(b => b.pts <= currentPts)

                      // Stats du mois en cours
                      const totalPresences = hebdoData.filter(h => h.palms === 'P').length
                      const totalAbsences = hebdoData.filter(h => h.palms === 'A').length
                      const totalTat = hebdoData.reduce((s,h) => s+(h.tat||0), 0)
                      const totalRefs = hebdoData.reduce((s,h) => s+(h.rdi||0)+(h.rde||0), 0)
                      const totalRefsInt = hebdoData.reduce((s,h) => s+(h.rdi||0), 0)
                      const totalRefsExt = hebdoData.reduce((s,h) => s+(h.rde||0), 0)
                      const totalInv = hebdoData.reduce((s,h) => s+(h.invites||0), 0)
                      const totalMpb = hebdoData.reduce((s,h) => s+Number(h.mpb||0), 0)
                      const totalCeu = hebdoData.reduce((s,h) => s+(h.ueg||0), 0)
                      const nbReunions = hebdoData.length

                      // Rendu du détail par réunion selon le KPI
                      const renderWeekly = () => {
                        if (hebdoData.length === 0) return <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:8 }}>Aucune donnée hebdomadaire saisie</div>

                        if (c.label === 'Présence') return (
                          <div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                              {hebdoData.map((h, j) => (
                                <div key={j} style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:500, background: h.palms === 'P' ? '#D1FAE5' : '#FEE2E2', color: h.palms === 'P' ? '#065F46' : '#991B1B' }}>
                                  {formatDate(h.date_reunion)} — {h.palms === 'P' ? '✓ Présent' : '✗ Absent'}
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:11, color:'#6B7280', display:'flex', gap:12 }}>
                              <span>✓ {totalPresences} présence(s)</span>
                              <span>✗ {totalAbsences} absence(s)</span>
                              <span>Taux : {nbReunions ? Math.round(totalPresences/nbReunions*100) : 0}%</span>
                            </div>
                          </div>
                        )

                        if (c.label === '1-2-1s') return (
                          <div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                              {hebdoData.map((h, j) => (
                                <div key={j} style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, background: h.tat > 0 ? '#D1FAE5' : '#F3F4F6', color: h.tat > 0 ? '#065F46' : '#9CA3AF' }}>
                                  {formatDate(h.date_reunion)} — {h.tat || 0} TàT
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:11, color:'#6B7280' }}>Total : {totalTat} TàT sur {nbReunions} réunion(s) · Rythme : {nbReunions ? (totalTat/nbReunions).toFixed(2) : '0'}/sem</div>
                          </div>
                        )

                        if (c.label === 'Recommandations') return (
                          <div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                              {hebdoData.map((h, j) => {
                                const refs = (h.rdi||0) + (h.rde||0)
                                return (
                                  <div key={j} style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, background: refs > 0 ? '#D1FAE5' : '#F3F4F6', color: refs > 0 ? '#065F46' : '#9CA3AF' }}>
                                    {formatDate(h.date_reunion)} — {refs} ({h.rdi||0}↗ + {h.rde||0}↙)
                                  </div>
                                )
                              })}
                            </div>
                            <div style={{ fontSize:11, color:'#6B7280' }}>Total : {totalRefs} reco. ({totalRefsInt} internes + {totalRefsExt} externes) · Rythme : {nbReunions ? (totalRefs/nbReunions).toFixed(2) : '0'}/sem</div>
                          </div>
                        )

                        if (c.label === 'TYFCB') return (
                          <div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                              {hebdoData.filter(h => Number(h.mpb) > 0).length > 0 ? hebdoData.filter(h => Number(h.mpb) > 0).map((h, j) => (
                                <div key={j} style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, background:'#D1FAE5', color:'#065F46' }}>
                                  {formatDate(h.date_reunion)} — {Number(h.mpb).toLocaleString('de-DE')} MAD
                                </div>
                              )) : <div style={{ fontSize:11, color:'#9CA3AF' }}>Aucun TYFCB déclaré</div>}
                            </div>
                            <div style={{ fontSize:11, color:'#6B7280' }}>Total : {totalMpb.toLocaleString('de-DE')} MAD</div>
                          </div>
                        )

                        if (c.label === 'Visiteurs') return (
                          <div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                              {hebdoData.map((h, j) => (
                                <div key={j} style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, background: (h.invites||0) > 0 ? '#D1FAE5' : '#F3F4F6', color: (h.invites||0) > 0 ? '#065F46' : '#9CA3AF' }}>
                                  {formatDate(h.date_reunion)} — {h.invites || 0} visiteur(s)
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:11, color:'#6B7280' }}>Total : {totalInv} visiteur(s) sur {nbReunions} réunion(s)</div>
                          </div>
                        )

                        if (c.label === 'CEU') return (
                          <div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                              {hebdoData.map((h, j) => (
                                <div key={j} style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:600, background: (h.ueg||0) > 0 ? '#D1FAE5' : '#F3F4F6', color: (h.ueg||0) > 0 ? '#065F46' : '#9CA3AF' }}>
                                  {formatDate(h.date_reunion)} — {h.ueg || 0} CEU
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:11, color:'#6B7280' }}>Total : {totalCeu} CEU · Rythme : {nbReunions ? (totalCeu/nbReunions).toFixed(2) : '0'}/sem</div>
                          </div>
                        )

                        return <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:8 }}>Données sur 6 mois glissants (consolidé)</div>
                      }

                      return (
                        <div style={{ background:'#fff', borderRadius:'0 0 10px 10px', border:`1px solid ${cardBg.border}`, borderTop:'none', padding:'12px 14px' }}>
                          {/* Barème BNI */}
                          <div style={{ marginBottom:10 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', marginBottom:6 }}>Barème BNI — {c.label}</div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                              {bareme.map((b, j) => (
                                <div key={j} style={{ padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:600,
                                  background: b.pts === currentPts ? cardBg.bg : '#F9FAFB',
                                  color: b.pts === currentPts ? cardBg.color : '#9CA3AF',
                                  border: b.pts === currentPts ? `1.5px solid ${cardBg.bar}` : '1px solid #E8E6E1'
                                }}>
                                  {b.seuil} → {b.pts} pts
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Prochain palier */}
                          {nextTier && (
                            <div style={{ padding:'8px 12px', borderRadius:8, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
                              <span style={{ fontSize:14 }}>🎯</span>
                              <div style={{ fontSize:11, color:'#854D0E' }}>
                                <strong>Prochain palier :</strong> {nextTier.seuil} → {nextTier.pts} pts (+{nextTier.pts - currentPts} pts)
                              </div>
                            </div>
                          )}

                          {/* Détail par réunion */}
                          <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', marginBottom:6 }}>Détail par réunion ({nbReunions})</div>
                          {renderWeekly()}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'radar' && (
            <div>
              <MembreRadarChart score={s} />
              <div style={{ marginTop:12, background:'#fff', borderRadius:10, padding:14, border:'1px solid #E8E6E1', fontSize:12, color:'#6B7280', lineHeight:1.6 }}>
                💡 Le radar montre l'équilibre des performances. Un membre idéal a un hexagone large et régulier. Les axes tronqués indiquent des axes de progression prioritaires.
              </div>
            </div>
          )}

          {tab === 'email' && (
            <div>
              <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                {[['relance','📊 Axes d\'amélioration'],['renouvellement','🔄 Renouvellement'],['felicitations','🏆 Félicitations']].map(([id,label]) => (
                  <button key={id} onClick={() => { setEmailType(id); setEmailContent('') }} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #E8E6E1', fontSize:12, background:emailType===id?'#C41E3A':'#fff', color:emailType===id?'#fff':'#6B7280', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>{label}</button>
                ))}
              </div>
              <button onClick={generateEmail} disabled={emailLoading} style={{ width:'100%', padding:'12px 0', background:emailLoading?'rgba(196,30,58,0.5)':'#C41E3A', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:emailLoading?'not-allowed':'pointer', marginBottom:14, fontFamily:'DM Sans, sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {emailLoading ? <><div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />Génération...</> : '🤖 Générer avec l\'IA'}
              </button>
              {emailContent && (
                <div>
                  <div style={{ background:'#fff', borderRadius:10, padding:16, border:'1px solid #E8E6E1', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', marginBottom:10 }}>{emailContent}</div>
                  <button onClick={() => { navigator.clipboard.writeText(emailContent); alert('Copié !') }} style={{ width:'100%', padding:'10px 0', background:'#1C1C2E', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                    📋 Copier dans le presse-papiers
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
