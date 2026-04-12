import React, { useState, useRef, useEffect } from 'react'
import { fetchInvites, fetchDashboardKPIs, fetchScoresMK01 } from '../lib/bniService'
import { GroupeScoresChart } from './ScoresChart'
import { BNI_SYSTEM_PROMPT } from '../data/bniData'
import { supabase } from '../lib/supabase'
import { PageHeader, SectionTitle, TableWrap, StatCard } from './ui'

// ─── INVITÉS ────────────────────────────────────────────────────────────────
export function Invites() {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tous')

  useEffect(() => {
    fetchInvites().then(data => { setInvites(data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const STATUTS = ['tous','Validé par CM','Fiche envoyée','En stand-by','A recontacter','Devenu Membre','Pas intéressé pour le moment','Injoignable']
  const filtered = filter === 'tous' ? invites : invites.filter(i => i.statut === filter)

  const pipeline = [
    { statut:'Validé par CM', col:'#059669' },
    { statut:'Fiche envoyée', col:'#3B82F6' },
    { statut:'En stand-by', col:'#8B5CF6' },
    { statut:'A recontacter', col:'#D97706' },
    { statut:'Devenu Membre', col:'#059669' },
    { statut:'Pas intéressé pour le moment', col:'#9CA3AF' },
    { statut:'Injoignable', col:'#9CA3AF' },
  ].map(p => ({ ...p, n: invites.filter(i => i.statut === p.statut).length }))

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Pipeline Invités" sub={`MK-01 · ${invites.length} invités depuis déc 2025`} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {pipeline.slice(0,4).map(p => (
          <div key={p.statut} onClick={() => setFilter(p.statut)} style={{ background:'#fff', borderRadius:10, padding:16, border:'1px solid #E8E6E1', borderTop:`3px solid ${p.col}`, cursor:'pointer' }} onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#6B7280', marginBottom:6 }}>{p.statut}</div>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'Playfair Display, serif', color:p.col }}>{loading ? '...' : p.n}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {['tous','Validé par CM','A recontacter','Devenu Membre','Pas intéressé pour le moment'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding:'6px 12px', borderRadius:20, border:'1px solid #E8E6E1', fontSize:12, background:filter===s?'#C41E3A':'#fff', color:filter===s?'#fff':'#6B7280', cursor:'pointer' }}>
            {s === 'tous' ? `Tous (${invites.length})` : s}
          </button>
        ))}
      </div>
      {loading ? <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Chargement...</div> : (
        <TableWrap>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Date','Prénom','Nom','Profession','Statut','Invité par','CA en charge'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {filtered.map((inv, i) => {
                const statCol = inv.statut==='Devenu Membre'||inv.statut==='Validé par CM' ? '#059669' : inv.statut==='A recontacter'||inv.statut==='Fiche envoyée' ? '#D97706' : '#9CA3AF'
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }} onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280' }}>{inv.date_visite ? new Date(inv.date_visite).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:500 }}>{inv.prenom}</td>
                    <td style={{ padding:'10px 14px', fontWeight:500 }}>{inv.nom}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280' }}>{inv.profession || '—'}</td>
                    <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:12, background:statCol+'22', color:statCol }}>{inv.statut || '—'}</span></td>
                    <td style={{ padding:'10px 14px', fontSize:12 }}>{inv.invite_par_nom || '—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:12 }}>{inv.membre_ca_charge_nom || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{filtered.length} invité{filtered.length!==1?'s':''}</div>
        </TableWrap>
      )}
    </div>
  )
}

