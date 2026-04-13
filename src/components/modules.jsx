import React, { useState, useRef, useEffect } from 'react'
import { fetchInvites, fetchDashboardKPIs, fetchScoresMK01, fetchPalmsHebdoMois, fetchMonthlySnapshots, syncSheetToSupabase, writeInviteToSheet } from '../lib/bniService'
import { GroupeScoresChart } from './ScoresChart'
import { BNI_SYSTEM_PROMPT } from '../data/bniData'
import { supabase } from '../lib/supabase'
import { PageHeader, SectionTitle, TableWrap, StatCard, Card, fullName, cap } from './ui'

// ─── INVITÉS ────────────────────────────────────────────────────────────────
export function Invites({ profil }) {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tous')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [showVisitorImport, setShowVisitorImport] = useState(false)
  const [showVisitorArchives, setShowVisitorArchives] = useState(false)
  const [visitorArchives, setVisitorArchives] = useState([])
  const [archiveDetail, setArchiveDetail] = useState(null)
  const [archiveData, setArchiveData] = useState([])
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [newStatut, setNewStatut] = useState(false)
  const [customStatut, setCustomStatut] = useState('')
  const [extraStatuts, setExtraStatuts] = useState([])
  const [statutColors, setStatutColors] = useState({})
  const [columnAccess, setColumnAccess] = useState({})
  const [showAccessConfig, setShowAccessConfig] = useState(false)
  const [collapsedMonths, setCollapsedMonths] = useState({})
  const [showCommentaires, setShowCommentaires] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const isMobile = window.innerWidth <= 768

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchInvites(),
      supabase.from('statut_colors').select('statut, couleur'),
      supabase.from('invite_column_access').select('role, column_key, visible'),
    ]).then(([invData, colorsRes, accessRes]) => {
      setInvites(invData || [])
      const cMap = {}
      ;(colorsRes?.data || []).forEach(c => { cMap[c.statut] = c.couleur })
      setStatutColors(cMap)
      // Accès colonnes par rôle
      const aMap = {}
      ;(accessRes?.data || []).forEach(a => { if (!aMap[a.role]) aMap[a.role] = {}; aMap[a.role][a.column_key] = a.visible })
      setColumnAccess(aMap)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const COULEURS = {
    vert: { bg:'#D1FAE5', color:'#065F46', badge:'#A7F3D0', label:'Vert' },
    bleu: { bg:'#DBEAFE', color:'#1E40AF', badge:'#BFDBFE', label:'Bleu' },
    jaune: { bg:'#FEF9C3', color:'#854D0E', badge:'#FDE68A', label:'Jaune' },
    orange: { bg:'#FFEDD5', color:'#9A3412', badge:'#FED7AA', label:'Orange' },
    rouge: { bg:'#FEE2E2', color:'#991B1B', badge:'#FECACA', label:'Rouge' },
    gris: { bg:'#F3F4F6', color:'#4B5563', badge:'#E5E7EB', label:'Gris' },
  }

  const getStatutStyle = (statut) => {
    const couleur = statutColors[statut] || 'gris'
    return COULEURS[couleur] || COULEURS.gris
  }

  const saveStatutColor = async (statut, couleur) => {
    await supabase.from('statut_colors').upsert({ statut, couleur }, { onConflict: 'statut' })
    setStatutColors(prev => ({ ...prev, [statut]: couleur }))
  }

  const processVisitorFile = async (file) => {
    setSyncMsg('Import en cours...')
    try {
      const text = await file.text()
      // Parser le XLS SpreadsheetML
      const rowChunks = text.split(/<Row[^>]*>/i).slice(1)
      let headers = [], headerFound = false, imported = 0, skipped = 0

      // Trouver les headers (ligne contenant "Prénom" ou "First")
      const rows = []
      rowChunks.forEach(chunk => {
        const cellMatches = [...chunk.matchAll(/<Cell([^>]*)>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>/g)]
        if (!cellMatches.length) return
        const vals = []
        cellMatches.forEach(m => {
          const idxMatch = m[1].match(/ss:Index="(\d+)"/)
          if (idxMatch) { while (vals.length < parseInt(idxMatch[1]) - 1) vals.push('') }
          vals.push(m[2].trim())
        })
        if (!headerFound) {
          if (vals.some(v => v.includes('Prénom') && v.includes('Recherché')) || (vals.includes('Prénom Recherché') && vals.includes('Nom Recherché'))) {
            // C'est la ligne avant les vrais headers, skip
          } else if (vals.length >= 10 && (vals.includes('Prénom Recherché') || vals.some(v => v === 'Société'))) {
            headers = vals
            headerFound = true
          }
          return
        }
        if (vals.length >= 3 && vals[0]) rows.push(vals)
      })

      if (!headerFound || rows.length === 0) {
        setSyncMsg('Erreur : headers non trouvés dans le fichier')
        return
      }

      // Mapper les colonnes
      const colIdx = (name) => headers.findIndex(h => h && h.toLowerCase().includes(name.toLowerCase()))
      const iPrenom = colIdx('prénom')
      const iNom = colIdx('nom')
      const iSociete = colIdx('société') >= 0 ? colIdx('société') : colIdx('societe')
      const iProfession = colIdx('profession')
      const iEmail = colIdx('email')
      const iTel = colIdx('téléphone') >= 0 ? colIdx('téléphone') : colIdx('telephone')
      const iAdresse = colIdx('adresse ligne 1') >= 0 ? colIdx('adresse ligne 1') : colIdx('adresse')
      const iVille = colIdx('ville')
      const iDate = colIdx('date de visite') >= 0 ? colIdx('date de visite') : colIdx('date')
      const iInvitedBy = colIdx('invited by') >= 0 ? colIdx('invited by') : colIdx('invité par')
      const iType = colIdx('type')

      const groupeId = (await supabase.from('groupes').select('id').eq('code','MK-01').single()).data?.id

      for (const r of rows) {
        const prenom = (r[iPrenom] || '').trim()
        const nom = (r[iNom] || '').trim()
        if (!prenom && !nom) continue

        let dateVisite = null
        const dateStr = r[iDate] || ''
        if (dateStr.includes('T')) dateVisite = dateStr.split('T')[0]
        else if (dateStr.includes('/')) { const parts = dateStr.split('/'); dateVisite = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` }

        const inviteData = {
          groupe_id: groupeId,
          prenom, nom,
          societe: r[iSociete] || null,
          profession: r[iProfession] || null,
          email: iEmail >= 0 ? (r[iEmail] || null) : null,
          telephone: iTel >= 0 ? (r[iTel] || null) : null,
          adresse: iAdresse >= 0 ? (r[iAdresse] || null) : null,
          ville: iVille >= 0 ? (r[iVille] || null) : null,
          invite_par_nom: iInvitedBy >= 0 ? (r[iInvitedBy] || null) : null,
          type_visite: iType >= 0 ? (r[iType] || null) : null,
          date_visite: dateVisite,
        }

        // Upsert par prenom + nom + date
        const pNorm = prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const nNorm = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const { data: existing } = await supabase.from('invites').select('id')
          .eq('groupe_id', groupeId).ilike('prenom', prenom).ilike('nom', nom).limit(1)

        if (existing?.length) {
          await supabase.from('invites').update(inviteData).eq('id', existing[0].id)
        } else {
          await supabase.from('invites').insert(inviteData)
        }
        imported++
      }

      // Extraire les dates depuis le fichier
      const depuisMatch = text.match(/Depuis[\s:]*<\/Data>[\s\S]*?<Data[^>]*>(\d{4}-\d{2}-\d{2})/i)
      const jusquaMatch = text.match(/Jusqu[\s\S]*?au[\s:]*<\/Data>[\s\S]*?<Data[^>]*>(\d{4}-\d{2}-\d{2})/i)
      // Archiver l'import
      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from('visitor_imports').insert({
        groupe_id: groupeId,
        date_debut: depuisMatch?.[1] || null,
        date_fin: jusquaMatch?.[1] || null,
        nb_invites: imported,
        imported_by: session?.user?.id,
      })
      setSyncMsg(`Import réussi — ${imported} invités importés`)
      setShowVisitorImport(false)
      load()
    } catch (e) { setSyncMsg('Erreur : ' + e.message) }
  }

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

  const SENSITIVE_COLUMNS = [
    { key:'email', label:'Email' },
    { key:'telephone', label:'Téléphone' },
    { key:'adresse', label:'Adresse' },
    { key:'commentaires', label:'Commentaires' },
  ]
  const ALL_ROLES = ['super_admin','directeur_executif','directrice_consultante','president','vice_president','secretaire_tresorier','lecture']
  const ROLE_LABELS = { super_admin:'SA', directeur_executif:'DE', directrice_consultante:'DC', president:'P', vice_president:'VP', secretaire_tresorier:'ST', lecture:'L' }
  const isColumnVisible = (col) => {
    const role = profil?.role || 'lecture'
    return columnAccess[role]?.[col] !== false
  }
  const canConfigAccess = ['super_admin','directrice_consultante'].includes(profil?.role)
  const toggleColumnAccess = async (role, col) => {
    const current = columnAccess[role]?.[col] !== false
    const newVal = !current
    await supabase.from('invite_column_access').upsert({ role, column_key: col, visible: newVal }, { onConflict: 'role,column_key' })
    setColumnAccess(prev => ({ ...prev, [role]: { ...(prev[role]||{}), [col]: newVal } }))
  }

  const BASE_STATUTS =['Validé par CM','Fiche envoyée au postulant','En cours traitement par CM','En stand-by','A temporiser','A recontacter','Collaborateur d\'un membre BNI','Devenu Membre','Membre BNI','Pas intéressé pour le moment','Pas de budget pour le moment','Injoignable','absente','Doublon — orienté groupe 2']
  const ALL_STATUTS = [...new Set([...BASE_STATUTS, ...invites.map(i => i.statut).filter(Boolean), ...extraStatuts])]
  const STATUTS = ['tous','Validé par CM','Fiche envoyée','En stand-by','A recontacter','Devenu Membre','Membre BNI','Collaborateur d\'un membre BNI','Pas intéressé pour le moment','Injoignable']
  const total = invites.length || 1
  const couleurKeys = Object.keys(COULEURS)
  const filtered = filter === 'tous' ? invites
    : couleurKeys.includes(filter) ? invites.filter(i => (statutColors[i.statut] || 'gris') === filter)
    : invites.filter(i => i.statut === filter)

  // Pipeline dynamique basé sur les statuts réels + couleurs
  const statutCounts = {}
  invites.forEach(i => { if (i.statut) statutCounts[i.statut] = (statutCounts[i.statut]||0) + 1 })
  const pipeline = Object.entries(statutCounts)
    .map(([statut, n]) => ({ statut, n, ...getStatutStyle(statut) }))
    .sort((a, b) => b.n - a.n)

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Pipeline Invités" sub={`MK-01 · ${invites.length} invités depuis déc 2025`}
        right={
          <div style={{ display:'flex', gap: isMobile ? 6 : 8, alignItems:'center', flexWrap:'wrap' }}>
            {syncMsg && <span style={{ fontSize:11, color: syncMsg.startsWith('Erreur') ? '#DC2626' : '#059669' }}>{syncMsg}</span>}
            {['super_admin','directrice_consultante','secretaire_tresorier'].includes(profil?.role) &&
              <button onClick={() => { setShowVisitorArchives(!showVisitorArchives); if (!showVisitorArchives) { setShowVisitorImport(false); setShowAccessConfig(false); supabase.from('visitor_imports').select('*').order('imported_at',{ascending:false}).then(({data}) => setVisitorArchives(data||[])) } }}
                style={{ background: showVisitorArchives ? '#1C1C2E' : '#fff', color: showVisitorArchives ? '#fff' : '#1C1C2E', border:'1px solid #E8E6E1', borderRadius:8, padding: isMobile ? '6px 10px' : '8px 14px', cursor:'pointer', fontSize: isMobile ? 11 : 12, fontWeight:600, fontFamily:'DM Sans, sans-serif' }}>
                📂 Archives
              </button>}
            {['super_admin','directrice_consultante','secretaire_tresorier'].includes(profil?.role) &&
              <button onClick={() => { setShowVisitorImport(!showVisitorImport); if(!showVisitorImport) { setShowVisitorArchives(false); setShowAccessConfig(false) } }}
                style={{ background: showVisitorImport ? '#1C1C2E' : '#fff', color: showVisitorImport ? '#fff' : '#1C1C2E', border:'1px solid #E8E6E1', borderRadius:8, padding: isMobile ? '6px 10px' : '8px 14px', cursor:'pointer', fontSize: isMobile ? 11 : 12, fontWeight:600, fontFamily:'DM Sans, sans-serif' }}>
                📥 Import
              </button>}
            {canConfigAccess &&
              <button onClick={() => setShowAccessConfig(!showAccessConfig)}
                style={{ background: showAccessConfig ? '#1C1C2E' : '#fff', color: showAccessConfig ? '#fff' : '#1C1C2E', border:'1px solid #E8E6E1', borderRadius:8, padding: isMobile ? '6px 10px' : '8px 14px', cursor:'pointer', fontSize: isMobile ? 11 : 12, fontWeight:600, fontFamily:'DM Sans, sans-serif' }}>
                🔒 Accès
              </button>}
            {profil?.role === 'super_admin' &&
              <button onClick={syncing ? undefined : handleSync}
                style={{ background: syncing ? '#E8E6E1' : '#fff', border:'1px solid #E8E6E1', borderRadius:8, padding: isMobile ? '6px 10px' : '8px 14px', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: isMobile ? 11 : 12, fontWeight:600, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif', opacity: syncing ? 0.6 : 1 }}>
                🔄 {syncing ? '...' : 'Sync'}
              </button>}
          </div>
        }
      />
      {/* Import XLS visiteurs */}
      {showVisitorImport && (
        <Card style={{ marginBottom:20 }}>
          <SectionTitle>📥 Importer un rapport visiteurs (XLS)</SectionTitle>
          <div style={{ border:'2px dashed #E8E6E1', borderRadius:10, padding:'24px 20px', textAlign:'center', cursor:'pointer', background:'#FAFAF8' }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#C41E3A'; e.currentTarget.style.background='#FEF2F2' }}
            onDragLeave={e => { e.currentTarget.style.borderColor='#E8E6E1'; e.currentTarget.style.background='#FAFAF8' }}
            onDrop={e => {
              e.preventDefault(); e.currentTarget.style.borderColor='#E8E6E1'; e.currentTarget.style.background='#FAFAF8'
              const file = e.dataTransfer.files[0]; if (file) processVisitorFile(file)
            }}
            onClick={() => { const input = document.createElement('input'); input.type='file'; input.accept='.xls,.xlsx'; input.onchange=e => { if(e.target.files[0]) processVisitorFile(e.target.files[0]) }; input.click() }}>
            <div style={{ fontSize:28, marginBottom:8 }}>📂</div>
            <div style={{ fontSize:13, fontWeight:600, color:'#1C1C2E' }}>Glisser le fichier visiteurs ici</div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4 }}>ou cliquer pour sélectionner · Export BNI Connect</div>
          </div>
          {syncMsg && <div style={{ marginTop:10, fontSize:12, color: syncMsg.startsWith('Erreur') ? '#DC2626' : '#059669', fontWeight:500 }}>{syncMsg}</div>}
        </Card>
      )}

      {/* Archives des imports visiteurs */}
      {showVisitorArchives && (
        <Card style={{ marginBottom:20 }}>
          <SectionTitle>📂 Archives des imports visiteurs</SectionTitle>
          {visitorArchives.length === 0 ? (
            <div style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Aucun import archivé</div>
          ) : (
            <div>
              {visitorArchives.map((a, i) => {
                const isActive = archiveDetail === a.id
                const debut = a.date_debut ? new Date(a.date_debut+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) : '?'
                const fin = a.date_fin ? new Date(a.date_fin+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) : '?'
                const importDate = new Date(a.imported_at).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
                return (
                  <div key={a.id} style={{ marginBottom:8 }}>
                    <div onClick={async () => {
                      if (isActive) { setArchiveDetail(null); setArchiveData([]); return }
                      setArchiveDetail(a.id)
                      // Charger les invités de cette période
                      const { data } = await supabase.from('invites').select('*')
                        .eq('groupe_id', a.groupe_id)
                        .gte('date_visite', a.date_debut)
                        .lte('date_visite', a.date_fin)
                        .order('date_visite')
                      setArchiveData(data || [])
                    }}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:8, background: isActive ? '#EDE9FE' : '#F7F6F3', border:`1px solid ${isActive ? '#8B5CF6' : '#E8E6E1'}`, cursor:'pointer' }}
                      onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:'#C41E3A', flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color: isActive ? '#5B21B6' : '#1C1C2E' }}>{debut} → {fin}</div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>Importé le {importDate} · {a.nb_invites} invité{a.nb_invites>1?'s':''}</div>
                      </div>
                      <span style={{ fontSize:10, color:'#9CA3AF' }}>{isActive ? '▲' : '▼'}</span>
                    </div>
                    {isActive && archiveData.length > 0 && (
                      <div style={{ marginTop:6, background:'#fff', borderRadius:'0 0 8px 8px', border:'1px solid #E8E6E1', borderTop:'none', overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse' }}>
                          <thead><tr>{['Date','Prénom','Nom','Société','Profession',
                            ...(isColumnVisible('telephone') ? ['Tél.'] : []),
                            ...(isColumnVisible('email') ? ['Email'] : []),
                            'Invité par','Type'].map(h => (
                            <th key={h} style={{ background:'#F9F8F6', padding:'6px 10px', textAlign:'left', fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
                          ))}</tr></thead>
                          <tbody>
                            {archiveData.map((inv, j) => {
                              const st = getStatutStyle(inv.statut)
                              return (
                                <tr key={j} style={{ borderBottom:'1px solid #F3F2EF', background:st.bg }}>
                                  <td style={{ padding:'6px 10px', fontSize:11, color:st.color }}>{inv.date_visite ? new Date(inv.date_visite).toLocaleDateString('fr-FR') : '—'}</td>
                                  <td style={{ padding:'6px 10px', fontSize:11, fontWeight:600, color:st.color }}>{cap(inv.prenom)}</td>
                                  <td style={{ padding:'6px 10px', fontSize:11, fontWeight:600, color:st.color }}>{cap(inv.nom)}</td>
                                  <td style={{ padding:'6px 10px', fontSize:10, color:st.color }}>{inv.societe || '—'}</td>
                                  <td style={{ padding:'6px 10px', fontSize:10, color:st.color }}>{inv.profession || '—'}</td>
                                  {isColumnVisible('telephone') && <td style={{ padding:'6px 10px', fontSize:10, color:st.color }}>{inv.telephone || '—'}</td>}
                                  {isColumnVisible('email') && <td style={{ padding:'6px 10px', fontSize:10, color:st.color }}>{inv.email || '—'}</td>}
                                  <td style={{ padding:'6px 10px', fontSize:10, color:st.color }}>{inv.invite_par_nom || '—'}</td>
                                  <td style={{ padding:'6px 10px', fontSize:10, color:st.color }}>{inv.type_visite || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Panneau config accès données */}
      {showAccessConfig && (
        <Card style={{ marginBottom:20 }}>
          <SectionTitle>🔒 Accès aux données sensibles par rôle</SectionTitle>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>
                <th style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', borderBottom:'1px solid #E8E6E1' }}>Donnée</th>
                {ALL_ROLES.map(r => (
                  <th key={r} style={{ padding:'8px 8px', textAlign:'center', fontSize:10, fontWeight:700, color:'#6B7280', borderBottom:'1px solid #E8E6E1' }}>{ROLE_LABELS[r]}</th>
                ))}
              </tr></thead>
              <tbody>
                {SENSITIVE_COLUMNS.map(col => (
                  <tr key={col.key} style={{ borderBottom:'1px solid #F3F2EF' }}>
                    <td style={{ padding:'10px 12px', fontSize:12, fontWeight:500 }}>{col.label}</td>
                    {ALL_ROLES.map(r => {
                      const visible = columnAccess[r]?.[col.key] !== false
                      return (
                        <td key={r} style={{ padding:'8px 8px', textAlign:'center' }}>
                          <div onClick={() => toggleColumnAccess(r, col.key)}
                            style={{ width:28, height:28, borderRadius:6, background: visible ? '#D1FAE5' : '#FEE2E2', border:`1px solid ${visible ? '#A7F3D0' : '#FECACA'}`, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:12, transition:'transform 0.1s' }}
                            onMouseEnter={e=>e.currentTarget.style.transform='scale(1.1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                            {visible ? '✓' : '✕'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop:10, fontSize:10, color:'#9CA3AF' }}>Cliquez sur une case pour activer/désactiver l'accès. Les modifications sont appliquées immédiatement.</div>
        </Card>
      )}

      {/* Cards par catégorie de couleur */}
      {(() => {
        const byCouleur = { vert:[], bleu:[], jaune:[], orange:[], rouge:[], gris:[] }
        pipeline.forEach(p => { const c = statutColors[p.statut] || 'gris'; if(byCouleur[c]) byCouleur[c].push(p); else byCouleur.gris.push(p) })
        const cards = [
          { label:'Convertis', couleur:'vert', icon:'✓', desc:'Devenus membres' },
          { label:'En cours', couleur:'bleu', icon:'→', desc:'Fiches envoyées, Membres BNI' },
          { label:'À suivre', couleur:'jaune', icon:'◎', desc:'Recontacter, Collaborateurs' },
          { label:'En attente', couleur:'orange', icon:'⏸', desc:'Stand-by, Temporiser' },
          { label:'Perdus', couleur:'rouge', icon:'✕', desc:'Pas intéressé, Injoignable' },
          { label:'Autres', couleur:'gris', icon:'—', desc:'Doublons, Sans statut' },
        ].map(c => {
          const statuts = byCouleur[c.couleur] || []
          const n = statuts.reduce((s, p) => s + p.n, 0)
          const pct = Math.round(n / total * 100)
          return { ...c, n, pct, statuts, style: COULEURS[c.couleur] }
        }).filter(c => c.n > 0)

        return <>
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : `repeat(${Math.min(cards.length, 6)},1fr)`, gap: isMobile ? 8 : 12, marginBottom:16 }}>
            {cards.map(c => (
              <div key={c.couleur} onClick={() => {
                if (filter === c.couleur) setFilter('tous')
                else setFilter(c.couleur)
              }}
                style={{ background:c.style.bg, borderRadius:10, padding: isMobile ? '10px 12px' : '14px 16px', border:`1px solid ${c.style.badge}`, cursor:'pointer', transition:'transform 0.1s' }}
                onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                <div style={{ fontSize: isMobile ? 9 : 10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:c.style.color, marginBottom: isMobile ? 2 : 4 }}>{c.label}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                  <span style={{ fontSize: isMobile ? 18 : 26, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:c.style.color }}>{c.n}</span>
                  <span style={{ fontSize: isMobile ? 10 : 12, fontWeight:600, color:c.style.color, opacity:0.6 }}>{c.pct}%</span>
                </div>
                {!isMobile && <div style={{ fontSize:9, color:'#1C1C2E', opacity:0.5, marginTop:2 }}>{c.desc}</div>}
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={() => { setFilter('tous'); setShowFilters(!showFilters) }} style={{ padding:'5px 12px', borderRadius:16, border: filter==='tous'?'2px solid #1C1C2E':'1px solid #E8E6E1', fontSize:11, fontWeight:filter==='tous'?700:400, background:filter==='tous'?'#1C1C2E':'#fff', color:filter==='tous'?'#fff':'#6B7280', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>Tous ({invites.length}) <span style={{ fontSize:9, opacity:0.6 }}>{showFilters ? '▲' : '▼'}</span></button>
            {(showFilters || filter !== 'tous') && pipeline.map(p => {
              const st = getStatutStyle(p.statut)
              const isActive = filter === p.statut
              return <button key={p.statut} onClick={() => { setFilter(isActive ? 'tous' : p.statut); if(!isActive) setShowFilters(false) }} style={{ padding:'5px 10px', borderRadius:16, border:isActive?`2px solid ${st.color}`:'1px solid #E8E6E1', fontSize:10, fontWeight:isActive?600:400, background:isActive?st.bg:'#fff', color:isActive?st.color:'#9CA3AF', cursor:'pointer' }}>{p.statut} ({p.n})</button>
            })}
          </div>
        </>
      })()}
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

        return months.map(([month, { invites: monthInvites }]) => {
        const isCollapsed = collapsedMonths[month]
        return (
        <div key={month} style={{ marginBottom:16 }}>
          <div onClick={() => setCollapsedMonths(prev => ({...prev, [month]: !prev[month]}))}
            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 18px', background:'#1C1C2E', borderRadius: isCollapsed ? 10 : '10px 10px 0 0', cursor:'pointer', userSelect:'none' }}
            onMouseEnter={e=>e.currentTarget.style.background='#2D2D42'} onMouseLeave={e=>e.currentTarget.style.background='#1C1C2E'}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ color:'#fff', fontSize:15, fontWeight:700, textTransform:'capitalize', letterSpacing:'0.02em' }}>{month}</span>
              <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.7)' }}>{monthInvites.length} invité{monthInvites.length > 1 ? 's' : ''} · {Math.round(monthInvites.length/total*100)}%</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {(() => {
                const mStats = {}
                monthInvites.forEach(inv => { const c = statutColors[inv.statut] || 'gris'; mStats[c] = (mStats[c]||0) + 1 })
                return Object.entries(mStats).map(([c, n]) => (
                  <span key={c} style={{ fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:8, background:COULEURS[c]?.bg || '#F3F4F6', color:COULEURS[c]?.color || '#4B5563' }}>{n}</span>
                ))
              })()}
              <span style={{ color:'rgba(255,255,255,0.5)', fontSize:12, transition:'transform 0.2s', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', marginLeft:4 }}>▼</span>
            </div>
          </div>
          {!isCollapsed && <div>
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'6px 10px 0' }}>
            {isColumnVisible('commentaires') && <button onClick={e=>{e.stopPropagation();setShowCommentaires(!showCommentaires)}} style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:6, border:'1px solid #E8E6E1', background:showCommentaires?'#1C1C2E':'#fff', color:showCommentaires?'#fff':'#6B7280', cursor:'pointer', fontFamily:'DM Sans, sans-serif', display:'flex', alignItems:'center', gap:4 }}>
              💬 {showCommentaires ? 'Masquer' : 'Afficher'} commentaires
            </button>}
          </div>
          <TableWrap>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{[['Date',90],['Prénom',120],['Nom',120],['Profession',null],['Statut',150],
              ...(isColumnVisible('telephone') ? [['Téléphone',120]] : []),
              ...(isColumnVisible('email') ? [['Email',160]] : []),
              ['Invité par',130],['CA en charge',100],
              ...(isColumnVisible('commentaires') && showCommentaires ? [['Commentaires',null]] : []),
            ].map(([h,w]) => (
              <th key={h} style={{ background:'#F9F8F6', padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1', width: w ? w : undefined }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {monthInvites.map((inv, i) => {
                const statStyle = getStatutStyle(inv.statut)
                const isEdit = editId === inv.id
                const inputSt = { padding:'4px 8px', border:'1px solid #E8E6E1', borderRadius:6, fontSize:11, fontFamily:'DM Sans, sans-serif', width:'100%', boxSizing:'border-box' }
                return (
                  <React.Fragment key={i}>
                  <tr style={{ borderBottom: isEdit ? 'none' : '1px solid rgba(0,0,0,0.05)', background: isEdit ? '#FFFBEB' : statStyle.bg, cursor:'pointer', boxShadow: isEdit ? 'inset 0 0 0 2px #C9A84C' : 'none' }}
                    onClick={() => { if (isEdit) { setEditId(null) } else { setEditId(inv.id); setEditData({...inv}) } }}
                    onMouseEnter={e=>{ if(!isEdit) e.currentTarget.style.opacity='0.85'}} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color }}>{inv.date_visite ? new Date(inv.date_visite).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600, color:statStyle.color }}>{cap(inv.prenom)}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600, color:statStyle.color }}>{cap(inv.nom)}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color, opacity:0.8 }}>{inv.profession || '—'}</td>
                    <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:12, background:statStyle.badge, color:statStyle.color }}>{inv.statut || '—'}</span></td>
                    {isColumnVisible('telephone') && <td style={{ padding:'10px 14px', fontSize:11, color:statStyle.color, opacity:0.8 }}>{inv.telephone || '—'}</td>}
                    {isColumnVisible('email') && <td style={{ padding:'10px 14px', fontSize:11, color:statStyle.color, opacity:0.8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{inv.email || '—'}</td>}
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color, opacity:0.8 }}>{inv.invite_par_nom || '—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:12, color:statStyle.color, opacity:0.8 }}>{inv.membre_ca_charge_nom || '—'}</td>
                    {isColumnVisible('commentaires') && showCommentaires && <td style={{ padding:'10px 14px', fontSize:11, color:statStyle.color, opacity:0.7 }}>{inv.commentaires || '—'}</td>}
                  </tr>
                  {isEdit && (
                    <tr style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', background:'#FFFBEB', boxShadow:'inset 0 0 0 2px #C9A84C' }}>
                      <td colSpan={20} style={{ padding:'12px 14px' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:10 }}>
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Prénom</label><input value={editData.prenom||''} onChange={e=>setEditData({...editData,prenom:e.target.value})} style={inputSt}/></div>
                          <div style={{ position:'relative' }}>
                            <label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Nom</label>
                            <input value={editData.nom||''} onChange={e=>setEditData({...editData,nom:e.target.value})} style={inputSt}/>
                            <button onClick={e=>{e.stopPropagation();setEditData({...editData, prenom:editData.nom, nom:editData.prenom})}}
                              title="Inverser prénom ↔ nom"
                              style={{ position:'absolute', top:0, right:0, background:'#1C1C2E', color:'#fff', border:'none', borderRadius:4, fontSize:9, padding:'2px 5px', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>⇄</button>
                          </div>
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
                          <div><label style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>Couleur</label>
                            <div style={{ display:'flex', gap:4, padding:'4px 0' }}>
                              {Object.entries(COULEURS).map(([key, c]) => {
                                const isActive = (statutColors[editData.statut] || 'gris') === key
                                return (
                                  <div key={key} onClick={e => { e.stopPropagation(); if(editData.statut) saveStatutColor(editData.statut, key) }}
                                    style={{ width:28, height:28, borderRadius:6, background:c.bg, border:`2px solid ${isActive ? c.color : c.badge}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'transform 0.1s', transform: isActive ? 'scale(1.15)' : 'scale(1)' }}
                                    title={c.label}>
                                    {isActive && <div style={{ width:10, height:10, borderRadius:3, background:c.color }} />}
                                  </div>
                                )
                              })}
                            </div>
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
        </div>}
        </div>
        )})
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
            <div style={{ fontFamily:'DM Sans, sans-serif', fontSize:28, fontWeight:700, color:'#C41E3A' }}>MK-01</div>
            <div style={{ fontSize:18, fontWeight:600, marginTop:2 }}>Kénitra Atlantique</div>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Lancé le 12 décembre 2025 · Région Kénitra</div>
          </div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:'#D1FAE5', color:'#065F46' }}>Actif</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginTop:20 }}>
          {[[kpis?.membresActifs ?? '…','Membres actifs'],['83%','Objectif rempli'],[kpis?.invitesTotal ?? '…','Invités reçus'],[kpis?.invitesConvertis ?? '…','Convertis'],[(tyfcb/1000).toFixed(0)+'K MAD','TYFCB généré']].map(([v,l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>{v}</div>
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
            <div style={{ fontFamily:'DM Sans, sans-serif', fontSize:28, fontWeight:700, color:'#9CA3AF' }}>MK-02</div>
            <div style={{ fontSize:18, fontWeight:600, marginTop:2 }}>Kénitra Impulse</div>
            <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>En cours de constitution · 2 postulants</div>
          </div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:'#F3F4F6', color:'#4B5563' }}>En préparation</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:20 }}>
          {[['2','Postulants'],['Achraf Nour','Fitness / Bien-être'],['Ilyasse Essafi','Dentiste']].map(([v,l]) => (
            <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding:12 }}>
              <div style={{ fontSize:15, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>{v}</div>
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

  const mob = window.innerWidth <= 768

  return (
    <div style={{ padding: mob ? '16px' : '28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Reporting" sub={`MK-01 Kénitra Atlantique · ${moisLabel}`} />
      <div style={{ display:'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: mob ? 8 : 16, marginBottom: mob ? 16 : 24 }}>
        {[
          { label:'TYFCB total', value: kpis ? `${Math.round(kpis.tyfcb).toLocaleString('de-DE')} MAD` : '…', sub:'6 mois glissants',
            topBg: kpis?.tyfcb >= 300000 ? '#A7F3D0' : kpis?.tyfcb >= 50000 ? '#FDE68A' : '#FECACA',
            valueColor: kpis?.tyfcb >= 300000 ? '#065F46' : kpis?.tyfcb >= 50000 ? '#854D0E' : '#991B1B',
            bg: kpis?.tyfcb >= 300000 ? '#D1FAE5' : kpis?.tyfcb >= 50000 ? '#FEF9C3' : '#FEE2E2' },
          { label:'Recommandations', value: loading ? '…' : scores.reduce((s,r)=>s+(Number(r.referrals_given_score)||0),0), sub:'Score total',
            topBg:'#FDE68A', valueColor:'#854D0E', bg:'#FEF9C3' },
          { label:'Taux de présence', value: kpis ? `${kpis.pRate}%` : '…', sub:'Moyenne groupe',
            topBg: kpis?.pRate >= 95 ? '#A7F3D0' : kpis?.pRate >= 88 ? '#FDE68A' : '#FECACA',
            valueColor: kpis?.pRate >= 95 ? '#065F46' : kpis?.pRate >= 88 ? '#854D0E' : '#991B1B',
            bg: kpis?.pRate >= 95 ? '#D1FAE5' : kpis?.pRate >= 88 ? '#FEF9C3' : '#FEE2E2' },
          { label:'Conversion invités', value: kpis && kpis.invitesTotal > 0 ? `${Math.round(kpis.invitesConvertis/kpis.invitesTotal*100)}%` : '…', sub:`${kpis?.invitesConvertis||0}/${kpis?.invitesTotal||0} invités`,
            topBg: kpis?.invitesConvertis > 3 ? '#A7F3D0' : kpis?.invitesConvertis > 0 ? '#FDE68A' : '#FECACA',
            valueColor: kpis?.invitesConvertis > 3 ? '#065F46' : kpis?.invitesConvertis > 0 ? '#854D0E' : '#991B1B',
            bg: kpis?.invitesConvertis > 3 ? '#D1FAE5' : kpis?.invitesConvertis > 0 ? '#FEF9C3' : '#FEE2E2' },
        ].map(c => (
          <div key={c.label} style={{ background:c.bg, borderRadius: mob ? 10 : 12, border:'1px solid rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <div style={{ background:c.topBg, padding: mob ? '6px 12px' : '10px 18px' }}>
              <div style={{ fontSize: mob ? 9 : 11, fontWeight:600, color:c.valueColor, textTransform:'uppercase', letterSpacing:'0.07em', opacity:0.8 }}>{c.label}</div>
            </div>
            <div style={{ padding: mob ? '8px 12px 10px' : '14px 18px 16px' }}>
              <div style={{ fontSize: mob ? 16 : 28, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:c.valueColor }}>{c.value}</div>
              <div style={{ fontSize: mob ? 9 : 12, color:'#6B7280', marginTop:2 }}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Score groupe — distribution (toujours visible sur mobile) */}
      {!loading && <div style={{ marginBottom:16 }}>
        {mob ? (
          <div style={{ background:'#fff', borderRadius:10, padding:'14px 16px', border:'1px solid #E8E6E1', marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Distribution des scores</div>
            <div style={{ display:'flex', gap:6 }}>
              {[
                { label:'Vert', tl:'vert', bg:'#D1FAE5', color:'#065F46', count: scores.filter(s=>s.traffic_light==='vert').length },
                { label:'Orange', tl:'orange', bg:'#FEF9C3', color:'#854D0E', count: scores.filter(s=>s.traffic_light==='orange').length },
                { label:'Rouge', tl:'rouge', bg:'#FEE2E2', color:'#991B1B', count: scores.filter(s=>s.traffic_light==='rouge').length },
                { label:'Gris', tl:'gris', bg:'#F3F4F6', color:'#4B5563', count: scores.filter(s=>s.traffic_light==='gris'||!s.traffic_light).length },
              ].map(t => (
                <div key={t.tl} style={{ flex:1, background:t.bg, borderRadius:8, padding:'8px 6px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:t.color, fontFamily:'DM Sans, sans-serif' }}>{t.count}</div>
                  <div style={{ fontSize:8, fontWeight:600, color:t.color, textTransform:'uppercase', opacity:0.7 }}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : <GroupeScoresChart scores={scores} />}
      </div>}

      {/* ─── SECTIONS VP (après le graphe, avant les tableaux) ─── */}
      {!loading && <>
          {/* Objectifs collectifs du mois */}
          <div style={{ marginBottom: mob ? 12 : 16 }}>
            <SectionTitle>🎯 Objectifs collectifs — {moisLabel}</SectionTitle>
            <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr 1fr', gap: mob ? 8 : 16 }}>
              {[
                { label:'Total TàT groupe', value:totalTatMois, obj:nbJeudis*totalMembres, color:'#C41E3A' },
                { label:'Total Reco. groupe', value:totalRecoMois, obj:Math.ceil(nbJeudis*1.25*totalMembres), color:'#8B5CF6' },
                { label:'TYFCB du mois', value:totalMpbMois, obj:50000, color:'#3B82F6', isMoney:true },
              ].map(o => (
                <div key={o.label} style={{ background:'#fff', borderRadius: mob ? 10 : 12, padding: mob ? '10px 14px' : '16px 18px', border:'1px solid #E8E6E1', display:'flex', alignItems:'center', gap: mob ? 10 : 0, flexDirection: mob ? 'row' : 'column' }}>
                  {mob ? (<>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>{o.label}</div>
                      <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                        <span style={{ fontSize:18, fontWeight:700, color:o.color, fontFamily:'DM Sans, sans-serif' }}>{o.isMoney ? Number(o.value).toLocaleString('de-DE') : o.value}</span>
                        <span style={{ fontSize:10, color:'#9CA3AF' }}>/ {o.isMoney ? Number(o.obj).toLocaleString('de-DE') : o.obj}</span>
                      </div>
                    </div>
                    <div style={{ width:60 }}><ProgressBar value={o.value} max={o.obj} color={o.value >= o.obj ? '#059669' : o.value >= o.obj*0.5 ? '#D97706' : '#DC2626'} /></div>
                  </>) : (<>
                    <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, alignSelf:'flex-start' }}>{o.label}</div>
                    <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:8, alignSelf:'flex-start' }}>
                      <span style={{ fontSize:24, fontWeight:700, color:o.color, fontFamily:'DM Sans, sans-serif' }}>{o.isMoney ? Number(o.value).toLocaleString('de-DE') : o.value}</span>
                      <span style={{ fontSize:12, color:'#9CA3AF' }}>/ {o.isMoney ? Number(o.obj).toLocaleString('de-DE') : o.obj}</span>
                    </div>
                    <div style={{ width:'100%' }}><ProgressBar value={o.value} max={o.obj} color={o.value >= o.obj ? '#059669' : o.value >= o.obj*0.5 ? '#D97706' : '#DC2626'} /></div>
                  </>)}
                </div>
              ))}
            </div>
          </div>

          {/* Taux de participation */}
          <div style={{ marginBottom: mob ? 12 : 16 }}>
            <SectionTitle>📊 Taux de participation — {moisLabel}</SectionTitle>
            <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr 1fr 1fr' : '1fr 1fr 1fr', gap: mob ? 8 : 16 }}>
              {[
                { label:`≥ 1 TàT`, value:membresAvecTat, total:totalMembres, color:'#C41E3A' },
                { label:`≥ 1 Reco.`, value:membresAvecReco, total:totalMembres, color:'#8B5CF6' },
                { label:`100% prés.`, value:Object.values(hebdoMap).filter(m=>m.absences===0&&m.presences>0).length, total:totalMembres, color:'#059669' },
              ].map(p => {
                const pct = p.total > 0 ? Math.round(p.value/p.total*100) : 0
                const bg = pct >= 80 ? '#D1FAE5' : pct >= 50 ? '#FEF9C3' : '#FEE2E2'
                return (
                  <div key={p.label} style={{ background:bg, borderRadius: mob ? 10 : 12, padding: mob ? '10px 10px' : '16px 18px', border:'1px solid rgba(0,0,0,0.06)', textAlign: mob ? 'center' : 'left' }}>
                    <div style={{ fontSize: mob ? 8 : 11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom: mob ? 2 : 4 }}>{p.label}</div>
                    <div style={{ fontSize: mob ? 20 : 28, fontWeight:700, color:p.color, fontFamily:'DM Sans, sans-serif' }}>{pct}%</div>
                    <div style={{ fontSize: mob ? 9 : 12, color:'#6B7280' }}>{p.value}/{p.total}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top contributeurs vs Inactifs */}
          <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: mob ? 8 : 16, marginBottom: mob ? 12 : 16 }}>
            <TableWrap>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>🌟 Top contributeurs du mois</SectionTitle></div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['Membre','TàT','Reco.','TYFCB'].map(h=><th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>)}</tr></thead>
                <tbody>{top5.map((m,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid #F3F2EF', background:'#D1FAE5' }}>
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:'#065F46' }}>{fullName(m.score?.membres?.prenom, m.score?.membres?.nom)}</td>
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
                    <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:'#991B1B' }}>{fullName(m.score?.membres?.prenom, m.score?.membres?.nom)}</td>
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
                    <div style={{ fontSize:12, fontWeight:600, color:'#991B1B' }}>{fullName(s.membres?.prenom, s.membres?.nom)}</div>
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
              <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr 1fr' : '1fr 1fr', gap: mob ? 8 : 16 }}>
                {[
                  { label:'TàT', current:totalTatMois, prev:prevTotalTat },
                  { label:'Reco.', current:totalRecoMois, prev:prevTotalReco },
                ].map(e => {
                  const diff = e.current - e.prev
                  const pct = e.prev > 0 ? Math.round((diff/e.prev)*100) : 0
                  return (
                    <div key={e.label} style={{ background:'#fff', borderRadius: mob ? 10 : 12, padding: mob ? '10px 12px' : '16px 18px', border:'1px solid #E8E6E1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize: mob ? 9 : 11, fontWeight:600, color:'#6B7280', textTransform:'uppercase' }}>{e.label}</div>
                        <div style={{ fontSize: mob ? 18 : 22, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>{e.current}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize: mob ? 14 : 18, fontWeight:700, color: diff >= 0 ? '#059669' : '#DC2626' }}>{diff >= 0 ? '↑' : '↓'} {Math.abs(diff)}</div>
                        <div style={{ fontSize: mob ? 9 : 11, color: diff >= 0 ? '#059669' : '#DC2626' }}>{pct >= 0 ? '+' : ''}{pct}%</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
      </>}

      {loading ? <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Chargement...</div> : (
        <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: mob ? 8 : 16 }}>
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
                      <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color: Number(s.total_score||0) >= 70 ? '#065F46' : Number(s.total_score||0) >= 50 ? '#854D0E' : Number(s.total_score||0) >= 30 ? '#991B1B' : '#6B7280' }}>{fullName(s.membres?.prenom, s.membres?.nom)}</td>
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
                      <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color: Number(s.total_score||0) >= 70 ? '#065F46' : Number(s.total_score||0) >= 50 ? '#854D0E' : Number(s.total_score||0) >= 30 ? '#991B1B' : '#6B7280' }}>{fullName(s.membres?.prenom, s.membres?.nom)}</td>
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
