import React, { useState, useRef, useEffect } from 'react'
import { fetchInvites, fetchDashboardKPIs, fetchScoresMK01, fetchPalmsHebdoMois, fetchMonthlySnapshots, syncSheetToSupabase, writeInviteToSheet } from '../lib/bniService'
import { GroupeScoresChart } from './ScoresChart'
import { BNI_SYSTEM_PROMPT } from '../data/bniData'
import { supabase } from '../lib/supabase'
import { PageHeader, SectionTitle, TableWrap, StatCard } from './ui'

// ─── INVITÉS ────────────────────────────────────────────────────────────────
export function Invites() {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tous')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [newStatut, setNewStatut] = useState(false)
  const [customStatut, setCustomStatut] = useState('')
  const [extraStatuts, setExtraStatuts] = useState([])

  const load = () => {
    setLoading(true)
    fetchInvites().then(data => { setInvites(data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const result = await syncSheetToSupabase()
      setSyncMsg(`Sync terminée — ${result.synced} invités synchronisés`)
      load()
    } catch (e) { setSyncMsg('Erreur : ' + e.message) }
    setSyncing(false)
  }

  const handleSaveEdit = async () => {
    try {
      await supabase.from('invites').update(editData).eq('id', editId)
      // Aussi écrire dans Google Sheet
      try { await writeInviteToSheet(editData) } catch(e) { console.log('Sheet write skipped:', e) }
      // Mettre à jour localement sans recharger (évite le scroll en haut)
      setInvites(prev => prev.map(inv => inv.id === editId ? { ...inv, ...editData } : inv))
      setEditId(null)
      setSyncMsg('Invité mis à jour')
    } catch(e) { setSyncMsg('Erreur : ' + e.message) }
  }

  const BASE_STATUTS = ['Validé par CM','Fiche envoyée au postulant','En cours traitement par CM','En stand-by','A temporiser','A recontacter','Collaborateur d\'un membre BNI','Devenu Membre','Membre BNI','Pas intéressé pour le moment','Pas de budget pour le moment','Injoignable','absente','Doublon — orienté groupe 2']
  const ALL_STATUTS = [...new Set([...BASE_STATUTS, ...invites.map(i => i.statut).filter(Boolean), ...extraStatuts])]
  const STATUTS = ['tous','Validé par CM','Fiche envoyée','En stand-by','A recontacter','Devenu Membre','Membre BNI','Collaborateur d\'un membre BNI','Pas intéressé pour le moment','Injoignable']
  const filtered = filter === 'tous' ? invites : invites.filter(i => i.statut === filter)

  const pipeline = [
    { statut:'Validé par CM', col:'#059669' },
    { statut:'Fiche envoyée au postulant', col:'#3B82F6' },
    { statut:'En stand-by', col:'#8B5CF6' },
    { statut:'A recontacter', col:'#D97706' },
    { statut:'Devenu Membre', col:'#059669' },
    { statut:'Pas intéressé pour le moment', col:'#9CA3AF' },
    { statut:'Injoignable', col:'#9CA3AF' },
  ].map(p => ({ ...p, n: invites.filter(i => i.statut === p.statut).length }))

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Pipeline Invités" sub={`MK-01 · ${invites.length} invités depuis déc 2025`}
        right={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {syncMsg && <span style={{ fontSize:11, color: syncMsg.startsWith('Erreur') ? '#DC2626' : '#059669' }}>{syncMsg}</span>}
            <button onClick={handleSync} disabled={syncing}
              style={{ padding:'9px 16px', background: syncing ? '#9CA3AF' : '#1C1C2E', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor: syncing ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif', display:'flex', alignItems:'center', gap:6 }}>
              {syncing ? 'Sync...' : '🔄 Sync Google Sheet'}
            </button>
          </div>
        }
      />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {pipeline.slice(0,4).map(p => (
          <div key={p.statut} onClick={() => setFilter(p.statut)} style={{ background:'#fff', borderRadius:10, padding:16, border:'1px solid #E8E6E1', borderTop:`3px solid ${p.col}`, cursor:'pointer' }} onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'#6B7280', marginBottom:6 }}>{p.statut}</div>
            <div style={{ fontSize:28, fontWeight:700, fontFamily:'Playfair Display, serif', color:p.col }}>{loading ? '...' : p.n}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {['tous','Validé par CM','A recontacter','Devenu Membre','Pas intéressé pour le moment'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding:'6px 12px', borderRadius:20, border:'1px solid #E8E6E1', fontSize:12, background:filter===s?'#C41E3A':'#fff', color:filter===s?'#fff':'#6B7280', cursor:'pointer' }}>
            {s === 'tous' ? `Tous (${invites.length})` : s}
          </button>
        ))}
      </div>
      {loading ? <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Chargement...</div> : (() => {
        // Grouper par mois
        const byMonth = {}
        filtered.forEach(inv => {
          const d = inv.date_visite ? new Date(inv.date_visite + 'T12:00:00') : null
          const key = d ? d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' }) : 'Sans date'
          const sortKey = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : '0000-00'
          if (!byMonth[key]) byMonth[key] = { sortKey, invites: [] }
          byMonth[key].invites.push(inv)
        })
        const months = Object.entries(byMonth).sort((a,b) => b[1].sortKey.localeCompare(a[1].sortKey))

        return months.map(([month, { invites: monthInvites }]) => (
        <div key={month} style={{ marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#1C1C2E', textTransform:'capitalize', fontFamily:'Playfair Display, serif' }}>{month}</div>
            <div style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#F3F4F6', color:'#6B7280' }}>{monthInvites.length} invité{monthInvites.length > 1 ? 's' : ''}</div>
          </div>
        <TableWrap>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'10%' }} />
              <col style={{ width:'12%' }} />
              <col style={{ width:'12%' }} />
              <col style={{ width:'20%' }} />
              <col style={{ width:'16%' }} />
              <col style={{ width:'15%' }} />
              <col style={{ width:'15%' }} />
            </colgroup>
            <thead><tr>{['Date','Prénom','Nom','Profession','Statut','Invité par','CA en charge'].map(h => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {monthInvites.map((inv, i) => {
                const st = inv.statut || ''
                const statStyle = st==='Devenu Membre' ? { bg:'#D1FAE5', color:'#065F46', badge:'#A7F3D0' }
                  : st==='Validé par CM' ? { bg:'#D1FAE5', color:'#065F46', badge:'#A7F3D0' }
                  : st==='Membre BNI' ? { bg:'#DBEAFE', color:'#1E40AF', badge:'#BFDBFE' }
                  : st==='Fiche envoyée au postulant' || st==='Fiche envoyée' ? { bg:'#DBEAFE', color:'#1E40AF', badge:'#BFDBFE' }
                  : st==='En cours traitement par CM' ? { bg:'#FEF9C3', color:'#854D0E', badge:'#FDE68A' }
                  : st==='A recontacter' ? { bg:'#FEF9C3', color:'#854D0E', badge:'#FDE68A' }
                  : st==='Collaborateur d\'un membre BNI' ? { bg:'#FEF9C3', color:'#854D0E', badge:'#FDE68A' }
                  : st==='En stand-by' || st==='A temporiser' ? { bg:'#FFEDD5', color:'#9A3412', badge:'#FED7AA' }
                  : st==='Pas intéressé pour le moment' || st==='Pas de budget pour le moment' ? { bg:'#FEE2E2', color:'#991B1B', badge:'#FECACA' }
                  : st==='Injoignable' || st==='absente' ? { bg:'#FEE2E2', color:'#991B1B', badge:'#FECACA' }
                  : st==='Doublon — orienté groupe 2' ? { bg:'#F3F4F6', color:'#4B5563', badge:'#E5E7EB' }
                  : { bg:'#F9FAFB', color:'#6B7280', badge:'#F3F4F6' }
                const isEdit = editId === inv.id
                const inputSt = { padding:'4px 8px', border:'1px solid #E8E6E1', borderRadius:6, fontSize:11, fontFamily:'DM Sans, sans-serif', width:'100%', boxSizing:'border-box' }
                return (
                  <React.Fragment key={i}>
                  <tr style={{ borderBottom: isEdit ? 'none' : '1px solid rgba(0,0,0,0.05)', background: isEdit ? '#FFFBEB' : statStyle.bg, cursor:'pointer', boxShadow: isEdit ? 'inset 0 0 0 2px #C9A84C' : 'none' }}
                    onClick={() => { if (isEdit) { setEditId(null) } else { setEditId(inv.id); setEditData({...inv}) } }}
                    onMouseEnter={e=>{ if(!isEdit) e.currentTarget.style.opacity='0.85'}} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color }}>{inv.date_visite ? new Date(inv.date_visite).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600, color:statStyle.color }}>{inv.prenom}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600, color:statStyle.color }}>{inv.nom}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color, opacity:0.8 }}>{inv.profession || '—'}</td>
                    <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:12, background:statStyle.badge, color:statStyle.color }}>{inv.statut || '—'}</span></td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color, opacity:0.8 }}>{inv.invite_par_nom || '—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color, opacity:0.8 }}>{inv.membre_ca_charge_nom || '—'}</td>
                  </tr>
                  {isEdit && (
                    <tr style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', background:'#FFFBEB', boxShadow:'inset 0 0 0 2px #C9A84C' }}>
                      <td colSpan={7} style={{ padding:'12px 14px' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:10 }}>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Prénom</label><input value={editData.prenom||''} onChange={e=>setEditData({...editData,prenom:e.target.value})} style={inputSt}/></div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Nom</label><input value={editData.nom||''} onChange={e=>setEditData({...editData,nom:e.target.value})} style={inputSt}/></div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Société</label><input value={editData.societe||''} onChange={e=>setEditData({...editData,societe:e.target.value})} style={inputSt}/></div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Profession</label><input value={editData.profession||''} onChange={e=>setEditData({...editData,profession:e.target.value})} style={inputSt}/></div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Téléphone</label><input value={editData.telephone||''} onChange={e=>setEditData({...editData,telephone:e.target.value})} style={inputSt}/></div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Statut</label>
                            {newStatut ? (
                              <div style={{ display:'flex', gap:4 }}>
                                <input value={customStatut} onChange={e=>setCustomStatut(e.target.value)} placeholder="Nouveau statut..." style={{...inputSt, flex:1}} autoFocus />
                                <button onClick={e=>{e.stopPropagation(); if(customStatut.trim()){setEditData({...editData,statut:customStatut.trim()});setExtraStatuts(prev=>[...prev,customStatut.trim()]);setNewStatut(false);setCustomStatut('')}}} style={{ padding:'4px 8px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:6, fontSize:10, cursor:'pointer' }}>OK</button>
                                <button onClick={e=>{e.stopPropagation();setNewStatut(false);setCustomStatut('')}} style={{ padding:'4px 8px', background:'#F3F4F6', color:'#4B5563', border:'none', borderRadius:6, fontSize:10, cursor:'pointer' }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display:'flex', gap:4 }}>
                                <select value={editData.statut||''} onChange={e=>setEditData({...editData,statut:e.target.value})} style={{...inputSt, flex:1}}><option value="">—</option>{ALL_STATUTS.map(s=><option key={s} value={s}>{s}</option>)}</select>
                                <button onClick={e=>{e.stopPropagation();setNewStatut(true)}} style={{ padding:'4px 8px', background:'#1C1C2E', color:'#fff', border:'none', borderRadius:6, fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>+ Nouveau</button>
                              </div>
                            )}
                          </div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Invité par</label><input value={editData.invite_par_nom||''} onChange={e=>setEditData({...editData,invite_par_nom:e.target.value})} style={inputSt}/></div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>CA en charge</label><input value={editData.membre_ca_charge_nom||''} onChange={e=>setEditData({...editData,membre_ca_charge_nom:e.target.value})} style={inputSt}/></div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr', gap:8, marginBottom:10 }}>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Commentaires</label><input value={editData.commentaires||''} onChange={e=>setEditData({...editData,commentaires:e.target.value})} style={inputSt}/></div>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Date visite</label><input type="date" value={editData.date_visite||''} onChange={e=>setEditData({...editData,date_visite:e.target.value})} style={inputSt}/></div>
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={e=>{e.stopPropagation();handleSaveEdit()}} style={{ padding:'6px 16px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer' }}>Sauvegarder</button>
                          <button onClick={e=>{e.stopPropagation();setEditId(null)}} style={{ padding:'6px 16px', background:'#F3F4F6', color:'#4B5563', border:'none', borderRadius:6, fontSize:11, cursor:'pointer' }}>Annuler</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
        </div>
        ))
      })()}
    </div>
  )
}

// ─── GROUPES ─────────────────────────────────────────────────────────────────
export function Groupes() {
  const [kpis, setKpis] = useState(null)
  useEffect(() => { fetchDashboardKPIs().then(setKpis) }, [])

  const tyfcb = kpis?.tyfcb || 0

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Groupes" sub="Région Kénitra · 1 groupe actif · 1 en préparation" />
      <div style={{ background:'#fff', borderRadius:14, padding:24, border:'1px solid #E8E6E1', borderLeft:'4px solid #C41E3A', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontFamily:'Playfair Display, serif', fontSize:28, fontWeight:700, color:'#C41E3A' }}>MK-01</div>
            <div style={{ fontSize:18, fontWeight:600, marginTop:2 }}>Kénitra Atlantique</div>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Lancé le 12 décembre 2025 · Région Kénitra</div>
          </div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:'#D1FAE5', color:'#065F46' }}>Actif</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginTop:20 }}>
          {[[kpis?.membresActifs ?? '…','Membres actifs'],['83%','Objectif rempli'],[kpis?.invitesTotal ?? '…','Invités reçus'],[kpis?.invitesConvertis ?? '…','Convertis'],[(tyfcb/1000).toFixed(0)+'K MAD','TYFCB généré']].map(([v,l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:'Playfair Display, serif' }}>{v}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6B7280', marginBottom:6 }}>
            <span>Progression objectif membres</span><span>{kpis?.membresActifs ?? '…'} / 30</span>
          </div>
          <div style={{ height:6, background:'#F3F2EF', borderRadius:3 }}>
            <div style={{ height:6, width:`${Math.min(100,(kpis?.membresActifs||0)/30*100)}%`, background:'#C41E3A', borderRadius:3 }} />
          </div>
        </div>
      </div>
      <div style={{ background:'#fff', borderRadius:14, padding:24, border:'1px solid #E8E6E1', borderLeft:'4px solid #9CA3AF', opacity:0.85, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontFamily:'Playfair Display, serif', fontSize:28, fontWeight:700, color:'#9CA3AF' }}>MK-02</div>
            <div style={{ fontSize:18, fontWeight:600, marginTop:2 }}>Kénitra Impulse</div>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>En cours de constitution · 2 postulants</div>
          </div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:'#F3F4F6', color:'#4B5563' }}>En préparation</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:20 }}>
          {[['2','Postulants'],['Achraf Nour','Fitness / Bien-être'],['Ilyasse Essafi','Dentiste']].map(([v,l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:15, fontWeight:700, fontFamily:'Playfair Display, serif' }}>{v}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ textAlign:'center', padding:20 }}>
        <button style={{ padding:'12px 24px', background:'transparent', border:'2px dashed #E8E6E1', borderRadius:10, fontSize:13, color:'#9CA3AF', cursor:'pointer' }}>+ Ajouter un groupe</button>
      </div>
    </div>
  )
}

