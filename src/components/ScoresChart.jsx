import React, { useState } from 'react'

const COLORS = {
  vert: '#059669', orange: '#D97706', rouge: '#DC2626', gris: '#9CA3AF'
}

// Mini bar chart component
const BarChart = ({ data, height = 160 }) => {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height, paddingTop:20 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <div style={{ fontSize:9, color:'#9CA3AF', fontWeight:500 }}>{d.value}</div>
          <div style={{ width:'100%', background: COLORS[d.tl] || '#9CA3AF', borderRadius:'3px 3px 0 0', height: `${(d.value / max) * (height - 30)}px`, minHeight:4, transition:'height 0.5s ease' }} />
          <div style={{ fontSize:9, color:'#6B7280', textAlign:'center', lineHeight:1.2, maxWidth:40, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// Radar chart pour les critères d'un membre
const RadarChart = ({ criteria, size = 200 }) => {
  const n = criteria.length
  const cx = size / 2, cy = size / 2
  const r = size * 0.38
  const labelR = size * 0.48

  const getPoint = (i, radius) => {
    const angle = (i * 2 * Math.PI / n) - Math.PI / 2
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  }

  const gridLevels = [0.25, 0.5, 0.75, 1]
  
  const dataPoints = criteria.map((c, i) => getPoint(i, r * (c.pct / 100)))
  const dataPath = dataPoints.map((p, i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map(level => {
        const pts = criteria.map((_, i) => getPoint(i, r * level))
        const path = pts.map((p, i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
        return <path key={level} d={path} fill="none" stroke="#E8E6E1" strokeWidth="0.5" />
      })}
      {/* Axes */}
      {criteria.map((_, i) => {
        const end = getPoint(i, r)
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#E8E6E1" strokeWidth="0.5" />
      })}
      {/* Data */}
      <path d={dataPath} fill="rgba(196,30,58,0.15)" stroke="#C41E3A" strokeWidth="1.5" />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#C41E3A" />)}
      {/* Labels */}
      {criteria.map((c, i) => {
        const lp = getPoint(i, labelR)
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="central" fontSize="9" fill="#6B7280" fontFamily="DM Sans, sans-serif">
            {c.label}
          </text>
        )
      })}
    </svg>
  )
}

export function GroupeScoresChart({ scores }) {
  const [view, setView] = useState('bar')
  
  const barData = (scores || [])
    .filter(s => s.rank && s.rank <= 15)
    .sort((a, b) => a.rank - b.rank)
    .map(s => ({
      label: s.membres?.prenom?.split(' ')[0] || '?',
      value: Math.round(Number(s.total_score) || 0),
      tl: s.traffic_light || 'gris'
    }))

  const tlDistrib = { vert: 0, orange: 0, rouge: 0, gris: 0 }
  ;(scores || []).forEach(s => { if (s.traffic_light) tlDistrib[s.traffic_light]++ })
  const total = Object.values(tlDistrib).reduce((a, b) => a + b, 0) || 1

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:13, fontWeight:600 }}>📊 Scores groupe — Top 15</div>
        <div style={{ display:'flex', gap:6 }}>
          {[['bar','Barres'],['donut','Distribution']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #E8E6E1', fontSize:11, background:view===v?'#1C1C2E':'#fff', color:view===v?'#fff':'#6B7280', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:'16px', overflowX:'auto' }}>
        {view === 'bar' ? (
          <BarChart data={barData} height={180} />
        ) : (
          <div>
            {/* Distribution circles */}
            <div style={{ display:'flex', justifyContent:'center', gap:24, marginBottom:16 }}>
              {Object.entries(tlDistrib).map(([tl, n]) => (
                <div key={tl} style={{ textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:'50%', background:COLORS[tl]+'22', border:`3px solid ${COLORS[tl]}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 6px', fontSize:18, fontWeight:700, color:COLORS[tl] }}>{n}</div>
                  <div style={{ fontSize:11, color:'#6B7280' }}>{tl}</div>
                  <div style={{ fontSize:10, color:'#9CA3AF' }}>{Math.round(n/total*100)}%</div>
                </div>
              ))}
            </div>
            {/* Progress bars */}
            {Object.entries(tlDistrib).map(([tl, n]) => (
              <div key={tl} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:COLORS[tl], flexShrink:0 }} />
                <span style={{ fontSize:12, width:50 }}>{tl}</span>
                <div style={{ flex:1, background:'#F3F2EF', height:8, borderRadius:4 }}>
                  <div style={{ height:8, width:`${n/total*100}%`, background:COLORS[tl], borderRadius:4, transition:'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize:12, fontWeight:600, width:20 }}>{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function MembreRadarChart({ score }) {
  if (!score) return null
  
  const criteria = [
    { label:'Présence', pct: Math.min(100, (Number(score.attendance_score)||0) / 10 * 100) },
    { label:'1-2-1s', pct: Math.min(100, (Number(score.score_121)||0) / 20 * 100) },
    { label:'Refs', pct: Math.min(100, (Number(score.referrals_given_score)||0) / 25 * 100) },
    { label:'Visiteurs', pct: Math.min(100, (Number(score.visitor_score)||0) / 25 * 100) },
    { label:'TYFCB', pct: Math.min(100, (Number(score.tyfcb_score)||0) / 5 * 100) },
    { label:'Parrainages', pct: Math.min(100, (Number(score.sponsor_score)||0) / 5 * 100) },
    { label:'CEU', pct: Math.min(100, (Number(score.ceu_score)||0) / 10 * 100) },
  ]

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', padding:16 }}>
      <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Radar de performance</div>
      <div style={{ display:'flex', justifyContent:'center' }}>
        <RadarChart criteria={criteria} size={220} />
      </div>
    </div>
  )
}
