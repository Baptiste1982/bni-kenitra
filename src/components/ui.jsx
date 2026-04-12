import React from 'react'

export const TLBadge = ({ tl }) => {
  if (!tl) return <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:12, background:'#F3F4F6', color:'#4B5563' }}>—</span>
  const cfg = {
    vert:   { bg:'#D1FAE5', color:'#065F46', dot:'#059669' },
    orange: { bg:'#FEF3C7', color:'#92400E', dot:'#D97706' },
    rouge:  { bg:'#FEE2E2', color:'#991B1B', dot:'#DC2626' },
    gris:   { bg:'#F3F4F6', color:'#4B5563', dot:'#9CA3AF' },
  }[tl] || { bg:'#F3F4F6', color:'#4B5563', dot:'#9CA3AF' }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:12, background:cfg.bg, color:cfg.color }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:cfg.dot, display:'inline-block' }} />
      {tl}
    </span>
  )
}

export const Card = ({ children, style={}, accent }) => (
  <div style={{ background:'#fff', borderRadius:12, padding:'18px 20px', border:'1px solid #E8E6E1', borderTop: accent ? `3px solid ${accent}` : '1px solid #E8E6E1', ...style }}>
    {children}
  </div>
)

export const StatCard = ({ label, value, sub, accent, style={}, children }) => (
  <Card accent={accent} style={style}>
    <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{label}</div>
    <div style={{ fontSize:28, fontWeight:700, fontFamily:'Playfair Display, serif', color:'#1C1C2E' }}>{value}</div>
    {sub && <div style={{ fontSize:12, color:'#6B7280', marginTop:4 }}>{sub}</div>}
    {children}
  </Card>
)

export const SectionTitle = ({ children }) => (
  <div style={{ fontSize:13, fontWeight:600, color:'#1C1C2E', marginBottom:12, letterSpacing:'0.02em' }}>{children}</div>
)

export const PageHeader = ({ title, sub, right }) => (
  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
    <div>
      <h1 style={{ fontFamily:'Playfair Display, serif', fontSize:24, fontWeight:700, color:'#1C1C2E' }}>{title}</h1>
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
  <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden' }}>{children}</div>
)

export const Spinner = ({ size=20, color='#C41E3A' }) => (
  <div style={{ width:size, height:size, border:`2px solid #E8E6E1`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
)
