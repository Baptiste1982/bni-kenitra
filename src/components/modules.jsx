import React, { useState, useRef, useEffect } from 'react'
import { fetchInvites, fetchDashboardKPIs, fetchScoresMK01, fetchObjectifs, fetchPalmsHebdoMois, fetchMonthlySnapshots, syncSheetToSupabase, writeInviteToSheet, buildDynamicSystemPrompt, fetchPostulants } from '../lib/bniService'
import { GroupeScoresChart } from './ScoresChart'
import { BNI_SYSTEM_PROMPT } from '../data/bniData'
import { supabase } from '../lib/supabase'
import { PageHeader, SectionTitle, TableWrap, StatCard, Card, AccordionPanel, fullName, cap } from './ui'
import PostulantsImport from './PostulantsImport'
import PostulantDetail from './PostulantDetail'

// ─── INVITÉS ────────────────────────────────────────────────────────────────
export function Invites({ profil, groupeCode = 'MK-01' }) {
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
  const [collapsedMonths, setCollapsedMonths] = useState(null)
  const [showCommentaires, setShowCommentaires] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const isMobile = window.innerWidth <= 768

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchInvites(groupeCode),
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

  useEffect(() => { load() }, [groupeCode])

  // Replier tous les mois sauf le mois en cours (une seule fois au chargement)
  useEffect(() => {
    if (!invites.length || collapsedMonths !== null) return
    const now = new Date()
    const currentMonth = now.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
    const collapsed = {}
    invites.forEach(inv => {
      const d = inv.date_visite ? new Date(inv.date_visite + 'T12:00:00') : null
      const key = d ? d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' }) : 'Sans date'
      if (key !== currentMonth) collapsed[key] = true
    })
    setCollapsedMonths(collapsed)
  }, [invites])

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

      // Trouver les headers (ligne contenant "Prénom", "Société", "First", etc.)
      const rows = []
      const allParsedRows = []
      rowChunks.forEach(chunk => {
        const cellMatches = [...chunk.matchAll(/<Cell([^>]*)>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>/g)]
        if (!cellMatches.length) return
        const vals = []
        cellMatches.forEach(m => {
          const idxMatch = m[1].match(/ss:Index="(\d+)"/)
          if (idxMatch) { while (vals.length < parseInt(idxMatch[1]) - 1) vals.push('') }
          vals.push(m[2].trim())
        })
        allParsedRows.push(vals)
        if (!headerFound) {
          const joined = vals.join(' ').toLowerCase()
          // Détecter la ligne header : contient prénom/first + nom/last ou société/company
          if (vals.length >= 5 && (
            (joined.includes('prénom') && joined.includes('nom')) ||
            (joined.includes('first') && joined.includes('last')) ||
            (joined.includes('prénom') && joined.includes('société')) ||
            vals.some(v => v.toLowerCase().includes('prénom recherché')) ||
            vals.some(v => v.toLowerCase() === 'société')
          )) {
            headers = vals
            headerFound = true
          }
          return
        }
        if (vals.length >= 3 && vals.some(v => v)) rows.push(vals)
      })

      if (!headerFound || rows.length === 0) {
        console.log('Toutes les lignes parsées:', allParsedRows.slice(0, 10))
        setSyncMsg(`Erreur : headers non trouvés (${allParsedRows.length} lignes lues). Vérifiez le format du fichier.`)
        return
      }

      // Mapper les colonnes (normalise accents)
      const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const colIdx = (name) => headers.findIndex(h => h && (h.toLowerCase().includes(name.toLowerCase()) || norm(h).includes(norm(name))))
      console.log('Headers trouvés:', headers)
      const iPrenom = colIdx('prénom') >= 0 ? colIdx('prénom') : colIdx('prenom') >= 0 ? colIdx('prenom') : colIdx('first')
      const iNom = colIdx('nom') >= 0 ? colIdx('nom') : colIdx('last')
      const iSociete = colIdx('société') >= 0 ? colIdx('société') : colIdx('societe') >= 0 ? colIdx('societe') : colIdx('company')
      const iProfession = colIdx('profession')
      const iEmail = colIdx('email')
      const iTel = colIdx('téléphone') >= 0 ? colIdx('téléphone') : colIdx('telephone')
      const iAdresse = colIdx('adresse ligne 1') >= 0 ? colIdx('adresse ligne 1') : colIdx('adresse')
      const iVille = colIdx('ville')
      const iDate = colIdx('date de visite') >= 0 ? colIdx('date de visite') : colIdx('date')
      const iInvitedBy = colIdx('invited by') >= 0 ? colIdx('invited by') : colIdx('invité par')
      const iType = colIdx('type')

      const groupeId = (await supabase.from('groupes').select('id').eq('code', groupeCode).single()).data?.id

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

      // Extraire les dates depuis le fichier (formats: YYYY-MM-DD, DD/MM/YYYY, YYYY-MM-DDT...)
      const parseMetaDate = (label) => {
        // Chercher dans le XML : label suivi d'une date dans une cellule adjacente
        const patterns = [
          new RegExp(label + '[\\s:]*<\\/Data>[\\s\\S]*?<Data[^>]*>(\\d{4}-\\d{2}-\\d{2})', 'i'),
          new RegExp(label + '[\\s:]*<\\/Data>[\\s\\S]*?<Data[^>]*>(\\d{4}-\\d{2}-\\d{2})T', 'i'),
          new RegExp(label + '[\\s:]*<\\/Data>[\\s\\S]*?<Data[^>]*>(\\d{2}/\\d{2}/\\d{4})', 'i'),
          new RegExp(label + '[^<]*>(\\d{4}-\\d{2}-\\d{2})', 'i'),
          new RegExp(label + '[^<]*>(\\d{2}/\\d{2}/\\d{4})', 'i'),
        ]
        for (const p of patterns) {
          const m = text.match(p)
          if (m) {
            const v = m[1]
            if (v.includes('/')) { const [d,mo,y] = v.split('/'); return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}` }
            return v
          }
        }
        return null
      }
      let dateDebut = parseMetaDate('Depuis')
      let dateFin = parseMetaDate("Jusqu.*?au")
      // Fallback : utiliser min/max des dates de visite importées
      if (!dateDebut || !dateFin) {
        const allDates = rows.map(r => {
          const ds = r[iDate] || ''
          if (ds.includes('T')) return ds.split('T')[0]
          if (ds.includes('/')) { const parts = ds.split('/'); return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` }
          return ds
        }).filter(d => d && d.match(/^\d{4}-/)).sort()
        if (!dateDebut && allDates.length) dateDebut = allDates[0]
        if (!dateFin && allDates.length) dateFin = allDates[allDates.length - 1]
      }
      // Archiver l'import
      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from('visitor_imports').insert({
        groupe_id: groupeId,
        date_debut: dateDebut,
        date_fin: dateFin,
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

  const handleDeleteInvite = async () => {
    if (!editId) return
    const inv = invites.find(i => i.id === editId)
    const label = inv ? `${cap(inv.prenom) || ''} ${cap(inv.nom) || ''}`.trim() || 'cet invité' : 'cet invité'
    if (!window.confirm(`Supprimer définitivement ${label} ?\nCette action est irréversible.`)) return
    try {
      await supabase.from('invites').delete().eq('id', editId)
      setInvites(prev => prev.filter(i => i.id !== editId))
      setEditId(null)
      setSyncMsg('Invité supprimé')
    } catch(e) { setSyncMsg('Erreur suppression : ' + e.message) }
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
      <PageHeader title="Pipeline Invités" sub={`${groupeCode} · ${invites.length} invités`}
        right={
          <div style={{ display:'flex', gap: isMobile ? 6 : 10, alignItems:'center', flexWrap:'wrap' }}>
            {syncMsg && <span style={{ fontSize:11, color: syncMsg.startsWith('Erreur') ? '#DC2626' : '#059669' }}>{syncMsg}</span>}
            {['super_admin','directrice_consultante','secretaire_tresorier'].includes(profil?.role) &&
              <div onClick={() => { setShowVisitorArchives(!showVisitorArchives); if (!showVisitorArchives) { setShowVisitorImport(false); setShowAccessConfig(false); supabase.from('visitor_imports').select('*').order('imported_at',{ascending:false}).then(({data}) => setVisitorArchives(data||[])) } }}
                style={{ background: showVisitorArchives ? '#F3F2EF' : '#fff', border:'1px solid #E8E6E1', borderRadius:12, padding: isMobile ? '8px 14px' : '12px 16px', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s', display:'flex', alignItems:'center', gap:12 }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';e.currentTarget.style.transform='translateY(-1px)'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none'}}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>Archives</div>
                  <div style={{ fontSize: isMobile ? 13 : 16, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>Historique</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                </div>
              </div>}
            {['super_admin','directrice_consultante','secretaire_tresorier'].includes(profil?.role) &&
              <div onClick={() => { setShowVisitorImport(!showVisitorImport); if(!showVisitorImport) { setShowVisitorArchives(false); setShowAccessConfig(false) } }}
                style={{ background: showVisitorImport ? '#F3F2EF' : '#fff', border:'1px solid #E8E6E1', borderRadius:12, padding: isMobile ? '8px 14px' : '12px 16px', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s', display:'flex', alignItems:'center', gap:12 }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';e.currentTarget.style.transform='translateY(-1px)'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none'}}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>Importer</div>
                  <div style={{ fontSize: isMobile ? 13 : 16, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>Fichier XLS</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                </div>
              </div>}
            {canConfigAccess &&
              <div onClick={() => setShowAccessConfig(!showAccessConfig)}
                style={{ background: showAccessConfig ? '#F3F2EF' : '#fff', border:'1px solid #E8E6E1', borderRadius:12, padding: isMobile ? '8px 14px' : '12px 16px', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s', display:'flex', alignItems:'center', gap:12 }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';e.currentTarget.style.transform='translateY(-1px)'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none'}}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>Paramètres</div>
                  <div style={{ fontSize: isMobile ? 13 : 16, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>Accès</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                </div>
              </div>}
            {profil?.role === 'super_admin' &&
              <div onClick={syncing ? undefined : handleSync}
                style={{ background: syncing ? '#E8E6E1' : '#fff', border:'1px solid #E8E6E1', borderRadius:12, padding: isMobile ? '8px 14px' : '12px 16px', cursor: syncing ? 'not-allowed' : 'pointer', transition:'box-shadow 0.15s, transform 0.15s', display:'flex', alignItems:'center', gap:12, opacity: syncing ? 0.6 : 1 }}
                onMouseEnter={e=>{if(!syncing){e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)';e.currentTarget.style.transform='translateY(-1px)'}}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.transform='none'}}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>Google Sheets</div>
                  <div style={{ fontSize: isMobile ? 13 : 16, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>{syncing ? 'Sync...' : 'Sync'}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                  <span style={{ width:4, height:4, borderRadius:'50%', background:'#C41E3A' }} />
                </div>
              </div>}
          </div>
        }
      />
      {/* Import XLS visiteurs */}
      <AccordionPanel open={showVisitorImport}>
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
      </AccordionPanel>

      {/* Archives des imports visiteurs */}
      <AccordionPanel open={showVisitorArchives}>
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
                      let query = supabase.from('invites').select('*').eq('groupe_id', a.groupe_id)
                      if (a.date_debut) query = query.gte('date_visite', a.date_debut)
                      if (a.date_fin) query = query.lte('date_visite', a.date_fin)
                      const { data } = await query.order('date_visite')
                      setArchiveData(data || [])
                    }}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:8, background: isActive ? '#EDE9FE' : '#F7F6F3', border:`1px solid ${isActive ? '#8B5CF6' : '#E8E6E1'}`, cursor:'pointer' }}
                      onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:'#C41E3A', flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color: isActive ? '#5B21B6' : '#1C1C2E' }}>{debut} → {fin}</div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>Importé le {importDate} · {a.nb_invites} invité{a.nb_invites>1?'s':''}</div>
                      </div>
                      <button onClick={async (e) => {
                        e.stopPropagation()
                        if (!window.confirm(`Supprimer l'archive du ${debut} → ${fin} ?`)) return
                        await supabase.from('visitor_imports').delete().eq('id', a.id)
                        setVisitorArchives(prev => prev.filter(x => x.id !== a.id))
                        if (isActive) { setArchiveDetail(null); setArchiveData([]) }
                      }} title="Supprimer l'archive"
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#DC2626', opacity:0.5, padding:'2px 6px', borderRadius:4, flexShrink:0 }}
                        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.5'}>🗑</button>
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
      </AccordionPanel>

      {/* Panneau config accès données */}
      <AccordionPanel open={showAccessConfig}>
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
      </AccordionPanel>

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
        const isCollapsed = (collapsedMonths || {})[month]
        return (
        <div key={month} style={{ marginBottom:16 }}>
          <div onClick={() => setCollapsedMonths(prev => ({...(prev||{}), [month]: !(prev||{})[month]}))}
            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 18px', background:'#F3F2EF', borderRadius: isCollapsed ? 10 : '10px 10px 0 0', cursor:'pointer', userSelect:'none', border:'1px solid #E8E6E1' }}
            onMouseEnter={e=>e.currentTarget.style.background='#EAE8E4'} onMouseLeave={e=>e.currentTarget.style.background='#F3F2EF'}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ color:'#1C1C2E', fontSize:15, fontWeight:700, textTransform:'capitalize', letterSpacing:'0.02em' }}>{month}</span>
              <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'rgba(0,0,0,0.07)', color:'#6B7280' }}>{monthInvites.length} invité{monthInvites.length > 1 ? 's' : ''} · {Math.round(monthInvites.length/total*100)}%</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {(() => {
                const mStats = {}
                monthInvites.forEach(inv => { const c = statutColors[inv.statut] || 'gris'; mStats[c] = (mStats[c]||0) + 1 })
                return Object.entries(mStats).map(([c, n]) => (
                  <span key={c} style={{ fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:8, background:COULEURS[c]?.bg || '#F3F4F6', color:COULEURS[c]?.color || '#4B5563' }}>{n}</span>
                ))
              })()}
              <span style={{ color:'#9CA3AF', fontSize:12, transition:'transform 0.2s', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', marginLeft:4 }}>▼</span>
            </div>
          </div>
          <AccordionPanel open={!isCollapsed}><div>
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
                    <tr style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', background:'#FFFBEB', boxShadow:'inset 0 0 0 2px #C9A84C', animation:'fadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
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
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <button onClick={e=>{e.stopPropagation();handleSaveEdit()}} style={{ padding:'6px 16px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer' }}>Sauvegarder</button>
                          <button onClick={e=>{e.stopPropagation();setEditId(null)}} style={{ padding:'6px 16px', background:'#F3F4F6', color:'#4B5563', border:'none', borderRadius:6, fontSize:11, cursor:'pointer' }}>Annuler</button>
                          <div style={{ flex:1 }} />
                          <button onClick={e=>{e.stopPropagation();handleDeleteInvite()}} title="Supprimer définitivement cet invité" style={{ padding:'6px 14px', background:'#fff', color:'#B91C1C', border:'1px solid #FCA5A5', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}
                            onMouseEnter={e=>{ e.currentTarget.style.background='#FEE2E2'; e.currentTarget.style.borderColor='#B91C1C' }}
                            onMouseLeave={e=>{ e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='#FCA5A5' }}>
                            🗑 Supprimer
                          </button>
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
        </div></AccordionPanel>
        </div>
        )})
      })()}
    </div>
  )
}

// ─── GROUPES ─────────────────────────────────────────────────────────────────
export function Groupes({ groupes = [], groupeCode, onSwitchGroupe }) {
  const [dataByGroupe, setDataByGroupe] = useState({})  // { code: { kpis, scores, hebdo, prevSnapshot } }
  const [postulantsByGroupe, setPostulantsByGroupe] = useState({}) // { code: [postulants] }
  const [loading, setLoading] = useState(true)
  const [importFor, setImportFor] = useState(null) // groupe_code cible pour l'import
  const [selected, setSelected] = useState(null) // postulant sélectionné

  const now = new Date()
  const mois = now.getMonth() + 1, annee = now.getFullYear()
  const prevMois = mois === 1 ? 12 : mois - 1
  const prevAnnee = mois === 1 ? annee - 1 : annee

  const actifs = groupes.filter(g => g.statut === 'actif')
  const prepa = groupes.filter(g => g.statut !== 'actif')

  useEffect(() => {
    if (!actifs.length) { setLoading(false); return }
    setLoading(true)
    Promise.all(actifs.map(async g => {
      const [kpis, scores, hebdo, prevSnapshot] = await Promise.all([
        fetchDashboardKPIs(g.code).catch(() => null),
        fetchScoresMK01(g.code).catch(() => []),
        fetchPalmsHebdoMois(mois, annee, g.code).catch(() => []),
        fetchMonthlySnapshots(prevMois, prevAnnee, g.code).catch(() => []),
      ])
      return [g.code, { kpis, scores, hebdo, prevSnapshot }]
    })).then(entries => {
      const map = {}
      entries.forEach(([code, data]) => { map[code] = data })
      setDataByGroupe(map)
      setLoading(false)
    })
  }, [groupes.map(g => g.code).join(',')])

  // Charger postulants pour tous les groupes
  const loadPostulants = () => {
    if (!groupes.length) return
    fetchPostulants().then(rows => {
      const map = {}
      groupes.forEach(g => { map[g.code] = [] })
      ;(rows || []).forEach(r => {
        if (!map[r.groupe_code]) map[r.groupe_code] = []
        map[r.groupe_code].push(r)
      })
      setPostulantsByGroupe(map)
    }).catch(() => {})
  }
  useEffect(loadPostulants, [groupes.map(g => g.code).join(',')])

  const mob = window.innerWidth <= 768

  // Calculs par groupe
  const computeGroupeMetrics = (g) => {
    const d = dataByGroupe[g.code]
    if (!d) return null
    const { kpis, scores, hebdo, prevSnapshot } = d
    const tyfcb = kpis?.tyfcb || 0

    // Distribution feux
    const feux = { vert:0, orange:0, rouge:0, gris:0 }
    scores.forEach(s => { feux[s.traffic_light || 'gris'] = (feux[s.traffic_light || 'gris'] || 0) + 1 })

    // Hebdo agrégé par membre (pour détecter absents répétés)
    const hMap = {}
    hebdo.filter(r => r.membre_id).forEach(r => {
      if (!hMap[r.membre_id]) hMap[r.membre_id] = { tat:0, presences:0, absences:0 }
      const m = hMap[r.membre_id]
      m.tat += r.tat || 0
      if (r.palms === 'P') m.presences += r.nb_reunions || 1
      else m.absences += r.nb_reunions || 1
    })
    const absentsRepetes = Object.values(hMap).filter(m => m.absences >= 2).length
    const sansTat = scores.filter(s => {
      const h = hMap[s.membre_id]
      return !h || h.tat === 0
    }).length

    // TYFCB évolution vs N-1 (snapshot du mois précédent)
    const prevTyfcb = prevSnapshot.reduce((s, r) => s + (Number(r.tyfcb_6mois) || 0), 0)
    const tyfcbDelta = prevTyfcb > 0 ? Math.round((tyfcb - prevTyfcb) / prevTyfcb * 100) : null

    return { kpis, scores, feux, tyfcb, tyfcbDelta, absentsRepetes, sansTat, membresRouges: feux.rouge }
  }

  const badge = (statut) => {
    if (statut === 'actif') return { bg:'#D1FAE5', color:'#065F46', label:'Actif' }
    if (statut === 'preparation' || statut === 'en_preparation') return { bg:'#FEF3C7', color:'#92400E', label:'En préparation' }
    return { bg:'#F3F4F6', color:'#4B5563', label: statut || '—' }
  }

  const FeuxBar = ({ feux }) => {
    const total = (feux.vert || 0) + (feux.orange || 0) + (feux.rouge || 0) + (feux.gris || 0)
    if (!total) return <div style={{ fontSize:11, color:'#9CA3AF' }}>—</div>
    const segs = [
      { c:'#10B981', n:feux.vert || 0, lbl:'Vert' },
      { c:'#F59E0B', n:feux.orange || 0, lbl:'Orange' },
      { c:'#EF4444', n:feux.rouge || 0, lbl:'Rouge' },
      { c:'#9CA3AF', n:feux.gris || 0, lbl:'Gris' },
    ]
    return (
      <div>
        <div style={{ display:'flex', height:10, borderRadius:5, overflow:'hidden', background:'#F3F2EF' }}>
          {segs.map(s => s.n > 0 && (
            <div key={s.lbl} style={{ width:`${s.n/total*100}%`, background:s.c }} title={`${s.lbl} : ${s.n}`} />
          ))}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:6, fontSize:11, color:'#6B7280' }}>
          {segs.map(s => (
            <span key={s.lbl} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:s.c }} />
              <span style={{ fontWeight:600, color:'#111827' }}>{s.n}</span>
              <span>{s.lbl}</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  const ActiveCard = ({ g }) => {
    const m = computeGroupeMetrics(g)
    const isCurrent = g.code === groupeCode
    const b = badge(g.statut)
    return (
      <div style={{
        background:'#fff', borderRadius:14, padding: mob ? 16 : 24, border:'1px solid #E8E6E1',
        borderLeft: `4px solid ${isCurrent ? '#C41E3A' : '#10B981'}`, marginBottom:16,
        boxShadow: isCurrent ? '0 4px 16px rgba(196,30,58,0.08)' : 'none'
      }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontFamily:'DM Sans, sans-serif', fontSize: mob ? 22 : 28, fontWeight:700, color:'#C41E3A' }}>{g.code}</div>
            <div style={{ fontSize: mob ? 15 : 18, fontWeight:600, marginTop:2 }}>{g.nom || '—'}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:b.bg, color:b.color }}>{b.label}</span>
            {!isCurrent && onSwitchGroupe && (
              <button onClick={() => onSwitchGroupe(g.code)} style={{
                fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:8,
                background:'#1C1C2E', color:'#fff', border:'none', cursor:'pointer'
              }}>Passer sur ce groupe</button>
            )}
            {isCurrent && <span style={{ fontSize:11, fontWeight:600, color:'#C41E3A', textTransform:'uppercase', letterSpacing:'0.05em' }}>Groupe actif</span>}
          </div>
        </div>

        {!m ? (
          <div style={{ padding:20, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Chargement…</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: mob ? 8 : 12, marginTop: mob ? 14 : 20 }}>
              {[
                [m.kpis?.membresActifs ?? '—', 'Membres actifs'],
                [m.kpis ? `${m.kpis.pRate}%` : '—', 'Présence'],
                [m.kpis?.invitesTotal ?? '—', 'Invités reçus'],
                [m.kpis?.invitesConvertis ?? '—', 'Convertis'],
                [`${(m.tyfcb/1000).toFixed(0)}K MAD`, 'TYFCB 6 mois'],
              ].map(([v, l]) => (
                <div key={l} style={{ background:'#F7F6F3', borderRadius:8, padding: mob ? 10 : 12 }}>
                  <div style={{ fontSize: mob ? 15 : 18, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>{v}</div>
                  <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Distribution feux */}
            <div style={{ marginTop:18 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Distribution des feux</div>
              <FeuxBar feux={m.feux} />
            </div>

            {/* Indicateurs critiques */}
            <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr' : 'repeat(3,1fr)', gap:10, marginTop:18 }}>
              <div style={{ background: m.membresRouges > 0 ? '#FEE2E2' : '#F7F6F3', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'#6B7280', marginBottom:2 }}>Membres en alerte rouge</div>
                <div style={{ fontSize:18, fontWeight:700, color: m.membresRouges > 0 ? '#991B1B' : '#111827' }}>{m.membresRouges}</div>
              </div>
              <div style={{ background: m.absentsRepetes > 0 ? '#FEF3C7' : '#F7F6F3', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'#6B7280', marginBottom:2 }}>Absents répétés ({'≥'}2)</div>
                <div style={{ fontSize:18, fontWeight:700, color: m.absentsRepetes > 0 ? '#92400E' : '#111827' }}>{m.absentsRepetes}</div>
              </div>
              <div style={{ background:'#F7F6F3', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ fontSize:11, color:'#6B7280', marginBottom:2 }}>Évolution TYFCB vs M-1</div>
                <div style={{ fontSize:18, fontWeight:700, color: m.tyfcbDelta == null ? '#9CA3AF' : m.tyfcbDelta >= 0 ? '#065F46' : '#991B1B' }}>
                  {m.tyfcbDelta == null ? '—' : `${m.tyfcbDelta >= 0 ? '+' : ''}${m.tyfcbDelta}%`}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // Kanban colonnes
  const KANBAN = [
    { v:'contacte',     l:'Contacté',     c:'#3730A3', bg:'#E0E7FF' },
    { v:'rdv_planifie', l:'RDV',          c:'#92400E', bg:'#FEF3C7' },
    { v:'visiteur',     l:'Visiteur',     c:'#6B21A8', bg:'#E9D5FF' },
    { v:'inscrit',      l:'Inscrit',      c:'#065F46', bg:'#D1FAE5' },
    { v:'refuse',       l:'Refusé',       c:'#991B1B', bg:'#FEE2E2' },
  ]

  const PostulantCard = ({ p }) => (
    <div
      onClick={() => setSelected(p)}
      style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:8, padding:'10px 12px', cursor:'pointer', transition:'0.12s', boxShadow:'0 1px 2px rgba(0,0,0,0.03)' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)'; e.currentTarget.style.transform = 'none' }}>
      <div style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{p.prenom} {p.nom}</div>
      {p.profession && <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{p.profession}</div>}
      {p.parrain_nom && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:4, fontStyle:'italic' }}>via {p.parrain_nom}</div>}
    </div>
  )

  const Pipeline = ({ groupeCode: gc }) => {
    const list = postulantsByGroupe[gc] || []
    return (
      <div style={{ marginTop:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Pipeline postulants · {list.length} au total
          </div>
          <button onClick={() => setImportFor(gc)} style={{ padding:'7px 14px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            + Importer postulation
          </button>
        </div>
        <div style={mob ? {
          display:'flex', gap:10, overflowX:'auto', WebkitOverflowScrolling:'touch',
          paddingBottom:4, marginLeft:-4, marginRight:-4, paddingLeft:4, paddingRight:4,
          scrollSnapType:'x mandatory',
        } : { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10 }}>
          {KANBAN.map(col => {
            const items = list.filter(p => p.statut === col.v)
            return (
              <div key={col.v} style={{
                background:'#F7F6F3', borderRadius:10, padding: mob ? 8 : 10,
                minHeight: mob ? 64 : 140,
                ...(mob ? { flex:'0 0 130px', scrollSnapAlign:'start' } : {}),
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, padding:'2px 4px' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:col.c, textTransform:'uppercase', letterSpacing:'0.05em' }}>{col.l}</span>
                  <span style={{ fontSize:11, fontWeight:700, background:col.bg, color:col.c, padding:'2px 8px', borderRadius:10 }}>{items.length}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {items.length === 0 ? (
                    <div style={{ fontSize:11, color:'#9CA3AF', padding:'8px 4px', textAlign:'center' }}>—</div>
                  ) : items.map(p => <PostulantCard key={p.id} p={p} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const PrepaCard = ({ g }) => {
    const b = badge(g.statut)
    const list = postulantsByGroupe[g.code] || []
    const countsByStatut = list.reduce((acc, p) => { acc[p.statut] = (acc[p.statut] || 0) + 1; return acc }, {})
    return (
      <div style={{ background:'#fff', borderRadius:14, padding: mob ? 16 : 24, border:'1px dashed #D1D5DB', borderLeft:'4px solid #9CA3AF', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontFamily:'DM Sans, sans-serif', fontSize: mob ? 22 : 28, fontWeight:700, color:'#9CA3AF' }}>{g.code}</div>
            <div style={{ fontSize: mob ? 15 : 18, fontWeight:600, marginTop:2 }}>{g.nom || '—'}</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:6 }}>En cours de constitution</div>
          </div>
          <span style={{ fontSize:12, fontWeight:500, padding:'4px 10px', borderRadius:12, background:b.bg, color:b.color }}>{b.label}</span>
        </div>
        <div style={{ marginTop:14, padding:'10px 12px', background:'#F7F6F3', borderRadius:8, fontSize:12, color:'#4B5563', display:'flex', gap:14, flexWrap:'wrap' }}>
          <span><strong style={{ color:'#111827' }}>{list.length}</strong> postulants</span>
          <span><strong style={{ color:'#111827' }}>{countsByStatut.visiteur || 0}</strong> visiteurs</span>
          <span><strong style={{ color:'#111827' }}>{countsByStatut.inscrit || 0}</strong> inscrits</span>
        </div>
        <Pipeline groupeCode={g.code} />
      </div>
    )
  }

  return (
    <div style={{ padding: mob ? '16px' : '28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Groupes"
        sub={`Région Kénitra · ${actifs.length} actif${actifs.length > 1 ? 's' : ''} · ${prepa.length} en préparation`}
      />
      {loading && !Object.keys(dataByGroupe).length && (
        <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:14 }}>Chargement des données des groupes…</div>
      )}
      {actifs.map(g => (
        <div key={g.code}>
          <ActiveCard g={g} />
          <div style={{ marginTop:-8, marginBottom:20, padding: mob ? '0 4px' : '0 8px' }}>
            <Pipeline groupeCode={g.code} />
          </div>
        </div>
      ))}
      {prepa.map(g => <PrepaCard key={g.code} g={g} />)}
      {!groupes.length && !loading && (
        <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:14 }}>Aucun groupe configuré.</div>
      )}

      {importFor && (
        <PostulantsImport
          groupes={groupes}
          defaultGroupeCode={importFor}
          onClose={() => setImportFor(null)}
          onSaved={loadPostulants}
        />
      )}
      {selected && (
        <PostulantDetail
          postulant={selected}
          groupes={groupes}
          onClose={() => setSelected(null)}
          onUpdated={loadPostulants}
        />
      )}
    </div>
  )
}

// ─── REPORTING ───────────────────────────────────────────────────────────────
export function Reporting({ groupeCode = 'MK-01' }) {
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
    Promise.all([fetchScoresMK01(groupeCode), fetchDashboardKPIs(groupeCode), fetchPalmsHebdoMois(mois, annee, groupeCode), fetchMonthlySnapshots(prevMois, prevAnnee, groupeCode)])
      .then(([s, k, h, ps]) => { setScores(s); setKpis(k); setHebdo(h); setPrevSnapshot(ps); setLoading(false) })
  }, [groupeCode])

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
      <PageHeader title="Reporting" sub={`${groupeCode} · ${moisLabel}`} />
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
          <div style={{ marginBottom: mob ? 12 : 16 }}>
            <SectionTitle>🚨 Membres à risque ({membresRisque.length})</SectionTitle>
            {membresRisque.length === 0 ? (
              <div style={{ background:'#D1FAE5', borderRadius:10, padding:'14px 16px', textAlign:'center', fontSize:13, color:'#065F46', fontWeight:500 }}>Aucun membre à risque ce mois ✓</div>
            ) : (
              <div style={{ background:'#fff', borderRadius: mob ? 10 : 12, border:'1px solid #FECACA', overflow:'hidden' }}>
                {membresRisque.slice(0,15).map((s,i) => {
                  const sc = Number(s.total_score||0)
                  const h = hebdoMap[s.membre_id]
                  const severity = sc < 20 ? '#DC2626' : sc < 30 ? '#F59E0B' : '#6B7280'
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', padding: mob ? '8px 12px' : '10px 16px', borderBottom: i < membresRisque.length-1 ? '1px solid #FEE2E2' : 'none', gap: mob ? 8 : 12 }}>
                      <div style={{ width: mob ? 28 : 34, height: mob ? 28 : 34, borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span style={{ fontSize: mob ? 11 : 13, fontWeight:700, color:severity }}>{sc}</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize: mob ? 12 : 13, fontWeight:600, color:'#991B1B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(s.membres?.prenom, s.membres?.nom)}</div>
                        <div style={{ display:'flex', gap: mob ? 6 : 10, marginTop:2 }}>
                          <span style={{ fontSize: mob ? 9 : 10, color:'#DC2626', fontWeight:500 }}>TàT {h?.tat||0}</span>
                          <span style={{ fontSize: mob ? 9 : 10, color:'#DC2626', fontWeight:500 }}>Reco {h?.refs||0}</span>
                          <span style={{ fontSize: mob ? 9 : 10, color: (h?.absences||0) > 0 ? '#DC2626' : '#6B7280', fontWeight:500 }}>{h?.absences||0} abs.</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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
          <div style={{ background:'#fff', borderRadius: mob ? 10 : 12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
            <div style={{ padding: mob ? '10px 12px' : '14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>💰 Top TYFCB générés</SectionTitle></div>
            {scores.filter(s=>Number(s.tyfcb)>0).sort((a,b)=>Number(b.tyfcb)-Number(a.tyfcb)).slice(0,8).map((s,i)=>{
              const sc = Number(s.total_score||0)
              const tyb = Number(s.tyfcb) >= 300000 ? {bg:'#D1FAE5',c:'#065F46'} : Number(s.tyfcb) >= 50000 ? {bg:'#FEF9C3',c:'#854D0E'} : Number(s.tyfcb) >= 20000 ? {bg:'#FFEDD5',c:'#9A3412'} : {bg:'#FEE2E2',c:'#991B1B'}
              const rBg = {vert:'#D1FAE5',orange:'#FEF9C3',rouge:'#FEE2E2',gris:'#F9FAFB'}[s.traffic_light]||'#fff'
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: mob ? '6px 12px' : '8px 16px', borderBottom:'1px solid rgba(0,0,0,0.05)', background:rBg }}>
                  <div style={{ fontWeight:600, fontSize: mob ? 11 : 13, color: sc >= 70 ? '#065F46' : sc >= 50 ? '#854D0E' : sc >= 30 ? '#991B1B' : '#6B7280', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(s.membres?.prenom, s.membres?.nom)}</div>
                  <div style={{ fontWeight:700, fontSize: mob ? 11 : 13, color:tyb.c, background:tyb.bg, padding:'2px 8px', borderRadius:6, flexShrink:0, marginLeft:8 }}>{Number(s.tyfcb).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>
              )
            })}
          </div>
          <div style={{ background:'#fff', borderRadius: mob ? 10 : 12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
            <div style={{ padding: mob ? '10px 12px' : '14px 16px', borderBottom:'1px solid #E8E6E1' }}><SectionTitle>🏆 Classement complet</SectionTitle></div>
            {scores.filter(s=>s.rank).sort((a,b)=>a.rank-b.rank).map((s,i)=>{
              const sc = Number(s.total_score||0)
              const scBg = sc >= 70 ? {bg:'#D1FAE5',c:'#065F46'} : sc >= 50 ? {bg:'#FEF9C3',c:'#854D0E'} : sc >= 30 ? {bg:'#FEE2E2',c:'#991B1B'} : {bg:'#F3F4F6',c:'#4B5563'}
              const rBg2 = {vert:'#D1FAE5',orange:'#FEF9C3',rouge:'#FEE2E2',gris:'#F9FAFB'}[s.traffic_light]||'#fff'
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', padding: mob ? '6px 12px' : '8px 16px', borderBottom:'1px solid rgba(0,0,0,0.05)', background:rBg2, gap:8 }}>
                  <div style={{ color:'#9CA3AF', fontSize: mob ? 10 : 12, width: mob ? 20 : 28, flexShrink:0, textAlign:'center' }}>{s.rank}</div>
                  <div style={{ fontWeight:600, fontSize: mob ? 11 : 13, color: sc >= 70 ? '#065F46' : sc >= 50 ? '#854D0E' : sc >= 30 ? '#991B1B' : '#6B7280', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullName(s.membres?.prenom, s.membres?.nom)}</div>
                  <div style={{ fontWeight:700, fontSize: mob ? 12 : 14, color:scBg.c, background:scBg.bg, padding:'2px 8px', borderRadius:6, flexShrink:0 }}>{sc}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── OBJECTIFS ──────────────────────────────────────────────────────────────
export function Objectifs({ groupeCode = 'MK-01', profil }) {
  const [objectifs, setObjectifs] = useState(null)
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const isAdmin = ['super_admin','directeur_executif','directrice_consultante'].includes(profil?.role)

  // Sliders simulation — valeurs locales modifiables en temps réel
  const [simPres, setSimPres] = useState(null)
  const [simRefs, setSimRefs] = useState(null)
  const [simVis, setSimVis] = useState(null)
  const [simTyfcb, setSimTyfcb] = useState(null)
  const [simMode, setSimMode] = useState(false)
  const [sortBy, setSortBy] = useState('atteinte')
  const [sortDir, setSortDir] = useState('desc')

  const load = async () => {
    setLoading(true)
    const [objData, scoresData] = await Promise.all([
      fetchObjectifs(groupeCode),
      fetchScoresMK01(groupeCode),
    ])
    setObjectifs(objData)
    setScores(scoresData)
    if (objData) {
      setForm(objData)
      setSimPres(Number(objData.objectif_retention) || 95)
      setSimRefs(Number(objData.objectif_references_semaine) || 1)
      setSimVis(Number(objData.objectif_invites_semaine) || 1)
      setSimTyfcb(Number(objData.objectif_tyfcb) || 500000)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [groupeCode])

  const handleSave = async () => {
    if (!objectifs?.id) return
    const { error } = await supabase.from('objectifs').update({
      objectif_membres: Number(form.objectif_membres) || 30,
      objectif_retention: Number(form.objectif_retention) || 95,
      objectif_invites_semaine: Number(form.objectif_invites_semaine) || 1,
      objectif_references_semaine: Number(form.objectif_references_semaine) || 1,
      objectif_tyfcb: Number(form.objectif_tyfcb) || 500000,
    }).eq('id', objectifs.id)
    if (!error) { setEditing(false); load() }
  }

  // Sauvegarder les objectifs simulés comme officiels
  const handleApplySimulation = async () => {
    if (!objectifs?.id) return
    const { error } = await supabase.from('objectifs').update({
      objectif_retention: simPres,
      objectif_references_semaine: simRefs,
      objectif_invites_semaine: simVis,
      objectif_tyfcb: simTyfcb,
    }).eq('id', objectifs.id)
    if (!error) { setSimMode(false); load() }
  }

  const resetSim = () => {
    if (!objectifs) return
    setSimPres(Number(objectifs.objectif_retention) || 95)
    setSimRefs(Number(objectifs.objectif_references_semaine) || 1)
    setSimVis(Number(objectifs.objectif_invites_semaine) || 1)
    setSimTyfcb(Number(objectifs.objectif_tyfcb) || 500000)
    setSimMode(false)
  }

  if (loading) return <div style={{ padding:'28px 32px', textAlign:'center', color:'#9CA3AF' }}>Chargement...</div>

  const nbMembres = scores.filter(s => s.membre_id).length
  const obj = objectifs || { objectif_membres:30, objectif_retention:95, objectif_invites_semaine:1, objectif_references_semaine:1, objectif_tyfcb:500000 }

  // Utiliser les valeurs simulation (ou les objectifs réels si pas de sim)
  const objPres = simPres ?? Number(obj.objectif_retention)
  const objRefs = simRefs ?? Number(obj.objectif_references_semaine)
  const objVis = simVis ?? Number(obj.objectif_invites_semaine)
  const objTyfcbTotal = simTyfcb ?? Number(obj.objectif_tyfcb)
  const objTyfcbMembre = nbMembres > 0 ? objTyfcbTotal / nbMembres : 20000

  // Calculer les données membres avec les seuils courants
  const membresData = scores.filter(s => s.membres).map(s => {
    const pres = Math.round((Number(s.attendance_rate)||0)*100)
    const refs = Number(s.referrals_given_rate)||0
    const vis = Number(s.visitors)||0
    const tyfcb = Number(s.tyfcb)||0
    const okPres = pres >= objPres
    const okRefs = refs >= objRefs
    const okVis = vis >= objVis
    const okTyfcb = tyfcb >= objTyfcbMembre
    const nbOk = [okPres, okRefs, okVis, okTyfcb].filter(Boolean).length
    const atteinte = Math.round(((okPres ? 100 : pres / objPres * 100) * 0.3 + (okRefs ? 100 : refs / objRefs * 100) * 0.25 + (okVis ? 100 : vis / objVis * 100) * 0.2 + (okTyfcb ? 100 : tyfcb / objTyfcbMembre * 100) * 0.25))
    return { ...s, pres, refs, vis, tyfcb, okPres, okRefs, okVis, okTyfcb, nbOk, atteinte: Math.min(atteinte, 100) }
  })

  // Tri dynamique
  const sortKey = { atteinte:'atteinte', pres:'pres', refs:'refs', vis:'vis', tyfcb:'tyfcb', score:'total_score', nom:'_nom' }[sortBy] || 'atteinte'
  membresData.sort((a,b) => {
    let va, vb
    if (sortBy === 'nom') { va = fullName(a.membres?.prenom, a.membres?.nom); vb = fullName(b.membres?.prenom, b.membres?.nom); return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va) }
    va = Number(sortBy === 'score' ? a.total_score : a[sortKey]) || 0
    vb = Number(sortBy === 'score' ? b.total_score : b[sortKey]) || 0
    return sortDir === 'asc' ? va - vb : vb - va
  })

  // Compteurs pour le résumé
  const countOkPres = membresData.filter(m => m.okPres).length
  const countOkRefs = membresData.filter(m => m.okRefs).length
  const countOkVis = membresData.filter(m => m.okVis).length
  const countOkTyfcb = membresData.filter(m => m.okTyfcb).length
  const count4sur4 = membresData.filter(m => m.nbOk === 4).length
  const count0sur4 = membresData.filter(m => m.nbOk === 0).length

  const tlColor = { vert:'#059669', orange:'#D97706', rouge:'#DC2626', gris:'#9CA3AF' }
  const atteinteColor = (v) => v >= 80 ? '#059669' : v >= 50 ? '#D97706' : '#DC2626'
  const okBadge = (ok) => ok
    ? { bg:'#D1FAE5', color:'#065F46', label:'✓' }
    : { bg:'#FEE2E2', color:'#991B1B', label:'✗' }

  // Vérifier si la simulation a changé par rapport aux objectifs sauvegardés
  const simChanged = simPres !== Number(obj.objectif_retention) || simRefs !== Number(obj.objectif_references_semaine) || simVis !== Number(obj.objectif_invites_semaine) || simTyfcb !== Number(obj.objectif_tyfcb)

  const SliderKpi = ({ label, value, onChange, min, max, step, unit, countOk, total, icon }) => (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', padding:'16px 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em' }}>{icon} {label}</span>
        <span style={{ fontSize:18, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>{typeof value === 'number' && value >= 1000 ? value.toLocaleString('fr-FR') : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => { onChange(Number(e.target.value)); if (!simMode) setSimMode(true) }}
        style={{ width:'100%', height:6, appearance:'none', background:`linear-gradient(to right, #C41E3A ${((value-min)/(max-min))*100}%, #F3F2EF ${((value-min)/(max-min))*100}%)`, borderRadius:3, outline:'none', cursor:'pointer' }} />
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
        <span style={{ fontSize:10, color:'#9CA3AF' }}>{typeof min === 'number' && min >= 1000 ? min.toLocaleString('fr-FR') : min}{unit}</span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:12, fontWeight:700, color: countOk === total ? '#059669' : countOk >= total * 0.6 ? '#D97706' : '#DC2626' }}>{countOk}/{total}</span>
          <span style={{ fontSize:10, color:'#9CA3AF' }}>atteignent</span>
        </div>
        <span style={{ fontSize:10, color:'#9CA3AF' }}>{typeof max === 'number' && max >= 1000 ? max.toLocaleString('fr-FR') : max}{unit}</span>
      </div>
    </div>
  )

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Objectifs & Simulation" sub={`T${obj.trimestre || '?'} ${obj.annee || '2026'} — ${groupeCode} — ${nbMembres} membres`}
        right={simChanged ? (
          <div style={{ display:'flex', gap:8 }}>
            {isAdmin && <button onClick={handleApplySimulation} style={{ padding:'8px 16px', background:'#059669', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>Appliquer comme objectif</button>}
            <button onClick={resetSim} style={{ padding:'8px 16px', background:'#fff', color:'#6B7280', border:'1px solid #E8E6E1', borderRadius:8, fontSize:12, cursor:'pointer' }}>Réinitialiser</button>
          </div>
        ) : null}
      />

      {/* Bandeau simulation active */}
      {simChanged && (
        <div style={{ background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#92400E' }}>
          <span style={{ fontSize:14 }}>⚡</span>
          <strong>Mode simulation actif</strong> — Ajustez les curseurs pour voir l'impact en temps réel. Les changements ne sont pas sauvegardés.
        </div>
      )}

      {/* Résumé rapide */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:20 }}>
        <div style={{ background:'#D1FAE5', borderRadius:10, padding:'14px 18px', border:'1px solid #A7F3D0' }}>
          <div style={{ fontSize:28, fontWeight:700, color:'#065F46', fontFamily:'DM Sans, sans-serif' }}>{count4sur4}</div>
          <div style={{ fontSize:11, color:'#065F46', fontWeight:500 }}>membres atteignent 4/4 objectifs</div>
        </div>
        <div style={{ background:'#FEF9C3', borderRadius:10, padding:'14px 18px', border:'1px solid #FDE68A' }}>
          <div style={{ fontSize:28, fontWeight:700, color:'#854D0E', fontFamily:'DM Sans, sans-serif' }}>{nbMembres - count4sur4 - count0sur4}</div>
          <div style={{ fontSize:11, color:'#854D0E', fontWeight:500 }}>membres partiellement atteints</div>
        </div>
        <div style={{ background:'#FEE2E2', borderRadius:10, padding:'14px 18px', border:'1px solid #FECACA' }}>
          <div style={{ fontSize:28, fontWeight:700, color:'#991B1B', fontFamily:'DM Sans, sans-serif' }}>{count0sur4}</div>
          <div style={{ fontSize:11, color:'#991B1B', fontWeight:500 }}>membres à 0/4 objectifs</div>
        </div>
      </div>

      {/* Sliders interactifs */}
      <div style={{ display:'grid', gridTemplateColumns: window.innerWidth <= 768 ? '1fr' : '1fr 1fr', gap:12, marginBottom:24 }}>
        <SliderKpi label="Présence" icon="📋" value={objPres} onChange={setSimPres} min={50} max={100} step={5} unit="%" countOk={countOkPres} total={nbMembres} />
        <SliderKpi label="Recos / semaine" icon="🤝" value={objRefs} onChange={setSimRefs} min={0} max={5} step={0.25} unit="/sem" countOk={countOkRefs} total={nbMembres} />
        <SliderKpi label="Visiteurs / semaine" icon="🎯" value={objVis} onChange={setSimVis} min={0} max={5} step={0.5} unit="/sem" countOk={countOkVis} total={nbMembres} />
        <SliderKpi label="TYFCB total chapitre" icon="💰" value={objTyfcbTotal} onChange={setSimTyfcb} min={100000} max={2000000} step={50000} unit=" MAD" countOk={countOkTyfcb} total={nbMembres} />
      </div>

      {/* Tableau — qui passe, qui passe pas */}
      {(() => {
        const toggleSort = (key) => { if (sortBy === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc') } else { setSortBy(key); setSortDir('desc') } }
        const arrow = (key) => sortBy === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''
        const thStyle = (key, align='center') => ({ background: sortBy === key ? '#EDE9E3' : '#F9F8F6', padding:'8px 12px', textAlign:align, fontSize:10, fontWeight:600, color: sortBy === key ? '#1C1C2E' : '#6B7280', textTransform:'uppercase', borderBottom:'1px solid #E8E6E1', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', transition:'background 0.15s' })
        return (
      <TableWrap>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <SectionTitle>Détail par membre</SectionTitle>
          <div style={{ fontSize:10, color:'#9CA3AF' }}>Cliquez sur un en-tête pour trier</div>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            <th onClick={() => toggleSort('nom')} style={thStyle('nom','left')}>Membre{arrow('nom')}</th>
            <th style={{ background:'#F9F8F6', padding:'8px 8px', textAlign:'center', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', borderBottom:'1px solid #E8E6E1' }}>TL</th>
            <th onClick={() => toggleSort('atteinte')} style={thStyle('atteinte')}>Atteinte{arrow('atteinte')}</th>
            <th onClick={() => toggleSort('pres')} style={thStyle('pres')}>Présence ≥{objPres}%{arrow('pres')}</th>
            <th onClick={() => toggleSort('refs')} style={thStyle('refs')}>Recos ≥{objRefs}{arrow('refs')}</th>
            <th onClick={() => toggleSort('vis')} style={thStyle('vis')}>Visit. ≥{objVis}{arrow('vis')}</th>
            <th onClick={() => toggleSort('tyfcb')} style={thStyle('tyfcb')}>TYFCB ≥{Math.round(objTyfcbMembre/1000)}K{arrow('tyfcb')}</th>
            <th onClick={() => toggleSort('score')} style={thStyle('score')}>Score{arrow('score')}</th>
          </tr></thead>
          <tbody>
            {membresData.map((s, i) => {
              const tl = s.traffic_light || 'gris'
              const renderCell = (ok, value, fmt) => {
                const b = okBadge(ok)
                return (
                  <td style={{ padding:'6px 12px', textAlign:'center' }}>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:b.bg, fontSize:11, fontWeight:600, color:b.color }}>
                      <span>{b.label}</span>
                      <span style={{ opacity:0.7 }}>{fmt}</span>
                    </div>
                  </td>
                )
              }
              return (
                <tr key={i} style={{ borderBottom:'1px solid #F3F2EF', background: s.nbOk === 4 ? '#F0FDF4' : s.nbOk === 0 ? '#FEF2F2' : 'transparent' }}
                  onMouseEnter={e=>e.currentTarget.style.opacity='0.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                  <td style={{ padding:'8px 12px', fontSize:12, fontWeight:500 }}>{fullName(s.membres?.prenom, s.membres?.nom)}</td>
                  <td style={{ padding:'6px 8px', textAlign:'center' }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:tlColor[tl], margin:'0 auto' }} />
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'center' }}>
                    <span style={{ fontSize:13, fontWeight:700, color:atteinteColor(s.atteinte) }}>{s.nbOk}/4</span>
                  </td>
                  {renderCell(s.okPres, s.pres, `${s.pres}%`)}
                  {renderCell(s.okRefs, s.refs, s.refs.toFixed(2))}
                  {renderCell(s.okVis, s.vis, String(s.vis))}
                  {renderCell(s.okTyfcb, s.tyfcb, `${(s.tyfcb/1000).toFixed(0)}K`)}
                  <td style={{ padding:'6px 8px', textAlign:'center', fontSize:12, fontWeight:700, color: Number(s.total_score) >= 70 ? '#065F46' : Number(s.total_score) >= 50 ? '#854D0E' : '#991B1B' }}>{Number(s.total_score||0).toFixed(0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
        )
      })()}
    </div>
  )
}

// ─── AGENT IA ────────────────────────────────────────────────────────────────
export function AgentIA({ groupeCode = 'MK-01' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(null)
  const [promptMeta, setPromptMeta] = useState(null)
  const [promptLoading, setPromptLoading] = useState(true)
  const msgsRef = useRef(null)

  // Charger le prompt dynamique au montage
  useEffect(() => {
    buildDynamicSystemPrompt(groupeCode)
      .then(result => { setSystemPrompt(result.prompt); setPromptMeta(result); setPromptLoading(false) })
      .catch(() => { setSystemPrompt(BNI_SYSTEM_PROMPT); setPromptMeta({ nbMembres: '?', nbAlertes: 0, nbInvites: 0, secteurs: [] }); setPromptLoading(false) })
  }, [groupeCode])

  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight }, [messages, loading])

  const send = async (text) => {
    const content = text || input.trim()
    if (!content || loading || !systemPrompt) return
    setInput('')
    const newMessages = [...messages, { role:'user', content }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { system: systemPrompt, max_tokens: 1500, messages: newMessages.map(m => ({ role: m.role, content: m.content })) }
      })
      if (error) throw error
      setMessages([...newMessages, { role:'assistant', content:data.content?.[0]?.text || 'Désolé, erreur.' }])
    } catch { setMessages([...newMessages, { role:'assistant', content:'Erreur de connexion.' }]) }
    setLoading(false)
  }

  const QUICK = [
    'Quels membres sont en danger ?',
    'Quels métiers recruter en priorité ?',
    'Actions prioritaires cette semaine ?',
    'Analyse le pipeline invités',
    'Comment aider les membres gris ?',
  ]

  return (
    <div style={{ padding:'28px 32px 0', height:'100%', display:'flex', flexDirection:'column', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title={<>Agent IA <span style={{ fontSize:16, fontFamily:'DM Sans, sans-serif', fontWeight:400, color:'#C9A84C' }}>· Conseiller BNI</span></>} sub="Données en temps réel · Analyse · Plans d'action" />
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#fff', borderRadius:14, border:'1px solid #E8E6E1', overflow:'hidden', minHeight:0 }}>
        <div ref={msgsRef} style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          {promptLoading ? (
            <div style={{ padding:'20px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Chargement des données du chapitre...</div>
          ) : (
            <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, lineHeight:1.6 }}>
              <strong>Agent BNI Kénitra connecté</strong><br /><br />
              {promptMeta?.nbMembres} membres actifs · {promptMeta?.secteurs?.length || 0} secteurs couverts · {promptMeta?.nbAlertes || 0} alerte{(promptMeta?.nbAlertes || 0) > 1 ? 's' : ''} · {promptMeta?.nbInvites || 0} invité{(promptMeta?.nbInvites || 0) > 1 ? 's' : ''} dans le pipeline<br /><br />
              Posez-moi une question — je m'appuie uniquement sur les données réelles du chapitre.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap', alignSelf:m.role==='user'?'flex-end':'flex-start', borderBottomRightRadius:m.role==='user'?4:12, borderBottomLeftRadius:m.role==='user'?12:4, background:m.role==='user'?'#C41E3A':'#F3F2EF', color:m.role==='user'?'#fff':'#1C1C2E' }}>
              {m.content}
            </div>
          ))}
          {loading && <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:12, borderBottomLeftRadius:4, background:'#F3F2EF', fontSize:13, color:'#9CA3AF' }}>L'agent analyse vos données...</div>}
        </div>
        <div style={{ padding:'0 16px 10px', display:'flex', gap:8, flexWrap:'wrap' }}>
          {QUICK.map(q => <button key={q} onClick={() => send(q)} disabled={promptLoading} style={{ padding:'6px 12px', border:'1px solid #E8E6E1', borderRadius:20, fontSize:11, background:'#fff', color:'#6B7280', cursor: promptLoading ? 'not-allowed' : 'pointer', opacity: promptLoading ? 0.5 : 1 }}>{q}</button>)}
        </div>
        <div style={{ padding:16, borderTop:'1px solid #E8E6E1', display:'flex', gap:10 }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Posez votre question..." rows={2} style={{ flex:1, padding:'11px 16px', border:'1px solid #E8E6E1', borderRadius:10, fontSize:13, fontFamily:'DM Sans, sans-serif', resize:'none', outline:'none' }} />
          <button onClick={() => send()} disabled={loading||promptLoading||!input.trim()} style={{ padding:'11px 20px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:loading||promptLoading||!input.trim()?'not-allowed':'pointer', opacity:loading||promptLoading||!input.trim()?0.5:1 }}>Envoyer</button>
        </div>
      </div>
    </div>
  )
}