// ─── GROUPES ─────────────────────────────────────────────────────────────────
export function Groupes() {
  const [kpis, setKpis] = useState(null)
  useEffect(() => { fetchDashboardKPIs().then(setKpis) }, [])

  const tyfcb = kpis?.tyfcb || 0

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Groupes" sub="Région Kénitra · 1 groupe actif · 1 en préparation" />
      <div style={{ background:'#fff', borderRadius:14, padding:24, border:'1px solid #E8E6E1', borderLeft:'4px solid #C41E3A', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontFamily:'Playfair Display, serif', fontSize:28, fontWeight:700, color:'#C41E3A' }}>MK-01</div>
            <div style={{ fontSize:18, fontWeight:600, marginTop:2 }}>Kénitra Atlantique</div>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Lancé le 12 décembre 2025 · Région Kénitra</div>
          </div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:'#D1FAE5', color:'#065F46' }}>Actif</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginTop:20 }}>
          {[[kpis?.membresActifs ?? '…','Membres actifs'],['83%','Objectif rempli'],[kpis?.invitesTotal ?? '…','Invités reçus'],[kpis?.invitesConvertis ?? '…','Convertis'],[(tyfcb/1000).toFixed(0)+'K MAD','TYFCB généré']].map(([v,l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:'Playfair Display, serif' }}>{v}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6B7280', marginBottom:6 }}>
            <span>Progression objectif membres</span><span>{kpis?.membresActifs ?? '…'} / 30</span>
          </div>
          <div style={{ height:6, background:'#F3F2EF', borderRadius:3 }}>
            <div style={{ height:6, width:`${Math.min(100,(kpis?.membresActifs||0)/30*100)}%`, background:'#C41E3A', borderRadius:3 }} />
          </div>
        </div>
      </div>
      <div style={{ background:'#fff', borderRadius:14, padding:24, border:'1px solid #E8E6E1', borderLeft:'4px solid #9CA3AF', opacity:0.85, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontFamily:'Playfair Display, serif', fontSize:28, fontWeight:700, color:'#9CA3AF' }}>MK-02</div>
            <div style={{ fontSize:18, fontWeight:600, marginTop:2 }}>Kénitra Impulse</div>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>En cours de constitution · 2 postulants</div>
          </div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:'#F3F4F6', color:'#4B5563' }}>En préparation</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:20 }}>
          {[['2','Postulants'],['Achraf Nour','Fitness / Bien-être'],['Ilyasse Essafi','Dentiste']].map(([v,l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:15, fontWeight:700, fontFamily:'Playfair Display, serif' }}>{v}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ textAlign:'center', padding:20 }}>
        <button style={{ padding:'12px 24px', background:'transparent', border:'2px dashed #E8E6E1', borderRadius:10, fontSize:13, color:'#9CA3AF', cursor:'pointer' }}>+ Ajouter un groupe</button>
      </div>
    </div>
  )
}

