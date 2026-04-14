import { supabase } from './supabase'

// ─── HELPER : get groupe id ───────────────────────────────────────────────────
let groupeIdCache = {}
async function getGroupeId(code = 'MK-01') {
  if (groupeIdCache[code]) return groupeIdCache[code]
  const { data } = await supabase.from('groupes').select('id').eq('code', code).single()
  if (data) groupeIdCache[code] = data.id
  return data?.id || null
}

// ─── GROUPES ─────────────────────────────────────────────────────────────────
export async function fetchGroupes() {
  const { data, error } = await supabase.from('groupes').select('*').order('code')
  if (error) throw error
  return data
}

// ─── SCORES ──────────────────────────────────────────────────────────────────
export async function fetchScoresMK01(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return []

  // Charger scores avec membres
  const { data: scoresData, error: scoresErr } = await supabase
    .from('scores_bni')
    .select('*, membres(prenom, nom, societe, secteur_activite, date_renouvellement)')
    .eq('groupe_id', groupeId)
    .order('rank', { nullsLast: true })
  if (scoresErr) throw scoresErr

  // Charger membres sans score
  const scoredIds = (scoresData || []).map(s => s.membre_id)
  const { data: membresData } = await supabase
    .from('membres')
    .select('id, prenom, nom, societe, secteur_activite, date_renouvellement')
    .eq('groupe_id', groupeId)
    .eq('statut', 'actif')

  const unscored = (membresData || [])
    .filter(m => !scoredIds.includes(m.id))
    .map(m => ({
      membre_id: m.id,
      rank: null, total_score: null, traffic_light: null, tyfcb: null,
      attendance_rate: null, attendance_score: null, score_121: null, rate_121: null,
      referrals_given_score: null, referrals_given_rate: null,
      visitor_score: null, visitors: null, sponsor_score: null, sponsors: null,
      tyfcb_score: null, ceu_score: null, ceu_rate: null,
      membres: { prenom: m.prenom, nom: m.nom, societe: m.societe, secteur_activite: m.secteur_activite, date_renouvellement: m.date_renouvellement }
    }))

  return [...(scoresData || []), ...unscored]
}

// ─── INVITÉS ─────────────────────────────────────────────────────────────────
export async function fetchInvites(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return []
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('groupe_id', groupeId)
    .order('date_visite', { ascending: false })
  if (error) throw error
  return data || []
}

