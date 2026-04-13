import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fullName } from './ui'

const ROLE_COLORS = { super_admin:'#C9A84C', directeur_executif:'#C9A84C', directrice_consultante:'#3B82F6', president:'#6366F1', vice_president:'#8B5CF6', secretaire_tresorier:'#DC2626', lecture:'#6B7280' }
const ROLE_ABBR = { super_admin:'SA', directeur_executif:'DE', directrice_consultante:'DC', president:'P', vice_president:'VP', secretaire_tresorier:'ST', lecture:'L' }

export default function TeamChat({ profil, isOpen, onClose, onlineUsers }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [showPoke, setShowPoke] = useState(false)
  const [pokeNotif, setPokeNotif] = useState(null)
  const msgsRef = useRef(null)
  const userId = profil?.id || null

  // Charger les messages
  useEffect(() => {
    if (!isOpen) return
    supabase.from('team_messages').select('*').order('created_at', { ascending: true }).limit(100)
      .then(({ data }) => { setMessages(data || []); scrollBottom() })

    // Écouter les nouveaux messages en temps réel
    const channel = supabase.channel('team-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, payload => {
        setMessages(prev => [...prev, payload.new])
        scrollBottom()
        // Notification si poke pour moi
        if (payload.new.poke_user_id === userId) {
          setPokeNotif(payload.new)
          setTimeout(() => setPokeNotif(null), 5000)
        }
      }).subscribe()

    return () => supabase.removeChannel(channel)
  }, [isOpen, userId])

  const scrollBottom = () => setTimeout(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight }, 50)

  const sendMessage = async (pokeUserId, pokePrenom) => {
    const msg = input.trim()
    if (!msg || !profil) return
    await supabase.from('team_messages').insert({
      user_id: userId, prenom: profil.prenom, nom: profil.nom, role: profil.role,
      message: msg, poke_user_id: pokeUserId || null, poke_prenom: pokePrenom || null,
    })
    setInput('')
    setShowPoke(false)
  }

  if (!isOpen) return null

  // Grouper les messages par jour
  const groupByDay = {}
  messages.forEach(m => {
    const day = new Date(m.created_at).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })
    if (!groupByDay[day]) groupByDay[day] = []
    groupByDay[day].push(m)
  })

  return (
    <div style={{ position:'fixed', bottom:20, right:20, width:380, maxHeight:'70vh', background:'#fff', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', zIndex:200, overflow:'hidden', border:'1px solid #E8E6E1' }}>

      {/* Header */}
      <div style={{ background:'#1C1C2E', padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:16 }}>💬</span>
          <span style={{ color:'#fff', fontSize:14, fontWeight:700 }}>Chat Équipe</span>
          <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background:'rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.6)' }}>{messages.length}</span>
        </div>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', width:26, height:26, borderRadius:'50%', cursor:'pointer', fontSize:12 }}>✕</button>
      </div>

      {/* Poke notification */}
      {pokeNotif && (
        <div style={{ padding:'10px 16px', background:'#FEF3C7', borderBottom:'1px solid #FDE68A', display:'flex', alignItems:'center', gap:8, animation:'fadeIn 0.3s' }}>
          <span style={{ fontSize:14 }}>👋</span>
          <span style={{ fontSize:12, fontWeight:600, color:'#854D0E' }}>{fullName(pokeNotif.prenom, pokeNotif.nom)} vous mentionne !</span>
        </div>
      )}

      {/* Messages */}
      <div ref={msgsRef} style={{ flex:1, overflowY:'auto', padding:'12px 14px', maxHeight:'45vh' }}>
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
                  <div style={{ maxWidth:'70%' }}>
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
      {showPoke && (
        <div style={{ padding:'8px 14px', borderTop:'1px solid #E8E6E1', background:'#F7F6F3' }}>
          <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', marginBottom:6 }}>Mentionner un membre :</div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {(onlineUsers || []).filter(u => u.id !== userId).map(u => {
              const rc = ROLE_COLORS[u.role] || '#6B7280'
              return (
                <button key={u.id} onClick={() => sendMessage(u.id, u.prenom)}
                  style={{ padding:'4px 10px', borderRadius:16, border:`1px solid ${rc}`, background:rc+'22', color:rc, fontSize:10, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                  👋 {u.prenom}
                </button>
              )
            })}
            <button onClick={() => setShowPoke(false)} style={{ padding:'4px 8px', borderRadius:16, border:'1px solid #E8E6E1', background:'#fff', color:'#9CA3AF', fontSize:10, cursor:'pointer' }}>✕</button>
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ padding:'10px 14px', borderTop:'1px solid #E8E6E1', display:'flex', gap:8, alignItems:'center' }}>
        <button onClick={() => setShowPoke(!showPoke)} title="Mentionner"
          style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #E8E6E1', background: showPoke ? '#FEF3C7' : '#fff', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>👋</button>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Écrire un message..."
          style={{ flex:1, padding:'8px 12px', border:'1px solid #E8E6E1', borderRadius:20, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none' }} />
        <button onClick={() => sendMessage()} disabled={!input.trim()}
          style={{ width:32, height:32, borderRadius:'50%', background: input.trim() ? '#C41E3A' : '#E8E6E1', border:'none', cursor: input.trim() ? 'pointer' : 'default', color:'#fff', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>↑</button>
      </div>
    </div>
  )
}
