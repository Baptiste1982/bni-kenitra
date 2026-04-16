import React, { useState, useEffect } from 'react'
import { fetchDashboardKPIs, cloturerMois } from '../lib/bniService'
import { supabase } from '../lib/supabase'
import { TLBadge, SectionTitle, PageHeader, TableWrap, fullName } from './ui'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, ComposedChart, ReferenceLine, Legend } from 'recharts'

// Objectif mensuel TYFCB par defaut (fallback si pas configure en base). Seuil "vert" >= 100k
const DEFAULT_OBJECTIF_TYFCB = 100000

const scoreBg = (score) => score >= 70 ? { bg:'#D1FAE5', color:'#065F46' } : score >= 50 ? { bg:'#FEF9C3', color:'#854D0E' } : score >= 30 ? { bg:'#FEE2E2', color:'#991B1B' } : { bg:'#F3F4F6', color:'#4B5563' }
const tlBg = (tl) => ({ vert:{bg:'#D1FAE5',color:'#065F46'}, orange:{bg:'#FEF9C3',color:'#854D0E'}, rouge:{bg:'#FEE2E2',color:'#991B1B'}, gris:{bg:'#F3F4F6',color:'#4B5563'} }[tl] || {bg:'#F3F4F6',color:'#4B5563'})
const tyfcbBg = (val) => val >= 300000 ? {bg:'#D1FAE5',color:'#065F46'} : val >= 50000 ? {bg:'#FEF9C3',color:'#854D0E'} : val >= 20000 ? {bg:'#FEF9C3',color:'#854D0E'} : val > 0 ? {bg:'#FEE2E2',color:'#991B1B'} : {bg:'#F3F4F6',color:'#4B5563'}
const nameColor = (score) => Number(score||0) >= 70 ? '#065F46' : Number(score||0) >= 50 ? '#854D0E' : Number(score||0) >= 30 ? '#991B1B' : '#6B7280'
const rowBg = (tl) => ({ vert:'#D1FAE5', orange:'#FEF9C3', rouge:'#FEE2E2', gris:'#F9FAFB' }[tl] || '#fff')

