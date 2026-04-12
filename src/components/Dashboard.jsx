import React, { useState, useEffect } from 'react'
import { fetchDashboardKPIs } from '../lib/bniService'
import { TLBadge, SectionTitle, PageHeader, TableWrap } from './ui'

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
          { label:'Membres actifs', value: kpis?.membresActifs ?? '—', sub:'Objectif : 30 membres', accent:'#C41E3A', nav:'membres', prog: kpis ? kpis.membresActifs/30*100 : 0 },
          { label:'Alertes actives', value: kpis?.alertesCount ?? '—', sub:'Cliquez pour voir le détail', accent:'#F59E0B', nav:'invites', valueColor: kpis?.alertesCount > 0 ? '#DC2626' : '#059669' },
          { label:'TYFCB généré', value: kpis ? `${(kpis.tyfcb/1000).toFixed(0)}K MAD` : '—', sub:'En 4 mois de réunions', accent:'#3B82F6', nav:'reporting' },
          { label:'Taux de présence', value: kpis ? `${kpis.pRate}%` : '—', sub:'Moyenne groupe', accent:'#059669', nav:'reporting' },
        ].map(c => (
          <div key={c.label} onClick={() => onNavigate(c.nav)} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'18px 20px', border:'1px solid #E8E6E1', borderTop:`3px solid ${c.accent}`, cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{c.label}</div>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'Playfair Display, serif', color: c.valueColor || '#1C1C2E' }}>{c.value}</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>{c.sub}</div>
            {c.prog !== undefined && <div style={{ height:4, background:'#F3F2EF', borderRadius:2, marginTop:10 }}><div style={{ height:4, width:`${Math.min(100,c.prog)}%`, background:c.accent, borderRadius:2 }} /></div>}
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
            {[['vert', tl.vert, '#059669'], ['orange', tl.orange, '#D97706'], ['rouge', tl.rouge, '#DC2626'], ['gris', tl.gris, '#9CA3AF']].map(([t, n, col]) => (
              <div key={t} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:col }} />
                <span style={{ fontSize:12, width:45 }}>{t}</span>
                <div style={{ flex:1, background:'#F3F2EF', height:6, borderRadius:3 }}>
                  <div style={{ width:`${(n || 0)/20*100}%`, height:6, borderRadius:3, background:col }} />
                </div>
                <span style={{ fontSize:12, fontWeight:600, width:20, textAlign:'right' }}>{n || 0}</span>
              </div>
            ))}
          </div>

          <div onClick={() => onNavigate('invites')} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Pipeline invités</SectionTitle>
              <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir →</span>
            </div>
            {[['Total', kpis?.invitesTotal ?? '—', '#1C1C2E'], ['Convertis', kpis?.invitesConvertis ?? '—', '#059669'], ['En cours', kpis?.invitesEnCours ?? '—', '#D97706']].map(([l, v, col]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, color:'#6B7280' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:col }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 live */}
      <TableWrap>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <SectionTitle>🏆 Top 5 classement membres</SectionTitle>
          <button onClick={() => onNavigate('membres')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir tous →</button>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>{['Rang','Membre','Société','Score','Traffic Light','TYFCB (MAD)'].map(h => (
            <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {topScores.map(s => (
              <tr key={s.rank} onClick={() => onNavigate('membres')} style={{ borderBottom:'1px solid #F3F2EF', cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <td style={{ padding:'10px 14px' }}><div style={{ width:22, height:22, borderRadius:'50%', background:'#F3F2EF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#6B7280' }}>{s.rank}</div></td>
                <td style={{ padding:'10px 14px', fontWeight:500 }}>{s.membres?.prenom} {s.membres?.nom}</td>
                <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{s.membres?.societe || '—'}</td>
                <td style={{ padding:'10px 14px', fontWeight:700 }}>{Number(s.total_score).toFixed(0)}</td>
                <td style={{ padding:'10px 14px' }}><TLBadge tl={s.traffic_light} /></td>
                <td style={{ padding:'10px 14px', fontWeight:600 }}>{s.tyfcb ? Number(s.tyfcb).toLocaleString('fr-FR') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