// ─── REPORTING ───────────────────────────────────────────────────────────────
export function Reporting() {
  const [scores, setScores] = useState([])
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchScoresMK01(), fetchDashboardKPIs()]).then(([s, k]) => { setScores(s); setKpis(k); setLoading(false) })
  }, [])

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Reporting" sub="MK-01 Kénitra Atlantique · Oct 2025 → Mars 2026" />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <StatCard label="TYFCB total" value={kpis ? `${(kpis.tyfcb/1000).toFixed(0)}K MAD` : '…'} sub="Affaires entre membres" accent="#3B82F6" />
        <StatCard label="Recommandations données" value={loading ? '…' : scores.reduce((s,r)=>s+(Number(r.referrals_given_score)||0),0)} sub="Score total" accent="#8B5CF6" />
        <StatCard label="Taux de présence" value={kpis ? `${kpis.pRate}%` : '…'} sub="Moyenne groupe" accent="#059669" />
        <StatCard label="Conversion invités" value={kpis && kpis.invitesTotal > 0 ? `${Math.round(kpis.invitesConvertis/kpis.invitesTotal*100)}%` : '…'} sub={`${kpis?.invitesConvertis || 0} sur ${kpis?.invitesTotal || 0} invités`} accent="#C41E3A" />
      </div>
      {!loading && <div style={{ marginBottom:16 }}><GroupeScoresChart scores={scores} /></div>}
      {loading ? <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Chargement...</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <TableWrap>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>💰 Top TYFCB générés</SectionTitle></div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Membre','TYFCB (MAD)','TL'].map(h=><th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
              <tbody>
                {scores.filter(s=>Number(s.tyfcb)>0).sort((a,b)=>Number(b.tyfcb)-Number(a.tyfcb)).slice(0,8).map((s,i)=>{
                  const tyb = Number(s.tyfcb) >= 300000 ? {bg:'#D1FAE5',c:'#065F46'} : Number(s.tyfcb) >= 50000 ? {bg:'#FEF9C3',c:'#854D0E'} : Number(s.tyfcb) >= 20000 ? {bg:'#FFEDD5',c:'#9A3412'} : {bg:'#FEE2E2',c:'#991B1B'}
                  const tb = s.traffic_light==='vert'?{bg:'#D1FAE5',c:'#065F46'}:s.traffic_light==='orange'?{bg:'#FFEDD5',c:'#9A3412'}:s.traffic_light==='rouge'?{bg:'#FEE2E2',c:'#991B1B'}:{bg:'#F3F4F6',c:'#4B5563'}
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }} onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'8px 12px', fontWeight:500, fontSize:13 }}>{s.membres?.prenom} {s.membres?.nom}</td>
                      <td style={{ padding:'8px 12px', fontWeight:700, fontSize:13, background:tyb.bg, color:tyb.c, textAlign:'center' }}>{Number(s.tyfcb).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><span style={{ fontSize:11, fontWeight:500, color:tb.c }}>{s.traffic_light||'—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
          <TableWrap>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>🏆 Classement complet</SectionTitle></div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['#','Membre','Score','TL'].map(h=><th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
              <tbody>
                {scores.filter(s=>s.rank).sort((a,b)=>a.rank-b.rank).map((s,i)=>{
                  const sc = Number(s.total_score||0)
                  const scBg = sc >= 70 ? {bg:'#D1FAE5',c:'#065F46'} : sc >= 50 ? {bg:'#FEF9C3',c:'#854D0E'} : sc >= 30 ? {bg:'#FEE2E2',c:'#991B1B'} : {bg:'#F3F4F6',c:'#4B5563'}
                  const tb = s.traffic_light==='vert'?{bg:'#D1FAE5',c:'#065F46'}:s.traffic_light==='orange'?{bg:'#FFEDD5',c:'#9A3412'}:s.traffic_light==='rouge'?{bg:'#FEE2E2',c:'#991B1B'}:{bg:'#F3F4F6',c:'#4B5563'}
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }} onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:12, width:30 }}>{s.rank}</td>
                      <td style={{ padding:'8px 12px', fontWeight:500, fontSize:13 }}>{s.membres?.prenom} {s.membres?.nom}</td>
                      <td style={{ padding:'8px 12px', fontWeight:700, fontSize:14, background:scBg.bg, color:scBg.c, textAlign:'center', width:60 }}>{sc}</td>
                      <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><span style={{ fontSize:11, fontWeight:500, color:tb.c }}>{s.traffic_light||'—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </div>
  )
}

// ─── AGENT IA ────────────────────────────────────────────────────────────────
export function AgentIA() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef(null)

  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight }, [messages, loading])

  const send = async (text) => {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')
    const newMessages = [...messages, { role:'user', content }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { system: BNI_SYSTEM_PROMPT, max_tokens: 1000, messages: newMessages.map(m => ({ role: m.role, content: m.content })) }
      })
      if (error) throw error
      setMessages([...newMessages, { role:'assistant', content:data.content?.[0]?.text || 'Désolé, erreur.' }])
    } catch { setMessages([...newMessages, { role:'assistant', content:'Erreur de connexion.' }]) }
    setLoading(false)
  }

  const QUICK = ['Qui sont mes membres à risque ?','Génère un email pour Zaynab','Actions prioritaires cette semaine ?','Analyse le pipeline invités']

  return (
    <div style={{ padding:'28px 32px 0', height:'100%', display:'flex', flexDirection:'column', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title={<>Agent IA <span style={{ fontSize:16, fontFamily:'DM Sans, sans-serif', fontWeight:400, color:'#C9A84C' }}>· Conseiller BNI</span></>} sub="Analyse · Rédaction · Plans d'action" />
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid #E8E6E1', overflow:'hidden', minHeight:0 }}>
        <div ref={msgsRef} style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, lineHeight:1.6 }}>
            <strong>👋 Agent BNI Kénitra actif</strong><br /><br />
            Je connais vos membres, scores, alertes et pipeline en temps réel. Comment puis-je vous aider ?
          </div>
          {messages.map((m, i) => (
            <div key={i} style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap', alignSelf:m.role==='user'?'flex-end':'flex-start', borderBottomRightRadius:m.role==='user'?4:12, borderBottomLeftRadius:m.role==='user'?12:4, background:m.role==='user'?'#C41E3A':'#F3F2EF', color:m.role==='user'?'#fff':'#1C1C2E' }}>
              {m.content}
            </div>
          ))}
          {loading && <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, color:'#9CA3AF' }}>L'agent réfléchit...</div>}
        </div>
        <div style={{ padding:'0 16px 10px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {QUICK.map(q => <button key={q} onClick={() => send(q)} style={{ padding:'6px 12px', border:'1px solid #E8E6E1', borderRadius:20, fontSize:12, background:'#fff', color:'#6B7280', cursor:'pointer' }}>{q}</button>)}
        </div>
        <div style={{ padding:16, borderTop:'1px solid #E8E6E1', display:'flex', gap:10 }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Posez votre question..." rows={2} style={{ flex:1, padding:'11px 16px', border:'1px solid #E8E6E1', borderRadius:10, fontSize:13, fontFamily:'DM Sans, sans-serif', resize:'none', outline:'none' }} />
          <button onClick={() => send()} disabled={loading||!input.trim()} style={{ padding:'11px 20px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:loading||!input.trim()?'not-allowed':'pointer', opacity:loading||!input.trim()?0.5:1 }}>Envoyer</button>
        </div>
      </div>
    </div>
  )
}
