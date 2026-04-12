import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Membres from './components/Membres'
import { Invites, Groupes, Reporting, AgentIA } from './components/modules'

const NAV = [
  { id:'dashboard', label:'Tableau de bord', icon:'▦' },
  { id:'membres',   label:'Membres',          icon:'◈' },
  { id:'invites',   label:'Invités',           icon:'◉' },
  { id:'groupes',   label:'Groupes',           icon:'⬟' },
  { id:'reporting', label:'Reporting',         icon:'◫' },
  { id:'agent',     label:'Agent IA',          icon:'◊', badge:'IA' },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const navigate = (id) => {
    setActive(id)
    setSidebarOpen(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#1C1C2E', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'DM Sans, sans-serif', fontSize:14 }}>Chargement...</div>
    </div>
  )

  if (!user) return <Login onLogin={setUser} />

  const MODULES = {
    dashboard: <Dashboard onNavigate={navigate} />,
    membres:   <Membres />,
    invites:   <Invites />,
    groupes:   <Groupes />,
    reporting: <Reporting />,
    agent:     <AgentIA />,
  }

  const Sidebar = () => (
    <aside style={{ width:220, background:'#1C1C2E', display:'flex', flexDirection:'column', flexShrink:0, height:'100%' }}>
      <div style={{ padding:'20px 16px 18px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:'#C41E3A', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Playfair Display, serif', fontSize:15, fontWeight:700, color:'#fff', flexShrink:0 }}>B</div>
          <div>
            <div style={{ color:'#fff', fontWeight:600, fontSize:13 }}>BNI Kénitra</div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, letterSpacing:'0.07em', textTransform:'uppercase' }}>Dir. Exécutif</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => navigate(n.id)} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'9px 10px', borderRadius:7, border:'none', cursor:'pointer', textAlign:'left', background: active===n.id ? 'rgba(196,30,58,0.22)' : 'transparent', color: active===n.id ? '#fff' : 'rgba(255,255,255,0.45)', fontSize:13, fontWeight: active===n.id ? 600 : 400, fontFamily:'DM Sans, sans-serif', transition:'all 0.15s' }}>
            <span style={{ fontSize:15, width:18, textAlign:'center', color: active===n.id?'#C41E3A':'rgba(255,255,255,0.3)' }}>{n.icon}</span>
            {n.label}
            {n.badge && <span style={{ marginLeft:'auto', background:'#C9A84C', color:'#fff', fontSize:9, padding:'2px 5px', borderRadius:8, fontWeight:700 }}>{n.badge}</span>}
          </button>
        ))}
      </nav>
      <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(196,30,58,0.12)', borderRadius:7, padding:'9px 11px' }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'#C41E3A', flexShrink:0, animation:'pulse 2s ease-in-out infinite' }} />
          <span style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>4 alertes actives</span>
        </div>
      </div>
      <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ color:'#fff', fontSize:12, fontWeight:500 }}>Jean Baptiste Chiotti</div>
        <div style={{ color:'rgba(255,255,255,0.35)', fontSize:11, marginBottom:8 }}>DE · Région Kénitra</div>
        <button onClick={handleLogout} style={{ fontSize:11, color:'rgba(255,255,255,0.3)', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'DM Sans, sans-serif' }}>Déconnexion →</button>
      </div>
    </aside>
  )

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'DM Sans, sans-serif' }}>
      {/* Desktop sidebar */}
      <div className="hide-mobile" style={{ display:'flex', flexShrink:0 }}>
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      <div className={`sidebar-overlay${sidebarOpen?' open':''}`} onClick={() => setSidebarOpen(false)} />
      
      {/* Mobile sidebar */}
      <div style={{ position:'fixed', top:0, left:0, height:'100%', zIndex:50, transform: sidebarOpen?'translateX(0)':'translateX(-100%)', transition:'transform 0.25s ease', display:'flex' }} className="hide-desktop">
        <Sidebar />
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Mobile top bar */}
        <div style={{ display:'none', background:'#1C1C2E', padding:'12px 16px', alignItems:'center', gap:12, flexShrink:0 }} className="mobile-topbar">
          <button onClick={() => setSidebarOpen(true)} style={{ background:'none', border:'none', color:'#fff', fontSize:20, lineHeight:1, cursor:'pointer', padding:'2px 4px' }}>☰</button>
          <div style={{ color:'#fff', fontWeight:600, fontSize:14 }}>BNI Kénitra</div>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#C41E3A', animation:'pulse 2s ease-in-out infinite' }} />
            <span style={{ color:'rgba(255,255,255,0.6)', fontSize:11 }}>4 alertes</span>
          </div>
        </div>

        <main key={active} style={{ flex:1, overflowY:'auto', background:'#F7F6F3', display:'flex', flexDirection:'column' }}>
          {MODULES[active]}
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .hide-desktop { display: flex !important; }
          .mobile-topbar { display: flex !important; }
        }
        @media (min-width: 769px) {
          .hide-desktop { display: none !important; }
        }
      `}</style>
    </div>
  )
}
