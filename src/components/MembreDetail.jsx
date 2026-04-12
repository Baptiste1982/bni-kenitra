import React, { useState } from 'react'
import { TLBadge } from './ui'
import { MembreRadarChart } from './ScoresChart'
import { BNI_SYSTEM_PROMPT } from '../data/bniData'
import { supabase } from '../lib/supabase'

export default function MembreDetail({ membre, score, profil, onClose }) {
  const [tab, setTab] = useState('profil')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailContent, setEmailContent] = useState('')
  const [emailType, setEmailType] = useState('relance')

  const m = membre
  const s = score || {}
  const renouv = m.date_renouvellement ? new Date(m.date_renouvellement) : null
  const daysToRenew = renouv ? Math.round((renouv - new Date()) / (1000*60*60*24)) : null
  const isUrgent = daysToRenew !== null && daysToRenew < 90

  const criteria = [
    { label:'Présence', rate: s.attendance_rate, score: s.attendance_score, max:10, format: v => `${Math.round(v*100)}%` },
    { label:'1-2-1s', rate: s.rate_121, score: s.score_121, max:20, format: v => `${Number(v).toFixed(2)}/sem` },
    { label:'Références', rate: s.referrals_given_rate, score: s.referrals_given_score, max:25, format: v => `${Number(v).toFixed(2)}/sem` },
    { label:'Visiteurs', rate: s.visitors, score: s.visitor_score, max:25, format: v => `${v} en 6 mois` },
    { label:'Sponsors', rate: s.sponsors, score: s.sponsor_score, max:5, format: v => `${v} en 6 mois` },
    { label:'TYFCB', rate: s.tyfcb, score: s.tyfcb_score, max:5, format: v => `${Number(v).toLocaleString('fr-FR')} MAD` },
    { label:'CEU', rate: s.ceu_rate, score: s.ceu_score, max:10, format: v => `${Number(v).toFixed(2)}/sem` },
  ]

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
      'Références': { cibleMois: 4, unite: 'références données ce mois', importance: 'Donner des références, c\'est activer le principe du Givers Gain. Plus tu donnes, plus tu reçois. C\'est le moteur de ton retour sur investissement BNI.' },
      'Visiteurs': { cibleMois: 1, unite: 'visiteur invité ce mois', importance: 'Inviter des visiteurs renforce le groupe et montre ton engagement. Chaque visiteur est un membre potentiel qui élargit ton réseau.' },
      'Présence': { cibleMois: 4, unite: 'réunions sur 4 ce mois', importance: 'La présence est la base de tout. Sans présence régulière, impossible de construire la confiance avec les autres membres ni de recevoir des références.' },
      'CEU': { cibleMois: 4, unite: 'CEU ce mois', importance: 'La formation continue te rend plus efficace en réseautage et montre ta volonté de progresser au sein du groupe.' },
      'Sponsors': { cibleMois: 0, unite: '', importance: 'Sponsoriser un nouveau membre montre ton leadership et contribue directement à la croissance du groupe.' },
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
            <div style={{ color:'#fff', fontSize:17, fontWeight:600 }}>{m.prenom} {m.nom}</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginTop:2 }}>{m.societe} · {m.secteur_activite}</div>
          </div>
          <div style={{ textAlign:'right', marginRight:8 }}>
            <div style={{ fontSize:26, fontWeight:700, fontFamily:'Playfair Display, serif', color:tlColor }}>{totalScore}</div>
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
                const barCol = pct >= 70 ? '#059669' : pct >= 40 ? '#D97706' : '#DC2626'
                return (
                  <div key={i} style={{ background:'#fff', borderRadius:10, padding:'12px 14px', border:'1px solid #E8E6E1', marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{c.label}</div>
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{c.rate !== undefined && c.rate !== null ? c.format(c.rate) : '—'}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:18, fontWeight:700, color:barCol }}>{Number(c.score)||0}</div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>/ {c.max} pts</div>
                      </div>
                    </div>
                    <div style={{ height:6, background:'#F3F2EF', borderRadius:3 }}>
                      <div style={{ height:6, width:`${pct}%`, background:barCol, borderRadius:3, transition:'width 0.5s ease' }} />
                    </div>
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
