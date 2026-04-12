import React from 'react'
import { MEMBRES_DATA, ALERTES_DATA } from '../data/bniData'
import { TLBadge, SectionTitle, PageHeader, TableWrap } from './ui'

export default function Dashboard({ onNavigate }) {
  const tyfcb = MEMBRES_DATA.reduce((s, m) => s + (m.tyfcb || 0), 0)
  const presTotal = MEMBRES_DATA.reduce((s, m) => s + m.p, 0)
  const absTotal = MEMBRES_DATA.reduce((s, m) => s + m.a, 0)
  const pRate = Math.round(presTotal / (presTotal + absTotal) * 100)
  const scored = MEMBRES_DATA.filter(m => m.tl)
  const tlCounts = { vert:0, orange:0, rouge:0, gris:0 }
  scored.forEach(m => tlCounts[m.tl]++)

  const cardStyle = (accent) => ({
    background:'#fff', borderRadius:12, padding:'18px 20px',
    border:'1px solid #E8E6E1', borderTop:`3px solid ${accent}`,
    cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s',
  })

  const hoverCard = (e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }
  const unhoverCard = (e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Bonjour, Jean Baptiste 👋"
        sub="MK-01 Kénitra Atlantique · Région Kénitra"
        right={
          <div style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:10, padding:'10px 16px', textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>Lancé le</div>
            <div style={{ fontSize:13, fontWeight:600 }}>12 déc 2025</div>
          </div>
        }
      />

      {/* Stat cards — cliquables */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { label:'Membres actifs', value:'25', sub:'Objectif : 30 membres', accent:'#C41E3A', nav:'membres', prog:83 },
          { label:'Alertes actives', value:'4', sub:'Dont 1 renouvellement urgent', accent:'#F59E0B', nav:'invites', valueColor:'#DC2626' },
          { label:'TYFCB généré', value:`${(tyfcb/1000).toFixed(0)}K MAD`, sub:'En 4 mois de réunions', accent:'#3B82F6', nav:'reporting' },
          { label:'Taux de présence', value:`${pRate}%`, sub:'Moyenne groupe', accent:'#059669', nav:'reporting' },
        ].map(c => (
          <div key={c.label} style={cardStyle(c.accent)} onClick={() => onNavigate(c.nav)} onMouseEnter={hoverCard} onMouseLeave={unhoverCard}>
            <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{c.label}</div>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'Playfair Display, serif', color: c.valueColor || '#1C1C2E' }}>{c.value}</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>{c.sub}</div>
            {c.prog && <div style={{ height:4, background:'#F3F2EF', borderRadius:2, marginTop:10 }}><div style={{ height:4, width:`${c.prog}%`, background:c.accent, borderRadius:2 }} /></div>}
            <div style={{ fontSize:11, color:c.accent, marginTop:6, fontWeight:500 }}>Voir le détail →</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        {/* Alertes — cliquables */}
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>🚨 Alertes prioritaires</SectionTitle>
            <button onClick={() => onNavigate('invites')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir les invités →</button>
          </div>
          <div style={{ padding:12 }}>
            {ALERTES_DATA.map((a, i) => (
              <div key={i} onClick={() => onNavigate(a.type === 'renouvellement' ? 'membres' : 'invites')}
                style={{ display:'flex', alignItems:'flex-start', gap:10, padding:12, borderRadius:8, marginBottom:8, background:a.niveau==='danger'?'#FEF2F2':'#FFFBEB', border:`1px solid ${a.niveau==='danger'?'#FEE2E2':'#FEF3C7'}`, cursor:'pointer', transition:'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity='0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity='1'}
              >
                <div style={{ width:10, height:10, borderRadius:'50%', background:a.niveau==='danger'?'#DC2626':'#D97706', flexShrink:0, marginTop:3 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a.titre}</div>
                  <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{a.msg}</div>
                  <div style={{ fontSize:10, fontWeight:600, color:a.niveau==='danger'?'#DC2626':'#D97706', marginTop:4 }}>Échéance : {a.echeance}</div>
                </div>
                <span style={{ fontSize:11, color:'#9CA3AF', flexShrink:0 }}>→</span>
              </div>
            ))}
          </div>
        </TableWrap>

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Traffic light — cliquable */}
          <div onClick={() => onNavigate('membres')} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', cursor:'pointer' }} onMouseEnter={hoverCard} onMouseLeave={unhoverCard}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Traffic Light</SectionTitle>
              <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir membres →</span>
            </div>
            {[['vert', tlCounts.vert, '#059669'], ['orange', tlCounts.orange, '#D97706'], ['rouge', tlCounts.rouge, '#DC2626'], ['gris', tlCounts.gris, '#9CA3AF']].map(([tl, n, col]) => (
              <div key={tl} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:col }} />
                <span style={{ fontSize:12, width:45 }}>{tl}</span>
                <div style={{ flex:1, background:'#F3F2EF', height:6, borderRadius:3 }}>
                  <div style={{ width:`${n/20*100}%`, height:6, borderRadius:3, background:col }} />
                </div>
                <span style={{ fontSize:12, fontWeight:600, width:20, textAlign:'right' }}>{n}</span>
              </div>
            ))}
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:8 }}>0 membre vert · Groupe de 4 mois</div>
          </div>

          {/* Pipeline — cliquable */}
          <div onClick={() => onNavigate('invites')} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', cursor:'pointer' }} onMouseEnter={hoverCard} onMouseLeave={unhoverCard}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Pipeline invités</SectionTitle>
              <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir →</span>
            </div>
            {[['Total depuis déc 2025', 44, '#1C1C2E'], ['Convertis membres', 5, '#059669'], ['En cours de traitement', 11, '#D97706']].map(([l, v, col]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, color:'#6B7280' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:col }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 — cliquable */}
      <TableWrap>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <SectionTitle>🏆 Top 5 classement membres</SectionTitle>
          <button onClick={() => onNavigate('membres')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir tous les membres →</button>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>{['Rang','Membre','Société','Score','Traffic Light','TYFCB (MAD)'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {MEMBRES_DATA.filter(m => m.rank && m.rank <= 5).map(m => (
              <tr key={m.rank} onClick={() => onNavigate('membres')} style={{ borderBottom:'1px solid #F3F2EF', cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}
              >
                <td style={{ padding:'10px 14px' }}><div style={{ width:22, height:22, borderRadius:'50%', background:'#F3F2EF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'#6B7280' }}>{m.rank}</div></td>
                <td style={{ padding:'10px 14px', fontWeight:500 }}>{m.prenom} {m.nom}</td>
                <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{m.societe}</td>
                <td style={{ padding:'10px 14px', fontWeight:700 }}>{m.score}</td>
                <td style={{ padding:'10px 14px' }}><TLBadge tl={m.tl} /></td>
                <td style={{ padding:'10px 14px', fontWeight:600 }}>{m.tyfcb.toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}
