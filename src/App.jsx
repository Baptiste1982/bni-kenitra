import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Membres from './components/Membres'
import RealtimeAlerts from './components/RealtimeAlerts'
import { Invites, Groupes, Reporting, AgentIA } from './components/modules'
import SuiviHebdo from './components/SuiviHebdo'

const NAV = [
  { id:'dashboard', label:'Tableau de bord', icon:'▦' },
  { id:'membres',   label:'Membres',          icon:'◈' },
  { id:'hebdo',     label:'Suivi Hebdo',      icon:'◧' },
  { id:'invites',   label:'Invités',           icon:'◉' },
  { id:'groupes',   label:'Groupes',           icon:'⬟' },
  { id:'reporting', label:'Reporting',         icon:'◫' },
  { id:'agent',     label:'Agent IA',          icon:'◊', badge:'IA' },
]

// Logo BNI Kénitra SVG inline
const BNILogo = () => (
  <div style={{ width:34, height:34, borderRadius:'50%', background:'#C41E3A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 2px 8px rgba(196,30,58,0.4)' }}>
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
      <text x="0" y="12" fontFamily="serif" fontSize="13" fontWeight="900" fill="white" letterSpacing="-0.5">BNi</text>
    </svg>
  </div>
)

export default function App() {
  const [user, setUser] = useState(null)
  const [profil, setProfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(4)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profils').select('prenom, nom, email, telephone, titre, role').eq('id', session.user.id).single()
          .then(({ data }) => { if (data) setProfil(data) })
      }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profils').select('prenom, nom, email, telephone, titre, role').eq('id', session.user.id).single()
          .then(({ data }) => { if (data) setProfil(data) })
      } else { setProfil(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Live alert count via Realtime
  useEffect(() => {
    if (!user) return
    supabase.from('alertes').select('id', { count:'exact' }).eq('lue', false)
      .then(({ count }) => { if (count !== null) setAlertCount(count) })

    const channel = supabase.channel('alert-count')
      .on('postgres_changes', { event:'*', schema:'public', table:'alertes' }, () => {
        supabase.from('alertes').select('id', { count:'exact' }).eq('lue', false)
          .then(({ count }) => { if (count !== null) setAlertCount(count) })
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const navigate = (id) => { setActive(id); setSidebarOpen(false) }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#1C1C2E', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'rgba(255,255,255,0.4)', fontFamily:'DM Sans, sans-serif', fontSize:14 }}>Chargement...</div>
    </div>
  )

  if (!user) return <Login onLogin={setUser} />

  const MODULES = {
    dashboard: <Dashboard onNavigate={navigate} />,
    membres:   <Membres profil={profil} />,
    hebdo:     <SuiviHebdo />,
    invites:   <Invites />,
    groupes:   <Groupes />,
    reporting: <Reporting />,
    agent:     <AgentIA />,
  }

  const Sidebar = () => (
    <aside style={{ width:220, background:'#1C1C2E', display:'flex', flexDirection:'column', flexShrink:0, height:'100%' }}>
      {/* Logo BNI */}
      <div style={{ padding:'20px 16px 18px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <BNILogo />
          <div>
            <div style={{ color:'#fff', fontWeight:600, fontSize:13, letterSpacing:'-0.01em' }}>BNI Kénitra</div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, letterSpacing:'0.07em', textTransform:'uppercase' }}>Dir. Exécutif</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => navigate(n.id)} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'9px 10px', borderRadius:7, border:'none', cursor:'pointer', textAlign:'left', background: active===n.id ? 'rgba(196,30,58,0.22)' : 'transparent', color: active===n.id ? '#fff' : 'rgba(255,255,255,0.45)', fontSize:13, fontWeight: active===n.id ? 600 : 400, fontFamily:'DM Sans, sans-serif', transition:'all 0.15s' }}>
            <span style={{ fontSize:15, width:18, textAlign:'center', color: active===n.id?'#C41E3A':'rgba(255,255,255,0.3)' }}>{n.icon}</span>
            {n.label}
            {n.badge && <span style={{ marginLeft:'auto', background:'#C9A84C', color:'#fff', fontSize:9, padding:'2px 5px', borderRadius:8, fontWeight:700 }}>{n.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Alertes live */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('dashboard')} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, background:'rgba(196,30,58,0.12)', borderRadius:7, padding:'9px 11px', border:'none', cursor:'pointer' }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background: alertCount > 0 ? '#C41E3A' : '#059669', flexShrink:0, animation: alertCount > 0 ? 'pulse 2s ease-in-out infinite' : 'none' }} />
          <span style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>
            {alertCount > 0 ? `${alertCount} alerte${alertCount > 1 ? 's' : ''} active${alertCount > 1 ? 's' : ''}` : 'Aucune alerte'}
          </span>
          {alertCount > 0 && <span style={{ marginLeft:'auto', background:'#C41E3A', color:'#fff', fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:10 }}>{alertCount}</span>}
        </button>
      </div>

      {/* User */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'#fff', flexShrink:0 }}>JB</div>
          <div>
            <div style={{ color:'#fff', fontSize:11, fontWeight:500 }}>Jean Baptiste Chiotti</div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10 }}>DE · Région Kénitra</div>
          </div>
        </div>
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
      <div style={{ position:'fixed', top:0, left:0, height:'100%', zIndex:50, transform: sidebarOpen?'translateX(0)':'translateX(-100%)', transition:'transform 0.25s ease', display:'flex' }} className="hide-desktop">
        <Sidebar />
      </div>

      {/* Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ display:'none', background:'#1C1C2E', padding:'12px 16px', alignItems:'center', gap:12, flexShrink:0 }} className="mobile-topbar">
          <button onClick={() => setSidebarOpen(true)} style={{ background:'none', border:'none', color:'#fff', fontSize:20, cursor:'pointer', padding:'2px 4px' }}>☰</button>
          <BNILogo />
          <div style={{ color:'#fff', fontWeight:600, fontSize:14 }}>BNI Kénitra</div>
          {alertCount > 0 && (
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#C41E3A', animation:'pulse 2s ease-in-out infinite' }} />
              <span style={{ color:'rgba(255,255,255,0.6)', fontSize:11 }}>{alertCount} alerte{alertCount>1?'s':''}</span>
            </div>
          )}
        </div>

        <main key={active} style={{ flex:1, overflowY:'auto', background:'#F7F6F3', display:'flex', flexDirection:'column' }}>
          {MODULES[active]}
        </main>
      </div>

      {/* Realtime alerts toast */}
      <RealtimeAlerts onNavigate={navigate} />

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
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
