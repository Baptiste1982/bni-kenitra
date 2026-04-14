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

// ─── RECALCUL SCORES BNI ────────────────────────────────────────────────────
// Recalcule scores_bni : PALMS Excel (base) + palms_hebdo post-période (compilation)
// Visiteurs : table invites sur 6 mois glissants
// Applique le barème BNI officiel
export async function recalculateScores(groupeCode = 'MK-01') {
  const groupeId = await getGroupeId(groupeCode)
  if (!groupeId) throw new Error('Groupe introuvable')

  const countJeudis = (from, to) => {
    let count = 0
    const d = new Date(from + 'T12:00:00')
    const end = new Date(to + 'T12:00:00')
    while (d <= end) { if (d.getDay() === 4) count++; d.setDate(d.getDate() + 1) }
    return count
  }

  // 1. Charger palms_imports (base Excel) pour ce groupe
  const { data: palms, error: pErr } = await supabase
    .from('palms_imports')
    .select('*')
    .eq('groupe_id', groupeId)
  if (pErr) throw pErr
  if (!palms?.length) throw new Error('Aucune donnée PALMS importée')

  // 2. Déterminer la période PALMS et la date d'import (point de coupure)
  const periodeDebut = palms[0]?.periode_debut
  const periodeFin = palms[0]?.periode_fin
  const aujourdHui = new Date().toISOString().split('T')[0]
  // La date d'import = dernier jour couvert par le PALMS Excel
  const palmsImportDate = palms[0]?.created_at ? new Date(palms[0].created_at).toISOString().split('T')[0] : periodeFin

  // 3. Charger palms_hebdo APRÈS la date d'import PALMS (données compilées qui s'ajoutent)
  const { data: hebdoData } = await supabase
    .from('palms_hebdo')
    .select('membre_id, palms, rdi, rde, rri, rre, invites, tat, mpb, ueg, nb_reunions, date_reunion')
    .eq('groupe_id', groupeId)
    .gt('date_reunion', palmsImportDate)

  // Agréger hebdo par membre
  const hebdoAgg = {}
  ;(hebdoData || []).forEach(h => {
    if (!h.membre_id) return
    if (!hebdoAgg[h.membre_id]) hebdoAgg[h.membre_id] = { presences:0, absences:0, tat:0, rdi:0, rde:0, rri:0, rre:0, mpb:0, ueg:0, reunions:0 }
    const a = hebdoAgg[h.membre_id]
    const nb = h.nb_reunions || 1
    if (h.palms === 'P') a.presences += nb
    else if (h.palms === 'A') a.absences += nb
    a.tat += h.tat || 0
    a.rdi += h.rdi || 0
    a.rde += h.rde || 0
    a.rri += h.rri || 0
    a.rre += h.rre || 0
    a.mpb += Number(h.mpb) || 0
    a.ueg += h.ueg || 0
    a.reunions += nb
  })

  // Nombre total de jeudis : du début PALMS jusqu'à aujourd'hui (période combinée)
  const nbSemaines = countJeudis(periodeDebut, aujourdHui) || 1
  const nbSemainesPalms = countJeudis(periodeDebut, periodeFin) || 1
  const nbSemainesHebdo = Object.values(hebdoAgg).length > 0 ? countJeudis(palmsImportDate, aujourdHui) : 0
  console.log(`[recalculateScores] Période: ${periodeDebut} → ${aujourdHui} (${nbSemaines} jeudis total, PALMS importé le ${palmsImportDate}, ${nbSemainesHebdo} jeudis hebdo compilés)`)

  // 4. Charger scores existants pour récupérer sponsors
  const { data: existingScores } = await supabase
    .from('scores_bni')
    .select('membre_id, sponsors, sponsor_score')
    .eq('groupe_id', groupeId)
  const sponsorMap = {}
  ;(existingScores || []).forEach(s => { sponsorMap[s.membre_id] = { sponsors: s.sponsors || 0, score: Number(s.sponsor_score) || 0 } })

  // 5. Charger les membres pour matcher invite_par_nom → membre_id
  const { data: membres } = await supabase
    .from('membres')
    .select('id, prenom, nom')
    .eq('groupe_id', groupeId)

  // 6. Visiteurs : 6 mois glissants depuis la table invites
  const sixMoisAvant = new Date()
  sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6)
  const sixMoisStr = sixMoisAvant.toISOString().split('T')[0]
  const { data: invitesData } = await supabase
    .from('invites')
    .select('invite_par_nom, date_visite')
    .eq('groupe_id', groupeId)
    .gte('date_visite', sixMoisStr)

  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const visitorsPerMembre = {}
  ;(invitesData || []).forEach(inv => {
    if (!inv.invite_par_nom) return
    const invNorm = norm(inv.invite_par_nom)
    const membre = (membres || []).find(m => {
      const mPrenom = norm(m.prenom), mNom = norm(m.nom)
      const fullA = `${mPrenom} ${mNom}`, fullB = `${mNom} ${mPrenom}`
      if (invNorm === fullA || invNorm === fullB) return true
      if (invNorm.includes(mNom) && invNorm.includes(mPrenom)) return true
      if (mPrenom.length >= 3 && invNorm.includes(mNom) && invNorm.includes(mPrenom.slice(0, 3))) return true
      return false
    })
    if (membre) {
      visitorsPerMembre[membre.id] = (visitorsPerMembre[membre.id] || 0) + 1
    }
  })
  console.log('[recalculateScores] Visiteurs 6 mois glissants:', visitorsPerMembre)

  // 7. Calculer les scores : PALMS base + hebdo compilé
  const scored = palms.map(p => {
    const h = hebdoAgg[p.membre_id] || { presences:0, absences:0, tat:0, rdi:0, rde:0, rri:0, rre:0, mpb:0, ueg:0 }

    // Cumuler PALMS + hebdo
    const presences = (p.presences || 0) + h.presences
    const absences = (p.absences || 0) + h.absences
    const totalReunions = presences + absences
    const tat = (Number(p.tat) || 0) + h.tat
    const refsGiven = (p.rdi || 0) + (p.rde || 0) + h.rdi + h.rde
    const tyfcb = (Number(p.mpb) || 0) + h.mpb
    const ueg = (p.ueg || 0) + h.ueg

    // Taux sur la période totale combinée
    const attendanceRate = totalReunions > 0 ? presences / totalReunions : 0
    const rateTat = tat / nbSemaines
    const rateRefs = refsGiven / nbSemaines
    const rateUeg = ueg / nbSemaines
    // Visiteurs : 6 mois glissants depuis table invites
    const visitors = visitorsPerMembre[p.membre_id] || 0

    // Barème BNI
    const attendanceScore = attendanceRate >= 0.95 ? 10 : attendanceRate >= 0.88 ? 5 : 0
    const score121 = rateTat >= 1 ? 20 : rateTat >= 0.75 ? 15 : rateTat >= 0.5 ? 10 : rateTat >= 0.25 ? 5 : 0
    const refsScore = rateRefs >= 1.25 ? 25 : rateRefs >= 1 ? 20 : rateRefs >= 0.75 ? 15 : rateRefs >= 0.50 ? 10 : rateRefs >= 0.25 ? 5 : 0
    const visitorScore = visitors >= 5 ? 25 : visitors >= 4 ? 20 : visitors >= 3 ? 15 : visitors >= 2 ? 10 : visitors >= 1 ? 5 : 0
    const tyfcbK = tyfcb / 1000
    const tyfcbScore = tyfcbK >= 30 ? 5 : tyfcbK >= 15 ? 4 : tyfcbK >= 5 ? 3 : tyfcbK >= 2 ? 2 : tyfcb > 0 ? 1 : 0
    const ceuScore = rateUeg > 0.5 ? 10 : rateUeg > 0 ? 5 : 0
    const sp = sponsorMap[p.membre_id] || { sponsors: 0, score: 0 }

    const totalScore = attendanceScore + score121 + refsScore + visitorScore + tyfcbScore + ceuScore + sp.score
    const trafficLight = totalScore >= 70 ? 'vert' : totalScore >= 50 ? 'orange' : totalScore >= 30 ? 'rouge' : 'gris'

    return {
      membre_id: p.membre_id,
      groupe_id: groupeId,
      total_score: totalScore,
      traffic_light: trafficLight,
      attendance_rate: attendanceRate,
      attendance_score: attendanceScore,
      rate_121: rateTat,
      score_121: score121,
      referrals_given_rate: rateRefs,
      referrals_given_score: refsScore,
      visitors,
      visitor_score: visitorScore,
      tyfcb,
      tyfcb_score: tyfcbScore,
      ceu_rate: rateUeg,
      ceu_score: ceuScore,
      sponsors: sp.sponsors,
      sponsor_score: sp.score,
      periode_debut: periodeDebut,
      periode_fin: aujourdHui,
    }
  })

  // 8. Trier par score et attribuer les rangs
  scored.sort((a, b) => b.total_score - a.total_score || a.attendance_rate - b.attendance_rate)
  scored.forEach((s, i) => { s.rank = i + 1 })

  // 9. Upsert dans scores_bni
  const { error: uErr } = await supabase
    .from('scores_bni')
    .upsert(scored, { onConflict: 'membre_id' })
  if (uErr) throw uErr

  return { count: scored.length, nbSemaines, nbSemainesHebdo, periodeDebut, periodeFin: aujourdHui }
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

