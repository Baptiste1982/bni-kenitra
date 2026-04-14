import React from 'react'

export const cap = (s) => s ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : ''
export const fullName = (prenom, nom) => `${cap(prenom || '')} ${cap(nom || '')}`.trim()

export const TLBadge = ({ tl }) => {
  if (!tl) return <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:16, height:16, borderRadius:'50%', background:'#E5E7EB' }} />
  const dot = {
    vert:   '#059669',
    orange: '#D97706',
    rouge:  '#DC2626',
    gris:   '#9CA3AF',
  }[tl] || '#9CA3AF'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:16, height:16, borderRadius:'50%', background:dot, boxShadow:`0 0 6px ${dot}55` }} />
  )
}

export const Card = ({ children, style={}, accent }) => (
  <div style={{ background:'#fff', borderRadius:12, padding:'18px 20px', border:'1px solid #E8E6E1', borderTop: accent ? `3px solid ${accent}` : '1px solid #E8E6E1', ...style }}>
    {children}
  </div>
)

export const StatCard = ({ label, value, sub, accent, topBg, valueColor, style={}, children }) => (
  topBg ? (
    <div style={{ borderRadius:12, border:'1px solid rgba(0,0,0,0.06)', overflow:'hidden', ...style }}>
      <div style={{ background:topBg, padding:'10px 20px' }}>
        <div style={{ fontSize:11, fontWeight:600, color:valueColor || '#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', opacity:0.8 }}>{label}</div>
      </div>
      <div style={{ padding:'14px 20px 18px' }}>
        <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:valueColor || '#1C1C2E' }}>{value}</div>
        {sub && <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>{sub}</div>}
        {children}
      </div>
    </div>
  ) : (
    <Card accent={accent} style={style}>
      <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:valueColor || '#1C1C2E' }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>{sub}</div>}
      {children}
    </Card>
  )
)

export const SectionTitle = ({ children }) => (
  <div style={{ fontSize:13, fontWeight:600, color:'#1C1C2E', marginBottom:12, letterSpacing:'0.02em' }}>{children}</div>
)

export const PageHeader = ({ title, sub, right }) => (
  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
    <div>
      <h1 style={{ fontFamily:'DM Sans, sans-serif', fontSize:24, fontWeight:700, color:'#1C1C2E' }}>{title}</h1>
      {sub && <p style={{ color:'#6B7280', fontSize:13, marginTop:3 }}>{sub}</p>}
    </div>
    {right}
  </div>
)

export const ProgressBar = ({ value, max, color='#C41E3A', style={} }) => (
  <div style={{ height:6, background:'#F3F2EF', borderRadius:3, overflow:'hidden', ...style }}>
    <div style={{ height:'100%', width:`${Math.min(100, value/max*100)}%`, background:color, borderRadius:3, transition:'width 0.4s ease' }} />
  </div>
)

export const TableWrap = ({ children }) => (
  <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>{children}</div>
)

export const Spinner = ({ size=20, color='#C41E3A' }) => (
  <div style={{ width:size, height:size, border:`2px solid #E8E6E1`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
)
