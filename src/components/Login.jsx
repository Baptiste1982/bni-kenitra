import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login') // login | magic

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      onLogin(data.user)
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : err.message)
    }
    setLoading(false)
  }

  const handleMagicLink = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } })
      if (error) throw error
      setError('✅ Lien envoyé ! Vérifiez votre boîte mail.')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#1C1C2E', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans, sans-serif' }}>
      {/* Background pattern */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(196,30,58,0.08) 1px, transparent 1px)', backgroundSize:'32px 32px' }} />
      
      <div style={{ position:'relative', width:'100%', maxWidth:400, padding:32 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background:'#C41E3A', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:28, fontFamily:'DM Sans, sans-serif', fontWeight:700, color:'#fff' }}>B</div>
          <div style={{ fontFamily:'DM Sans, sans-serif', fontSize:22, fontWeight:700, color:'#fff' }}>BNI Kénitra</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:13, marginTop:4 }}>Espace Directeur Exécutif</div>
        </div>

        {/* Card */}
        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:32, backdropFilter:'blur(10px)' }}>
          <div style={{ display:'flex', gap:8, marginBottom:24, background:'rgba(255,255,255,0.05)', borderRadius:8, padding:4 }}>
            {[['login','Mot de passe'],['magic','Lien magique']].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{ flex:1, padding:'8px 0', borderRadius:6, border:'none', cursor:'pointer', fontSize:13, fontWeight:mode===m?600:400, background:mode===m?'rgba(255,255,255,0.1)':'transparent', color:mode===m?'#fff':'rgba(255,255,255,0.4)', transition:'all 0.15s' }}>
                {l}
              </button>
            ))}
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleMagicLink}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:500, color:'rgba(255,255,255,0.5)', marginBottom:6, letterSpacing:'0.05em', textTransform:'uppercase' }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="votre@email.com"
                style={{ width:'100%', padding:'11px 14px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff', fontSize:14, fontFamily:'DM Sans, sans-serif', outline:'none' }}
              />
            </div>

            {mode === 'login' && (
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:500, color:'rgba(255,255,255,0.5)', marginBottom:6, letterSpacing:'0.05em', textTransform:'uppercase' }}>Mot de passe</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  style={{ width:'100%', padding:'11px 14px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff', fontSize:14, fontFamily:'DM Sans, sans-serif', outline:'none' }}
                />
              </div>
            )}

            {mode === 'magic' && (
              <div style={{ marginBottom:20, fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.5 }}>
                Vous recevrez un lien de connexion par email. Aucun mot de passe requis.
              </div>
            )}

            {error && (
              <div style={{ padding:'10px 14px', borderRadius:8, marginBottom:16, background: error.startsWith('✅') ? 'rgba(5,150,105,0.15)' : 'rgba(220,38,38,0.15)', border: `1px solid ${error.startsWith('✅') ? 'rgba(5,150,105,0.3)' : 'rgba(220,38,38,0.3)'}`, color: error.startsWith('✅') ? '#6EE7B7' : '#FCA5A5', fontSize:13 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ width:'100%', padding:'12px 0', background: loading ? 'rgba(196,30,58,0.5)' : '#C41E3A', border:'none', borderRadius:8, color:'#fff', fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer', fontFamily:'DM Sans, sans-serif', transition:'all 0.15s' }}>
              {loading ? 'Connexion...' : mode === 'login' ? 'Se connecter' : 'Envoyer le lien'}
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:20, color:'rgba(255,255,255,0.2)', fontSize:11 }}>
          BNI Kénitra · Région Maroc · © 2026
        </div>
      </div>
    </div>
  )
}