// ─── REGION KPIs ────────────────────────────────────────────────────────────
export async function fetchRegionKPIs() {
  // Charger tous les groupes
  const { data: groupes } = await supabase.from('groupes').select('id, code, nom').order('code')
  if (!groupes?.length) return null

  const groupeIds = groupes.map(g => g.id)
  const troisMoisAvant = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0]

  const [membresRes, scoresRes, palmsRes, invitesRes, hebdoRes] = await Promise.all([
    supabase.from('membres').select('id, groupe_id, statut, prenom, nom, created_at').in('groupe_id', groupeIds).eq('statut', 'actif'),
    supabase.from('scores_bni').select('groupe_id, total_score, traffic_light, tyfcb, attendance_rate, rate_121, referrals_given_rate, visitors, sponsors, ceu_rate, membres(prenom, nom)').in('groupe_id', groupeIds),
    supabase.from('palms_imports').select('groupe_id, presences, absences, rdi, rde, rri, rre, tat, mpb, invites, membre_id').in('groupe_id', groupeIds),
    supabase.from('invites').select('id, groupe_id, statut').in('groupe_id', groupeIds),
    supabase.from('palms_hebdo').select('groupe_id, tat, rdi, rde, invites, mpb, membre_id').in('groupe_id', groupeIds),
  ])

  const membres = membresRes.data || []
  const scores = scoresRes.data || []
  const palms = palmsRes.data || []
  const invites = invitesRes.data || []

  const CONVERTIS_STATUTS = ['Devenu Membre']
  const MEMBRES_BNI_STATUTS = ['Membre BNI']
  const INACTIFS_STATUTS = ['Pas intéressé pour le moment', 'Injoignable', 'Pas de budget pour le moment', 'absente']

  const byGroupe = {}
  groupes.forEach(g => {
    const gMembres = membres.filter(m => m.groupe_id === g.id)
    const gScores = scores.filter(s => s.groupe_id === g.id)
    const gPalms = palms.filter(p => p.groupe_id === g.id)
    const gInvites = invites.filter(i => i.groupe_id === g.id)

    const presTotal = gPalms.reduce((s, r) => s + (r.presences || 0), 0)
    const absTotal = gPalms.reduce((s, r) => s + (r.absences || 0), 0)
    const pRate = presTotal + absTotal > 0 ? Math.round(presTotal / (presTotal + absTotal) * 100) : 0

    const tyfcb = gScores.reduce((s, r) => s + (Number(r.tyfcb) || 0), 0)
    const totalRDI = gPalms.reduce((s, r) => s + (r.rdi || 0), 0)
    const totalRDE = gPalms.reduce((s, r) => s + (r.rde || 0), 0)
    const totalRRI = gPalms.reduce((s, r) => s + (r.rri || 0), 0)
    const totalRRE = gPalms.reduce((s, r) => s + (r.rre || 0), 0)
    const totalTaT = gPalms.reduce((s, r) => s + (Number(r.tat) || 0), 0)
    const totalMPB = gPalms.reduce((s, r) => s + (Number(r.mpb) || 0), 0)
    const totalInvites = gPalms.reduce((s, r) => s + (r.invites || 0), 0)

    const tlCounts = { vert: 0, orange: 0, rouge: 0, gris: 0 }
    gScores.forEach(s => { if (s.traffic_light && tlCounts[s.traffic_light] !== undefined) tlCounts[s.traffic_light]++ })

    const scoreMoyen = gScores.length > 0 ? Math.round(gScores.reduce((s, r) => s + (Number(r.total_score) || 0), 0) / gScores.length) : 0
    const zoneRouge = gScores.filter(s => s.traffic_light === 'rouge').length

    const invitesConvertis = gInvites.filter(i => CONVERTIS_STATUTS.includes(i.statut)).length
    const invitesEnCours = gInvites.filter(i => i.statut && !CONVERTIS_STATUTS.includes(i.statut) && !MEMBRES_BNI_STATUTS.includes(i.statut) && !INACTIFS_STATUTS.includes(i.statut)).length

    byGroupe[g.code] = {
      code: g.code, nom: g.nom,
      membresActifs: gMembres.length,
      pRate, tyfcb,
      totalRDI, totalRDE, totalRRI, totalRRE,
      totalRecos: totalRDI + totalRDE + totalRRI + totalRRE,
      recosParMembre: gMembres.length > 0 ? ((totalRDI + totalRDE + totalRRI + totalRRE) / gMembres.length).toFixed(1) : '0',
      totalTaT, totalMPB, totalInvites,
      invitesParMembre: gMembres.length > 0 ? (totalInvites / gMembres.length).toFixed(1) : '0',
      tlCounts, scoreMoyen, zoneRouge,
      invitesConvertis, invitesEnCours, invitesTotal: gInvites.length,
      scores: gScores,
    }
  })

  // Totaux régionaux
  const totalMembres = membres.length
  const presTotal = palms.reduce((s, r) => s + (r.presences || 0), 0)
  const absTotal = palms.reduce((s, r) => s + (r.absences || 0), 0)
  const pRateRegion = presTotal + absTotal > 0 ? Math.round(presTotal / (presTotal + absTotal) * 100) : 0
  const tyfcbRegion = scores.reduce((s, r) => s + (Number(r.tyfcb) || 0), 0)
  const totalRecosRegion = palms.reduce((s, r) => s + (r.rdi||0) + (r.rde||0) + (r.rri||0) + (r.rre||0), 0)
  const totalTaTRegion = palms.reduce((s, r) => s + (Number(r.tat) || 0), 0)
  const totalMPBRegion = palms.reduce((s, r) => s + (Number(r.mpb) || 0), 0)
  const totalInvitesRegion = palms.reduce((s, r) => s + (r.invites || 0), 0)
  const scoreMoyenRegion = scores.length > 0 ? Math.round(scores.reduce((s, r) => s + (Number(r.total_score) || 0), 0) / scores.length) : 0
  const zoneRougeRegion = scores.filter(s => s.traffic_light === 'rouge').length

  const tlCountsRegion = { vert: 0, orange: 0, rouge: 0, gris: 0 }
  scores.forEach(s => { if (s.traffic_light && tlCountsRegion[s.traffic_light] !== undefined) tlCountsRegion[s.traffic_light]++ })

  const invitesConvertisRegion = invites.filter(i => CONVERTIS_STATUTS.includes(i.statut)).length
  const invitesEnCoursRegion = invites.filter(i => i.statut && !CONVERTIS_STATUTS.includes(i.statut) && !MEMBRES_BNI_STATUTS.includes(i.statut) && !INACTIFS_STATUTS.includes(i.statut)).length

  // Top 5 membres région par score
  const topScoresRegion = [...scores].filter(s => s.total_score).sort((a,b) => Number(b.total_score) - Number(a.total_score)).slice(0, 5).map((s, i) => ({
    ...s, rank: i + 1,
    groupeCode: groupes.find(g => g.id === s.groupe_id)?.code || '?'
  }))

  // Top 5 TYFCB
  const topTyfcbRegion = [...scores].filter(s => Number(s.tyfcb) > 0).sort((a,b) => Number(b.tyfcb) - Number(a.tyfcb)).slice(0, 5).map(s => ({
    ...s, groupeCode: groupes.find(g => g.id === s.groupe_id)?.code || '?'
  }))

  // Top recos (from palms)
  const recosByMembre = {}
  palms.forEach(p => {
    if (!recosByMembre[p.membre_id]) recosByMembre[p.membre_id] = { total: 0, groupe_id: p.groupe_id }
    recosByMembre[p.membre_id].total += (p.rdi||0) + (p.rde||0) + (p.rri||0) + (p.rre||0)
  })
  const topRecosRegion = Object.entries(recosByMembre)
    .sort((a,b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([mid, d]) => {
      const m = membres.find(m => m.id === mid)
      return { membre_id: mid, prenom: m?.prenom, nom: m?.nom, total: d.total, groupeCode: groupes.find(g => g.id === d.groupe_id)?.code || '?' }
    })

  // Top TaT
  const tatByMembre = {}
  palms.forEach(p => {
    if (!tatByMembre[p.membre_id]) tatByMembre[p.membre_id] = { total: 0, groupe_id: p.groupe_id }
    tatByMembre[p.membre_id].total += Number(p.tat) || 0
  })
  const topTaTRegion = Object.entries(tatByMembre)
    .sort((a,b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([mid, d]) => {
      const m = membres.find(m => m.id === mid)
      return { membre_id: mid, prenom: m?.prenom, nom: m?.nom, total: d.total, groupeCode: groupes.find(g => g.id === d.groupe_id)?.code || '?' }
    })

  // Top invités
  const invByMembre = {}
  palms.forEach(p => {
    if (!invByMembre[p.membre_id]) invByMembre[p.membre_id] = { total: 0, groupe_id: p.groupe_id }
    invByMembre[p.membre_id].total += p.invites || 0
  })
  const topInvitesRegion = Object.entries(invByMembre)
    .sort((a,b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([mid, d]) => {
      const m = membres.find(m => m.id === mid)
      return { membre_id: mid, prenom: m?.prenom, nom: m?.nom, total: d.total, groupeCode: groupes.find(g => g.id === d.groupe_id)?.code || '?' }
    })

  return {
    groupes, byGroupe,
    totalMembres, pRateRegion, tyfcbRegion,
    totalRecosRegion, totalTaTRegion, totalMPBRegion, totalInvitesRegion,
    scoreMoyenRegion, zoneRougeRegion, tlCountsRegion,
    invitesConvertisRegion, invitesEnCoursRegion, invitesTotalRegion: invites.length,
    topScoresRegion, topTyfcbRegion, topRecosRegion, topTaTRegion, topInvitesRegion,
    recosParMembreRegion: totalMembres > 0 ? (totalRecosRegion / totalMembres).toFixed(1) : '0',
    invitesParMembreRegion: totalMembres > 0 ? (totalInvitesRegion / totalMembres).toFixed(1) : '0',
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