// ─── ALERTES ─────────────────────────────────────────────────────────────────
export async function fetchAlertes() {
  const { data, error } = await supabase
    .from('alertes')
    .select('*, membres(prenom, nom), groupes(code, nom)')
    .eq('lue', false)
    .order('niveau', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function marquerAlerteLue(id) {
  const { error } = await supabase.from('alertes').update({ lue: true }).eq('id', id)
  if (error) throw error
}

// ─── PALMS ───────────────────────────────────────────────────────────────────
export async function fetchPalmsMK01(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return []
  const { data, error } = await supabase
    .from('palms_imports')
    .select('*, membres(prenom, nom)')
    .eq('groupe_id', groupeId)
  if (error) throw error
  return data || []
}

// ─── PALMS HEBDO ────────────────────────────────────────────────────────────
export async function fetchMembresForMatch(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return []
  const { data } = await supabase.from('membres').select('id, prenom, nom').eq('groupe_id', groupeId).eq('statut', 'actif')
  return data || []
}

export async function insertPalmsHebdo(rows, dateReunion, nbReunions = 1, groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) throw new Error(`Groupe ${groupeCode} introuvable`)
  const records = rows.map(r => ({ ...r, groupe_id: groupeId, date_reunion: dateReunion, nb_reunions: nbReunions }))
  const { data, error } = await supabase.from('palms_hebdo').upsert(records, { onConflict: 'membre_id,date_reunion' })
  if (error) throw error
  return data
}

export async function fetchPalmsHebdoMois(mois, annee, groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return []
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finDate = new Date(annee, mois, 0)
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finDate.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('palms_hebdo')
    .select('*, membres(prenom, nom)')
    .eq('groupe_id', groupeId)
    .gte('date_reunion', debut)
    .lte('date_reunion', fin)
    .order('date_reunion')
  if (error) throw error
  return data || []
}

// ─── OBJECTIFS ───────────────────────────────────────────────────────────────
export async function fetchObjectifs(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return null
  const { data } = await supabase
    .from('objectifs')
    .select('*')
    .eq('groupe_id', groupeId)
    .order('annee', { ascending: false })
    .limit(1)
  return data?.[0] || null
}

// ─── TEMPLATES ───────────────────────────────────────────────────────────────
export async function fetchTemplates() {
  const { data, error } = await supabase.from('templates_messages').select('*').eq('actif', true)
  if (error) throw error
  return data || []
}

// ─── DASHBOARD KPIs ──────────────────────────────────────────────────────────
export async function fetchDashboardKPIs(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return null

  const troisMoisAvant = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0]
  const [membresRes, alertesRes, invitesRes, scoresRes, palmsRes, recontacterRes] = await Promise.all([
    supabase.from('membres').select('id, statut').eq('groupe_id', groupeId).eq('statut', 'actif'),
    supabase.from('alertes').select('id, niveau, type_alerte, titre, message, date_echeance').eq('lue', false),
    supabase.from('invites').select('id, statut').eq('groupe_id', groupeId),
    supabase.from('scores_bni').select('total_score, traffic_light, tyfcb, rank, attendance_rate, attendance_score, rate_121, score_121, referrals_given_rate, referrals_given_score, visitors, visitor_score, sponsors, sponsor_score, ceu_rate, ceu_score, tyfcb_score, membres(prenom, nom, societe, secteur_activite, date_renouvellement)').eq('groupe_id', groupeId),
    supabase.from('palms_imports').select('presences, absences').eq('groupe_id', groupeId),
    supabase.from('invites').select('id, prenom, nom, statut, date_visite, profession, societe').eq('groupe_id', groupeId).eq('statut', 'A recontacter').gte('date_visite', troisMoisAvant).order('date_visite'),
  ])

  const membres = membresRes.data || []
  const recontacter = (recontacterRes.data || []).map(r => ({
    id: r.id, niveau: 'relance', type_alerte: 'recontact',
    titre: `Recontacter ${r.prenom} ${r.nom}`,
    message: `${r.profession || r.societe || 'Invité'} — visite le ${r.date_visite ? new Date(r.date_visite+'T12:00:00').toLocaleDateString('fr-FR') : '?'}. À relancer.`,
    date_echeance: null,
  }))
  const alertes = [...(alertesRes.data || []), ...recontacter]
  const invites = invitesRes.data || []
  const scores  = scoresRes.data  || []
  const palms   = palmsRes.data   || []

  // TYFCB
  const tyfcb = scores.reduce((s, r) => s + (Number(r.tyfcb) || 0), 0)

  // Taux présence
  const presTotal = palms.reduce((s, r) => s + (r.presences || 0), 0)
  const absTotal  = palms.reduce((s, r) => s + (r.absences  || 0), 0)
  const pRate = presTotal + absTotal > 0 ? Math.round(presTotal / (presTotal + absTotal) * 100) : 0

  // Traffic light
  const tlCounts = { vert: 0, orange: 0, rouge: 0, gris: 0 }
  scores.forEach(s => { if (s.traffic_light && tlCounts[s.traffic_light] !== undefined) tlCounts[s.traffic_light]++ })

  // Invités stats
  const CONVERTIS_STATUTS = ['Devenu Membre']
  const MEMBRES_BNI_STATUTS = ['Membre BNI']
  const INACTIFS_STATUTS  = ['Pas intéressé pour le moment', 'Injoignable', 'Pas de budget pour le moment', 'absente']

  const invitesConvertis = invites.filter(i => CONVERTIS_STATUTS.includes(i.statut)).length
  const invitesMembresBNI = invites.filter(i => MEMBRES_BNI_STATUTS.includes(i.statut)).length
  const invitesEnCours   = invites.filter(i => i.statut && !CONVERTIS_STATUTS.includes(i.statut) && !MEMBRES_BNI_STATUTS.includes(i.statut) && !INACTIFS_STATUTS.includes(i.statut)).length

  return {
    membresActifs: membres.length,
    alertesCount: alertes.length,
    recontacterCount: recontacter.length,
    alertes,
    tyfcb,
    pRate,
    tlCounts,
    invitesTotal: invites.length,
    invitesConvertis,
    invitesMembresBNI,
    invitesEnCours,
    scores,
    palms,
  }
}

