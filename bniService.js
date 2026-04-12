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
  const { data, error } = await supabase
    .from('scores_bni')
    .select('*, membres(prenom, nom, societe, secteur_activite, date_renouvellement)')
    .eq('groupe_id', groupeId)
    .order('rank', { nullsLast: true })
  if (error) throw error
  return data || []
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
    supabase.from('scores_bni').select('total_score, traffic_light, tyfcb').eq('groupe_id', groupeId),
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
  const CONVERTIS_STATUTS = ['Devenu Membre', 'Membre BNI']
  const INACTIFS_STATUTS  = ['Pas intéressé pour le moment', 'Injoignable', 'Pas de budget pour le moment', 'absente']

  const invitesConvertis = invites.filter(i => CONVERTIS_STATUTS.includes(i.statut)).length
  const invitesEnCours   = invites.filter(i => i.statut && !CONVERTIS_STATUTS.includes(i.statut) && !INACTIFS_STATUTS.includes(i.statut)).length

  return {
    membresActifs: membres.length,
    alertesCount: alertes.length,
    alertes,
    tyfcb,
    pRate,
    tlCounts,
    invitesTotal: invites.length,
    invitesConvertis,
    invitesEnCours,
    scores,
    palms,
  }
}
