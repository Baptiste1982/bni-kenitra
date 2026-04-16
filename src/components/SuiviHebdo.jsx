import React, { useState, useEffect, useRef } from 'react'
import { fetchMembresForMatch, insertPalmsHebdo, fetchPalmsHebdoMois, recalculateScores, fetchScoresMK01 } from '../lib/bniService'
import { supabase } from '../lib/supabase'
import { PageHeader, SectionTitle, TableWrap, Card, Spinner, AccordionPanel, fullName } from './ui'
import MembreDetail from './MembreDetail'

// Mapping des entêtes PALMS → noms internes
// Supporte :
//  - colonne unique "PALMS" (ancien format)
//  - 5 colonnes séparées "P" "A" "L" "M" "S" (format PALMS moderne)
const HEADERS_MAP = {
  'Prénom': 'prenom', 'Nom': 'nom',
  'PALMS': 'palms',
  'P': 'p', 'A': 'a', 'L': 'l', 'M': 'm', 'S': 's',
  'RDI': 'rdi', 'RDE': 'rde', 'RRI': 'rri', 'RRE': 'rre',
  'Inv.': 'invites', 'Inv': 'invites',
  'TàT': 'tat',
  'MPB': 'mpb',
  'UEG': 'ueg',
}

// Objectifs mensuels (4 réunions/mois)

function normalize(s) { return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

// Snap une date au jeudi de la même semaine (jour de réunion BNI)
function snapToThursday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0=dim, 1=lun, ..., 4=jeu
  const offset = 4 - day // jours jusqu'au jeudi (négatif = après jeudi)
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function matchMembre(prenom, nom, membres) {
  const p = normalize(prenom), n = normalize(nom)
  return membres.find(m => normalize(m.prenom) === p && normalize(m.nom) === n)
    || membres.find(m => normalize(m.nom) === n && normalize(m.prenom).includes(p))
    || membres.find(m => normalize(m.nom) === n)
    || null
}

// Convertit un export PALMS au format SpreadsheetML 2003 (.xls en XML) en TSV.
// Gère ss:Index (sauts de colonnes vides — ex: col 9 entre RDI et RDE)
// et ss:MergeAcross (cellules fusionnées visuellement — on remplit de vide pour
// garder l'alignement des colonnes).
function spreadsheetXmlToTsv(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) return xml
    const SS = 'urn:schemas-microsoft-com:office:spreadsheet'
    const getElems = (parent, name) => {
      const ns = parent.getElementsByTagNameNS ? parent.getElementsByTagNameNS(SS, name) : null
      if (ns && ns.length) return ns
      return parent.getElementsByTagName(name)
    }
    const getAttr = (el, name) => {
      const v = el.getAttributeNS ? el.getAttributeNS(SS, name) : null
      return v || el.getAttribute('ss:' + name) || el.getAttribute(name)
    }
    const rows = getElems(doc, 'Row')
    if (!rows.length) return xml
    const lines = []
    for (let i = 0; i < rows.length; i++) {
      const cells = getElems(rows[i], 'Cell')
      const out = []
      let colIdx = 1 // ss:Index est 1-based
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j]
        const idx = parseInt(getAttr(cell, 'Index')) || colIdx
        while (colIdx < idx) { out.push(''); colIdx++ }
        const data = getElems(cell, 'Data')[0]
        out.push(data ? (data.textContent || '') : '')
        colIdx++
        const merge = parseInt(getAttr(cell, 'MergeAcross')) || 0
        for (let k = 0; k < merge; k++) { out.push(''); colIdx++ }
      }
      lines.push(out.join('\t'))
    }
    return lines.join('\n')
  } catch (e) {
    console.error('[SpreadsheetML]', e)
    return xml
  }
}

