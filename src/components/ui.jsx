import React, { useEffect, useRef, useState } from 'react'

export const cap = (s) => s ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : ''

// Accordion fluide : height mesurée + opacity + translateY pour un drop-down net
// Easing Material Design standard, 450ms
export const AccordionPanel = ({ open, children }) => {
  const innerRef = useRef(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (!innerRef.current) return
    const el = innerRef.current
    const measure = () => setHeight(el.scrollHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])
  const ease = 'cubic-bezier(0.4, 0, 0.2, 1)'
  const duration = 450
  return (
    <div aria-hidden={!open} style={{
      height: open ? height : 0,
      opacity: open ? 1 : 0,
      overflow: 'hidden',
      transition: `height ${duration}ms ${ease}, opacity ${duration}ms ${ease}`,
      pointerEvents: open ? 'auto' : 'none',
      willChange: 'height, opacity',
    }}>
      <div ref={innerRef} style={{
        transform: open ? 'translateY(0)' : 'translateY(-12px)',
        transition: `transform ${duration}ms ${ease}`,
        willChange: 'transform',
      }}>
        {children}
      </div>
    </div>
  )
}

export const fullName = (prenom, nom) => `${cap(prenom || '')} ${cap(nom || '')}`.trim()

const TL_COLORS = {
  vert:   { base: '#059669', light: '#6EE7B7' },
  orange: { base: '#D97706', light: '#FCD34D' },
  rouge:  { base: '#DC2626', light: '#FCA5A5' },
  gris:   { base: '#9CA3AF', light: '#E5E7EB' },
}
const TL_ORDER = { gris: 0, rouge: 1, orange: 2, vert: 3 }

export const TLBadge = ({ tl, size = 14 }) => {
  if (!tl) return <span style={{ display:'inline-block', width:size, height:size, borderRadius:'50%', background:'#E5E7EB', border:'1px solid #D1D5DB' }} />
  const c = TL_COLORS[tl] || TL_COLORS.gris
  return (
    <span style={{
      display:'inline-block',
      width:size,
      height:size,
      borderRadius:'50%',
      background:`radial-gradient(circle at 32% 28%, ${c.light} 0%, ${c.base} 65%, ${c.base} 100%)`,
      boxShadow:`0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px ${c.base}33, inset 0 -1px 2px rgba(0,0,0,0.18), inset 0 1px 1px rgba(255,255,255,0.35)`,
      verticalAlign:'middle',
    }} />
  )
}

export const TrendArrow = ({ from, to, showDelta = true }) => {
  const a = Number(from) || 0
  const b = Number(to) || 0
  const delta = Math.round(b - a)
  const isUp = delta > 0
  const isDown = delta < 0
  const bg = isUp ? '#D1FAE5' : isDown ? '#FEE2E2' : '#F3F4F6'
  const color = isUp ? '#065F46' : isDown ? '#991B1B' : '#6B7280'
  const title = isUp ? `Progression (+${delta})` : isDown ? `Baisse (${delta})` : 'Stable'
  const Arrow = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ display:'block' }} aria-hidden="true">
      {isUp && <path d="M2 8 L8 2 M8 2 L4.5 2 M8 2 L8 5.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      {isDown && <path d="M2 2 L8 8 M8 8 L4.5 8 M8 8 L8 4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      {!isUp && !isDown && <path d="M2.5 5 L7.5 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" />}
    </svg>
  )
  return (
    <span title={title} style={{
      display:'inline-flex', alignItems:'center', gap:3,
      padding: showDelta ? '2px 6px' : '2px 4px',
      background: bg, color, borderRadius: 999,
      fontSize: 10, fontWeight: 700, lineHeight: 1,
      verticalAlign:'middle', fontFamily:'DM Sans, sans-serif',
    }}>
      <Arrow />
      {showDelta && <span>{delta > 0 ? `+${delta}` : delta}</span>}
    </span>
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

export const PageHeader = ({ title, sub, right }) => {
  const mob = typeof window !== 'undefined' && window.innerWidth <= 768
  return (
    <div style={{ display:'flex', alignItems: mob ? 'stretch' : 'flex-start', justifyContent:'space-between', marginBottom:24, flexDirection: mob ? 'column' : 'row', gap: mob ? 12 : 0 }}>
      <div>
        <h1 style={{ fontFamily:'DM Sans, sans-serif', fontSize: mob ? 20 : 24, fontWeight:700, color:'#1C1C2E' }}>{title}</h1>
        {sub && <p style={{ color:'#6B7280', fontSize:13, marginTop:3 }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}

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
