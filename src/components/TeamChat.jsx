import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fullName, AccordionPanel } from './ui'

const ROLE_COLORS = { super_admin:'#C9A84C', directeur_executif:'#C9A84C', directrice_consultante:'#3B82F6', president:'#6366F1', vice_president:'#8B5CF6', secretaire_tresorier:'#DC2626', lecture:'#6B7280' }
const ROLE_ABBR = { super_admin:'SA', directeur_executif:'DE', directrice_consultante:'DC', president:'P', vice_president:'VP', secretaire_tresorier:'ST', lecture:'L' }

export default function TeamChat({ profil, isOpen, onClose, onlineUsers, onNewMessage, chatTabRef }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [showPoke, setShowPoke] = useState(false)
  const [pokeTarget, setPokeTarget] = useState(null)
  const [pokeNotif, setPokeNotif] = useState(null)
  const msgsRef = useRef(null)
  const inputRef = useRef(null)
  const userId = profil?.id || null

  useEffect(() => {
    supabase.from('team_messages').select('*').order('created_at', { ascending: true }).limit(100)
      .then(({ data }) => { setMessages(data || []); scrollBottom() })

    const channel = supabase.channel('team-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, payload => {
        setMessages(prev => [...prev, payload.new])
        scrollBottom()
        if (payload.new.user_id !== userId) {
          if (onNewMessage) onNewMessage()
          if (payload.new.poke_user_id === userId) {
            setPokeNotif(payload.new)
            setTimeout(() => setPokeNotif(null), 5000)
          }
        }
      }).subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId])

  const scrollBottom = () => setTimeout(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight }, 50)

  const sendMessage = async () => {
    const msg = input.trim()
    if (!msg || !profil) return
    await supabase.from('team_messages').insert({
      user_id: userId, prenom: profil.prenom, nom: profil.nom, role: profil.role,
      message: msg, poke_user_id: pokeTarget?.id || null, poke_prenom: pokeTarget?.prenom || null,
    })
    setInput('')
    setPokeTarget(null)
    setShowPoke(false)
  }

  const handlePoke = (u) => {
    setPokeTarget(u)
    setInput(prev => `@${u.prenom} ${prev}`)
    setShowPoke(false)
    inputRef.current?.focus()
  }

  // Fermer au clic en dehors
  const chatRef = useRef(null)
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e) => {
      if (chatRef.current && !chatRef.current.contains(e.target) && (!chatTabRef?.current || !chatTabRef.current.contains(e.target))) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onClose])

  // Grouper par jour
  const groupByDay = {}
  messages.forEach(m => {
    const day = new Date(m.created_at).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })
    if (!groupByDay[day]) groupByDay[day] = []
    groupByDay[day].push(m)
  })

  const mob = window.innerWidth <= 768

  return (
    <div ref={chatRef} style={{
      position:'fixed',
      ...(mob ? {
        top: isOpen ? 0 : '100vh',
        left:0, right:0, bottom:0,
        width:'100%', height:'100%',
        borderRadius:0, border:'none',
      } : {
        bottom: isOpen ? 36 : '-100vh',
        right:40, width:380, height:'60vh',
        borderRadius:'12px 12px 0 0', border:'1px solid #E8E6E1', borderBottom:'none',
      }),
      visibility: isOpen ? 'visible' : 'hidden',
      background:'#fff',
      boxShadow: isOpen ? '0 -4px 24px rgba(0,0,0,0.15)' : 'none',
      display:'flex', flexDirection:'column', zIndex:200,
      transition: mob ? 'top 0.3s ease' : 'bottom 0.3s ease',
    }}>

      {/* Header mobile */}
      {mob && isOpen && (
        <div style={{ padding:'12px 16px', background:'#1C1C2E', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer', padding:0 }}>←</button>
          <span style={{ fontSize:14 }}>💬</span>
          <span style={{ color:'#fff', fontSize:14, fontWeight:600 }}>Chat Équipe</span>
          <span style={{ color:'rgba(255,255,255,0.4)', fontSize:11, marginLeft:'auto' }}>{(onlineUsers||[]).filter(u=>u.isLive).length} en ligne</span>
        </div>
      )}

      {/* Poke notification */}
      {pokeNotif && (
        <div style={{ padding:'10px 16px', background:'#FEF3C7', borderBottom:'1px solid #FDE68A', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:14 }}>👋</span>
          <span style={{ fontSize:12, fontWeight:600, color:'#854D0E' }}>{fullName(pokeNotif.prenom, pokeNotif.nom)} vous mentionne !</span>
        </div>
      )}

      {/* Messages */}
      <div ref={msgsRef} style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
        {Object.entries(groupByDay).map(([day, dayMsgs]) => (
          <div key={day}>
            <div style={{ textAlign:'center', margin:'12px 0 8px' }}>
              <span style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', background:'#F3F4F6', padding:'2px 10px', borderRadius:10, textTransform:'uppercase' }}>{day}</span>
            </div>
            {dayMsgs.map((m, i) => {
              const isMe = m.user_id === userId
              const rc = ROLE_COLORS[m.role] || '#6B7280'
              const time = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
              return (
                <div key={m.id || i} style={{ display:'flex', gap:8, marginBottom:10, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                  {!isMe && (
                    <div style={{ width:28, height:28, borderRadius:'50%', background:rc+'33', border:`1.5px solid ${rc}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:rc, flexShrink:0, marginTop:2 }}>{ROLE_ABBR[m.role]||'?'}</div>
                  )}
                  <div style={{ maxWidth:'75%' }}>
                    {!isMe && <div style={{ fontSize:10, fontWeight:600, color:rc, marginBottom:2 }}>{fullName(m.prenom, m.nom)}</div>}
                    {m.poke_prenom && (
                      <div style={{ fontSize:9, color:'#D97706', marginBottom:2 }}>👋 @{m.poke_prenom}</div>
                    )}
                    <div style={{ padding:'8px 12px', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: isMe ? '#1C1C2E' : '#F3F4F6', color: isMe ? '#fff' : '#1C1C2E', fontSize:13, lineHeight:1.4, wordBreak:'break-word' }}>
                      {m.message}
                    </div>
                    <div style={{ fontSize:9, color:'#9CA3AF', marginTop:2, textAlign: isMe ? 'right' : 'left' }}>{time}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Poke selector */}
      <AccordionPanel open={showPoke}>
        <div style={{ padding:'8px 14px', borderTop:'1px solid #E8E6E1', background:'#F7F6F3', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', marginBottom:6 }}>Mentionner :</div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {(onlineUsers || []).filter(u => u.id !== userId).map(u => {
              const rc = ROLE_COLORS[u.role] || '#6B7280'
              return (
                <button key={u.id} onClick={() => handlePoke(u)}
                  style={{ padding:'4px 10px', borderRadius:16, border:`1px solid ${rc}`, background:rc+'22', color:rc, fontSize:10, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                  👋 {u.prenom}
                </button>
              )
            })}
            <button onClick={() => setShowPoke(false)} style={{ padding:'4px 8px', borderRadius:16, border:'1px solid #E8E6E1', background:'#fff', color:'#9CA3AF', fontSize:10, cursor:'pointer' }}>✕</button>
          </div>
        </div>
      </AccordionPanel>

      {/* Poke target indicator */}
      {pokeTarget && (
        <div style={{ padding:'4px 14px', background:'#FEF3C7', display:'flex', alignItems:'center', gap:6, fontSize:10, color:'#854D0E', flexShrink:0 }}>
          👋 @{pokeTarget.prenom}
          <button onClick={() => setPokeTarget(null)} style={{ background:'none', border:'none', color:'#854D0E', cursor:'pointer', fontSize:12 }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div style={{ padding:'10px 14px', borderTop:'1px solid #E8E6E1', display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
        <button onClick={() => setShowPoke(!showPoke)} title="Mentionner"
          style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E8E6E1', background: showPoke ? '#FEF3C7' : '#fff', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>👋</button>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Écrire un message..."
          style={{ flex:1, padding:'8px 12px', border:'1px solid #E8E6E1', borderRadius:20, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none' }} />
        <button onClick={sendMessage} disabled={!input.trim()}
          style={{ width:32, height:32, borderRadius:'50%', background: input.trim() ? '#C41E3A' : '#E8E6E1', border:'none', cursor: input.trim() ? 'pointer' : 'default', color:'#fff', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>↑</button>
      </div>
    </div>
  )
}
