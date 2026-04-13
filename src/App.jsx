import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Membres from './components/Membres'
import RealtimeAlerts from './components/RealtimeAlerts'
import { Invites, Groupes, Reporting, AgentIA } from './components/modules'
import SuiviHebdo from './components/SuiviHebdo'
import AdminUsers from './components/AdminUsers'
import Alertes from './components/Alertes'
import TeamChat from './components/TeamChat'

const ADMIN_ROLES = ['super_admin', 'directeur_executif']
const ALL_MODULES = [
  { id:'alertes',   label:'Alertes',           icon:'🚨' },
  { id:'dashboard', label:'Tableau de bord', icon:'▦' },
  { id:'membres',   label:'Membres',          icon:'◈' },
  { id:'hebdo',     label:'Suivi Hebdo',      icon:'◧' },
  { id:'invites',   label:'Invités',           icon:'◉' },
  { id:'groupes',   label:'Groupes',           icon:'⬟' },
  { id:'reporting', label:'Reporting',         icon:'◫' },
  { id:'agent',     label:'Agent IA',          icon:'◊', badge:'IA' },
  { id:'admin',     label:'Admin',             icon:'⚙' },
]

// Logo BNI Kénitra
const BNILogo = () => (
  <img src="/logo-bni-kenitra.png" alt="BNI Kénitra" style={{ width:38, height:38, borderRadius:'50%', flexShrink:0, objectFit:'cover', boxShadow:'0 2px 8px rgba(196,30,58,0.4)' }} />
)

