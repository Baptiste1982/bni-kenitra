import React, { useState, useEffect } from 'react'
import { fetchRegionKPIs } from '../lib/bniService'
import { PageHeader, SectionTitle, TableWrap, fullName } from './ui'

const GROUP_COLORS = { 'MK-01': '#C41E3A', 'MK-02': '#3B82F6' }
const fmtMAD = v => Math.round(v).toLocaleString('de-DE') + ' MAD'
const fmtNum = v => Number(v).toLocaleString('de-DE')

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

  // Card KPI principal
  const RegionKPI = ({ label, value, sub, icon, accent = '#1C1C2E' }) => (
    <div onMouseEnter={hover} onMouseLeave={unhover}
      style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden', transition:'box-shadow 0.15s, transform 0.15s' }}>
      <div style={{ background:'#1C1C2E', padding: isMobile ? '8px 12px' : '10px 16px', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:14 }}>{icon}</span>
        <span style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
      </div>
      <div style={{ padding: isMobile ? '10px 12px' : '14px 16px' }}>
        <div style={{ fontSize: isMobile ? 22 : 28, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:accent }}>{value}</div>
        {sub && <div style={{ fontSize:11, color:'#6B7280', marginTop:3 }}>{sub}</div>}
        <div style={{ display:'flex', gap:6, marginTop:8 }}>
          {groupeCodes.map(code => (
            <span key={code} style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background: GROUP_COLORS[code] + '15', color: GROUP_COLORS[code], fontWeight:600 }}>
              {code}: {label.includes('présence') ? data.byGroupe[code].pRate + '%'
                : label.includes('TYFCB') ? fmtMAD(data.byGroupe[code].tyfcb)
                : label.includes('Membres') ? data.byGroupe[code].membresActifs
                : label.includes('PALMS') ? data.byGroupe[code].scoreMoyen
                : label.includes('ecos') ? data.byGroupe[code].totalRecos
                : label.includes('zone') ? data.byGroupe[code].zoneRouge
                : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  )

  // Top table
  const TopTable = ({ title, icon, items, valueLabel, formatFn = fmtNum }) => (
    <TableWrap>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:14 }}>{icon}</span>
        <SectionTitle>{title}</SectionTitle>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr>
          {['#', 'Membre', 'Groupe', valueLabel].map(h => (
            <th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)' }}>
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

  return (
    <div style={{ padding: isMobile ? '20px 16px' : '28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Suivi Régional"
        sub="Vue consolidée de tous les groupes BNI Kénitra"
      />

      {/* Bandeau résumé */}
      <div style={{ display:'flex', alignItems:'center', padding: isMobile ? '10px 14px' : '14px 20px', background:'#1C1C2E', borderRadius:12, marginBottom:20, color:'#fff', gap: isMobile ? 10 : 20, flexWrap:'wrap' }}>
        <div style={{ fontSize: isMobile ? 16 : 22, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>Région Kénitra</div>
        <div style={{ display:'flex', gap:8 }}>
          {groupeCodes.map(code => (
            <span key={code} style={{ fontSize:11, padding:'4px 12px', borderRadius:8, background: GROUP_COLORS[code], color:'#fff', fontWeight:600 }}>{code}</span>
          ))}
        </div>
        <div style={{ fontSize:12, opacity:0.6, marginLeft:'auto' }}>{data.totalMembres} membres actifs</div>
      </div>

      {/* KPIs principaux */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: isMobile ? 10 : 16, marginBottom:24 }}>
        <RegionKPI icon="👥" label="Membres actifs" value={data.totalMembres} sub={`Objectif régional : ${groupeCodes.length * 30}`} />
        <RegionKPI icon="📊" label="Taux de présence" value={data.pRateRegion + '%'} accent={data.pRateRegion >= 95 ? '#065F46' : data.pRateRegion >= 88 ? '#854D0E' : '#991B1B'} sub="Moyenne pondérée région" />
        <RegionKPI icon="💰" label="TYFCB généré" value={fmtMAD(data.tyfcbRegion)} accent={data.tyfcbRegion >= 500000 ? '#065F46' : '#854D0E'} sub="Business total référencé" />
        <RegionKPI icon="🤝" label="Recommandations" value={fmtNum(data.totalRecosRegion)} sub={`${data.recosParMembreRegion} par membre`} />
        <RegionKPI icon="⭐" label="Score PALMS moyen" value={data.scoreMoyenRegion} accent={data.scoreMoyenRegion >= 70 ? '#065F46' : data.scoreMoyenRegion >= 50 ? '#854D0E' : '#991B1B'} sub="Moyenne régionale" />
        <RegionKPI icon="🔴" label="Membres en zone rouge" value={data.zoneRougeRegion} accent={data.zoneRougeRegion > 5 ? '#991B1B' : data.zoneRougeRegion > 2 ? '#854D0E' : '#065F46'} sub="Sous les seuils BNI" />
      </div>

      {/* Comparatif détaillé */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:16, marginBottom:24 }}>
        {/* Barres comparatives */}
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}>
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

        {/* Traffic Light + Pipeline */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Traffic Light régional */}
          <TableWrap>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}>
              <SectionTitle>🚦 Traffic Light régional</SectionTitle>
            </div>
            <div style={{ padding:16 }}>
              {[['vert', '#059669', '#D1FAE5'], ['orange', '#D97706', '#FEF9C3'], ['rouge', '#DC2626', '#FEE2E2'], ['gris', '#9CA3AF', '#E5E7EB']].map(([tl, dot, bg]) => (
                <div key={tl} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'8px 12px', borderRadius:8, background:bg }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:dot, flexShrink:0 }} />
                  <span style={{ fontSize:12, width:50, fontWeight:700, color:'#1C1C2E', textTransform:'capitalize' }}>{tl}</span>
                  <span style={{ fontSize:16, fontWeight:700, color:'#1C1C2E', marginLeft:'auto' }}>{data.tlCountsRegion[tl]}</span>
                  <div style={{ display:'flex', gap:4, marginLeft:8 }}>
                    {groupeCodes.map(c => (
                      <span key={c} style={{ fontSize:9, padding:'1px 6px', borderRadius:6, background:GROUP_COLORS[c] + '18', color:GROUP_COLORS[c], fontWeight:600 }}>
                        {c.split('-')[1]}: {data.byGroupe[c].tlCounts[tl]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TableWrap>

          {/* Pipeline invités */}
          <TableWrap>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}>
              <SectionTitle>◉ Pipeline invités régional</SectionTitle>
            </div>
            <div style={{ padding:16 }}>
              {[
                ['Total invités', data.invitesTotalRegion, '#1C1C2E'],
                ['Devenus membres', data.invitesConvertisRegion, '#059669'],
                ['En cours', data.invitesEnCoursRegion, '#D97706'],
              ].map(([label, val, col]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, color:'#6B7280' }}>{label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:col }}>{val}</span>
                    <div style={{ display:'flex', gap:3 }}>
                      {groupeCodes.map(c => (
                        <span key={c} style={{ fontSize:9, padding:'1px 6px', borderRadius:6, background:GROUP_COLORS[c] + '18', color:GROUP_COLORS[c], fontWeight:600 }}>
                          {label.includes('Total') ? data.byGroupe[c].invitesTotal
                            : label.includes('Devenus') ? data.byGroupe[c].invitesConvertis
                            : data.byGroupe[c].invitesEnCours}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {data.totalMembres > 0 && (
                <div style={{ marginTop:8, padding:'8px 12px', background:'#F9F8F6', borderRadius:8, fontSize:11, color:'#6B7280' }}>
                  Taux de conversion : <strong style={{ color:'#065F46' }}>{data.invitesTotalRegion > 0 ? Math.round(data.invitesConvertisRegion / data.invitesTotalRegion * 100) : 0}%</strong>
                </div>
              )}
            </div>
          </TableWrap>
        </div>
      </div>

      {/* Top classements régionaux */}
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
