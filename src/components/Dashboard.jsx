import React, { useState, useEffect } from 'react'
import { fetchDashboardKPIs } from '../lib/bniService'
import { TLBadge, SectionTitle, PageHeader, TableWrap } from './ui'

const scoreBg = (score) => score >= 70 ? { bg:'#D1FAE5', color:'#065F46' } : score >= 50 ? { bg:'#FEF9C3', color:'#854D0E' } : score >= 30 ? { bg:'#FEE2E2', color:'#991B1B' } : { bg:'#F3F4F6', color:'#4B5563' }
const tlBg = (tl) => ({ vert:{bg:'#D1FAE5',color:'#065F46'}, orange:{bg:'#FEF9C3',color:'#854D0E'}, rouge:{bg:'#FEE2E2',color:'#991B1B'}, gris:{bg:'#F3F4F6',color:'#4B5563'} }[tl] || {bg:'#F3F4F6',color:'#4B5563'})
const tyfcbBg = (val) => val >= 300000 ? {bg:'#D1FAE5',color:'#065F46'} : val >= 50000 ? {bg:'#FEF9C3',color:'#854D0E'} : val >= 20000 ? {bg:'#FEF9C3',color:'#854D0E'} : val > 0 ? {bg:'#FEE2E2',color:'#991B1B'} : {bg:'#F3F4F6',color:'#4B5563'}
const nameColor = (score) => Number(score||0) >= 70 ? '#065F46' : Number(score||0) >= 50 ? '#854D0E' : Number(score||0) >= 30 ? '#991B1B' : '#6B7280'
const rowBg = (tl) => ({ vert:'#D1FAE5', orange:'#FEF9C3', rouge:'#FEE2E2', gris:'#F9FAFB' }[tl] || '#fff')

