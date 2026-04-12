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
export async function fetchScoresMK01() {
  const groupeId = await getGroupeId('MK-01')
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
export async function fetchPalmsMK01() {
  const groupeId = await getGroupeId('MK-01')
  if (!groupeId) return []
  const { data, error } = await supabase
    .from('palms_imports')
    .select('*, membres(prenom, nom)')
    .eq('groupe_id', groupeId)
  if (error) throw error
  return data || []
}

// ─── PALMS HEBDO ────────────────────────────────────────────────────────────
export async function fetchMembresForMatch() {
  const groupeId = await getGroupeId('MK-01')
  if (!groupeId) return []
  const { data } = await supabase.from('membres').select('id, prenom, nom').eq('groupe_id', groupeId).eq('statut', 'actif')
  return data || []
}

export async function insertPalmsHebdo(rows, dateReunion, nbReunions = 1) {
  const groupeId = await getGroupeId('MK-01')
  if (!groupeId) throw new Error('Groupe MK-01 introuvable')
  const records = rows.map(r => ({ ...r, groupe_id: groupeId, date_reunion: dateReunion, nb_reunions: nbReunions }))
  const { data, error } = await supabase.from('palms_hebdo').upsert(records, { onConflict: 'membre_id,date_reunion' })
  if (error) throw error
  return data
}

export async function fetchPalmsHebdoMois(mois, annee) {
  const groupeId = await getGroupeId('MK-01')
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
export async function fetchDashboardKPIs() {
  const groupeId = await getGroupeId('MK-01')
  if (!groupeId) return null

  const [membresRes, alertesRes, invitesRes, scoresRes, palmsRes] = await Promise.all([
    supabase.from('membres').select('id, statut').eq('groupe_id', groupeId).eq('statut', 'actif'),
    supabase.from('alertes').select('id, niveau, type_alerte, titre, message, date_echeance').eq('lue', false),
    supabase.from('invites').select('id, statut').eq('groupe_id', groupeId),
    supabase.from('scores_bni').select('total_score, traffic_light, tyfcb, rank, attendance_rate, attendance_score, rate_121, score_121, referrals_given_rate, referrals_given_score, visitors, visitor_score, sponsors, sponsor_score, ceu_rate, ceu_score, tyfcb_score, membres(prenom, nom, societe, secteur_activite, date_renouvellement)').eq('groupe_id', groupeId),
    supabase.from('palms_imports').select('presences, absences').eq('groupe_id', groupeId),
  ])

  const membres = membresRes.data || []
  const alertes = alertesRes.data || []
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
