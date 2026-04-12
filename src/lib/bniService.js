import { supabase } from './supabase'

// ─── GROUPES ─────────────────────────────────────────────────────────────────
export async function fetchGroupes() {
  const { data, error } = await supabase
    .from('groupes')
    .select('*')
    .order('code')
  if (error) throw error
  return data
}

// ─── MEMBRES ─────────────────────────────────────────────────────────────────
export async function fetchMembres(groupeCode = 'MK-01') {
  const { data, error } = await supabase
    .from('membres')
    .select(`
      *,
      groupes!inner(code, nom),
      scores_bni(rank, total_score, traffic_light, tyfcb, tyfcb_score, visitors, referrals_given_rate, rate_121, attendance_rate, attendance_score, periode_debut, periode_fin)
    `)
    .eq('groupes.code', groupeCode)
    .order('nom')
  if (error) throw error
  return data
}

export async function fetchMembresWithScores() {
  const { data, error } = await supabase
    .from('membres')
    .select(`
      id, prenom, nom, societe, secteur_activite, statut, date_renouvellement,
      groupes(code, nom),
      scores_bni(rank, total_score, traffic_light, tyfcb, visitors, referrals_given_score, attendance_rate, rate_121)
    `)
    .eq('statut', 'actif')
    .order('nom')
  if (error) throw error
  return data
}

// ─── SCORES / PALMS ──────────────────────────────────────────────────────────
export async function fetchScoresMK01() {
  const { data, error } = await supabase
    .from('scores_bni')
    .select(`
      *, 
      membres(prenom, nom, societe, secteur_activite, date_renouvellement, groupes(code))
    `)
    .order('rank', { nullsLast: true })
  if (error) throw error
  return data?.filter(s => s.membres?.groupes?.code === 'MK-01') || []
}

export async function fetchPalmsMK01() {
  const { data, error } = await supabase
    .from('palms_imports')
    .select(`*, membres(prenom, nom, groupes(code))`)
  if (error) throw error
  return data?.filter(p => p.membres?.groupes?.code === 'MK-01') || []
}

// ─── ALERTES ─────────────────────────────────────────────────────────────────
export async function fetchAlertes() {
  const { data, error } = await supabase
    .from('alertes')
    .select(`*, membres(prenom, nom), groupes(code, nom)`)
    .eq('lue', false)
    .order('niveau', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function marquerAlerteLue(id) {
  const { error } = await supabase
    .from('alertes')
    .update({ lue: true })
    .eq('id', id)
  if (error) throw error
}

// ─── INVITÉS ─────────────────────────────────────────────────────────────────
export async function fetchInvites(groupeCode = 'MK-01') {
  const { data, error } = await supabase
    .from('invites')
    .select(`*, groupes(code, nom)`)
    .order('date_visite', { ascending: false })
  if (error) throw error
  return data?.filter(i => i.groupes?.code === groupeCode) || []
}

// ─── KPIs DASHBOARD ──────────────────────────────────────────────────────────
export async function fetchDashboardKPIs() {
  const [membresRes, alertesRes, invitesRes, scoresRes, palmsRes] = await Promise.all([
    supabase.from('membres').select('id, statut, groupes!inner(code)').eq('groupes.code', 'MK-01').eq('statut', 'actif'),
    supabase.from('alertes').select('id, niveau, type_alerte, titre, message, date_echeance').eq('lue', false),
    supabase.from('invites').select('id, statut, groupes(code)'),
    supabase.from('scores_bni').select('total_score, traffic_light, tyfcb, membres(groupes(code))'),
    supabase.from('palms_imports').select('presences, absences, membres(groupes(code))')
  ])

  const membres = membresRes.data || []
  const alertes = alertesRes.data || []
  const invites = invitesRes.data?.filter(i => i.groupes?.code === 'MK-01') || []
  const scores = scoresRes.data?.filter(s => s.membres?.groupes?.code === 'MK-01') || []
  const palms = palmsRes.data?.filter(p => p.membres?.groupes?.code === 'MK-01') || []

  const tyfcb = scores.reduce((s, r) => s + (Number(r.tyfcb) || 0), 0)
  const presTotal = palms.reduce((s, r) => s + (r.presences || 0), 0)
  const absTotal = palms.reduce((s, r) => s + (r.absences || 0), 0)
  const pRate = presTotal + absTotal > 0 ? Math.round(presTotal / (presTotal + absTotal) * 100) : 0

  const tlCounts = { vert: 0, orange: 0, rouge: 0, gris: 0 }
  scores.forEach(s => { if (s.traffic_light && tlCounts[s.traffic_light] !== undefined) tlCounts[s.traffic_light]++ })

  const invitesMK01 = invites
  const invitesEnCours = invitesMK01.filter(i => i.statut && !['Devenu Membre','Pas intéressé pour le moment','Injoignable'].includes(i.statut)).length
  const invitesConvertis = invitesMK01.filter(i => i.statut === 'Devenu Membre').length

  return {
    membresActifs: membres.length,
    alertesCount: alertes.length,
    alertes,
    tyfcb,
    pRate,
    tlCounts,
    invitesTotal: invitesMK01.length,
    invitesEnCours,
    invitesConvertis,
    scores,
    palms
  }
}

// ─── OBJECTIFS ───────────────────────────────────────────────────────────────
export async function fetchObjectifs(groupeCode = 'MK-01') {
  const { data, error } = await supabase
    .from('objectifs')
    .select('*, groupes(code)')
    .order('annee', { ascending: false })
    .order('trimestre', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] || null
}

// ─── TEMPLATES ───────────────────────────────────────────────────────────────
export async function fetchTemplates() {
  const { data, error } = await supabase
    .from('templates_messages')
    .select('*')
    .eq('actif', true)
  if (error) throw error
  return data
}