// ─── ADMIN USERS ────────────────────────────────────────────────────────────
export async function fetchUsers() {
  const { data, error } = await supabase
    .from('profils')
    .select('id, prenom, nom, email, role, titre, telephone, actif, groupe_id, created_at, groupes(nom, code)')
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function createUser(params) {
  const { data, error } = await supabase.functions.invoke('manage-users', {
    body: { action: 'create', ...params }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function deleteUser(userId) {
  const { data, error } = await supabase.functions.invoke('manage-users', {
    body: { action: 'delete', user_id: userId }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function toggleUserActive(userId, actif) {
  const { data, error } = await supabase.functions.invoke('manage-users', {
    body: { action: 'toggle', user_id: userId, actif }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function resetUserPassword(userId, password) {
  const { data, error } = await supabase.functions.invoke('manage-users', {
    body: { action: 'reset_password', user_id: userId, password }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// ─── GOOGLE SHEETS SYNC ─────────────────────────────────────────────────────
export async function readGoogleSheet() {
  const { data, error } = await supabase.functions.invoke('sync-invites', {
    body: { action: 'read' }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function syncSheetToSupabase(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) throw new Error('Groupe introuvable')

  const sheetData = await readGoogleSheet()
  const rows = sheetData.values || []
  if (rows.length < 2) throw new Error('Sheet vide')

  const headers = rows[0].map(h => h.trim().toLowerCase())
  let synced = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length < 3) continue
    const prenom = (r[headers.indexOf('prénom')] || r[headers.indexOf('prénom ')] || '').trim()
    const nom = (r[headers.indexOf('nom')] || '').trim()
    if (!prenom && !nom) continue

    const dateStr = r[headers.indexOf('date')] || ''
    let dateVisite = null
    if (dateStr) {
      const parts = dateStr.split('/')
      if (parts.length === 3) dateVisite = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
    }

    const inviteData = {
      groupe_id: groupeId,
      prenom, nom,
      societe: r[headers.indexOf('société')] || null,
      profession: r[headers.indexOf('profession')] || null,
      telephone: r[headers.indexOf('téléphone')] || null,
      invite_par_nom: r[headers.indexOf('invité par')] || null,
      type_visite: r[headers.indexOf('type')] || null,
      statut: r[headers.indexOf('statut')] || null,
      membre_ca_charge_nom: r[headers.indexOf('membre ca en charge')] || null,
      commentaires: r[headers.indexOf('commentaires')] || null,
      date_visite: dateVisite,
    }

    // Upsert par prenom+nom+date
    const { data: existing } = await supabase.from('invites')
      .select('id').eq('groupe_id', groupeId)
      .ilike('prenom', prenom).ilike('nom', nom).limit(1)

    if (existing?.length) {
      await supabase.from('invites').update(inviteData).eq('id', existing[0].id)
    } else {
      await supabase.from('invites').insert(inviteData)
    }
    synced++
  }
  return { synced, total: rows.length - 1 }
}

export async function writeInviteToSheet(invite) {
  const row = [
    invite.date_visite ? new Date(invite.date_visite).toLocaleDateString('fr-FR') : '',
    invite.prenom || '', invite.nom || '', invite.societe || '',
    invite.profession || '', invite.telephone || '', invite.invite_par_nom || '',
    invite.type_visite || '', invite.statut || '', invite.membre_ca_charge_nom || '',
    invite.commentaires || ''
  ]
  const { data, error } = await supabase.functions.invoke('sync-invites', {
    body: { action: 'write_row', row }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// ─── MONTHLY SNAPSHOTS ──────────────────────────────────────────────────────
export async function cloturerMois(mois, annee, userId, groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) throw new Error('Groupe introuvable')
  const hebdo = await fetchPalmsHebdoMois(mois, annee, groupeCode)
  const membres = await fetchMembresForMatch(groupeCode)
  const map = {}
  hebdo.filter(r => r.membre_id).forEach(r => {
    if (!map[r.membre_id]) map[r.membre_id] = { tat:0, refs:0, invites:0, mpb:0, ueg:0, presences:0, absences:0 }
    const m = map[r.membre_id]
    m.tat += r.tat || 0; m.refs += (r.rdi||0)+(r.rde||0); m.invites += r.invites||0
    m.mpb += Number(r.mpb)||0; m.ueg += r.ueg||0
    if (r.palms === 'P') m.presences += r.nb_reunions||1; else m.absences += r.nb_reunions||1
  })
  const snapshots = membres.map(mb => {
    const d = map[mb.id] || { tat:0, refs:0, invites:0, mpb:0, ueg:0, presences:0, absences:0 }
    return { groupe_id:groupeId, membre_id:mb.id, mois, annee, total_tat:d.tat, total_refs:d.refs, total_invites:d.invites, total_mpb:d.mpb, total_ueg:d.ueg, presences:d.presences, absences:d.absences, cloture_par:userId }
  })
  const { error } = await supabase.from('monthly_snapshots').upsert(snapshots, { onConflict:'membre_id,mois,annee' })
  if (error) throw error
  return { count: snapshots.length }
}

export async function fetchMonthlySnapshots(mois, annee, groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return []
  const { data, error } = await supabase.from('monthly_snapshots').select('*, membres(prenom, nom)').eq('groupe_id', groupeId).eq('mois', mois).eq('annee', annee)
  if (error) throw error
  return data || []
}

export async function fetchAllSnapshots(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) return []
  const { data, error } = await supabase.from('monthly_snapshots').select('mois, annee, cloture_at').eq('groupe_id', groupeId).order('annee',{ascending:false}).order('mois',{ascending:false})
  if (error) throw error
  const seen = new Set()
  return (data||[]).filter(d => { const k=`${d.annee}-${d.mois}`; if(seen.has(k))return false; seen.add(k); return true })
}