export default function Dashboard({ onNavigate, profil, groupeCode = 'MK-01' }) {
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reunionsSaisies, setReunionsSaisies] = useState(0)
  const [reunionsProvisoires, setReunionsProvisoires] = useState(0)
  const [cloturing, setCloturing] = useState(false)
  const [clotureMsg, setClotureMsg] = useState('')
  const [greeting, setGreeting] = useState('Bonjour')
  const [greetingSub, setGreetingSub] = useState('MK-01 Kénitra Atlantique · Données en temps réel')
  const [greetingLogo, setGreetingLogo] = useState('')
  const [editGreeting, setEditGreeting] = useState(false)
  const [editGreetingText, setEditGreetingText] = useState('')
  const [editGreetingSub, setEditGreetingSub] = useState('')
  const [editGreetingLogo, setEditGreetingLogo] = useState('')
  const [trendData, setTrendData] = useState([])
  const [tfOfficiel, setTfOfficiel] = useState(null) // Score TF region officiel (depuis region_traffic_light)
  const [objectifTyfcb, setObjectifTyfcb] = useState(DEFAULT_OBJECTIF_TYFCB)
  const [editObjectif, setEditObjectif] = useState(false)
  const [objectifInput, setObjectifInput] = useState('')
  const isAdmin = ['super_admin','directeur_executif'].includes(profil?.role)
  const canEditObjectif = ['super_admin','directrice_consultante'].includes(profil?.role)

  const now = new Date()
  const mois = now.getMonth() + 1
  const annee = now.getFullYear()
  const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const nbJeudis = (() => { let c=0; const fin=new Date(annee,mois,0); for(let d=1;d<=fin.getDate();d++){if(new Date(annee,mois-1,d).getDay()===4)c++} return c })()
  const canCloture = ['super_admin','directeur_executif','directrice_consultante','vice_president'].includes(profil?.role)

  useEffect(() => {
    const premierJour = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const dernierJour = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0]
    Promise.all([
      fetchDashboardKPIs(groupeCode),
      supabase.from('palms_hebdo').select('date_reunion, is_provisoire').gte('date_reunion', premierJour).lte('date_reunion', dernierJour),
      supabase.from('app_settings').select('key, value'),
    ]).then(([data, hebdoRes, settingsRes]) => {
      setKpis(data)
      // Compter les réunions consolidées vs provisoires du mois en cours
      const dates = new Set((hebdoRes?.data || []).filter(r => !r.is_provisoire).map(r => r.date_reunion))
      const datesProv = new Set((hebdoRes?.data || []).filter(r => r.is_provisoire).map(r => r.date_reunion))
      setReunionsSaisies(dates.size)
      setReunionsProvisoires(datesProv.size)
      // Settings
      const sMap = {}
      ;(settingsRes?.data || []).forEach(s => { sMap[s.key] = s.value })
      if (sMap.greeting) setGreeting(sMap.greeting)
      if (sMap.greeting_sub) setGreetingSub(sMap.greeting_sub)
      if (sMap.greeting_logo) setGreetingLogo(sMap.greeting_logo)
      setLoading(false)
    }).catch(() => setLoading(false))

    // Charger les tendances hebdo (toutes les réunions)
    supabase.from('palms_hebdo').select('date_reunion, tat, rdi, rde, invites, mpb, palms')
      .order('date_reunion')
      .then(({ data: hd }) => {
        if (!hd || hd.length === 0) return
        const byDate = {}
        hd.forEach(h => {
          if (!byDate[h.date_reunion]) byDate[h.date_reunion] = { date: h.date_reunion, tat:0, refs:0, invites:0, mpb:0, presents:0, total:0 }
          const d = byDate[h.date_reunion]
          d.tat += h.tat || 0
          d.refs += (h.rdi||0) + (h.rde||0)
          d.invites += h.invites || 0
          d.mpb += Number(h.mpb) || 0
          if (h.palms === 'P') d.presents++
          d.total++
        })
        const trend = Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date)).map(d => ({
          ...d,
          label: new Date(d.date+'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' }),
          presence: d.total > 0 ? Math.round(d.presents / d.total * 100) : 0,
        }))
        setTrendData(trend)
      })

    // Charger l'objectif TYFCB mensuel configure sur le groupe
    supabase.from('groupes').select('objectif_tyfcb_mois').eq('code', groupeCode).single()
      .then(({ data }) => {
        if (data?.objectif_tyfcb_mois) setObjectifTyfcb(Number(data.objectif_tyfcb_mois))
      })

    // Charger le dernier score TF officiel depuis region_traffic_light pour ce groupe
    supabase.from('region_traffic_light')
      .select('annee, mois, score, groupe_nom')
      .is('deleted_at', null)
      .ilike('groupe_nom', `${groupeCode}%`)
      .order('annee', { ascending: false }).order('mois', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setTfOfficiel(data[0])
        else setTfOfficiel(null)
      })
  }, [groupeCode])

  const saveObjectifTyfcb = async () => {
    const val = parseInt(String(objectifInput).replace(/\s/g,'')) || 0
    if (val < 0) { setEditObjectif(false); return }
    const { error } = await supabase.from('groupes').update({ objectif_tyfcb_mois: val }).eq('code', groupeCode)
    if (!error) setObjectifTyfcb(val)
    setEditObjectif(false)
  }

  const handleCloture = async () => {
    if (!window.confirm(`Clôturer le mois de ${moisLabel} ? Les données seront sauvegardées.`)) return
    setCloturing(true); setClotureMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await cloturerMois(mois, annee, session?.user?.id, groupeCode)
      setClotureMsg(`Mois clôturé — ${result.count} membres sauvegardés`)
    } catch(e) { setClotureMsg('Erreur : ' + e.message) }
    setCloturing(false)
  }

  const saveGreeting = async () => {
    await Promise.all([
      supabase.from('app_settings').update({ value: editGreetingText }).eq('key', 'greeting'),
      supabase.from('app_settings').update({ value: editGreetingSub }).eq('key', 'greeting_sub'),
      supabase.from('app_settings').update({ value: editGreetingLogo }).eq('key', 'greeting_logo'),
    ])
    setGreeting(editGreetingText)
    setGreetingSub(editGreetingSub)
    setGreetingLogo(editGreetingLogo)
    setEditGreeting(false)
  }

  const hover = e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform='translateY(-1px)' }
  const unhover = e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' }

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, border:'3px solid #E8E6E1', borderTopColor:'#C41E3A', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
        <div style={{ color:'#9CA3AF', fontSize:13 }}>Chargement des données live...</div>
      </div>
    </div>
  )

  const tl = kpis?.tlCounts || { vert:0, orange:0, rouge:0, gris:0 }
  const topScores = (kpis?.scores || []).filter(s => s.rank && s.rank <= 5).sort((a,b) => a.rank - b.rank)
  const topTyfcb = [...(kpis?.scores || [])].filter(s => Number(s.tyfcb) > 0).sort((a,b) => Number(b.tyfcb) - Number(a.tyfcb)).slice(0, 8)

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
        {greetingLogo && <img src={greetingLogo} alt="" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', boxShadow:'0 2px 8px rgba(0,0,0,0.1)', flexShrink:0 }} />}
        <div style={{ flex:1 }}>
          <h1 style={{ fontFamily:'DM Sans, sans-serif', fontSize:24, fontWeight:700, color:'#1C1C2E' }}>{greeting}, {profil?.prenom || 'Jean Baptiste'} 👋</h1>
          <p style={{ color:'#6B7280', fontSize:13, marginTop:3 }}>{greetingSub}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {isAdmin && <button onClick={() => { setEditGreetingText(greeting); setEditGreetingSub(greetingSub); setEditGreetingLogo(greetingLogo); setEditGreeting(!editGreeting) }}
            style={{ background:'none', border:'1px solid #E8E6E1', borderRadius:8, padding:'5px 8px', cursor:'pointer', fontSize:12, color:'#6B7280' }} title="Personnaliser">✏️</button>}
          <div style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:10, padding:'10px 16px', textAlign:'right' }}>
            <div style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Lancé le</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#1C1C2E' }}>12 déc 2025</div>
          </div>
        </div>
      </div>
      {editGreeting && (
        <div style={{ background:'#fff', borderRadius:12, padding:'16px 20px', border:'1px solid #E8E6E1', marginBottom:16, animation:'fadeIn 0.2s ease' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#1C1C2E', marginBottom:12 }}>✏️ Personnaliser le message d'accueil</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', display:'block', marginBottom:4 }}>Message d'accueil</label>
              <input value={editGreetingText} onChange={e => setEditGreetingText(e.target.value)} placeholder="Bonjour" style={{ width:'100%', padding:'8px 12px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', display:'block', marginBottom:4 }}>Sous-titre</label>
              <input value={editGreetingSub} onChange={e => setEditGreetingSub(e.target.value)} placeholder="MK-01 Kénitra..." style={{ width:'100%', padding:'8px 12px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', display:'block', marginBottom:4 }}>URL du logo (laisser vide = pas de logo)</label>
            <input value={editGreetingLogo} onChange={e => setEditGreetingLogo(e.target.value)} placeholder="https://exemple.com/logo.png" style={{ width:'100%', padding:'8px 12px', border:'1px solid #E8E6E1', borderRadius:8, fontSize:13, fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
          </div>
          {editGreetingLogo && <div style={{ marginBottom:12 }}><img src={editGreetingLogo} alt="Aperçu" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', border:'1px solid #E8E6E1' }} onError={e => e.target.style.display='none'} /></div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={saveGreeting} style={{ padding:'7px 16px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Enregistrer</button>
            <button onClick={() => setEditGreeting(false)} style={{ padding:'7px 16px', background:'#F3F4F6', color:'#6B7280', border:'none', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Mois en cours */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: window.innerWidth <= 768 ? '10px 14px' : '14px 20px', background:'#1C1C2E', borderRadius:12, marginBottom:20, color:'#fff', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap: window.innerWidth <= 768 ? 8 : 16, flex:1, minWidth:0 }}>
          <div style={{ fontSize: window.innerWidth <= 768 ? 16 : 22, fontWeight:700, fontFamily:'DM Sans, sans-serif', textTransform:'capitalize', whiteSpace:'nowrap' }}>{moisLabel}</div>
          <div style={{ fontSize: window.innerWidth <= 768 ? 10 : 12, opacity:0.6, whiteSpace:'nowrap' }}>{reunionsSaisies + reunionsProvisoires}/{nbJeudis}</div>
          <div style={{ display:'flex', gap:3 }}>
            {Array.from({length:nbJeudis}).map((_,i) => (
              <div key={i} style={{ width: window.innerWidth <= 768 ? 8 : 10, height: window.innerWidth <= 768 ? 8 : 10, borderRadius:'50%', background: i < reunionsSaisies ? '#059669' : i < reunionsSaisies + reunionsProvisoires ? '#F59E0B' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        </div>
        {(canCloture || clotureMsg) && <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          {clotureMsg && <span style={{ fontSize:10, color: clotureMsg.startsWith('Erreur') ? '#FECACA' : '#A7F3D0' }}>{clotureMsg}</span>}
          {canCloture && (
            <div onClick={cloturing ? undefined : handleCloture}
              style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, padding:'5px 10px', cursor: cloturing ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:6, opacity: cloturing ? 0.5 : 1, transition:'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}>
              <div>
                <div style={{ fontSize:7, fontWeight:600, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{cloturing ? 'En cours...' : 'Clôture'}</div>
                <div style={{ fontSize:10, fontWeight:700, color:'#fff' }}>📋 Clôturer</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:1.5 }}>
                <span style={{ width:3, height:3, borderRadius:'50%', background:'#C41E3A' }} />
                <span style={{ width:3, height:3, borderRadius:'50%', background:'#C41E3A' }} />
                <span style={{ width:3, height:3, borderRadius:'50%', background:'#C41E3A' }} />
              </div>
            </div>
          )}
        </div>}
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns: window.innerWidth <= 768 ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: window.innerWidth <= 768 ? 10 : 16, marginBottom:24 }}>
        {[
          { label:'Membres actifs', value: kpis?.membresActifs ?? '—', sub:'Objectif : 30 membres', nav:'membres', prog: kpis ? kpis.membresActifs/30*100 : 0, bg: kpis?.membresActifs >= 25 ? '#D1FAE5' : kpis?.membresActifs >= 20 ? '#FEF9C3' : '#FEE2E2', topBg: kpis?.membresActifs >= 25 ? '#A7F3D0' : kpis?.membresActifs >= 20 ? '#FDE68A' : '#FECACA', valueColor: kpis?.membresActifs >= 25 ? '#065F46' : kpis?.membresActifs >= 20 ? '#854D0E' : '#991B1B', accent:'#C41E3A' },
          { label:'Alertes actives', value: kpis?.alertesCount ?? '—', sub:'Cliquez pour voir le détail', nav:'invites', bg: kpis?.alertesCount === 0 ? '#D1FAE5' : kpis?.alertesCount <= 2 ? '#FEF9C3' : '#FEE2E2', topBg: kpis?.alertesCount === 0 ? '#A7F3D0' : kpis?.alertesCount <= 2 ? '#FDE68A' : '#FECACA', valueColor: kpis?.alertesCount === 0 ? '#065F46' : '#991B1B', accent:'#F59E0B' },
          { label:'TYFCB généré', value: kpis ? `${Number(kpis.tyfcb).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2})} MAD` : '—', sub: `Cumul ${new Date().toLocaleDateString('fr-FR', {month:'long', year:'numeric'})}`, nav:'reporting', bg: kpis?.tyfcb >= 100000 ? '#D1FAE5' : kpis?.tyfcb >= 20000 ? '#FEF9C3' : kpis?.tyfcb > 0 ? '#FEF9C3' : '#FEE2E2', topBg: kpis?.tyfcb >= 100000 ? '#A7F3D0' : kpis?.tyfcb >= 20000 ? '#FDE68A' : kpis?.tyfcb > 0 ? '#FDE68A' : '#FECACA', valueColor: kpis?.tyfcb >= 100000 ? '#065F46' : kpis?.tyfcb >= 20000 ? '#854D0E' : kpis?.tyfcb > 0 ? '#854D0E' : '#991B1B', accent:'#3B82F6' },
          { label:'Taux de présence', value: kpis ? `${kpis.pRate}%` : '—', sub:'Moyenne groupe', nav:'reporting', bg: kpis?.pRate >= 95 ? '#D1FAE5' : kpis?.pRate >= 88 ? '#FEF9C3' : '#FEE2E2', topBg: kpis?.pRate >= 95 ? '#A7F3D0' : kpis?.pRate >= 88 ? '#FDE68A' : '#FECACA', valueColor: kpis?.pRate >= 95 ? '#065F46' : kpis?.pRate >= 88 ? '#854D0E' : '#991B1B', accent:'#059669' },
        ].map(c => (
          <div key={c.label} onClick={() => onNavigate(c.nav)} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:c.bg, borderRadius:12, border:'1px solid rgba(0,0,0,0.06)', overflow:'hidden', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ background:c.topBg, padding: window.innerWidth <= 768 ? '6px 12px' : '10px 20px' }}>
              <div style={{ fontSize: window.innerWidth <= 768 ? 9 : 11, fontWeight:600, color:c.valueColor, textTransform:'uppercase', letterSpacing:'0.07em', opacity:0.8 }}>{c.label}</div>
            </div>
            <div style={{ padding: window.innerWidth <= 768 ? '8px 12px 12px' : '14px 20px 18px' }}>
              <div style={{ fontSize: window.innerWidth <= 768 ? 18 : 28, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:c.valueColor }}>{c.value}</div>
              <div style={{ fontSize: window.innerWidth <= 768 ? 10 : 12, color:'#6B7280', marginTop:4 }}>{c.sub}</div>
              {c.prog !== undefined && <div style={{ height:4, background:'rgba(255,255,255,0.5)', borderRadius:2, marginTop:10 }}><div style={{ height:4, width:`${Math.min(100,c.prog)}%`, background:c.valueColor, borderRadius:2, opacity:0.5 }} /></div>}
              <div style={{ fontSize:11, color:c.valueColor, marginTop:6, fontWeight:500, opacity:0.7 }}>Voir le détail →</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tendances hebdo */}
      {trendData.length > 1 && (
        <div style={{ display:'grid', gridTemplateColumns: window.innerWidth <= 768 ? '1fr' : '1fr 1fr', gap:16, marginBottom:24, minWidth:0 }}>
          {/* TYFCB par réunion + cumul + objectif */}
          {(() => {
            // Calculer le cumul progressif du TYFCB semaine apres semaine
            let runningSum = 0
            const dataWithCumul = trendData.map(d => {
              runningSum += Number(d.mpb) || 0
              return { ...d, mpbCumul: Math.round(runningSum) }
            })
            const cumulActuel = dataWithCumul.length ? dataWithCumul[dataWithCumul.length - 1].mpbCumul : 0
            const pctObjectif = Math.round((cumulActuel / objectifTyfcb) * 100)
            const atteint = cumulActuel >= objectifTyfcb
            return (
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
                <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                  <SectionTitle>💰 TYFCB cumulé vs objectif</SectionTitle>
                  <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
                    <span style={{ fontWeight:700, color: atteint ? '#065F46' : pctObjectif >= 50 ? '#854D0E' : '#991B1B', display:'flex', alignItems:'center', gap:4 }}>
                      {Number(cumulActuel).toLocaleString('fr-FR')} /
                      {editObjectif ? (
                        <input
                          type="number"
                          value={objectifInput}
                          onChange={e => setObjectifInput(e.target.value)}
                          onBlur={saveObjectifTyfcb}
                          onKeyDown={e => { if (e.key === 'Enter') saveObjectifTyfcb(); if (e.key === 'Escape') setEditObjectif(false) }}
                          autoFocus
                          style={{ width:90, padding:'2px 6px', border:'1px solid #3B82F6', borderRadius:4, fontSize:11, fontFamily:'DM Sans, sans-serif', fontWeight:700 }}
                        />
                      ) : (
                        <span
                          onClick={() => { if (canEditObjectif) { setObjectifInput(objectifTyfcb); setEditObjectif(true) } }}
                          style={canEditObjectif ? { cursor:'pointer', borderBottom:'1px dashed currentColor', padding:'0 2px' } : {}}
                          title={canEditObjectif ? 'Cliquer pour modifier l\'objectif' : undefined}
                        >
                          {Number(objectifTyfcb).toLocaleString('fr-FR')}
                        </span>
                      )}
                      MAD
                      {canEditObjectif && !editObjectif && <span style={{ fontSize:10, color:'#3B82F6', marginLeft:2 }}>✎</span>}
                    </span>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background: atteint ? '#D1FAE5' : pctObjectif >= 50 ? '#FEF9C3' : '#FEE2E2', color: atteint ? '#065F46' : pctObjectif >= 50 ? '#854D0E' : '#991B1B', fontWeight:700 }}>{pctObjectif}%</span>
                  </div>
                </div>
                <div style={{ padding:'12px 8px 4px', height:220, minWidth:0 }}>
                  <ResponsiveContainer width="100%" height={210}>
                    <ComposedChart data={dataWithCumul}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EF" />
                      <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9CA3AF' }} />
                      <YAxis tick={{ fontSize:10, fill:'#9CA3AF' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip
                        formatter={(v, name) => [`${Number(v).toLocaleString('fr-FR')} MAD`, name === 'mpb' ? 'TYFCB semaine' : 'TYFCB cumulé']}
                        labelStyle={{ fontWeight:700 }}
                        contentStyle={{ borderRadius:8, border:'1px solid #E8E6E1', fontSize:12 }} />
                      <Legend wrapperStyle={{ fontSize:11 }} />
                      <ReferenceLine y={objectifTyfcb} stroke="#059669" strokeDasharray="4 4" strokeWidth={2} label={{ value:`🎯 Objectif ${(objectifTyfcb/1000).toFixed(0)}k`, position:'insideTopRight', fill:'#059669', fontSize:10, fontWeight:700 }} />
                      <Bar dataKey="mpb" name="TYFCB semaine" fill="#C41E3A" radius={[4,4,0,0]} />
                      <Line type="monotone" dataKey="mpbCumul" name="TYFCB cumulé" stroke="#3B82F6" strokeWidth={3} dot={{ r:5, fill:'#3B82F6' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}

          {/* Activité : TàT + Recos */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}>
              <SectionTitle>📊 Activité hebdo</SectionTitle>
            </div>
            <div style={{ padding:'12px 8px 4px', height:200, minWidth:0 }}>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EF" />
                  <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9CA3AF' }} />
                  <YAxis tick={{ fontSize:10, fill:'#9CA3AF' }} />
                  <Tooltip contentStyle={{ borderRadius:8, border:'1px solid #E8E6E1', fontSize:12 }} />
                  <Line type="monotone" dataKey="tat" name="1-2-1s" stroke="#3B82F6" strokeWidth={2} dot={{ r:4 }} />
                  <Line type="monotone" dataKey="refs" name="Recos" stroke="#059669" strokeWidth={2} dot={{ r:4 }} />
                  <Line type="monotone" dataKey="invites" name="Visiteurs" stroke="#D97706" strokeWidth={2} dot={{ r:4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        {/* Alertes live — catégorisées */}
        {(() => {
          const allAlertes = kpis?.alertes || []
          const alertesMembres = allAlertes.filter(a => a.type_alerte === 'renouvellement' || a.niveau === 'danger')
          const alertesInvites = allAlertes.filter(a => a.type_alerte === 'recontact' || (a.type_alerte !== 'renouvellement' && a.niveau !== 'danger' && a.niveau !== 'relance'))
          const alertesRecontact = allAlertes.filter(a => a.niveau === 'relance')
          const categories = [
            { label:'Membres', icon:'👤', alertes: alertesMembres, module:'membres' },
            { label:'Invités', icon:'◉', alertes: [...alertesInvites.filter(a=>a.niveau!=='relance')], module:'invites' },
            { label:'À recontacter', icon:'📞', alertes: alertesRecontact, module:'invites' },
          ].filter(c => c.alertes.length > 0)

          const renderAlerte = (a, i) => {
            const style = a.niveau==='danger' ? { bg:'#FEF2F2', border:'#FEE2E2', dot:'#DC2626' }
              : a.niveau==='relance' ? { bg:'#DBEAFE', border:'#BFDBFE', dot:'#3B82F6' }
              : { bg:'#FFFBEB', border:'#FEF3C7', dot:'#D97706' }
            return (
              <div key={i} onClick={() => onNavigate(a.type_alerte === 'renouvellement' ? 'membres' : 'invites')}
                style={{ display:'flex', alignItems:'flex-start', gap:10, padding:10, borderRadius:8, marginBottom:6, background:style.bg, border:`1px solid ${style.border}`, cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.opacity='0.8'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:style.dot, flexShrink:0, marginTop:4 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a.titre}</div>
                  <div style={{ fontSize:10, color:'#6B7280', marginTop:1 }}>{a.message}</div>
                  {a.date_echeance && <div style={{ fontSize:9, fontWeight:600, color:style.dot, marginTop:3 }}>Échéance : {new Date(a.date_echeance).toLocaleDateString('fr-FR')}</div>}
                </div>
              </div>
            )
          }

          return (
            <TableWrap>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <SectionTitle>🚨 Alertes prioritaires ({allAlertes.length})</SectionTitle>
              </div>
              <div style={{ padding:12, maxHeight:400, overflowY:'auto' }}>
                {allAlertes.length === 0 ? (
                  <div style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>✅ Aucune alerte active</div>
                ) : categories.map((cat, ci) => (
                  <div key={ci} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <span style={{ fontSize:12 }}>{cat.icon}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:'#1C1C2E', textTransform:'uppercase', letterSpacing:'0.06em' }}>{cat.label}</span>
                      <span style={{ fontSize:9, fontWeight:600, padding:'1px 6px', borderRadius:8, background:'#F3F4F6', color:'#6B7280' }}>{cat.alertes.length}</span>
                    </div>
                    {cat.alertes.map(renderAlerte)}
                  </div>
                ))}
              </div>
            </TableWrap>
          )
        })()}

        {/* Right column */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {(() => {
            // Score de sante pondere : vert=100, orange=60, rouge=30, gris=0
            const total = (tl.vert || 0) + (tl.orange || 0) + (tl.rouge || 0) + (tl.gris || 0)
            const sante = total > 0 ? Math.round(((tl.vert || 0) * 100 + (tl.orange || 0) * 60 + (tl.rouge || 0) * 30) / total) : 0
            const santeColor = sante >= 70 ? '#059669' : sante >= 50 ? '#D97706' : sante >= 30 ? '#DC2626' : '#9CA3AF'
            const santeLabel = sante >= 70 ? 'Excellente' : sante >= 50 ? 'Correcte' : sante >= 30 ? 'Fragile' : 'Alerte'
            // Gauge SVG : demi-cercle de 0 (gauche) a 100 (droite)
            const W = 260, H = 150, cx = W/2, cy = H - 20, r = 90, th = 18
            const angleOf = (s) => Math.PI - (Math.max(0, Math.min(100, s)) / 100) * Math.PI
            const pt = (a) => ({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) })
            const arcPath = (a, b) => { const p1 = pt(angleOf(a)), p2 = pt(angleOf(b)); return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}` }
            const nAngle = angleOf(sante)
            const nEnd = pt(nAngle)
            return (
              <div onClick={() => onNavigate('membres')} onMouseEnter={hover} onMouseLeave={unhover}
                style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <SectionTitle>🩺 Santé du chapter</SectionTitle>
                  <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir →</span>
                </div>
                <div style={{ display:'flex', justifyContent:'center' }}>
                  <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth:280 }}>
                    {/* Zones colorees de l'arc */}
                    <path d={arcPath(0, 30)} stroke="#FCA5A5" strokeWidth={th} fill="none" strokeLinecap="round" />
                    <path d={arcPath(30, 60)} stroke="#FCD34D" strokeWidth={th} fill="none" />
                    <path d={arcPath(60, 100)} stroke="#86EFAC" strokeWidth={th} fill="none" strokeLinecap="round" />
                    {/* Graduations */}
                    <text x={cx - r} y={cy + 18} textAnchor="middle" fontSize={9} fill="#9CA3AF">0</text>
                    <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={9} fill="#9CA3AF">50</text>
                    <text x={cx + r} y={cy + 18} textAnchor="middle" fontSize={9} fill="#9CA3AF">100</text>
                    {/* Aiguille */}
                    <line x1={cx} y1={cy} x2={nEnd.x} y2={nEnd.y} stroke={santeColor} strokeWidth={3} strokeLinecap="round" style={{ transition:'all 0.6s ease' }} />
                    <circle cx={cx} cy={cy} r={10} fill={santeColor} />
                    <circle cx={cx} cy={cy} r={4} fill="#fff" />
                    {/* Score central */}
                    <text x={cx} y={cy - 45} textAnchor="middle" fontSize={32} fontWeight={800} fill={santeColor}>{sante}</text>
                    <text x={cx} y={cy - 28} textAnchor="middle" fontSize={10} fill="#6B7280" fontWeight={600}>/ 100 · {santeLabel}</text>
                  </svg>
                </div>
                {/* Chips de repartition */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center', marginTop:4 }}>
                  {[['Vert', tl.vert, '#059669', '#D1FAE5'], ['Orange', tl.orange, '#854D0E', '#FEF9C3'], ['Rouge', tl.rouge, '#991B1B', '#FEE2E2'], ['Gris', tl.gris, '#4B5563', '#E5E7EB']].map(([t, n, col, bg]) => (
                    <div key={t} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:12, background:bg }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background: col }} />
                      <span style={{ fontSize:10, color:col, fontWeight:600 }}>{t}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:col }}>{n || 0}</span>
                    </div>
                  ))}
                </div>
                {/* Score TF officiel (depuis le rapport regional PALMS) */}
                {tfOfficiel && (() => {
                  const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
                  const tfBg = tfOfficiel.score >= 70 ? '#D1FAE5' : tfOfficiel.score >= 50 ? '#FEF9C3' : tfOfficiel.score >= 30 ? '#FEE2E2' : '#F3F4F6'
                  const tfCol = tfOfficiel.score >= 70 ? '#065F46' : tfOfficiel.score >= 50 ? '#854D0E' : tfOfficiel.score >= 30 ? '#991B1B' : '#4B5563'
                  return (
                    <div onClick={(e) => { e.stopPropagation(); onNavigate('rtl') }}
                      style={{ marginTop:10, padding:'10px 14px', background:'#F9F8F6', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between', border:'1px solid #E8E6E1', cursor:'pointer', transition:'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F0EFEC'} onMouseLeave={e => e.currentTarget.style.background='#F9F8F6'}>
                      <div>
                        <div style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em' }}>TF officiel PALMS</div>
                        <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{MOIS_COURT[tfOfficiel.mois - 1]} {tfOfficiel.annee}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:20, fontWeight:800, color:tfCol }}>{tfOfficiel.score}</span>
                        <span style={{ fontSize:11, color:'#9CA3AF' }}>/100</span>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:tfBg, color:tfCol, fontWeight:700, textTransform:'uppercase', marginLeft:4 }}>
                          {tfOfficiel.score >= 70 ? 'Vert' : tfOfficiel.score >= 50 ? 'Orange' : tfOfficiel.score >= 30 ? 'Rouge' : 'Gris'}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          <div onClick={() => onNavigate('invites')} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Pipeline invités</SectionTitle>
              <span style={{ fontSize:11, color:'#C41E3A', fontWeight:500 }}>Voir →</span>
            </div>
            {[['Total', kpis?.invitesTotal ?? '—', '#1C1C2E'], ['Devenus membres', kpis?.invitesConvertis ?? '—', '#059669'], ['Membres BNI', kpis?.invitesMembresBNI ?? '—', '#6366F1'], ['En cours', kpis?.invitesEnCours ?? '—', '#D97706']].map(([l, v, col]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, color:'#6B7280' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:col }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top classement + Top TYFCB */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>🏆 Top classement</SectionTitle>
            <button onClick={() => onNavigate('membres')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir tous →</button>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['#','Membre','Score','TL'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {topScores.map(s => {
                const sc = scoreBg(Number(s.total_score))
                const tb = tlBg(s.traffic_light)
                return (
                  <tr key={s.rank} onClick={() => onNavigate('membres')} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', cursor:'pointer', background:rowBg(s.traffic_light) }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                    <td style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:12, width:30 }}>{s.rank}</td>
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:nameColor(s.total_score) }}>{fullName(s.membres?.prenom, s.membres?.nom)}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, fontSize:14, background:sc.bg, color:sc.color, textAlign:'center', width:60 }}>{Number(s.total_score).toFixed(0)}</td>
                    <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><TLBadge tl={s.traffic_light} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>

        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>💰 Top TYFCB</SectionTitle>
            <button onClick={() => onNavigate('membres')} style={{ fontSize:11, color:'#C41E3A', background:'none', border:'none', cursor:'pointer', fontWeight:500 }}>Voir tous →</button>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Membre','TYFCB (MAD)','TL'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {topTyfcb.map((s, i) => {
                const tb = tlBg(s.traffic_light)
                const tyb = tyfcbBg(Number(s.tyfcb))
                return (
                  <tr key={i} onClick={() => onNavigate('membres')} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', cursor:'pointer', background:rowBg(s.traffic_light) }}
                    onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:nameColor(s.total_score) }}>{fullName(s.membres?.prenom, s.membres?.nom)}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, fontSize:13, background:tyb.bg, color:tyb.color, textAlign:'center' }}>{Number(s.tyfcb).toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                    <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><TLBadge tl={s.traffic_light} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
