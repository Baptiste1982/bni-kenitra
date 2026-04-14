import React, { useState, useEffect } from 'react'
import { fetchRegionKPIs } from '../lib/bniService'
import { PageHeader, SectionTitle, TableWrap, fullName } from './ui'

const GROUP_COLORS = { 'MK-01': '#C41E3A', 'MK-02': '#3B82F6' }
const fmtMAD = v => Math.round(v).toLocaleString('de-DE') + ' MAD'
const fmtNum = v => Number(v).toLocaleString('de-DE')

// Même logique de couleurs conditionnelles que Dashboard
const kpiBg = (good, mid, val, threshGood, threshMid) =>
  val >= threshGood ? { bg:'#D1FAE5', topBg:'#A7F3D0', color:'#065F46' }
  : val >= threshMid ? { bg:'#FEF9C3', topBg:'#FDE68A', color:'#854D0E' }
  : { bg:'#FEE2E2', topBg:'#FECACA', color:'#991B1B' }

export default function Region() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRegionKPIs().then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const isMobile = window.innerWidth <= 768

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, border:'3px solid #E8E6E1', borderTopColor:'#C41E3A', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
        <div style={{ color:'#9CA3AF', fontSize:13 }}>Chargement des données régionales...</div>
      </div>
    </div>
  )

  if (!data) return <div style={{ padding:32, color:'#9CA3AF', textAlign:'center' }}>Aucune donnée disponible</div>

  const groupeCodes = Object.keys(data.byGroupe)
  const hover = e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform='translateY(-1px)' }
  const unhover = e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' }

  // Barre comparative horizontale
  const CompareBar = ({ label, values, format = 'num', max }) => {
    const maxVal = max || Math.max(...values.map(v => v.value), 1)
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
        {values.map((v, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <div style={{ width:48, fontSize:10, fontWeight:600, color:v.color || '#6B7280', textAlign:'right', flexShrink:0 }}>{v.label}</div>
            <div style={{ flex:1, background:'#F3F2EF', borderRadius:4, height:22, overflow:'hidden', position:'relative' }}>
              <div style={{ height:'100%', width:`${Math.min(100, v.value / maxVal * 100)}%`, background:v.color || '#C41E3A', borderRadius:4, transition:'width 0.6s ease', minWidth: v.value > 0 ? 2 : 0 }} />
            </div>
            <div style={{ width:80, fontSize:12, fontWeight:700, color:'#1C1C2E', textAlign:'right', flexShrink:0 }}>
              {format === 'mad' ? fmtMAD(v.value) : format === 'pct' ? v.value + '%' : fmtNum(v.value)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Top table — même style que Dashboard
  const TopTable = ({ title, icon, items, valueLabel, formatFn = fmtNum }) => (
    <TableWrap>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <SectionTitle>{icon} {title}</SectionTitle>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr>
          {['#', 'Membre', 'Groupe', valueLabel].map(h => (
            <th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)' }}
              onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
              <td style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:12, width:30 }}>{i + 1}</td>
              <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:'#1C1C2E' }}>
                {item.membres ? fullName(item.membres.prenom, item.membres.nom) : fullName(item.prenom, item.nom)}
              </td>
              <td style={{ padding:'8px 12px' }}>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background: (GROUP_COLORS[item.groupeCode] || '#6B7280') + '15', color: GROUP_COLORS[item.groupeCode] || '#6B7280', fontWeight:600 }}>{item.groupeCode}</span>
              </td>
              <td style={{ padding:'8px 12px', fontWeight:700, fontSize:13, color:'#1C1C2E', textAlign:'right' }}>{formatFn(item.total_score ?? item.tyfcb ?? item.total)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>Aucune donnée</td></tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  )

  // KPI cards data — même esthétique que Dashboard
  const objRegional = groupeCodes.length * 30
  const kpiCards = [
    { label:'Membres actifs', value: data.totalMembres, sub:`Objectif régional : ${objRegional}`,
      ...kpiBg(null,null, data.totalMembres, objRegional*0.83, objRegional*0.66),
      prog: data.totalMembres / objRegional * 100,
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].membresActifs}`) },
    { label:'Taux de présence', value: data.pRateRegion + '%', sub:'Moyenne pondérée région',
      ...kpiBg(null,null, data.pRateRegion, 95, 88),
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].pRate}%`) },
    { label:'TYFCB généré', value: fmtMAD(data.tyfcbRegion), sub:'Business total référencé',
      ...kpiBg(null,null, data.tyfcbRegion, 500000, 100000),
      detail: groupeCodes.map(c => `${c}: ${fmtMAD(data.byGroupe[c].tyfcb)}`) },
    { label:'Recommandations', value: fmtNum(data.totalRecosRegion), sub:`${data.recosParMembreRegion} par membre`,
      ...kpiBg(null,null, data.totalRecosRegion, 80, 30),
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].totalRecos}`) },
    { label:'Score PALMS moyen', value: data.scoreMoyenRegion, sub:'Moyenne régionale',
      ...kpiBg(null,null, data.scoreMoyenRegion, 70, 50),
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].scoreMoyen}`) },
    { label:'Membres zone rouge', value: data.zoneRougeRegion, sub:'Sous les seuils BNI',
      bg: data.zoneRougeRegion <= 2 ? '#D1FAE5' : data.zoneRougeRegion <= 5 ? '#FEF9C3' : '#FEE2E2',
      topBg: data.zoneRougeRegion <= 2 ? '#A7F3D0' : data.zoneRougeRegion <= 5 ? '#FDE68A' : '#FECACA',
      color: data.zoneRougeRegion <= 2 ? '#065F46' : data.zoneRougeRegion <= 5 ? '#854D0E' : '#991B1B',
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].zoneRouge}`) },
  ]

  return (
    <div style={{ padding: isMobile ? '20px 16px' : '28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Suivi Régional"
        sub="Vue consolidée de tous les groupes BNI Kénitra"
      />

      {/* Bandeau résumé — même style que Dashboard mois en cours */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: isMobile ? '10px 14px' : '14px 20px', background:'#1C1C2E', borderRadius:12, marginBottom:20, color:'#fff', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap: isMobile ? 8 : 16, flex:1, minWidth:0 }}>
          <div style={{ fontSize: isMobile ? 16 : 22, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>Région Kénitra</div>
          <div style={{ display:'flex', gap:6 }}>
            {groupeCodes.map(code => (
              <span key={code} style={{ fontSize:10, padding:'3px 10px', borderRadius:8, background: GROUP_COLORS[code], color:'#fff', fontWeight:600 }}>{code}</span>
            ))}
          </div>
        </div>
        <div style={{ fontSize:12, opacity:0.6 }}>{data.totalMembres} membres actifs</div>
      </div>

      {/* KPI cards — même esthétique que Dashboard */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: isMobile ? 10 : 16, marginBottom:24 }}>
        {kpiCards.map(c => (
          <div key={c.label} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:c.bg, borderRadius:12, border:'1px solid rgba(0,0,0,0.06)', overflow:'hidden', cursor:'default', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ background:c.topBg, padding: isMobile ? '6px 12px' : '10px 20px' }}>
              <div style={{ fontSize: isMobile ? 9 : 11, fontWeight:600, color:c.color, textTransform:'uppercase', letterSpacing:'0.07em', opacity:0.8 }}>{c.label}</div>
            </div>
            <div style={{ padding: isMobile ? '8px 12px 12px' : '14px 20px 18px' }}>
              <div style={{ fontSize: isMobile ? 18 : 28, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:c.color }}>{c.value}</div>
              <div style={{ fontSize: isMobile ? 10 : 12, color:'#6B7280', marginTop:4 }}>{c.sub}</div>
              {c.prog !== undefined && <div style={{ height:4, background:'rgba(255,255,255,0.5)', borderRadius:2, marginTop:10 }}><div style={{ height:4, width:`${Math.min(100,c.prog)}%`, background:c.color, borderRadius:2, opacity:0.5 }} /></div>}
              <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                {c.detail.map((d, i) => (
                  <span key={i} style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background:'rgba(255,255,255,0.6)', color:c.color, fontWeight:600 }}>{d}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparatif + Traffic Light + Pipeline — même layout 2 colonnes que Dashboard */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap:16, marginBottom:24 }}>
        {/* Barres comparatives */}
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>📊 Comparatif groupes</SectionTitle>
          </div>
          <div style={{ padding:16 }}>
            <CompareBar label="Membres actifs" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].membresActifs, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Taux de présence" format="pct" max={100} values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].pRate, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Score PALMS moyen" max={100} values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].scoreMoyen, color: GROUP_COLORS[c] }))} />
            <CompareBar label="TYFCB" format="mad" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].tyfcb, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Recommandations" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalRecos, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Recos/membre" values={groupeCodes.map(c => ({ label: c, value: parseFloat(data.byGroupe[c].recosParMembre), color: GROUP_COLORS[c] }))} />
            <CompareBar label="TaT réalisés" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalTaT, color: GROUP_COLORS[c] }))} />
            <CompareBar label="MPB" format="mad" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalMPB, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Invités apportés" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalInvites, color: GROUP_COLORS[c] }))} />
          </div>
        </TableWrap>

        {/* Colonne droite — même layout que Dashboard */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Traffic Light régional */}
          <div onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Traffic Light</SectionTitle>
            </div>
            {[['vert', data.tlCountsRegion.vert, '#059669', '#D1FAE5'], ['orange', data.tlCountsRegion.orange, '#854D0E', '#FEF9C3'], ['rouge', data.tlCountsRegion.rouge, '#991B1B', '#FEE2E2'], ['gris', data.tlCountsRegion.gris, '#4B5563', '#E5E7EB']].map(([t, n, col, bg]) => (
              <div key={t} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'8px 12px', borderRadius:8, background:bg }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:({ vert:'#059669', orange:'#D97706', rouge:'#DC2626', gris:'#9CA3AF' })[t], flexShrink:0 }} />
                <span style={{ fontSize:12, width:50, fontWeight:700, color:col }}>{t}</span>
                <div style={{ flex:1, background:'rgba(255,255,255,0.6)', height:8, borderRadius:4 }}>
                  <div style={{ width:`${(n || 0) / Math.max(data.totalMembres, 1) * 100}%`, height:8, borderRadius:4, background:({ vert:'#059669', orange:'#D97706', rouge:'#DC2626', gris:'#9CA3AF' })[t], transition:'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize:16, fontWeight:700, width:28, textAlign:'right', color:col }}>{n || 0}</span>
              </div>
            ))}
            <div style={{ display:'flex', gap:4, marginTop:10, flexWrap:'wrap' }}>
              {groupeCodes.map(c => (
                <div key={c} style={{ fontSize:9, padding:'3px 8px', borderRadius:6, background:GROUP_COLORS[c] + '12', color:GROUP_COLORS[c], fontWeight:600 }}>
                  {c}: {Object.entries(data.byGroupe[c].tlCounts).map(([k,v]) => `${v}${k[0]}`).join(' ')}
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline invités */}
          <div onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Pipeline invités</SectionTitle>
            </div>
            {[
              ['Total', data.invitesTotalRegion, '#1C1C2E'],
              ['Devenus membres', data.invitesConvertisRegion, '#059669'],
              ['En cours', data.invitesEnCoursRegion, '#D97706'],
            ].map(([l, v, col]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, color:'#6B7280' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:col }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:8, padding:'6px 10px', background:'#F9F8F6', borderRadius:6, fontSize:11, color:'#6B7280' }}>
              Conversion : <strong style={{ color:'#065F46' }}>{data.invitesTotalRegion > 0 ? Math.round(data.invitesConvertisRegion / data.invitesTotalRegion * 100) : 0}%</strong>
            </div>
            <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
              {groupeCodes.map(c => (
                <span key={c} style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:GROUP_COLORS[c] + '12', color:GROUP_COLORS[c], fontWeight:600 }}>
                  {c}: {data.byGroupe[c].invitesTotal} inv.
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top classements — même style tables que Dashboard */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap:16, marginBottom:24 }}>
        <TopTable title="Top scores région" icon="🏆" items={data.topScoresRegion} valueLabel="Score" formatFn={v => Number(v).toFixed(0)} />
        <TopTable title="Top TYFCB région" icon="💰" items={data.topTyfcbRegion} valueLabel="TYFCB" formatFn={fmtMAD} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap:16 }}>
        <TopTable title="Top recommandations" icon="🤝" items={data.topRecosRegion} valueLabel="Total" />
        <TopTable title="Top TaT" icon="☕" items={data.topTaTRegion} valueLabel="Total" />
        <TopTable title="Top invités" icon="🎯" items={data.topInvitesRegion} valueLabel="Total" />
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