export default function SuiviHebdo({ groupeCode = 'MK-01', profil }) {
  const [rawText, setRawText] = useState('')
  // Origine de l'import courant : 'xls' (consolidé) | 'text' (provisoire) | null
  // - Fichier .xls PALMS SpreadsheetML → consolidé (clôture la semaine)
  // - Copier-coller ou .csv/.tsv → provisoire (remplaçable)
  const [importSource, setImportSource] = useState(null)
  const [dateReunion, setDateReunion] = useState(new Date().toISOString().split('T')[0])
  const [nbReunions, setNbReunions] = useState(1)
  const [showImport, setShowImport] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [archives, setArchives] = useState([])
  const [archiveDetail, setArchiveDetail] = useState(null)
  const [archiveData, setArchiveData] = useState([])
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [monthData, setMonthData] = useState([])
  const [loading, setLoading] = useState(true)
  const [scoresMap, setScoresMap] = useState({})
  const [selectedMembre, setSelectedMembre] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showPalmsInit, setShowPalmsInit] = useState(false)
  const [palmsInitLoading, setPalmsInitLoading] = useState(false)
  const [palmsInitResult, setPalmsInitResult] = useState(null)
  const [palmsInitError, setPalmsInitError] = useState('')
  const [palmsInitExists, setPalmsInitExists] = useState(false)
  const [palmsInitData, setPalmsInitData] = useState([])
  const [showPalmsInitData, setShowPalmsInitData] = useState(false)
  const [showInsight, setShowInsight] = useState(false)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightResult, setInsightResult] = useState(null)
  const [insightData, setInsightData] = useState([])
  const palmsInitFileRef = useRef(null)
  const insightFileRef = useRef(null)
  const hebdoFileRef = useRef(null)
  const palmsInitPanelRef = useRef(null)
  const archivesPanelRef = useRef(null)
  const importPanelRef = useRef(null)
  const insightPanelRef = useRef(null)
  const headerBtnsRef = useRef(null)

  // Click outside pour replier les accordéons (exclut les boutons header)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (headerBtnsRef.current && headerBtnsRef.current.contains(e.target)) return
      if (showPalmsInit && palmsInitPanelRef.current && !palmsInitPanelRef.current.contains(e.target)) setShowPalmsInit(false)
      if (showArchives && archivesPanelRef.current && !archivesPanelRef.current.contains(e.target)) setShowArchives(false)
      if (showImport && importPanelRef.current && !importPanelRef.current.contains(e.target)) setShowImport(false)
      if (showInsight && insightPanelRef.current && !insightPanelRef.current.contains(e.target)) setShowInsight(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPalmsInit, showArchives, showImport, showInsight])

  const now = new Date()
  const mois = now.getMonth() + 1
  const annee = now.getFullYear()
  const moisLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  // Semaines restantes dans le mois
  const finMois = new Date(annee, mois, 0)
  const joursRestants = Math.max(1, Math.round((finMois - now) / (1000 * 60 * 60 * 24)))
  const semainesRestantes = Math.max(0, Math.round(joursRestants / 7))

  // Nombre de jeudis dans le mois = nombre de réunions
  const nbJeudis = (() => {
    let count = 0
    for (let d = 1; d <= finMois.getDate(); d++) {
      if (new Date(annee, mois - 1, d).getDay() === 4) count++
    }
    return count
  })()
  // Objectifs mensuels basés sur le nombre de jeudis
  const objTat = nbJeudis  // 1 TàT par réunion
  const objRefs = Math.ceil(nbJeudis * 1.25)  // 1.25 réf par semaine

  const loadMonth = async () => {
    setLoading(true)
    const [data, scores] = await Promise.all([
      fetchPalmsHebdoMois(mois, annee, groupeCode),
      fetchScoresMK01(groupeCode).catch(() => []),
    ])
    setMonthData(data)
    const sMap = {}
    ;(scores || []).forEach(s => { if (s.membre_id) sMap[s.membre_id] = s })
    setScoresMap(sMap)
    setLoading(false)
  }

  // Vérifier si l'import initial PALMS existe déjà + charger les données
  const loadPalmsInit = async () => {
    const { data } = await supabase.from('palms_imports').select('*, membres(prenom, nom)').eq('periode_debut', '2025-12-12').order('mpb', { ascending: false })
    const exists = (data || []).length > 0
    setPalmsInitExists(exists)
    setPalmsInitData(data || [])
    if (exists) setShowPalmsInitData(true)
  }
  useEffect(() => { loadPalmsInit() }, [groupeCode])

  // Parser XML PALMS (même logique que PalmsImport)
  const parseXML = (text) => {
    const data = []
    let headers = []
    let headerFound = false
    const rowChunks = text.split(/<Row[^>]*>/i).slice(1)
    rowChunks.forEach(chunk => {
      const cellMatches = [...chunk.matchAll(/<Cell([^>]*)>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>/g)]
      if (!cellMatches.length) return
      const vals = []
      cellMatches.forEach(m => {
        const idxMatch = m[1].match(/ss:Index="(\d+)"/)
        if (idxMatch) { while (vals.length < parseInt(idxMatch[1]) - 1) vals.push('') }
        vals.push(m[2].trim())
      })
      if (vals.every(v => !v)) return
      if (!headerFound) {
        if (vals.includes('Prénom') && vals.includes('Nom')) { headers = vals; headerFound = true }
        return
      }
      const obj = {}
      headers.forEach((h, j) => { obj[h] = vals[j] || '' })
      if (obj['Prénom'] || obj['Nom']) data.push(obj)
    })
    return data
  }

  const handlePalmsInitImport = async (file) => {
    if (!file) return
    setPalmsInitLoading(true)
    setPalmsInitError('')
    setPalmsInitResult(null)
    try {
      const text = await file.text()
      if (!text.includes('<?xml') && !text.includes('<Workbook')) {
        setPalmsInitError('Format non reconnu. Utilisez l\'export XLS de BNI Connect.')
        setPalmsInitLoading(false)
        return
      }
      const rows = parseXML(text)
      if (rows.length === 0) {
        setPalmsInitError('Aucune donnée trouvée. Vérifiez le format du fichier.')
        setPalmsInitLoading(false)
        return
      }
      const { data: groupeData } = await supabase.from('groupes').select('id').eq('code', groupeCode).single()
      const groupeId = groupeData?.id
      const { data: membres } = await supabase.from('membres').select('id,prenom,nom').eq('groupe_id', groupeId)
      const norm = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

      // Supprimer l'ancien import initial s'il existe
      await supabase.from('palms_imports').delete().eq('groupe_id', groupeId).eq('periode_debut', '2025-12-12')

      let imported = 0, skipped = 0
      for (const row of rows) {
        const prenom = (row['Prénom'] || '').trim()
        const nomVal = (row['Nom'] || '').trim()
        if (!prenom && !nomVal) continue
        const pNorm = norm(prenom), nNorm = norm(nomVal)
        const membre = membres?.find(m => norm(m.nom) === nNorm && (norm(m.prenom) === pNorm || norm(m.prenom).includes(pNorm) || pNorm.includes(norm(m.prenom))))
          || membres?.find(m => norm(m.nom) === nNorm)
        if (!membre) { skipped++; continue }

        const palmsRow = {
          groupe_id: groupeId,
          membre_id: membre.id,
          presences: parseInt(row['P'] || row['Présences'] || 0),
          absences: parseInt(row['A'] || row['Absences'] || 0),
          late: parseInt(row['L'] || row['En retard'] || 0),
          makeup: parseInt(row['M'] || row['Makeup'] || 0),
          substitut: parseInt(row['S'] || row['Substitut'] || 0),
          rdi: parseInt(row['RDI'] || 0),
          rde: parseInt(row['RDE'] || 0),
          rri: parseInt(row['RRI'] || 0),
          rre: parseInt(row['RRE'] || 0),
          invites: parseInt(row['Inv.'] || row['Invités'] || 0),
          tat: parseFloat(row['TàT'] || row['T\u00e0T'] || 0),
          mpb: parseFloat(row['MPB'] || 0),
          ueg: parseInt(row['UEG'] || 0),
          periode_debut: '2025-12-12',
          periode_fin: '2026-03-31',
        }
        const { error } = await supabase.from('palms_imports').upsert(palmsRow, { onConflict: 'membre_id,periode_debut' })
        if (error) { skipped++; continue }
        imported++
      }
      // Recalculer les scores
      let scoreResult = null
      try { scoreResult = await recalculateScores(groupeCode) } catch (e) { console.error('[PALMS Init] Erreur recalcul:', e) }
      setPalmsInitResult({ imported, skipped, total: rows.length, scoreResult })
      setPalmsInitExists(true)
      await loadPalmsInit()
      await loadMonth()
    } catch (err) {
      setPalmsInitError('Erreur : ' + err.message)
    }
    setPalmsInitLoading(false)
  }

  // ── Charger les données BNI Insight existantes ──
  const loadInsightData = async () => {
    const { data } = await supabase.from('bni_insight_imports').select('*, membres(prenom, nom)').order('imported_at', { ascending: false })
    setInsightData(data || [])
  }

  // ── Import BNI Insight CSV (Sponsors uniquement — CEU vient du PALMS UEG) ──
  const handleInsightImport = async (file) => {
    if (!file) return
    setInsightLoading(true)
    setInsightResult(null)
    try {
      const text = await file.text()
      const membres = await fetchMembresForMatch(groupeCode)

      // Parser CSV avec gestion des champs entre guillemets (ex: "MK-01 KENITRA ATLANTIQUE,MA")
      const parseCSVLine = (line) => {
        const result = []
        let current = '', inQuotes = false
        for (const ch of line) {
          if (ch === '"') { inQuotes = !inQuotes }
          else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
          else { current += ch }
        }
        result.push(current.trim())
        return result
      }

      const lines = text.split('\n').filter(l => l.trim())
      const headers = parseCSVLine(lines[0])
      const nameIdx = headers.indexOf('Name')
      const sponsorsIdx = headers.indexOf('Sponsors')

      if (nameIdx === -1 || sponsorsIdx === -1) {
        throw new Error('Colonnes manquantes : Name ou Sponsors introuvables')
      }

      const rows = []
      let matched = 0
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        if (cols.length <= nameIdx) continue
        const fullNameStr = cols[nameIdx]
        const parts = fullNameStr.trim().split(/\s+/)
        // Essayer : dernier mot = nom (ex: "Hind ACHKIRE")
        const nom1 = parts[parts.length - 1]
        const prenom1 = parts.slice(0, -1).join(' ')
        let m = matchMembre(prenom1, nom1, membres)
        // Sinon : premier mot = prenom, reste = nom (ex: "Achraf Alaoui Tahiri")
        if (!m && parts.length > 2) {
          const prenom2 = parts[0]
          const nom2 = parts.slice(1).join(' ')
          m = matchMembre(prenom2, nom2, membres)
        }
        if (m) {
          matched++
          rows.push({
            groupe_id: m.groupe_id,
            membre_id: m.id,
            sponsors: parseInt(cols[sponsorsIdx]) || 0,
            periode_debut: null,
            periode_fin: null,
            imported_at: new Date().toISOString(),
          })
        }
      }

      if (rows.length === 0) throw new Error('Aucun membre matché')

      // Supprimer les anciennes données et insérer les nouvelles
      const groupeId = rows[0].groupe_id
      await supabase.from('bni_insight_imports').delete().eq('groupe_id', groupeId)
      const { error } = await supabase.from('bni_insight_imports').insert(rows)
      if (error) throw error

      // Recalculer les scores
      await recalculateScores(groupeCode)
      await loadInsightData()
      setInsightResult({ matched, total: lines.length - 1 })
    } catch (e) {
      console.error('[BNI Insight]', e)
      setInsightResult({ error: e.message })
    }
    setInsightLoading(false)
  }

  useEffect(() => { loadMonth() }, [groupeCode])

  // ─── PARSING & IMPORT ───────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!rawText.trim()) return
    setImporting(true)
    setResult(null)

    try {
      const membres = await fetchMembresForMatch(groupeCode)

      // Si l'utilisateur a chargé un fichier PALMS .xls (en fait du SpreadsheetML XML)
      // ou a collé du XML, on convertit en TSV avant de parser.
      let sourceText = rawText
      if (sourceText.trim().startsWith('<?xml') || sourceText.trim().startsWith('<Workbook')) {
        sourceText = spreadsheetXmlToTsv(sourceText)
      }

      // Détection automatique du séparateur : tab (copier/coller), puis point-virgule (CSV fr), puis virgule
      const firstLine = sourceText.trim().split(/\r?\n/)[0] || ''
      const sep = firstLine.includes('\t') ? '\t'
        : firstLine.split(';').length > firstLine.split(',').length ? ';'
        : ','
      // Parser une ligne en gérant les guillemets (pour CSV avec virgules dans des champs)
      const parseLine = (line) => {
        if (sep === '\t') return line.split('\t')
        const out = []; let cur = ''; let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') { inQuotes = !inQuotes; continue }
          if (ch === sep && !inQuotes) { out.push(cur); cur = ''; continue }
          cur += ch
        }
        out.push(cur)
        return out.map(s => s.trim())
      }
      const lines = sourceText.trim().split(/\r?\n/).map(parseLine)

      // Chercher dynamiquement la ligne d'en-tête (celle qui contient Prénom ET Nom)
      // Les exports PALMS ont 5-10 lignes de métadonnées avant le vrai header
      let headerIdx = -1
      for (let i = 0; i < Math.min(lines.length, 40); i++) {
        const cells = lines[i].map(c => (c || '').trim())
        if (cells.includes('Prénom') && cells.includes('Nom')) { headerIdx = i; break }
      }
      if (headerIdx === -1) {
        setResult({ error: `Ligne d'en-tête introuvable (pas de colonnes "Prénom" et "Nom" détectées dans les 40 premières lignes). Vérifie le format du fichier.` })
        setImporting(false)
        return
      }

      const headerRow = lines[headerIdx]
      const colMap = {}
      headerRow.forEach((h, i) => { const k = HEADERS_MAP[(h || '').trim()]; if (k && colMap[k] === undefined) colMap[k] = i })

      // Détection : format moderne avec 5 colonnes séparées P A L M S ?
      const hasPalmsSeparate = colMap.palms === undefined
        && colMap.p !== undefined && colMap.a !== undefined
        && colMap.l !== undefined && colMap.m !== undefined && colMap.s !== undefined

      // Déduit la lettre PALMS depuis les 5 colonnes (P > A > L > M > S)
      const derivePalms = (cols) => {
        if (parseInt(cols[colMap.p]) > 0) return 'P'
        if (parseInt(cols[colMap.a]) > 0) return 'A'
        if (parseInt(cols[colMap.l]) > 0) return 'L'
        if (parseInt(cols[colMap.m]) > 0) return 'M'
        if (parseInt(cols[colMap.s]) > 0) return 'S'
        return 'P'
      }
      // Parse un nombre décimal qui peut avoir une virgule (format FR: "13803,00")
      const toFloat = (s) => { const n = parseFloat(String(s || '0').replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
      const getPalms = (cols) => hasPalmsSeparate ? derivePalms(cols) : ((cols[colMap.palms] || 'P').trim() || 'P')

      let imported = 0, skipped = 0, bniRow = null
      const rows = []

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = lines[i]
        const prenom = (cols[colMap.prenom] || '').trim()
        const nom = (cols[colMap.nom] || '').trim()

        // Lignes spéciales (peuvent avoir le libellé dans Prénom OU dans Nom selon l'export)
        const firstLabel = prenom || nom
        const key = normalize(firstLabel)

        // Skip empty, "Total", "Invité(s)"
        if (!firstLabel || key === 'total' || key === 'invite' || key === 'invites') continue

        // BNI line (contribution externe)
        if (key === 'bni') {
          bniRow = {
            membre_id: null,
            palms: getPalms(cols),
            rdi: parseInt(cols[colMap.rdi]) || 0,
            rde: parseInt(cols[colMap.rde]) || 0,
            rri: parseInt(cols[colMap.rri]) || 0,
            rre: parseInt(cols[colMap.rre]) || 0,
            invites: parseInt(cols[colMap.invites]) || 0,
            tat: parseInt(cols[colMap.tat]) || 0,
            mpb: toFloat(cols[colMap.mpb]),
            ueg: parseInt(cols[colMap.ueg]) || 0,
          }
          continue
        }

        // Pas de prenom → pas un membre (ex: lignes de séparation vides)
        if (!prenom) { skipped++; continue }

        const membre = matchMembre(prenom, nom, membres)
        if (!membre) { skipped++; continue }

        rows.push({
          membre_id: membre.id,
          palms: getPalms(cols),
          rdi: parseInt(cols[colMap.rdi]) || 0,
          rde: parseInt(cols[colMap.rde]) || 0,
          rri: parseInt(cols[colMap.rri]) || 0,
          rre: parseInt(cols[colMap.rre]) || 0,
          invites: parseInt(cols[colMap.invites]) || 0,
          tat: parseInt(cols[colMap.tat]) || 0,
          mpb: toFloat(cols[colMap.mpb]),
          ueg: parseInt(cols[colMap.ueg]) || 0,
        })
        imported++
      }

      // Snap au jeudi de la semaine pour éviter les doublons
      const jeudiDate = snapToThursday(dateReunion)

      // Règle métier :
      //  - Fichier .xls (SpreadsheetML) → import CONSOLIDÉ (clôture la semaine, écrase tout)
      //  - Texte / CSV / TSV           → import PROVISOIRE (remplace le précédent provisoire)
      //  - Un provisoire ne doit PAS pouvoir écraser un consolidé déjà posé
      const isProvisoire = importSource !== 'xls'

      // ⚠️ Garde-fou : si aucune ligne n'est prête à être insérée, on avorte
      // AVANT le DELETE pour ne pas perdre la saisie précédente
      if (rows.length === 0 && !bniRow) {
        setResult({ error: `Aucun membre reconnu dans le fichier (${skipped} ligne${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''}). Vérifie les colonnes Prénom/Nom et le séparateur du CSV. Rien n'a été modifié en base.` })
        setImporting(false)
        return
      }

      // Récupérer le groupe + contrôler s'il existe déjà un consolidé pour ce jeudi
      const { data: groupeData } = await supabase.from('groupes').select('id').eq('code', groupeCode).single()
      if (!groupeData?.id) throw new Error(`Groupe ${groupeCode} introuvable`)

      if (isProvisoire) {
        // Un import texte ne peut pas écraser un consolidé déjà enregistré
        const { data: existing } = await supabase
          .from('palms_hebdo')
          .select('is_provisoire')
          .eq('groupe_id', groupeData.id)
          .eq('date_reunion', jeudiDate)
          .eq('is_provisoire', false)
          .limit(1)
        if (existing && existing.length > 0) {
          setResult({ error: `Ce jeudi (${jeudiDate}) est déjà clôturé par un import Excel consolidé. Pour le remplacer, supprime d'abord le consolidé dans les Archives ou ré-importe un nouveau .xls.` })
          setImporting(false)
          return
        }
      }

      // Supprimer les anciennes données de ce jeudi avant d'insérer (écrasement)
      const { error: delErr } = await supabase.from('palms_hebdo').delete().eq('groupe_id', groupeData.id).eq('date_reunion', jeudiDate)
      if (delErr) throw new Error('Suppression ancienne saisie : ' + delErr.message)

      if (rows.length > 0) await insertPalmsHebdo(rows, jeudiDate, nbReunions, groupeCode, { isProvisoire })
      if (bniRow) await insertPalmsHebdo([bniRow], jeudiDate, nbReunions, groupeCode, { isProvisoire })

      // Recalculer les scores BNI (PALMS base + hebdo compilé)
      let scoreResult = null
      try { scoreResult = await recalculateScores(groupeCode) } catch (e) { console.error('[Hebdo] Erreur recalcul scores:', e) }

      setResult({ imported, skipped, bni: !!bniRow, jeudiDate, snapped: jeudiDate !== dateReunion, scoreResult, isProvisoire })
      setRawText('')
      setImportSource(null)
      await loadMonth()
      // Rafraîchir la liste des archives pour que la nouvelle saisie apparaisse
      // (sinon le panneau Archives garde son cache antérieur à l'import)
      try {
        const { data: archivesData } = await supabase
          .from('palms_hebdo')
          .select('date_reunion, nb_reunions, groupe_id, is_provisoire, date_import')
          .order('date_reunion', { ascending: false })
        setArchives(archivesData || [])
      } catch (e) { console.error('[Hebdo] Erreur refresh archives:', e) }
    } catch (err) {
      setResult({ error: err.message })
    }
    setImporting(false)
  }

  // ─── AGGREGATION MENSUELLE ──────────────────────────────────────────────────
  const memberRows = monthData.filter(r => r.membre_id)
  const bniRows = monthData.filter(r => !r.membre_id)

  // Grouper par membre
  const membresMap = {}
  const dates = [...new Set(memberRows.map(r => r.date_reunion))].sort()
  const lastDate = dates[dates.length - 1] || null
  // Total réunions couvertes = somme des nb_reunions de chaque saisie
  const totalReunionsSaisies = memberRows.length > 0
    ? Math.max(...Object.values(memberRows.reduce((acc, r) => {
        if (!acc[r.membre_id]) acc[r.membre_id] = 0
        acc[r.membre_id] += r.nb_reunions || 1
        return acc
      }, {})))
    : 0
  // Découpage consolidé (import PALMS, vert) vs provisoire (saisies hebdo, orange)
  const datesConsolidees = new Set(memberRows.filter(r => !r.is_provisoire).map(r => r.date_reunion))
  const datesProvisoires = new Set(memberRows.filter(r => r.is_provisoire).map(r => r.date_reunion))
  const reunionsConsolidees = datesConsolidees.size
  const reunionsProvisoires = datesProvisoires.size

  memberRows.forEach(r => {
    const key = r.membre_id
    if (!membresMap[key]) {
      membresMap[key] = {
        id: r.membre_id,
        membre: r.membres || null,
        prenom: r.membres?.prenom || '?', nom: r.membres?.nom || '?',
        cumul: { tat: 0, refs: 0, invites: 0, mpb: 0, ueg: 0, presences: 0, absences: 0 },
        derniere: { tat: 0, refs: 0, invites: 0, mpb: 0, ueg: 0 },
      }
    }
    const m = membresMap[key]
    const refs = (r.rdi || 0) + (r.rde || 0)
    m.cumul.tat += r.tat || 0
    m.cumul.refs += refs
    m.cumul.invites += r.invites || 0
    m.cumul.mpb += Number(r.mpb) || 0
    m.cumul.ueg += r.ueg || 0
    if (r.palms === 'P') m.cumul.presences++
    else m.cumul.absences++

    if (r.date_reunion === lastDate) {
      m.derniere = { tat: r.tat || 0, refs, invites: r.invites || 0, mpb: Number(r.mpb) || 0, ueg: r.ueg || 0 }
    }
  })

  // BNI cumul
  const bniCumul = { tat: 0, refs: 0, invites: 0, mpb: 0, ueg: 0 }
  const bniDerniere = { tat: 0, refs: 0, invites: 0, mpb: 0, ueg: 0 }
  bniRows.forEach(r => {
    const refs = (r.rdi || 0) + (r.rde || 0)
    bniCumul.tat += r.tat || 0; bniCumul.refs += refs; bniCumul.invites += r.invites || 0
    bniCumul.mpb += Number(r.mpb) || 0; bniCumul.ueg += r.ueg || 0
    if (r.date_reunion === lastDate) {
      bniDerniere.tat = r.tat || 0; bniDerniere.refs = refs; bniDerniere.invites = r.invites || 0
      bniDerniere.mpb = Number(r.mpb) || 0; bniDerniere.ueg = r.ueg || 0
    }
  })

  const manque = (cumul, objectif) => Math.max(0, objectif - cumul)
  const manqueColor = (val) => val === 0 ? '#059669' : val <= 2 ? '#D97706' : '#DC2626'

  const sorted = Object.values(membresMap)
    .filter(m => !search || `${m.prenom} ${m.nom}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.cumul.tat + b.cumul.refs - (a.cumul.tat + a.cumul.refs))

  const th = { padding: '8px 10px', fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', whiteSpace: 'nowrap' }
  const kpiRule = { fontSize: 8, fontWeight: 400, color: '#9CA3AF', textTransform: 'none', letterSpacing: 0, marginTop: 3, whiteSpace: 'normal', lineHeight: 1.3 }
  const td = { padding: '8px 10px', fontSize: 12, textAlign: 'center', borderBottom: '1px solid #F3F2EF' }
  const tdName = { ...td, textAlign: 'left', fontWeight: 500, color: '#1C1C2E' }
  // Séparateur vertical entre groupes de colonnes
  const sep = { borderLeft: '2px solid #E5E7EB' }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.25s ease' }}>
      <style>{`
        table.suivi-table thead tr:first-child > th { border-bottom: 2px solid #E8E6E1; }
        table.suivi-table thead tr:nth-child(2) > th { border-bottom: 1px solid #E8E6E1; }
        tr.suivi-row {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                      filter 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                      background-color 0.2s ease;
        }
        tr.suivi-row > td {
          border-bottom: 1px solid rgba(0,0,0,0.08);
          transition: border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        tr.suivi-row.clickable:hover {
          background-color: transparent !important;
          transform: scale(1.008);
          filter: drop-shadow(0 6px 16px rgba(0,0,0,0.12)) brightness(1.04);
          position: relative;
          z-index: 5;
        }
        tr.suivi-row.clickable:hover > td {
          background-color: var(--row-bg);
        }
        tr.suivi-row.clickable:hover td:first-child {
          border-top-left-radius: 24px;
          border-bottom-left-radius: 24px;
        }
        tr.suivi-row.clickable:hover td:last-child {
          border-top-right-radius: 24px;
          border-bottom-right-radius: 24px;
        }
      `}</style>
      <PageHeader title="Suivi Hebdomadaire" sub={`Saisies texte provisoires — projections de la semaine en cours · ${moisLabel}`}
        right={
          <div ref={headerBtnsRef} style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
            {/* Bouton Initialisation */}
            <div onClick={() => { setShowPalmsInit(!showPalmsInit); if(!showPalmsInit) { setShowImport(false); setShowArchives(false); setShowInsight(false) } }}
              style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:12, padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                <div style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Import</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1C1C2E' }}>Initialisation</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>{[0,1,2].map(i=><div key={i} style={{ width:5, height:5, borderRadius:'50%', background:'#C41E3A' }} />)}</div>
            </div>
            {/* Bouton Archives Hebdo */}
            <div onClick={() => { setShowArchives(!showArchives); if(!showArchives) { setShowImport(false); setShowPalmsInit(false); setShowInsight(false); supabase.from('palms_hebdo').select('date_reunion, nb_reunions, groupe_id, is_provisoire, date_import').order('date_reunion',{ascending:false}).then(({data}) => { setArchives(data||[]) }) } }}
              style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:12, padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                <div style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Import</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1C1C2E' }}>Archives Hebdo</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>{[0,1,2].map(i=><div key={i} style={{ width:5, height:5, borderRadius:'50%', background:'#C41E3A' }} />)}</div>
            </div>
            {/* Bouton Insight */}
            <div onClick={() => { setShowInsight(!showInsight); if(!showInsight) { setShowImport(false); setShowArchives(false); setShowPalmsInit(false); loadInsightData() } }}
              style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:12, padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                <div style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Import</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1C1C2E' }}>Insight</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>{[0,1,2].map(i=><div key={i} style={{ width:5, height:5, borderRadius:'50%', background:'#C41E3A' }} />)}</div>
            </div>
            {/* Bouton Import Excel — ouvre directement le file picker .xls (consolidé) */}
            <div onClick={() => { setShowImport(true); setShowArchives(false); setShowPalmsInit(false); setShowInsight(false); setTimeout(() => hebdoFileRef.current?.click(), 0) }}
              style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:12, padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}
              title="Importer un fichier Excel .xls du rapport PALMS (clôture la semaine en Consolidé)">
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                <div style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Import</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1C1C2E' }}>Excel</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>{[0,1,2].map(i=><div key={i} style={{ width:5, height:5, borderRadius:'50%', background:'#C41E3A' }} />)}</div>
            </div>
            {/* Bouton Import Texte Provisoire */}
            <div onClick={() => { setShowImport(!showImport); if(!showImport) { setShowArchives(false); setShowPalmsInit(false); setShowInsight(false) } }}
              style={{ background:'#fff', border:'1px solid #E8E6E1', borderRadius:12, padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'box-shadow 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='none'}
              title="Coller du texte / CSV (saisie provisoire remplaçable)">
              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                <div style={{ fontSize:9, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em' }}>Import</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1C1C2E' }}>Texte provisoire</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>{[0,1,2].map(i=><div key={i} style={{ width:5, height:5, borderRadius:'50%', background:'#C41E3A' }} />)}</div>
            </div>
          </div>
        }
      />

      {/* ─── PALMS BASE : consultation (clic sur bouton header) ─────────── */}
      {showPalmsInit && palmsInitData.length > 0 && (
        <div ref={palmsInitPanelRef} style={{ marginBottom:24 }}>
          <div style={{ padding:'10px 16px', background:'#1C1C2E', borderRadius:'10px 10px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>
              PALMS Base — 12 déc. 2025 → 31 mars 2026
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{palmsInitData.length} membres</span>
              <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'rgba(209,250,229,0.2)', color:'#A7F3D0', fontWeight:600 }}>Consolidé</span>
              <div onClick={() => setShowPalmsInit(false)}
                style={{ width:20, height:20, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:14 }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)';e.currentTarget.style.color='#fff'}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.5)'}}>✕</div>
            </div>
          </div>
          <div style={{ overflowX:'auto', background:'#fff', border:'1px solid #E8E6E1', borderTop:'none' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Membre','P/A','RDI','RDE','RRI','RRE','Inv.','TàT','MPB','CEU'].map(h => (
                <th key={h} style={{ background:'#F9F8F6', padding:'8px 10px', textAlign: h==='Membre' ? 'left' : 'center', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {palmsInitData.map((d, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'8px 10px', fontSize:12, fontWeight:500 }}>{fullName(d.membres?.prenom, d.membres?.nom)}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{d.presences||0}/{(d.presences||0)+(d.absences||0)}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rdi||0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rde||0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rri||0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rre||0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.invites||0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{d.tat||0}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{Number(d.mpb||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.ueg||0}</td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Actions sous le tableau */}
          <div style={{ padding:'10px 16px', background:'#F9F8F6', borderRadius:'0 0 10px 10px', border:'1px solid #E8E6E1', borderTop:'none', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div onClick={() => palmsInitFileRef.current?.click()}
                style={{ fontSize:11, color:'#5B21B6', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}
                onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                📥 Ré-importer
              </div>
              <input ref={palmsInitFileRef} type="file" accept=".xls,.xlsx" style={{ display:'none' }}
                onChange={e => handlePalmsInitImport(e.target.files[0])} />
              {palmsInitLoading && <Spinner size={14} />}
            </div>
            <div onClick={async () => {
              if (!window.confirm('Supprimer l\'import initial PALMS ? Les scores seront recalculés sans cette base.')) return
              const { data: grp } = await supabase.from('groupes').select('id').eq('code', groupeCode).single()
              if (grp?.id) {
                await supabase.from('palms_imports').delete().eq('groupe_id', grp.id).eq('periode_debut', '2025-12-12')
                setPalmsInitExists(false)
                setPalmsInitData([])
                setPalmsInitResult(null)
                setShowPalmsInit(false)
                try { await recalculateScores(groupeCode) } catch(e) {}
                await loadMonth()
              }
            }}
              style={{ fontSize:11, color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
              onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              🗑 Supprimer
            </div>
          </div>
        </div>
      )}

      {/* PALMS BASE : zone d'import si pas encore de données */}
      {showPalmsInit && palmsInitData.length === 0 && (
        <div ref={palmsInitPanelRef}><Card style={{ marginBottom: 24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <SectionTitle>📥 Import PALMS Initial — Base de départ</SectionTitle>
            <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'#EDE9FE', color:'#5B21B6', fontWeight:600 }}>Unique · Consolidé</span>
          </div>
          <div style={{ padding:'12px 16px', background:'#F9F8F6', borderRadius:8, marginBottom:16, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:'#6B7280' }}>Période :</span>
              <span style={{ fontSize:13, fontWeight:700, color:'#1C1C2E' }}>12 déc. 2025 → 31 mars 2026</span>
            </div>
            <div style={{ fontSize:10, color:'#9CA3AF' }}>Rapport PALMS depuis le lancement du groupe</div>
          </div>
          <div
            onDragOver={e => { e.preventDefault() }}
            onDrop={e => { e.preventDefault(); handlePalmsInitImport(e.dataTransfer.files[0]) }}
            onClick={() => palmsInitFileRef.current?.click()}
            style={{ border:'2px dashed #C41E3A', borderRadius:10, padding:'28px 20px', textAlign:'center', cursor:'pointer', background:'#FAFAF8' }}
          >
            {palmsInitLoading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <Spinner size={16} />
                <span style={{ fontSize:13, color:'#6B7280' }}>Import et recalcul des scores en cours...</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize:28, marginBottom:6 }}>📊</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#1C1C2E', marginBottom:4 }}>Glisser le fichier PALMS ici</div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>Export BNI Connect · XLS · Période déc 2025 → mars 2026</div>
              </>
            )}
            <input ref={palmsInitFileRef} type="file" accept=".xls,.xlsx" style={{ display:'none' }}
              onChange={e => handlePalmsInitImport(e.target.files[0])} />
          </div>
          {palmsInitError && (
            <div style={{ marginTop:12, padding:10, background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:8, fontSize:12, color:'#DC2626' }}>⚠️ {palmsInitError}</div>
          )}
          {palmsInitResult && (
            <div style={{ marginTop:12, padding:12, background:'#D1FAE5', border:'1px solid #A7F3D0', borderRadius:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#065F46' }}>✅ Import initial réussi — {palmsInitResult.imported} membres</div>
            </div>
          )}
          <div style={{ marginTop:12, fontSize:11, color:'#9CA3AF', lineHeight:1.6 }}>
            💡 Ce rapport sert de base de départ pour les calculs sur 6 mois glissants. Les saisies hebdomadaires viendront se compiler par-dessus.
          </div>
        </Card></div>
      )}

      {/* ─── ARCHIVES ────────────────────────────────────────────────────── */}
      <AccordionPanel open={showArchives}>
        <div ref={archivesPanelRef}><Card style={{ marginBottom: 24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <SectionTitle>📂 Archives des saisies hebdo</SectionTitle>
            <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'#FEF3C7', color:'#92400E', fontWeight:600 }}>Provisoire</span>
            <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'#D1FAE5', color:'#065F46', fontWeight:600 }}>Consolidé</span>
          </div>
          {(() => {
            // Grouper par mois + garder info provisoire par date
            const byMonth = {}
            const dateInfo = {} // { date_reunion: { is_provisoire, date_import } }
            archives.forEach(a => {
              const d = new Date(a.date_reunion + 'T12:00:00')
              const key = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
              const sortKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
              if (!byMonth[key]) byMonth[key] = { sortKey, dates: new Set() }
              byMonth[key].dates.add(a.date_reunion)
              if (!dateInfo[a.date_reunion]) dateInfo[a.date_reunion] = { is_provisoire: a.is_provisoire, date_import: a.date_import }
            })
            const months = Object.entries(byMonth).sort((a,b) => b[1].sortKey.localeCompare(a[1].sortKey))

            return months.length === 0 ? (
              <div style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>Aucune archive</div>
            ) : months.map(([month, { dates: mDates }]) => {
              const sortedDates = [...mDates].sort()
              return (
                <div key={month} style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1C1C2E', textTransform:'capitalize' }}>{month}</div>
                    <div style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#EDE9FE', color:'#5B21B6' }}>{sortedDates.length} semaine{sortedDates.length > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {sortedDates.map(d => {
                      const date = new Date(d + 'T12:00:00')
                      const isActive = archiveDetail === d
                      const info = dateInfo[d] || {}
                      const isProvisoire = info.is_provisoire === true
                      const displayDate = isProvisoire && info.date_import
                        ? new Date(info.date_import + 'T12:00:00')
                        : date
                      return (
                        <div key={d} onClick={async () => {
                          if (isActive) { setArchiveDetail(null); setArchiveData([]); return }
                          setArchiveDetail(d)
                          const { data } = await supabase.from('palms_hebdo').select('*, membres(prenom, nom)').eq('date_reunion', d).order('tat', { ascending:false })
                          setArchiveData(data || [])
                        }}
                          style={{ padding:'8px 14px', borderRadius:8, background: isActive ? '#EDE9FE' : isProvisoire ? '#FFFBEB' : '#ECFDF5', border:`1px solid ${isActive ? '#8B5CF6' : isProvisoire ? '#F59E0B' : '#10B981'}`, display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'all 0.1s' }}
                          onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background: isProvisoire ? '#F59E0B' : '#10B981' }} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:600, color: isActive ? '#5B21B6' : '#1C1C2E', display:'flex', alignItems:'center', gap:6 }}>
                              {isProvisoire ? (
                                <>Importé le {displayDate.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}</>
                              ) : (
                                date.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })
                              )}
                              {isProvisoire ? (
                                <span style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:'#FEF3C7', color:'#92400E', fontWeight:700, textTransform:'uppercase' }}>Provisoire</span>
                              ) : (
                                <span style={{ fontSize:8, padding:'1px 5px', borderRadius:4, background:'#D1FAE5', color:'#065F46', fontWeight:700, textTransform:'uppercase' }}>Consolidé</span>
                              )}
                            </div>
                            <div style={{ fontSize:9, color: isActive ? '#7C3AED' : '#9CA3AF' }}>
                              {isProvisoire && !isActive ? `Réunion du ${date.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}` : isActive ? 'Cliquer pour fermer' : 'Cliquer pour voir'}
                            </div>
                          </div>
                          <div onClick={async (e) => {
                            e.stopPropagation()
                            if (!window.confirm(`Supprimer la saisie du ${date.toLocaleDateString('fr-FR')} ?`)) return
                            await supabase.from('palms_hebdo').delete().eq('date_reunion', d)
                            setArchives(prev => prev.filter(a => a.date_reunion !== d))
                            if (archiveDetail === d) { setArchiveDetail(null); setArchiveData([]) }
                            loadMonth()
                          }}
                            style={{ width:18, height:18, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#DC2626', cursor:'pointer', flexShrink:0 }}
                            onMouseEnter={e => e.currentTarget.style.background='#FEE2E2'}
                            onMouseLeave={e => e.currentTarget.style.background='transparent'}
                            title="Supprimer cette saisie">✕</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          })()}

          {/* Détail d'une archive */}
          {archiveDetail && archiveData.length > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ padding:'10px 16px', background:'#1C1C2E', borderRadius:'10px 10px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ color:'#fff', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                  Réunion du {new Date(archiveDetail+'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                  {archiveData[0]?.is_provisoire && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'#F59E0B', color:'#fff', fontWeight:700 }}>PROVISOIRE</span>}
                </span>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{archiveData.filter(d=>d.membre_id).length} membres</span>
              </div>
              <div style={{ overflowX:'auto', background:'#fff', borderRadius:'0 0 10px 10px', border:'1px solid #E8E6E1', borderTop:'none' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['Membre','P/A','RDI','RDE','RRI','RRE','Inv.','TàT','MPB','CEU'].map(h => (
                    <th key={h} style={{ background:'#F9F8F6', padding:'8px 10px', textAlign: h==='Membre' ? 'left' : 'center', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {archiveData.filter(d=>d.membre_id).map((d, i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #F3F2EF' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <td style={{ padding:'8px 10px', fontSize:12, fontWeight:500 }}>{fullName(d.membres?.prenom, d.membres?.nom)}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{d.palms}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rdi||0}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rde||0}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rri||0}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.rre||0}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.invites||0}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{d.tat||0}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center', fontWeight:600 }}>{Number(d.mpb||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                          <td style={{ padding:'8px 10px', fontSize:12, textAlign:'center' }}>{d.ueg||0}</td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card></div>
      </AccordionPanel>

      {/* ─── BNI INSIGHT ─────────────────────────────────────────────────── */}
      <AccordionPanel open={showInsight}>
        <div ref={insightPanelRef} style={{ marginBottom:24 }}>
          {insightData.length > 0 ? (
            <>
              <div style={{ padding:'10px 16px', background:'#1C1C2E', borderRadius:'10px 10px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>BNI Insight — CEU · Parrainages</span>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button onClick={() => { insightFileRef.current?.click() }} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer' }}>🔄 Ré-importer</button>
                  <button onClick={() => setShowInsight(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:26, height:26, borderRadius:'50%', cursor:'pointer', fontSize:12 }}>✕</button>
                </div>
              </div>
              <input ref={insightFileRef} type="file" accept=".csv" hidden onChange={e => handleInsightImport(e.target.files[0])} />
              <TableWrap>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#F7F6F3' }}>
                      <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#6B7280' }}>Membre</th>
                      <th style={{ padding:'8px 12px', textAlign:'center', fontWeight:600, color:'#6B7280' }}>Sponsors (parrainages)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insightData.map((d, i) => (
                      <tr key={i} style={{ borderTop:'1px solid #F3F2EF' }}>
                        <td style={{ padding:'6px 12px', fontWeight:600 }}>{fullName(d.membres?.prenom, d.membres?.nom)}</td>
                        <td style={{ padding:'6px 12px', textAlign:'center', fontWeight:700, color: d.sponsors > 0 ? '#059669' : '#9CA3AF' }}>{d.sponsors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {insightResult && !insightResult.error && (
                <div style={{ padding:10, background:'#D1FAE5', borderRadius:'0 0 10px 10px', fontSize:12, color:'#065F46', fontWeight:600 }}>
                  ✅ Import réussi — {insightResult.matched}/{insightResult.total} membres matchés
                </div>
              )}
            </>
          ) : (
            <Card>
              <SectionTitle>📊 Import BNI Insight — Parrainages (Sponsors)</SectionTitle>
              <p style={{ fontSize:12, color:'#6B7280', marginBottom:12 }}>Importez le fichier CSV "Rank" depuis BNI Insight. Seule la colonne <strong>Sponsors</strong> est extraite — le CEU provient désormais directement de la colonne UEG des imports PALMS (Excel/texte provisoire).</p>
              {insightLoading ? (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:12 }}>
                  <Spinner size={16} />
                  <span style={{ fontSize:13, color:'#6B7280' }}>Import et recalcul des scores en cours...</span>
                </div>
              ) : (
                <div
                  style={{ border:'2px dashed #E8E6E1', borderRadius:10, padding:24, textAlign:'center', cursor:'pointer' }}
                  onClick={() => insightFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleInsightImport(e.dataTransfer.files[0]) }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>📄</div>
                  <div style={{ fontSize:13, color:'#6B7280' }}>Cliquez ou glissez le CSV BNI Insight ici</div>
                </div>
              )}
              <input ref={insightFileRef} type="file" accept=".csv" hidden onChange={e => handleInsightImport(e.target.files[0])} />
              {insightResult?.error && (
                <div style={{ padding:10, background:'#FEE2E2', borderRadius:8, fontSize:12, color:'#991B1B', marginTop:10 }}>❌ {insightResult.error}</div>
              )}
            </Card>
          )}
        </div>
      </AccordionPanel>

      {/* ─── SAISIE ──────────────────────────────────────────────────────── */}
      {showImport && <div ref={importPanelRef}><Card style={{ marginBottom: 24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:0 }}>
          <SectionTitle>Coller les données PALMS ou importer un CSV / Excel</SectionTitle>
          {importSource === 'xls' ? (
            <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'#D1FAE5', color:'#065F46', fontWeight:600 }}>Excel · Consolidé</span>
          ) : (
            <span style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:'#FEF3C7', color:'#92400E', fontWeight:600 }}>Texte · Provisoire</span>
          )}
        </div>

        {/* Zone de dépôt CSV */}
        <div
          style={{ border:'2px dashed #E8E6E1', borderRadius:10, padding:16, textAlign:'center', cursor:'pointer', marginBottom:12, marginTop:8, transition:'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}
          onClick={() => hebdoFileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.background='#FEF3C7' }}
          onDragLeave={e => { e.currentTarget.style.background='transparent' }}
          onDrop={e => {
            e.preventDefault(); e.currentTarget.style.background='transparent'
            const f = e.dataTransfer.files?.[0]
            if (f) {
              const r = new FileReader()
              r.onload = ev => {
                const txt = String(ev.target?.result || '')
                // Si c'est un export PALMS .xls (SpreadsheetML XML) → import consolidé (clôture la semaine)
                // Sinon CSV/TSV → import provisoire (remplaçable)
                const isXml = txt.trim().startsWith('<?xml') || txt.trim().startsWith('<Workbook')
                setRawText(isXml ? spreadsheetXmlToTsv(txt) : txt)
                setImportSource(isXml ? 'xls' : 'text')
              }
              r.readAsText(f, 'utf-8')
            }
          }}>
          <div style={{ fontSize:22, marginBottom:4 }}>📄</div>
          <div style={{ fontSize:12, color:'#6B7280' }}>Cliquez ou glissez un fichier PALMS .xls, CSV ou TSV</div>
        </div>
        <input ref={hebdoFileRef} type="file" accept=".csv,.tsv,.txt,.xls,.xml" hidden
          onChange={e => {
            const f = e.target.files?.[0]; if (!f) return
            const r = new FileReader()
            r.onload = ev => {
              const txt = String(ev.target?.result || '')
              // Si c'est un export PALMS .xls (SpreadsheetML XML) → import consolidé (clôture la semaine)
              // Sinon CSV/TSV → import provisoire (remplaçable)
              const isXml = txt.trim().startsWith('<?xml') || txt.trim().startsWith('<Workbook')
              setRawText(isXml ? spreadsheetXmlToTsv(txt) : txt)
              setImportSource(isXml ? 'xls' : 'text')
            }
            r.readAsText(f, 'utf-8')
            e.target.value = '' // permet de re-sélectionner le même fichier
          }} />

        <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#6B7280' }}>Date :</label>
            <input type="date" value={dateReunion} onChange={e => setDateReunion(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #E8E6E1', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans, sans-serif' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#6B7280' }}>Nb de réunions couvertes :</label>
            <input type="number" min={1} max={5} value={nbReunions} onChange={e => setNbReunions(parseInt(e.target.value) || 1)}
              style={{ width: 50, padding: '6px 10px', border: '1px solid #E8E6E1', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }} />
          </div>
        </div>
        <textarea
          value={rawText}
          onChange={e => { setRawText(e.target.value); setImportSource('text') }}
          placeholder="Coller ici le tableau PALMS (copier depuis Excel/Google Sheets avec les en-têtes)..."
          style={{ width: '100%', minHeight: 120, padding: 12, border: '1px solid #E8E6E1', borderRadius: 8, fontSize: 12, fontFamily: 'DM Sans, monospace', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
          <button onClick={handleImport} disabled={importing || !rawText.trim()}
            style={{ padding: '10px 24px', background: importing ? 'rgba(196,30,58,0.5)' : '#C41E3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: importing ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 8 }}>
            {importing ? <><Spinner size={14} color="#fff" /> Import en cours...</> : 'Valider et importer'}
          </button>
          {result && !result.error && (
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>
              {result.imported} membres importés{result.skipped > 0 ? `, ${result.skipped} ignorés` : ''}{result.bni ? ' + contribution BNI' : ''}
              <span style={{ marginLeft:6, fontSize:9, padding:'1px 5px', borderRadius:4, fontWeight:700, textTransform:'uppercase', ...(result.isProvisoire ? { background:'#FEF3C7', color:'#92400E' } : { background:'#D1FAE5', color:'#065F46' }) }}>
                {result.isProvisoire ? 'Provisoire' : 'Consolidé'}
              </span>
              {result.snapped && <span style={{ color:'#D97706' }}> · Recalé au jeudi {new Date(result.jeudiDate+'T12:00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}</span>}
            </span>
          )}
          {result?.error && <span style={{ fontSize: 12, color: '#DC2626' }}>Erreur : {result.error}</span>}
        </div>
      </Card></div>}

      {/* ─── BARRE DE RECHERCHE PARTAGÉE (filtre les deux tableaux) ─── */}
      {!loading && dates.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un membre..."
            style={{ width:'100%', padding:'10px 14px', border:'1px solid #E8E6E1', borderRadius:10, fontSize:13, fontFamily:'DM Sans, sans-serif', outline:'none', boxSizing:'border-box', background:'#fff' }} />
        </div>
      )}

      {/* ─── TABLEAU ACTIONS POUR ALL GREEN ─────────────────────────────── */}
      {!loading && dates.length > 0 && (() => {
        const actionsSorted = Object.values(membresMap)
          .filter(m => !search || `${m.prenom} ${m.nom}`.toLowerCase().includes(search.toLowerCase()))
          .slice()
          .sort((a, b) => {
            const remA = manque(a.cumul.tat, objTat) + manque(a.cumul.refs, objRefs)
            const remB = manque(b.cumul.tat, objTat) + manque(b.cumul.refs, objRefs)
            return remB - remA
          })
        // Stats globales (non filtrées par recherche, pour garder la photo complete)
        const allMembres = Object.values(membresMap)
        const nbTotal = allMembres.length
        const nbVerts = allMembres.filter(m => manque(m.cumul.tat, objTat) === 0 && manque(m.cumul.refs, objRefs) === 0).length
        const pct = nbTotal > 0 ? Math.round((nbVerts / nbTotal) * 100) : 0
        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', background:'#1C1C2E', borderRadius:'10px 10px 0 0' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ color:'#fff', fontSize:15, fontWeight:700 }}>🎯 Actions pour tout passer au vert</span>
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'rgba(16,185,129,0.2)', color:'#A7F3D0' }}>{nbVerts}/{nbTotal} au vert</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:80, height:6, background:'rgba(255,255,255,0.15)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:'#10B981', transition:'width 0.3s' }} />
                </div>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.7)', fontWeight:600 }}>{pct}%</span>
              </div>
            </div>
            <TableWrap>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0 }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid #E8E6E1' }}>
                      <th style={{ ...th, textAlign:'left', minWidth:140 }}>Membre</th>
                      <th style={{ ...th, ...sep }}>Tête-à-tête<br/><span style={kpiRule}>Objectif : {objTat}/mois</span></th>
                      <th style={{ ...th, ...sep }}>Recommandations<br/><span style={kpiRule}>Objectif : {objRefs}/mois</span></th>
                      <th style={{ ...th, ...sep }}>Visiteurs<br/><span style={kpiRule}>Mois en cours</span></th>
                      <th style={{ ...th, ...sep }}>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionsSorted.map((m, i) => {
                      const mTat = manque(m.cumul.tat, objTat)
                      const mRefs = manque(m.cumul.refs, objRefs)
                      const isAllGreen = mTat === 0 && mRefs === 0
                      const tatBg = mTat === 0 ? '#D1FAE5' : mTat <= 2 ? '#FEF9C3' : '#FEE2E2'
                      const tatCol = mTat === 0 ? '#065F46' : mTat <= 2 ? '#854D0E' : '#991B1B'
                      const refsBg = mRefs === 0 ? '#D1FAE5' : mRefs <= 2 ? '#FEF9C3' : '#FEE2E2'
                      const refsCol = mRefs === 0 ? '#065F46' : mRefs <= 2 ? '#854D0E' : '#991B1B'
                      const invBg = m.cumul.invites > 0 ? '#D1FAE5' : '#F3F4F6'
                      const invCol = m.cumul.invites > 0 ? '#065F46' : '#6B7280'
                      const rowOpacity = isAllGreen ? 0.55 : 1
                      return (
                        <tr key={i} style={{ opacity: rowOpacity, borderBottom:'1px solid rgba(0,0,0,0.08)' }}>
                          <td style={{ ...tdName, fontWeight: isAllGreen ? 500 : 600 }}>{fullName(m.prenom, m.nom)}</td>
                          <td style={{ ...td, ...sep, background:tatBg, color:tatCol, fontWeight:700 }}>{mTat === 0 ? '✓' : mTat}</td>
                          <td style={{ ...td, ...sep, background:refsBg, color:refsCol, fontWeight:700 }}>{mRefs === 0 ? '✓' : mRefs}</td>
                          <td style={{ ...td, ...sep, background:invBg, color:invCol, fontWeight:600 }}>{m.cumul.invites || 0}</td>
                          <td style={{ ...td, ...sep, fontSize:16 }}>{isAllGreen ? '✅' : '⏳'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </TableWrap>
          </div>
        )
      })()}

      {/* ─── TABLEAU MENSUEL ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', background:'#1C1C2E', borderRadius:'10px 10px 0 0', marginBottom:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ color:'#fff', fontSize:15, fontWeight:700, textTransform:'capitalize' }}>Suivi — {moisLabel}</span>
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:4, background:'rgba(254,243,199,0.25)', color:'#FDE68A', fontWeight:600 }}>Provisoire</span>
          <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.7)' }}>{totalReunionsSaisies}/{nbJeudis} réunions</span>
          <div style={{ display:'flex', gap:3 }}>
            {Array.from({length:nbJeudis}).map((_,i) => (
              <div key={i} style={{ width:8, height:8, borderRadius:'50%', background: i < reunionsConsolidees ? '#059669' : i < reunionsConsolidees + reunionsProvisoires ? '#F59E0B' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        </div>
        <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{Math.max(0, nbJeudis - totalReunionsSaisies)} restante{Math.max(0, nbJeudis - totalReunionsSaisies) > 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : dates.length === 0 ? (
        <Card><p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', margin: 0 }}>Aucune donnée hebdomadaire pour {moisLabel}. Collez les données ci-dessus pour commencer.</p></Card>
      ) : (
        <TableWrap>
          <div style={{ overflowX: 'auto' }}>
            <table className="suivi-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E8E6E1' }}>
                  <th style={{ ...th, textAlign: 'left', minWidth: 140 }}>Membre</th>
                  <th style={{ ...th, ...sep, background: '#F7F6F3' }}>
                    <div>Prés.</div>
                    <div style={kpiRule}>≥95%→10 · ≥88%→5</div>
                  </th>
                  <th style={{ ...th, ...sep, cursor: 'pointer', userSelect: 'none' }} colSpan={showDetails ? 3 : 1} onClick={() => setShowDetails(v => !v)} title={showDetails ? 'Réduire' : 'Voir détails hebdo'}>
                    <div>Tête-à-tête <span style={{ color: '#C41E3A', fontSize: 11 }}>{showDetails ? '▾' : '▸'}</span></div>
                    <div style={kpiRule}>/sem : ≥1→20 · ≥0.75→15 · ≥0.5→10 · ≥0.25→5</div>
                  </th>
                  <th style={{ ...th, ...sep, cursor: 'pointer', userSelect: 'none' }} colSpan={showDetails ? 3 : 1} onClick={() => setShowDetails(v => !v)} title={showDetails ? 'Réduire' : 'Voir détails hebdo'}>
                    <div>Recommandations données <span style={{ color: '#C41E3A', fontSize: 11 }}>{showDetails ? '▾' : '▸'}</span></div>
                    <div style={kpiRule}>/sem : ≥1.25→25 · ≥1→20 · ≥0.75→15 · ≥0.5→10 · ≥0.25→5</div>
                  </th>
                  <th style={{ ...th, ...sep }}>
                    <div>Visiteurs</div>
                    <div style={kpiRule}>6 mois : 5→25 · 4→20 · 3→15 · 2→10 · 1→5</div>
                  </th>
                  <th style={{ ...th, ...sep }}>
                    <div>TYFCB</div>
                    <div style={kpiRule}>6 mois : ≥300k→5 · ≥150k→4 · ≥50k→3 · ≥20k→2 · &gt;0→1</div>
                  </th>
                  <th style={{ ...th, ...sep }}>
                    <div>CEU</div>
                    <div style={kpiRule}>/sem : &gt;0.5→10 · &gt;0→5</div>
                  </th>
                </tr>
                <tr style={{ borderBottom: '1px solid #E8E6E1' }}>
                  <th style={th}></th>
                  <th style={{ ...th, ...sep, background: '#F7F6F3', fontSize: 9, whiteSpace: 'normal' }}>Mois en cours</th>
                  {showDetails && <th style={{ ...th, ...sep, fontSize: 9, whiteSpace: 'normal' }}>Mois en cours</th>}
                  {showDetails && <th style={{ ...th, fontSize: 9, color: '#C41E3A', whiteSpace: 'normal' }}>Semaine en cours</th>}
                  <th style={{ ...th, ...(showDetails ? {} : sep), fontSize: 9, color: '#DC2626', whiteSpace: 'normal' }}>Reste à faire</th>
                  {showDetails && <th style={{ ...th, ...sep, fontSize: 9, whiteSpace: 'normal' }}>Mois en cours</th>}
                  {showDetails && <th style={{ ...th, fontSize: 9, color: '#C41E3A', whiteSpace: 'normal' }}>Semaine en cours</th>}
                  <th style={{ ...th, ...(showDetails ? {} : sep), fontSize: 9, color: '#DC2626', whiteSpace: 'normal' }}>Reste à faire</th>
                  <th style={{ ...th, ...sep, fontSize: 9, whiteSpace: 'normal' }}>Mois en cours</th>
                  <th style={{ ...th, ...sep, fontSize: 9, whiteSpace: 'normal' }}>Mois en cours</th>
                  <th style={{ ...th, ...sep, fontSize: 9, whiteSpace: 'normal' }}>Mois en cours</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m, i) => {
                  const mTat = manque(m.cumul.tat, objTat)
                  const mRefs = manque(m.cumul.refs, objRefs)
                  // Couleur de fond basée sur l'activité globale
                  const activity = m.cumul.tat + m.cumul.refs
                  const rowBg = activity >= objTat ? '#D1FAE5' : activity > 0 ? '#FEF9C3' : m.cumul.presences === 0 ? '#FEE2E2' : '#F9FAFB'
                  const nameCol = activity >= objTat ? '#065F46' : activity > 0 ? '#854D0E' : m.cumul.presences === 0 ? '#991B1B' : '#6B7280'
                  // Couleur présence
                  const presTotal = m.cumul.presences + m.cumul.absences
                  const presBg = presTotal === 0 ? '#FEE2E2' : m.cumul.absences === 0 ? '#D1FAE5' : '#FEF9C3'
                  const presCol = presTotal === 0 ? '#991B1B' : m.cumul.absences === 0 ? '#065F46' : '#854D0E'
                  // Couleur TàT
                  const tatBg = mTat === 0 ? '#D1FAE5' : mTat <= 2 ? '#FEF9C3' : '#FEE2E2'
                  const tatCol = mTat === 0 ? '#065F46' : mTat <= 2 ? '#854D0E' : '#991B1B'
                  // Couleur Reco
                  const refsBg = mRefs === 0 ? '#D1FAE5' : mRefs <= 2 ? '#FEF9C3' : '#FEE2E2'
                  const refsCol = mRefs === 0 ? '#065F46' : mRefs <= 2 ? '#854D0E' : '#991B1B'
                  const score = scoresMap[m.id]
                  const canOpen = !!score
                  return (
                    <tr key={i}
                      className={`suivi-row${canOpen ? ' clickable' : ''}`}
                      style={{ backgroundColor: rowBg, '--row-bg': rowBg, cursor: canOpen ? 'pointer' : 'default' }}
                      onClick={() => { if (canOpen) setSelectedMembre(score) }}>
                      <td style={{ ...tdName, color: nameCol, fontWeight: 600 }}>{fullName(m.prenom, m.nom)}</td>
                      <td style={{ ...td, ...sep, background: presBg, fontWeight: 600, color: presCol }}>{m.cumul.presences}/{presTotal}</td>
                      {showDetails && <td style={{ ...td, ...sep, fontWeight: 600 }}>{m.cumul.tat}</td>}
                      {showDetails && <td style={{ ...td, color: '#C41E3A', fontWeight: 600 }}>{m.derniere.tat}</td>}
                      <td style={{ ...td, ...(showDetails ? {} : sep), fontWeight: 700, background: tatBg, color: tatCol }}>{mTat === 0 ? '✓' : mTat}</td>
                      {showDetails && <td style={{ ...td, ...sep, fontWeight: 600 }}>{m.cumul.refs}</td>}
                      {showDetails && <td style={{ ...td, color: '#C41E3A', fontWeight: 600 }}>{m.derniere.refs}</td>}
                      <td style={{ ...td, ...(showDetails ? {} : sep), fontWeight: 700, background: refsBg, color: refsCol }}>{mRefs === 0 ? '✓' : mRefs}</td>
                      <td style={{ ...td, ...sep }}>{m.cumul.invites}</td>
                      <td style={{ ...td, ...sep, fontWeight: 600, color: m.cumul.mpb > 0 ? '#065F46' : '#9CA3AF' }}>{Number(m.cumul.mpb).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td style={{ ...td, ...sep }}>{m.cumul.ueg}</td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Ligne BNI (contribution externe) */}
              {(bniCumul.tat > 0 || bniCumul.refs > 0 || bniCumul.mpb > 0) && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #E8E6E1', background: '#F7F6F3' }}>
                    <td style={{ ...tdName, fontStyle: 'italic', color: '#6B7280' }}>Contribution BNI externe</td>
                    <td style={{ ...td, ...sep, background: '#F0EFEC' }}>—</td>
                    {showDetails && <td style={{ ...td, ...sep }}>{bniCumul.tat}</td>}
                    {showDetails && <td style={{ ...td, color: '#C41E3A' }}>{bniDerniere.tat}</td>}
                    <td style={{ ...td, ...(showDetails ? {} : sep) }}>—</td>
                    {showDetails && <td style={{ ...td, ...sep }}>{bniCumul.refs}</td>}
                    {showDetails && <td style={{ ...td, color: '#C41E3A' }}>{bniDerniere.refs}</td>}
                    <td style={{ ...td, ...(showDetails ? {} : sep) }}>—</td>
                    <td style={{ ...td, ...sep }}>{bniCumul.invites}</td>
                    <td style={{ ...td, ...sep }}>{Number(bniCumul.mpb).toLocaleString('fr-FR')}</td>
                    <td style={{ ...td, ...sep }}>{bniCumul.ueg}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </TableWrap>
      )}

      {/* Modale détail membre (partagée avec Membres) */}
      {selectedMembre && (
        <MembreDetail
          membre={selectedMembre.membres || {}}
          score={selectedMembre}
          profil={profil}
          onClose={() => setSelectedMembre(null)}
        />
      )}
    </div>
  )
}