// ─── REPORTING ───────────────────────────────────────────────────────────────
export function Reporting() {
  const [scores, setScores] = useState([])
  const [kpis, setKpis] = useState(null)
  const [hebdo, setHebdo] = useState([])
  const [prevSnapshot, setPrevSnapshot] = useState([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const mois = now.getMonth() + 1, annee = now.getFullYear()
  const moisLabel = now.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
  const nbJeudis = (() => { let c=0; const fin=new Date(annee,mois,0); for(let d=1;d<=fin.getDate();d++){if(new Date(annee,mois-1,d).getDay()===4)c++} return c })()
  const prevMois = mois === 1 ? 12 : mois - 1
  const prevAnnee = mois === 1 ? annee - 1 : annee

  useEffect(() => {
    Promise.all([fetchScoresMK01(), fetchDashboardKPIs(), fetchPalmsHebdoMois(mois, annee), fetchMonthlySnapshots(prevMois, prevAnnee)])
      .then(([s, k, h, ps]) => { setScores(s); setKpis(k); setHebdo(h); setPrevSnapshot(ps); setLoading(false) })
  }, [])

  // Agréger les données hebdo du mois
  const hebdoMap = {}
  hebdo.filter(r => r.membre_id).forEach(r => {
    if (!hebdoMap[r.membre_id]) hebdoMap[r.membre_id] = { tat:0, refs:0, invites:0, mpb:0, presences:0, absences:0 }
    const m = hebdoMap[r.membre_id]
    m.tat += r.tat||0; m.refs += (r.rdi||0)+(r.rde||0); m.invites += r.invites||0
    m.mpb += Number(r.mpb)||0
    if (r.palms==='P') m.presences += r.nb_reunions||1; else m.absences += r.nb_reunions||1
  })

  const totalMembres = scores.length || 25
  const membresAvecTat = Object.values(hebdoMap).filter(m => m.tat > 0).length
  const membresAvecReco = Object.values(hebdoMap).filter(m => m.refs > 0).length
  const totalTatMois = Object.values(hebdoMap).reduce((s,m) => s+m.tat, 0)
  const totalRecoMois = Object.values(hebdoMap).reduce((s,m) => s+m.refs, 0)
  const totalMpbMois = Object.values(hebdoMap).reduce((s,m) => s+m.mpb, 0)

  // Membres à risque : score < 30 OU 0 TàT ce mois OU absences > 1
  const membresRisque = scores.filter(s => {
    const h = hebdoMap[s.membre_id]
    return Number(s.total_score||0) < 30 || (!h || h.tat === 0) || (h && h.absences > 1)
  })

  // Top contributeurs et inactifs
  const sorted = Object.entries(hebdoMap).map(([id, d]) => ({ id, ...d, score: scores.find(s=>s.membre_id===id) })).sort((a,b) => (b.tat+b.refs)-(a.tat+a.refs))
  const top5 = sorted.slice(0, 5)
  const bottom5 = sorted.filter(s => s.tat === 0 && s.refs === 0).slice(0, 5)

  // Évolution vs mois précédent
  const prevMap = {}
  prevSnapshot.forEach(s => { prevMap[s.membre_id] = s })
  const prevTotalTat = prevSnapshot.reduce((s,m) => s+(m.total_tat||0), 0)
  const prevTotalReco = prevSnapshot.reduce((s,m) => s+(m.total_refs||0), 0)
  const hasPrev = prevSnapshot.length > 0

  const nameColor = sc => Number(sc||0) >= 70 ? '#065F46' : Number(sc||0) >= 50 ? '#854D0E' : Number(sc||0) >= 30 ? '#991B1B' : '#6B7280'
  const ProgressBar = ({ value, max, color }) => (
    <div style={{ height:8, background:'#F3F2EF', borderRadius:4, overflow:'hidden', flex:1 }}>
      <div style={{ height:'100%', width:`${Math.min(100,value/max*100)}%`, background:color, borderRadius:4, transition:'width 0.4s' }} />
    </div>
  )

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Reporting" sub={`MK-01 Kénitra Atlantique · ${moisLabel}`} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        <StatCard label="TYFCB total" value={kpis ? `${Math.round(kpis.tyfcb).toLocaleString('de-DE')} MAD` : '…'} sub="6 mois glissants · entre membres"
          topBg={kpis?.tyfcb >= 300000 ? '#A7F3D0' : kpis?.tyfcb >= 50000 ? '#FDE68A' : '#FECACA'}
          valueColor={kpis?.tyfcb >= 300000 ? '#065F46' : kpis?.tyfcb >= 50000 ? '#854D0E' : '#991B1B'}
          style={{ background: kpis?.tyfcb >= 300000 ? '#D1FAE5' : kpis?.tyfcb >= 50000 ? '#FEF9C3' : '#FEE2E2' }} />
        <StatCard label="Recommandations données" value={loading ? '…' : scores.reduce((s,r)=>s+(Number(r.referrals_given_score)||0),0)} sub="6 mois glissants · score total"
          topBg="#FDE68A" valueColor="#854D0E" style={{ background:'#FEF9C3' }} />
        <StatCard label="Taux de présence" value={kpis ? `${kpis.pRate}%` : '…'} sub="6 mois glissants · moyenne groupe"
          topBg={kpis?.pRate >= 95 ? '#A7F3D0' : kpis?.pRate >= 88 ? '#FDE68A' : '#FECACA'}
          valueColor={kpis?.pRate >= 95 ? '#065F46' : kpis?.pRate >= 88 ? '#854D0E' : '#991B1B'}
          style={{ background: kpis?.pRate >= 95 ? '#D1FAE5' : kpis?.pRate >= 88 ? '#FEF9C3' : '#FEE2E2' }} />
        <StatCard label="Conversion invités" value={kpis && kpis.invitesTotal > 0 ? `${Math.round(kpis.invitesConvertis/kpis.invitesTotal*100)}%` : '…'} sub={`${kpis?.invitesConvertis || 0} sur ${kpis?.invitesTotal || 0} invités`}
          topBg={kpis?.invitesConvertis > 3 ? '#A7F3D0' : kpis?.invitesConvertis > 0 ? '#FDE68A' : '#FECACA'}
          valueColor={kpis?.invitesConvertis > 3 ? '#065F46' : kpis?.invitesConvertis > 0 ? '#854D0E' : '#991B1B'}
          style={{ background: kpis?.invitesConvertis > 3 ? '#D1FAE5' : kpis?.invitesConvertis > 0 ? '#FEF9C3' : '#FEE2E2' }} />
      </div>
      {!loading && <div style={{ marginBottom:16 }}><GroupeScoresChart scores={scores} /></div>}

      {/* ─── SECTIONS VP (après le graphe, avant les tableaux) ─── */}
      {!loading && <>
          {/* Objectifs collectifs du mois */}
          <div style={{ marginBottom:16 }}>
            <SectionTitle>🎯 Objectifs collectifs — {moisLabel}</SectionTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
              {[
                { label:'Total TàT groupe', value:totalTatMois, obj:nbJeudis*totalMembres, color:'#C41E3A' },
                { label:'Total Reco. groupe', value:totalRecoMois, obj:Math.ceil(nbJeudis*1.25*totalMembres), color:'#8B5CF6' },
                { label:'TYFCB du mois', value:totalMpbMois, obj:50000, color:'#3B82F6', isMoney:true },
              ].map(o => (
                <div key={o.label} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1' }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{o.label}</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:24, fontWeight:700, color:o.color, fontFamily:'Playfair Display, serif' }}>{o.isMoney ? Number(o.value).toLocaleString('de-DE') : o.value}</span>
                    <span style={{ fontSize:12, color:'#9CA3AF' }}>/ {o.isMoney ? Number(o.obj).toLocaleString('de-DE') : o.obj}</span>
                  </div>
                  <ProgressBar value={o.value} max={o.obj} color={o.value >= o.obj ? '#059669' : o.value >= o.obj*0.5 ? '#D97706' : '#DC2626'} />
                </div>
              ))}
            </div>
          </div>

          {/* Taux de participation */}
          <div style={{ marginBottom:16 }}>
            <SectionTitle>📊 Taux de participation — {moisLabel}</SectionTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
              {[
                { label:`≥ 1 TàT ce mois`, value:membresAvecTat, total:totalMembres, color:'#C41E3A' },
                { label:`≥ 1 Reco. ce mois`, value:membresAvecReco, total:totalMembres, color:'#8B5CF6' },
                { label:`100% présence ce mois`, value:Object.values(hebdoMap).filter(m=>m.absences===0&&m.presences>0).length, total:totalMembres, color:'#059669' },
              ].map(p => {
                const pct = p.total > 0 ? Math.round(p.value/p.total*100) : 0
                const bg = pct >= 80 ? '#D1FAE5' : pct >= 50 ? '#FEF9C3' : '#FEE2E2'
                return (
                  <div key={p.label} style={{ background:bg, borderRadius:12, padding:'16px 18px', border:'1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{p.label}</div>
                    <div style={{ fontSize:28, fontWeight:700, color:p.color, fontFamily:'Playfair Display, serif' }}>{pct}%</div>
                    <div style={{ fontSize:12, color:'#6B7280' }}>{p.value}/{p.total} membres</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top contributeurs vs Inactifs */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <TableWrap>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>🌟 Top contributeurs du mois</SectionTitle></div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['Membre','TàT','Reco.','TYFCB'].map(h=><th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
                <tbody>{top5.map((m,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #F3F2EF', background:'#D1FAE5' }}>
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:'#065F46' }}>{m.score?.membres?.prenom} {m.score?.membres?.nom}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, textAlign:'center', color:'#065F46' }}>{m.tat}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, textAlign:'center', color:'#065F46' }}>{m.refs}</td>
                    <td style={{ padding:'8px 12px', fontWeight:600, textAlign:'center', color:'#065F46' }}>{Number(m.mpb).toLocaleString('de-DE')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableWrap>
            <TableWrap>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>⚠️ Membres inactifs ce mois</SectionTitle></div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['Membre','TàT','Reco.','Score'].map(h=><th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
                <tbody>{(bottom5.length > 0 ? bottom5 : [{id:null,tat:0,refs:0,score:null}]).map((m,i) => m.score ? (
                  <tr key={i} style={{ borderBottom:'1px solid #F3F2EF', background:'#FEE2E2' }}>
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:'#991B1B' }}>{m.score?.membres?.prenom} {m.score?.membres?.nom}</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, textAlign:'center', color:'#991B1B' }}>0</td>
                    <td style={{ padding:'8px 12px', fontWeight:700, textAlign:'center', color:'#991B1B' }}>0</td>
                    <td style={{ padding:'8px 12px', fontWeight:600, textAlign:'center', color:'#991B1B' }}>{Number(m.score?.total_score||0)}</td>
                  </tr>
                ) : (
                  <tr key={i}><td colSpan={4} style={{ padding:'16px', textAlign:'center', color:'#059669', fontSize:13 }}>Tous les membres sont actifs ce mois</td></tr>
                ))}</tbody>
              </table>
            </TableWrap>
          </div>

          {/* Membres à risque */}
          <div style={{ marginBottom:16 }}>
            <SectionTitle>🚨 Membres à risque ({membresRisque.length})</SectionTitle>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {membresRisque.slice(0,15).map((s,i) => {
                const sc = Number(s.total_score||0)
                const h = hebdoMap[s.membre_id]
                return (
                  <div key={i} style={{ background:'#FEE2E2', borderRadius:8, padding:'8px 12px', border:'1px solid #FECACA' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'#991B1B' }}>{s.membres?.prenom} {s.membres?.nom}</div>
                    <div style={{ fontSize:10, color:'#DC2626', marginTop:2 }}>Score: {sc} · TàT: {h?.tat||0} · Abs: {h?.absences||0}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Évolution vs mois précédent */}
          {hasPrev && (
            <div style={{ marginBottom:16 }}>
              <SectionTitle>📈 Évolution vs mois précédent</SectionTitle>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {[
                  { label:'TàT', current:totalTatMois, prev:prevTotalTat },
                  { label:'Recommandations', current:totalRecoMois, prev:prevTotalReco },
                ].map(e => {
                  const diff = e.current - e.prev
                  const pct = e.prev > 0 ? Math.round((diff/e.prev)*100) : 0
                  return (
                    <div key={e.label} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>{e.label}</div>
                        <div style={{ fontSize:22, fontWeight:700, fontFamily:'Playfair Display, serif' }}>{e.current}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:18, fontWeight:700, color: diff >= 0 ? '#059669' : '#DC2626' }}>{diff >= 0 ? '↑' : '↓'} {Math.abs(diff)}</div>
                        <div style={{ fontSize:11, color: diff >= 0 ? '#059669' : '#DC2626' }}>{pct >= 0 ? '+' : ''}{pct}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
      </>}

      {loading ? <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Chargement...</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <TableWrap>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>💰 Top TYFCB générés</SectionTitle></div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Membre','TYFCB (MAD)','TL'].map(h=><th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
              <tbody>
                {scores.filter(s=>Number(s.tyfcb)>0).sort((a,b)=>Number(b.tyfcb)-Number(a.tyfcb)).slice(0,8).map((s,i)=>{
                  const tyb = Number(s.tyfcb) >= 300000 ? {bg:'#D1FAE5',c:'#065F46'} : Number(s.tyfcb) >= 50000 ? {bg:'#FEF9C3',c:'#854D0E'} : Number(s.tyfcb) >= 20000 ? {bg:'#FFEDD5',c:'#9A3412'} : {bg:'#FEE2E2',c:'#991B1B'}
                  const rBg = {vert:'#D1FAE5',orange:'#FEF9C3',rouge:'#FEE2E2',gris:'#F9FAFB'}[s.traffic_light]||'#fff'
                  const tb = s.traffic_light==='vert'?{bg:'#D1FAE5',c:'#065F46'}:s.traffic_light==='orange'?{bg:'#FEF9C3',c:'#854D0E'}:s.traffic_light==='rouge'?{bg:'#FEE2E2',c:'#991B1B'}:{bg:'#F3F4F6',c:'#4B5563'}
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', background:rBg }} onMouseEnter={e=>e.currentTarget.style.opacity='0.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                      <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color: Number(s.total_score||0) >= 70 ? '#065F46' : Number(s.total_score||0) >= 50 ? '#854D0E' : Number(s.total_score||0) >= 30 ? '#991B1B' : '#6B7280' }}>{s.membres?.prenom} {s.membres?.nom}</td>
                      <td style={{ padding:'8px 12px', fontWeight:700, fontSize:13, background:tyb.bg, color:tyb.c, textAlign:'center' }}>{Number(s.tyfcb).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><span style={{ fontSize:11, fontWeight:500, color:tb.c }}>{s.traffic_light||'—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
          <TableWrap>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>🏆 Classement complet</SectionTitle></div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['#','Membre','Score','TL'].map(h=><th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
              <tbody>
                {scores.filter(s=>s.rank).sort((a,b)=>a.rank-b.rank).map((s,i)=>{
                  const sc = Number(s.total_score||0)
                  const scBg = sc >= 70 ? {bg:'#D1FAE5',c:'#065F46'} : sc >= 50 ? {bg:'#FEF9C3',c:'#854D0E'} : sc >= 30 ? {bg:'#FEE2E2',c:'#991B1B'} : {bg:'#F3F4F6',c:'#4B5563'}
                  const rBg2 = {vert:'#D1FAE5',orange:'#FEF9C3',rouge:'#FEE2E2',gris:'#F9FAFB'}[s.traffic_light]||'#fff'
                  const tb = s.traffic_light==='vert'?{bg:'#D1FAE5',c:'#065F46'}:s.traffic_light==='orange'?{bg:'#FEF9C3',c:'#854D0E'}:s.traffic_light==='rouge'?{bg:'#FEE2E2',c:'#991B1B'}:{bg:'#F3F4F6',c:'#4B5563'}
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', background:rBg2 }} onMouseEnter={e=>e.currentTarget.style.opacity='0.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                      <td style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:12, width:30 }}>{s.rank}</td>
                      <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color: Number(s.total_score||0) >= 70 ? '#065F46' : Number(s.total_score||0) >= 50 ? '#854D0E' : Number(s.total_score||0) >= 30 ? '#991B1B' : '#6B7280' }}>{s.membres?.prenom} {s.membres?.nom}</td>
                      <td style={{ padding:'8px 12px', fontWeight:700, fontSize:14, background:scBg.bg, color:scBg.c, textAlign:'center', width:60 }}>{sc}</td>
                      <td style={{ padding:'8px 12px', background:tb.bg, textAlign:'center', width:70 }}><span style={{ fontSize:11, fontWeight:500, color:tb.c }}>{s.traffic_light||'—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}

    </div>
  )
}

// ─── AGENT IA ────────────────────────────────────────────────────────────────
export function AgentIA() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef(null)

  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight }, [messages, loading])

  const send = async (text) => {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')
    const newMessages = [...messages, { role:'user', content }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { system: BNI_SYSTEM_PROMPT, max_tokens: 1000, messages: newMessages.map(m => ({ role: m.role, content: m.content })) }
      })
      if (error) throw error
      setMessages([...newMessages, { role:'assistant', content:data.content?.[0]?.text || 'Désolé, erreur.' }])
    } catch { setMessages([...newMessages, { role:'assistant', content:'Erreur de connexion.' }]) }
    setLoading(false)
  }

  const QUICK = ['Qui sont mes membres à risque ?','Génère un email pour Zaynab','Actions prioritaires cette semaine ?','Analyse le pipeline invités']

  return (
    <div style={{ padding:'28px 32px 0', height:'100%', display:'flex', flexDirection:'column', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title={<>Agent IA <span style={{ fontSize:16, fontFamily:'DM Sans, sans-serif', fontWeight:400, color:'#C9A84C' }}>· Conseiller BNI</span></>} sub="Analyse · Rédaction · Plans d'action" />
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid #E8E6E1', overflow:'hidden', minHeight:0 }}>
        <div ref={msgsRef} style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, lineHeight:1.6 }}>
            <strong>👋 Agent BNI Kénitra actif</strong><br /><br />
            Je connais vos membres, scores, alertes et pipeline en temps réel. Comment puis-je vous aider ?
          </div>
          {messages.map((m, i) => (
            <div key={i} style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap', alignSelf:m.role==='user'?'flex-end':'flex-start', borderBottomRightRadius:m.role==='user'?4:12, borderBottomLeftRadius:m.role==='user'?12:4, background:m.role==='user'?'#C41E3A':'#F3F2EF', color:m.role==='user'?'#fff':'#1C1C2E' }}>
              {m.content}
            </div>
          ))}
          {loading && <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, color:'#9CA3AF' }}>L'agent réfléchit...</div>}
        </div>
        <div style={{ padding:'0 16px 10px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {QUICK.map(q => <button key={q} onClick={() => send(q)} style={{ padding:'6px 12px', border:'1px solid #E8E6E1', borderRadius:20, fontSize:12, background:'#fff', color:'#6B7280', cursor:'pointer' }}>{q}</button>)}
        </div>
        <div style={{ padding:16, borderTop:'1px solid #E8E6E1', display:'flex', gap:10 }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Posez votre question..." rows={2} style={{ flex:1, padding:'11px 16px', border:'1px solid #E8E6E1', borderRadius:10, fontSize:13, fontFamily:'DM Sans, sans-serif', resize:'none', outline:'none' }} />
          <button onClick={() => send()} disabled={loading||!input.trim()} style={{ padding:'11px 20px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:loading||!input.trim()?'not-allowed':'pointer', opacity:loading||!input.trim()?0.5:1 }}>Envoyer</button>
        </div>
      </div>
    </div>
  )
}