export default function Dashboard({ onNavigate }) {
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardKPIs().then(data => { setKpis(data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const hover = e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform='translateY(-1px)' }
  const unhover = e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' }

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, border:'3px solid #E8E6E1', borderTopColor:'#C41E3A', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
        <div style={{ color:'#9CA3AF', fontSize:13 }}>Chargement des données live...</div>
      </div>
    </div>
  )

  const tl = kpis?.tlCounts || { vert:0, orange:0, rouge:0, gris:0 }
  const topScores = (kpis?.scores || []).filter(s => s.rank && s.rank <= 5).sort((a,b) => a.rank - b.rank)
  const topTyfcb = [...(kpis?.scores || [])].filter(s => Number(s.tyfcb) > 0).sort((a,b) => Number(b.tyfcb) - Number(a.tyfcb)).slice(0, 8)

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Bonjour, Jean Baptiste 👋"
        sub="MK-01 Kénitra Atlantique · Données en temps réel"
        right={
          <div style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:10, padding:'10px 16px', textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>Lancé le</div>
            <div style={{ fontSize:13, fontWeight:600 }}>12 déc 2025</div>
          </div>
        }
      />

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Membres actifs', value: kpis?.membresActifs ?? '—', sub:'Objectif : 30 membres', nav:'membres', prog: kpis ? kpis.membresActifs/30*100 : 0, bg: kpis?.membresActifs >= 25 ? '#D1FAE5' : kpis?.membresActifs >= 20 ? '#FEF9C3' : '#FEE2E2', valueColor: kpis?.membresActifs >= 25 ? '#065F46' : kpis?.membresActifs >= 20 ? '#854D0E' : '#991B1B', accent:'#C41E3A' },
          { label:'Alertes actives', value: kpis?.alertesCount ?? '—', sub:'Cliquez pour voir le détail', nav:'invites', bg: kpis?.alertesCount === 0 ? '#D1FAE5' : kpis?.alertesCount <= 2 ? '#FEF9C3' : '#FEE2E2', valueColor: kpis?.alertesCount === 0 ? '#065F46' : '#991B1B', accent:'#F59E0B' },
          { label:'TYFCB généré', value: kpis ? `${Math.round(kpis.tyfcb).toLocaleString('de-DE')} MAD` : '—', sub:'En 4 mois de réunions', nav:'reporting', bg: kpis?.tyfcb >= 300000 ? '#D1FAE5' : kpis?.tyfcb >= 50000 ? '#FEF9C3' : '#FEE2E2', valueColor: kpis?.tyfcb >= 300000 ? '#065F46' : kpis?.tyfcb >= 50000 ? '#854D0E' : '#991B1B', accent:'#3B82F6' },
          { label:'Taux de présence', value: kpis ? `${kpis.pRate}%` : '—', sub:'Moyenne groupe', nav:'reporting', bg: kpis?.pRate >= 95 ? '#D1FAE5' : kpis?.pRate >= 88 ? '#FEF9C3' : '#FEE2E2', valueColor: kpis?.pRate >= 95 ? '#065F46' : kpis?.pRate >= 88 ? '#854D0E' : '#991B1B', accent:'#059669' },
        ].map(c => (
          <div key={c.label} onClick={() => onNavigate(c.nav)} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:c.bg || '#fff', borderRadius:12, padding:'18px 20px', border:'1px solid rgba(0,0,0,0.06)', borderTop:`3px solid ${c.accent}`, cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{c.label}</div>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'Playfair Display, serif', color: c.valueColor || '#1C1C2E' }}>{c.value}</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>{c.sub}</div>
            {c.prog !== undefined && <div style={{ height:4, background:'rgba(255,255,255,0.5)', borderRadius:2, marginTop:10 }}><div style={{ height:4, width:`${Math.min(100,c.prog)}%`, background:c.accent, borderRadius:2 }} /></div>}
            <div style={{ fontSize:11, color:c.accent, marginTop:6, fontWeight:500 }}>Voir le détail →</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        {/* Alertes live */}
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>🚨 Alertes prioritaires — Live</SectionTitle>
            <button onClick={() => onNavigate('invites')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir les invités →</button>
          </div>
          <div style={{ padding:12 }}>
            {(kpis?.alertes || []).length === 0 ? (
              <div style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>✅ Aucune alerte active</div>
            ) : (kpis?.alertes || []).map((a, i) => (
              <div key={i} onClick={() => onNavigate(a.type_alerte === 'renouvellement' ? 'membres' : 'invites')}
                style={{ display:'flex', alignItems:'flex-start', gap:10, padding:12, borderRadius:8, marginBottom:8, background:a.niveau==='danger'?'#FEF2F2':'#FFFBEB', border:`1px solid ${a.niveau==='danger'?'#FEE2E2':'#FEF3C7'}`, cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.opacity='0.8'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:a.niveau==='danger'?'#DC2626':'#D97706', flexShrink:0, marginTop:3 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a.titre}</div>
                  <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{a.message}</div>
                  {a.date_echeance && <div style={{ fontSize:10, fontWeight:600, color:a.niveau==='danger'?'#DC2626':'#D97706', marginTop:4 }}>Échéance : {new Date(a.date_echeance).toLocaleDateString('fr-FR')}</div>}
                </div>
                <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>→</span>
              </div>
            ))}
          </div>
        </TableWrap>

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div onClick={() => onNavigate('membres')} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Traffic Light</SectionTitle>
              <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir →</span>
            </div>
            {[['vert', tl.vert, '#059669', '#D1FAE5'], ['orange', tl.orange, '#854D0E', '#FEF9C3'], ['rouge', tl.rouge, '#991B1B', '#FEE2E2'], ['gris', tl.gris, '#4B5563', '#F3F4F6']].map(([t, n, col, bg]) => (
              <div key={t} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'6px 10px', borderRadius:8, background:bg }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:col }} />
                <span style={{ fontSize:12, width:45, fontWeight:600, color:col }}>{t}</span>
                <div style={{ flex:1, background:'rgba(255,255,255,0.5)', height:6, borderRadius:3 }}>
                  <div style={{ width:`${(n || 0)/25*100}%`, height:6, borderRadius:3, background:col }} />
                </div>
                <span style={{ fontSize:14, fontWeight:700, width:24, textAlign:'right', color:col }}>{n || 0}</span>
              </div>
            ))}
          </div>

          <div onClick={() => onNavigate('invites')} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Pipeline invités</SectionTitle>
              <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir →</span>
            </div>
            {[['Total', kpis?.invitesTotal ?? '—', '#1C1C2E'], ['Devenus membres', kpis?.invitesConvertis ?? '—', '#059669'], ['Membres BNI', kpis?.invitesMembresBNI ?? '—', '#6366F1'], ['En cours', kpis?.invitesEnCours ?? '—', '#D97706']].map(([l, v, col]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, color:'#6B7280' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:col }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top classement + Top TYFCB */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>🏆 Top classement</SectionTitle>
            <button onClick={() => onNavigate('membres')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir tous →</button>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['#','Membre','Score','TL'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {topScores.map(s => {
                const sc = scoreBg(Number(s.total_score))
                const tb = tlBg(s.traffic_light)
                return (
                  <tr key={s.rank} onClick={() => onNavigate('membres')} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', cursor:'pointer', background:rowBg(s.traffic_light) }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                    <td style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:12, width:30 }}>{s.rank}</td>
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:nameColor(s.total_score) }}>{s.membres?.prenom} {s.membres?.nom}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, fontSize:14, background:sc.bg, color:sc.color, textAlign:'center', width:60 }}>{Number(s.total_score).toFixed(0)}</td>
                    <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><TLBadge tl={s.traffic_light} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>

        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>💰 Top TYFCB</SectionTitle>
            <button onClick={() => onNavigate('membres')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir tous →</button>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Membre','TYFCB (MAD)','TL'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {topTyfcb.map((s, i) => {
                const tb = tlBg(s.traffic_light)
                const tyb = tyfcbBg(Number(s.tyfcb))
                return (
                  <tr key={i} onClick={() => onNavigate('membres')} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', cursor:'pointer', background:rowBg(s.traffic_light) }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:nameColor(s.total_score) }}>{s.membres?.prenom} {s.membres?.nom}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, fontSize:13, background:tyb.bg, color:tyb.color, textAlign:'center' }}>{Number(s.tyfcb).toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                    <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><TLBadge tl={s.traffic_light} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