export default function App() {
  const [user, setUser] = useState(null)
  const [profil, setProfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(4)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profils').select('prenom, nom, email, telephone, titre, role, modules_access').eq('id', session.user.id).single()
          .then(({ data }) => { if (data) setProfil(data) })
      }
      setLoading(false)
    })
    let initialLoad = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase.from('profils').select('prenom, nom, email, telephone, titre, role, modules_access').eq('id', session.user.id).single()
          .then(({ data }) => {
            if (data) {
              setProfil(data)
              // Logger seulement les vraies connexions (pas les refreshs ni les doublons < 5min)
              if (event === 'SIGNED_IN' && !initialLoad) {
                supabase.from('connection_logs').select('connected_at').eq('user_id', session.user.id).eq('action', 'login').order('connected_at', {ascending:false}).limit(1)
                  .then(({ data: lastLog }) => {
                    const lastTime = lastLog?.[0]?.connected_at ? new Date(lastLog[0].connected_at) : null
                    const diffMin = lastTime ? (new Date() - lastTime) / 60000 : 999
                    if (diffMin > 5) {
                      supabase.from('connection_logs').insert({ user_id: session.user.id, email: data.email, prenom: data.prenom, nom: data.nom, role: data.role, action: 'login' }).then(() => {})
                    }
                  })
              }
              initialLoad = false
            }
          })
      } else { setProfil(null); initialLoad = false }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Realtime Presence — activité live
  useEffect(() => {
    if (!user || !profil) return

    // Mettre à jour last_seen en base
    supabase.from('profils').update({ last_seen: new Date().toISOString() }).eq('id', user.id).then(() => {})

    // Charger tous les profils pour l'affichage initial
    supabase.from('profils').select('id, prenom, nom, role, last_seen, actif').eq('actif', true)
      .then(({ data }) => { if (data) setOnlineUsers(data.map(u => ({ ...u, isLive: false }))) })

    // Rejoindre le channel Presence
    const channel = supabase.channel('online-users', { config: { presence: { key: user.id } } })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      // Mettre à jour les statuts en ligne en temps réel
      setOnlineUsers(prev => prev.map(u => ({
        ...u,
        isLive: !!state[u.id]?.length
      })))
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: user.id, prenom: profil.prenom, nom: profil.nom, role: profil.role })
      }
    })

    // Mettre à jour last_seen toutes les 60s en base (backup)
    const interval = setInterval(() => {
      supabase.from('profils').update({ last_seen: new Date().toISOString() }).eq('id', user.id).then(() => {})
    }, 60000)

    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [user, profil])


  // Live alert count via Realtime (alertes + recontacts)
  const updateAlertCount = async () => {
    const troisMois = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0]
    const [alertesRes, recontactRes] = await Promise.all([
      supabase.from('alertes').select('id', { count:'exact' }).eq('lue', false),
      supabase.from('invites').select('id', { count:'exact' }).eq('statut', 'A recontacter').gte('date_visite', troisMois),
    ])
    setAlertCount((alertesRes.count || 0) + (recontactRes.count || 0))
  }
  useEffect(() => {
    if (!user) return
    updateAlertCount()
    const channel = supabase.channel('alert-count')
      .on('postgres_changes', { event:'*', schema:'public', table:'alertes' }, updateAlertCount)
      .on('postgres_changes', { event:'*', schema:'public', table:'invites' }, updateAlertCount)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  const handleLogout = async () => {
    if (user && profil) {
      await supabase.from('connection_logs').insert({ user_id: user.id, email: profil.email, prenom: profil.prenom, nom: profil.nom, role: profil.role, action: 'logout' })
    }
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
    alertes:   <Alertes />,
    dashboard: <Dashboard onNavigate={navigate} profil={profil} />,
    membres:   <Membres profil={profil} />,
    hebdo:     <SuiviHebdo />,
    invites:   <Invites profil={profil} />,
    groupes:   <Groupes />,
    reporting: <Reporting />,
    agent:     <AgentIA />,
    admin:     <AdminUsers />,
  }

  const userRole = profil?.role || 'lecture'
  // Accès modules : si modules_access est défini, l'utiliser, sinon admin voit tout
  const userModules = profil?.modules_access || (ADMIN_ROLES.includes(userRole) ? ALL_MODULES.map(m => m.id) : ['dashboard', 'membres'])
  const NAV = ALL_MODULES.filter(m => userModules.includes(m.id))

  const Sidebar = () => (
    <aside style={{ width:220, background:'#1C1C2E', display:'flex', flexDirection:'column', flexShrink:0, height:'100%' }}>
      {/* Logo BNI */}
      <div style={{ padding:'16px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', flexDirection:'column', alignItems:'center' }}>
        <img src="/logo-bni-kenitra.png" alt="BNI Kénitra" style={{ width:'80%', maxWidth:160, borderRadius:'50%', objectFit:'cover', boxShadow:'0 4px 16px rgba(196,30,58,0.3)', marginBottom:10 }} />
        <div style={{ color:'#fff', fontWeight:700, fontSize:14, letterSpacing:'0.05em', textTransform:'uppercase' }}>BNI Kénitra</div>
      </div>

      {/* Alertes live — au-dessus du nav */}
      <div style={{ padding:'8px 10px' }}>
        <button onClick={() => navigate('alertes')} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, background: alertCount > 0 ? 'rgba(196,30,58,0.15)' : 'rgba(5,150,105,0.12)', borderRadius:7, padding:'8px 11px', border:'none', cursor:'pointer' }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background: alertCount > 0 ? '#C41E3A' : '#059669', flexShrink:0, animation: alertCount > 0 ? 'pulse 2s ease-in-out infinite' : 'none' }} />
          <span style={{ color:'rgba(255,255,255,0.6)', fontSize:11 }}>
            {alertCount > 0 ? `${alertCount} alerte${alertCount > 1 ? 's' : ''}` : 'Aucune alerte'}
          </span>
          {alertCount > 0 && <span style={{ marginLeft:'auto', background:'#C41E3A', color:'#fff', fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:10 }}>{alertCount}</span>}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'4px 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => navigate(n.id)} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'9px 10px', borderRadius:7, border:'none', cursor:'pointer', textAlign:'left', background: active===n.id ? 'rgba(196,30,58,0.22)' : 'transparent', color: active===n.id ? '#fff' : 'rgba(255,255,255,0.45)', fontSize:13, fontWeight: active===n.id ? 600 : 400, fontFamily:'DM Sans, sans-serif', transition:'all 0.15s' }}>
            <span style={{ fontSize:15, width:18, textAlign:'center', color: active===n.id?'#C41E3A':'rgba(255,255,255,0.3)' }}>{n.icon}</span>
            {n.label}
            {n.badge && <span style={{ marginLeft:'auto', background:'#C9A84C', color:'#fff', fontSize:9, padding:'2px 5px', borderRadius:8, fontWeight:700 }}>{n.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Utilisateurs en ligne */}
      <div style={{ padding:'10px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize:9, fontWeight:600, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Équipe</div>
        {onlineUsers.map(u => {
          const statusColor = u.isLive ? '#059669' : '#6B7280'
          const roleAbr = { super_admin:'SA', directeur_executif:'DE', directrice_consultante:'DC', president:'P', vice_president:'VP', secretaire_tresorier:'ST', lecture:'L' }[u.role] || '?'
          const roleCol = { super_admin:'#C9A84C', directeur_executif:'#C9A84C', directrice_consultante:'#3B82F6', president:'#6366F1', vice_president:'#8B5CF6', secretaire_tresorier:'#DC2626', lecture:'#6B7280' }[u.role] || '#6B7280'
          return (
            <div key={u.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ position:'relative' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:roleCol+'33', border:`2px solid ${roleCol}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:roleCol }}>{roleAbr}</div>
                <div style={{ position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%', background:statusColor, border:'2px solid #1C1C2E' }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'#fff', fontSize:10, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.prenom} {u.nom}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* User actuel */}
      <div style={{ padding:'10px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          {(() => {
            const roleAbr = { super_admin:'SA', directeur_executif:'DE', directrice_consultante:'DC', president:'P', vice_president:'VP', secretaire_tresorier:'ST', lecture:'L' }[profil?.role] || '?'
            const roleCol = { super_admin:'#C9A84C', directeur_executif:'#C9A84C', directrice_consultante:'#3B82F6', president:'#6366F1', vice_president:'#8B5CF6', secretaire_tresorier:'#DC2626', lecture:'#6B7280' }[profil?.role] || '#6B7280'
            return <div style={{ position:'relative' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:roleCol+'33', border:`2px solid ${roleCol}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:roleCol, flexShrink:0 }}>{roleAbr}</div>
              <div style={{ position:'absolute', bottom:0, right:0, width:11, height:11, borderRadius:'50%', background:'#059669', border:'2px solid #1C1C2E' }} />
            </div>
          })()}
          <div>
            <div style={{ color:'#fff', fontSize:11, fontWeight:500 }}>{profil ? `${profil.prenom} ${profil.nom}` : '...'}</div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10 }}>{profil?.titre || profil?.role || ''}</div>
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

      {/* Chat — onglet en bas */}
      <div onClick={() => { setChatOpen(!chatOpen); if(!chatOpen) setUnreadChat(0) }}
        style={{ position:'fixed', bottom:0, right:40, width:200, padding:'8px 16px', background:'#1C1C2E', borderRadius:'10px 10px 0 0', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', boxShadow:'0 -2px 8px rgba(0,0,0,0.1)', zIndex:201 }}>
        <span style={{ fontSize:14 }}>💬</span>
        <span style={{ color:'#fff', fontSize:12, fontWeight:600 }}>Chat Équipe</span>
        {unreadChat > 0 && <div style={{ width:18, height:18, borderRadius:'50%', background:'#C41E3A', color:'#fff', fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{unreadChat}</div>}
        <span style={{ color:'rgba(255,255,255,0.5)', fontSize:10, marginLeft:'auto' }}>{chatOpen ? '▼' : '▲'}</span>
      </div>
      <TeamChat profil={{...profil, id: user?.id}} isOpen={chatOpen} onClose={() => setChatOpen(false)} onlineUsers={onlineUsers} onNewMessage={() => { if(!chatOpen) setUnreadChat(prev => prev + 1) }} />

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
