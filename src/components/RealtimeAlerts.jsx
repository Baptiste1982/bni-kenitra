import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAlertes, marquerAlerteLue } from '../lib/bniService'

export default function RealtimeAlerts({ onNavigate }) {
  const [alertes, setAlertes] = useState([])
  const [newAlert, setNewAlert] = useState(null)
  const [show, setShow] = useState(false)
  const audioRef = useRef(null)

  const load = async () => {
    try {
      const data = await fetchAlertes()
      setAlertes(data || [])
    } catch {}
  }

  useEffect(() => {
    load()

    // Supabase Realtime subscription
    const channel = supabase
      .channel('alertes-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alertes'
      }, (payload) => {
        setNewAlert(payload.new)
        setAlertes(prev => [payload.new, ...prev])
        setShow(true)
        // Auto hide after 6s
        setTimeout(() => setShow(false), 6000)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'alertes'
      }, () => { load() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const marquerLue = async (id) => {
    await marquerAlerteLue(id)
    setAlertes(prev => prev.filter(a => a.id !== id))
  }

  return (
    <>
      {/* Toast notification pour nouvelle alerte en temps reel — a gauche du chat */}
      {show && newAlert && (
        <div style={{
          position:'fixed', bottom:8, right:160, zIndex:1000,
          background:'#1C1C2E', borderRadius:12, padding:'16px 20px',
          maxWidth:380, boxShadow:'0 8px 32px rgba(0,0,0,0.3)',
          animation:'slideInRight 0.3s ease',
          borderLeft:`4px solid ${newAlert.niveau==='danger'?'#DC2626':'#D97706'}`
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
            <div>
              <div style={{ color:'#fff', fontSize:13, fontWeight:600, marginBottom:4 }}>
                🚨 Nouvelle alerte
              </div>
              <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>{newAlert.titre}</div>
            </div>
            <button onClick={() => setShow(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:16, padding:0 }}>✕</button>
          </div>
          <button onClick={() => { setShow(false); onNavigate && onNavigate('dashboard') }}
            style={{ marginTop:10, fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontFamily:'DM Sans, sans-serif', padding:0 }}>
            Voir sur le dashboard →
          </button>
        </div>
      )}
      <style>{`
        @keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </>
  )
}
