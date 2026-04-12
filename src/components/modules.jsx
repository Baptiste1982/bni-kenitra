import React, { useState, useRef, useEffect } from 'react'
import { INVITES_DATA, MEMBRES_DATA, BNI_SYSTEM_PROMPT } from '../data/bniData'
import { PageHeader, SectionTitle, TableWrap, StatCard } from './ui'

// ─── INVITÉS ────────────────────────────────────────────────────────────────
export function Invites() {
  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Pipeline Invités" sub="MK-01 · Décembre 2025 → Avril 2026 · 44 invités" />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
        {INVITES_DATA.map((inv, i) => (
          <div key={i} style={{ background:'#fff', borderRadius:10, padding:16, border:'1px solid #E8E6E1', borderTop:`3px solid ${inv.col}` }}>
            <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#6B7280', marginBottom:6 }}>{inv.statut}</div>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'Playfair Display, serif', color:inv.col }}>{inv.n}</div>
            {inv.noms && <div style={{ fontSize:11, color:'#6B7280', marginTop:8, lineHeight:1.5 }}>{inv.noms}</div>}
          </div>
        ))}
      </div>
      <TableWrap>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>⚡ Actions urgentes</SectionTitle></div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>{['Invité','Statut','Invité par','Action requise'].map(h => (
            <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {[
              { nom:'Nada Souikra', statut:'Validé CM', statCol:'#059669', statBg:'#D1FAE5', par:'Hind ACHKIRE', action:'Relance adhésion immédiate', actionCol:'#DC2626' },
              { nom:'Youssef Elhessni', statut:'Validé CM', statCol:'#059669', statBg:'#D1FAE5', par:'Rafik BOUSSELHAM', action:'Relance adhésion immédiate', actionCol:'#DC2626' },
              { nom:'Mohammed Bouayoun', statut:'Fiche envoyée', statCol:'#1D4ED8', statBg:'#DBEAFE', par:'Ouiame Sibari', action:'3 relances sans réponse — décision', actionCol:'#D97706' },
              { nom:'Noura El Azhari', statut:'Stand-by', statCol:'#5B21B6', statBg:'#EDE9FE', par:'Nizar Ouahbi', action:'Appel de courtoisie', actionCol:'#6B7280' },
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}>
                <td style={{ padding:'10px 14px', fontWeight:500 }}>{r.nom}</td>
                <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:12, background:r.statBg, color:r.statCol }}>{r.statut}</span></td>
                <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280' }}>{r.par}</td>
                <td style={{ padding:'10px 14px', fontSize:12, fontWeight:500, color:r.actionCol }}>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}

// ─── GROUPES ─────────────────────────────────────────────────────────────────
export function Groupes() {
  const tyfcb = MEMBRES_DATA.reduce((s, m) => s + (m.tyfcb || 0), 0)
  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Groupes" sub="Région Kénitra · 1 groupe actif · 1 en préparation" />
      {/* MK-01 */}
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
          {[['25','Membres actifs'],['83%','Objectif rempli'],['44','Invités reçus'],['5','Convertis'],[(tyfcb/1000).toFixed(0)+'K MAD','TYFCB généré']].map(([v, l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:'Playfair Display, serif' }}>{v}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6B7280', marginBottom:6 }}>
            <span>Progression objectif membres</span><span>25 / 30</span>
          </div>
          <div style={{ height:6, background:'#F3F2EF', borderRadius:3 }}>
            <div style={{ height:6, width:'83%', background:'#C41E3A', borderRadius:3 }} />
          </div>
        </div>
      </div>
      {/* MK-02 */}
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
          {[['2','Postulants'],['Achraf Nour','Fitness / Bien-être'],['Ilyasse Essafi','Dentiste']].map(([v, l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:15, fontWeight:700, fontFamily:'Playfair Display, serif' }}>{v}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ textAlign:'center', padding:20 }}>
        <button style={{ padding:'12px 24px', background:'transparent', border:'2px dashed #E8E6E1', borderRadius:10, fontSize:13, color:'#9CA3AF' }}>
          + Ajouter un groupe
        </button>
      </div>
    </div>
  )
}

// ─── REPORTING ───────────────────────────────────────────────────────────────
export function Reporting() {
  const tyfcb = MEMBRES_DATA.reduce((s, m) => s + (m.tyfcb || 0), 0)
  const refs = MEMBRES_DATA.reduce((s, m) => s + (m.refs || 0), 0)
  const presTotal = MEMBRES_DATA.reduce((s, m) => s + m.p, 0)
  const absTotal = MEMBRES_DATA.reduce((s, m) => s + m.a, 0)
  const pRate = Math.round(presTotal / (presTotal + absTotal) * 100)

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Reporting" sub="MK-01 Kénitra Atlantique · Oct 2025 → Mars 2026" />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <StatCard label="TYFCB total" value={`${(tyfcb/1000).toFixed(0)}K MAD`} sub="Affaires entre membres" accent="#3B82F6" />
        <StatCard label="Références" value={refs} sub="En 4 mois de réunions" accent="#8B5CF6" />
        <StatCard label="Taux présence" value={`${pRate}%`} sub={`${presTotal}P / ${absTotal}A`} accent="#059669" />
        <StatCard label="Conversion invités" value="11%" sub="5 membres sur 44 invités" accent="#C41E3A" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>Top TYFCB générés</SectionTitle></div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Membre','TYFCB (MAD)'].map(h => <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
            <tbody>
              {MEMBRES_DATA.filter(m => m.tyfcb > 0).sort((a, b) => b.tyfcb - a.tyfcb).slice(0, 8).map((m, i) => (
                <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}>
                  <td style={{ padding:'10px 14px', fontWeight:500 }}>{m.prenom} {m.nom}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700 }}>{m.tyfcb.toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>Membres à surveiller — Absences</SectionTitle></div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Membre','Absences','Présences'].map(h => <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
            <tbody>
              {MEMBRES_DATA.filter(m => m.a > 0).sort((a, b) => b.a - a.a).map((m, i) => (
                <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}>
                  <td style={{ padding:'10px 14px', fontWeight:500 }}>{m.prenom} {m.nom}</td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color: m.a >= 4 ? '#DC2626' : m.a >= 2 ? '#D97706' : '#1C1C2E' }}>{m.a}</td>
                  <td style={{ padding:'10px 14px', color:'#059669' }}>{m.p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </div>
  )
}

// ─── AGENT IA ────────────────────────────────────────────────────────────────
export function AgentIA() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef(null)

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages, loading])

  const send = async (text) => {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')
    const newMessages = [...messages, { role:'user', content }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          system: BNI_SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role:m.role, content:m.content }))
        })
      })
      const data = await resp.json()
      const reply = data.content?.[0]?.text || 'Désolé, une erreur s\'est produite.'
      setMessages([...newMessages, { role:'assistant', content:reply }])
    } catch {
      setMessages([...newMessages, { role:'assistant', content:'Erreur de connexion. Veuillez réessayer.' }])
    }
    setLoading(false)
  }

  const QUICK = ['Qui sont mes membres à risque ?', 'Génère un email pour Zaynab', 'Analyse mon pipeline invités', 'Actions prioritaires cette semaine ?']

  return (
    <div style={{ padding:'28px 32px 0', height:'100%', display:'flex', flexDirection:'column', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title={<>Agent IA <span style={{ fontSize:16, fontFamily:'DM Sans, sans-serif', fontWeight:400, color:'#C9A84C' }}>· Conseiller BNI</span></>} sub="Analyse en temps réel · Génération de messages · Plans d'action" />
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid #E8E6E1', overflow:'hidden', minHeight:0 }}>
        {/* Messages */}
        <div ref={msgsRef} style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, lineHeight:1.6 }}>
            <strong>👋 Agent BNI Kénitra actif</strong><br /><br />
            Je connais vos 25 membres, leurs scores Traffic Light, le pipeline invités et les 4 alertes actives.<br /><br />
            Comment puis-je vous aider aujourd'hui ?
          </div>
          {messages.map((m, i) => (
            <div key={i} style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap', alignSelf: m.role==='user'?'flex-end':'flex-start', borderBottomRightRadius: m.role==='user'?4:12, borderBottomLeftRadius: m.role==='user'?12:4, background: m.role==='user'?'#C41E3A':'#F3F2EF', color: m.role==='user'?'#fff':'#1C1C2E' }}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, color:'#9CA3AF' }}>
              L'agent réfléchit...
            </div>
          )}
        </div>
        {/* Quick actions */}
        <div style={{ padding:'0 16px 10px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {QUICK.map(q => (
            <button key={q} onClick={() => send(q)} style={{ padding:'6px 12px', border:'1px solid #E8E6E1', borderRadius:20, fontSize:12, background:'#fff', color:'#6B7280' }}>
              {q}
            </button>
          ))}
        </div>
        {/* Input */}
        <div style={{ padding:16, borderTop:'1px solid #E8E6E1', display:'flex', gap:10 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Posez votre question à l'Agent BNI..."
            rows={2}
            style={{ flex:1, padding:'11px 16px', border:'1px solid #E8E6E1', borderRadius:10, fontSize:13, fontFamily:'DM Sans, sans-serif', resize:'none', outline:'none' }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()} style={{ padding:'11px 20px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, opacity: loading || !input.trim() ? 0.5 : 1 }}>
            Envoyer
          </button>
        </div>
      </div>
    </div>
  )
}
