import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { recalculateScores } from '../lib/bniService'

export default function PalmsImport({ onImportDone, groupeCode = 'MK-01' }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const parseXML = (text) => {
    const data = []
    let headers = []
    let headerFound = false
    let meta = { depuis: null, jusqua: null }

    // Extraire les dates depuis les métadonnées
    const depuisMatch = text.match(/Depuis le[\s:]*<\/Data>[\s\S]*?<Data[^>]*>(\d{4}-\d{2}-\d{2})/i)
      || text.match(/Depuis le :[\s\S]*?(\d{4}-\d{2}-\d{2})/)
    if (depuisMatch) meta.depuis = depuisMatch[1]
    const jusquaMatch = text.match(/Jusqu'au[\s:]*<\/Data>[\s\S]*?<Data[^>]*>(\d{4}-\d{2}-\d{2})/i)
      || text.match(/Jusqu'au :[\s\S]*?(\d{4}-\d{2}-\d{2})/)
    if (jusquaMatch) meta.jusqua = jusquaMatch[1]

    // Splitter par Row
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
        if (vals.includes('Prénom') && vals.includes('Nom')) {
          headers = vals
          headerFound = true
        }
        return
      }

      const obj = {}
      headers.forEach((h, j) => { obj[h] = vals[j] || '' })
      if (obj['Prénom'] || obj['Nom']) data.push(obj)
    })
    return { data, meta }
  }

  const processFile = async (file) => {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const text = await file.text()
      let rows = []

      let meta = {}
      // Try XML (SpreadsheetML)
      if (text.includes('<?xml') || text.includes('<Workbook')) {
        const parsed = parseXML(text)
        rows = parsed.data
        meta = parsed.meta
      } else {
        setError('Format non reconnu. Utilisez l\'export XLS de BNI Connect.')
        setLoading(false)
        return
      }

      if (rows.length === 0) {
        setError('Aucune donnée trouvée dans le fichier. Vérifiez le format.')
        setLoading(false)
        return
      }

      console.log('[PALMS Import] Parsed:', rows.length, 'rows, meta:', meta)

      // Get groupe MK-01
      const { data: groupes } = await supabase.from('groupes').select('id,code').eq('code', groupeCode).single()
      const groupeId = groupes?.id

      // Get existing membres
      const { data: membres } = await supabase.from('membres').select('id,prenom,nom').eq('groupe_id', groupeId)
      
      let imported = 0, skipped = 0
      const periode_debut = meta.depuis || '2025-10-01'
      const periode_fin = meta.jusqua || '2026-03-31'
      const dateImport = new Date().toISOString().split('T')[0]

      // Compter les jeudis entre debut et date d'import = réunions couvertes
      const countJeudis = (from, to) => {
        let count = 0
        const d = new Date(from + 'T12:00:00')
        const end = new Date(to + 'T12:00:00')
        while (d <= end) { if (d.getDay() === 4) count++; d.setDate(d.getDate() + 1) }
        return count
      }
      const jeudisCouverts = countJeudis(periode_debut, dateImport)
      const jeudisTotalMois = countJeudis(periode_debut, periode_fin)

      for (const row of rows) {
        const prenom = (row['Prénom'] || '').trim()
        const nom = (row['Nom'] || '').trim()
        if (!prenom && !nom) continue

        // Find membre — match exact nom + prenom souple
        const pNorm = prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const nNorm = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const membre = membres?.find(m => {
          const mp = m.prenom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          const mn = m.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          return mn === nNorm && (mp === pNorm || mp.includes(pNorm) || pNorm.includes(mp))
        }) || membres?.find(m => {
          const mn = m.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          return mn === nNorm
        })

        if (!membre) { skipped++; console.log('[PALMS Import] Skipped:', prenom, nom); continue }

        const palmsData = {
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
          periode_debut,
          periode_fin,
        }

        // Upsert
        const { error: upsertErr } = await supabase.from('palms_imports').upsert(palmsData, { onConflict: 'membre_id,periode_debut' })
        if (upsertErr) { console.error('[PALMS Import] Upsert error:', prenom, nom, upsertErr); skipped++; continue }
        imported++
      }

      // Recalculer les scores BNI automatiquement après l'import
      let scoreResult = null
      try {
        scoreResult = await recalculateScores(groupeCode)
      } catch (e) {
        console.error('[PALMS Import] Erreur recalcul scores:', e)
      }

      setResult({ imported, skipped, total: rows.length, periode_debut, periode_fin, dateImport, jeudisCouverts, jeudisTotalMois, scoreResult })
      if (onImportDone) onImportDone()

    } catch (err) {
      setError('Erreur lors de l\'import : ' + err.message)
    }
    setLoading(false)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:13, fontWeight:600 }}>📥 Import PALMS XLS</div>
        <div style={{ fontSize:11, color:'#9CA3AF' }}>Export BNI Connect · Format XLS</div>
      </div>
      <div style={{ padding:16 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current.click()}
          style={{ border:`2px dashed ${dragging?'#C41E3A':'#E8E6E1'}`, borderRadius:10, padding:'32px 20px', textAlign:'center', cursor:'pointer', background:dragging?'#FEF2F2':'#FAFAF8', transition:'all 0.15s' }}
        >
          <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
          <div style={{ fontSize:14, fontWeight:600, color:'#1C1C2E', marginBottom:4 }}>
            {loading ? 'Import en cours...' : 'Glisser le fichier PALMS ici'}
          </div>
          <div style={{ fontSize:12, color:'#9CA3AF' }}>ou cliquer pour sélectionner · XLS BNI Connect</div>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display:'none' }} onChange={e => processFile(e.target.files[0])} />
        </div>

        {loading && (
          <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:8, color:'#6B7280', fontSize:13 }}>
            <div style={{ width:16, height:16, border:'2px solid #E8E6E1', borderTopColor:'#C41E3A', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            Analyse et import des données...
          </div>
        )}

        {error && (
          <div style={{ marginTop:12, padding:12, background:'#FEF2F2', border:'1px solid #FEE2E2', borderRadius:8, fontSize:13, color:'#DC2626' }}>⚠️ {error}</div>
        )}

        {result && (
          <div style={{ marginTop:12, padding:12, background:'#D1FAE5', border:'1px solid #A7F3D0', borderRadius:8 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#065F46', marginBottom:4 }}>✅ Import réussi !</div>
            <div style={{ fontSize:12, color:'#059669' }}>
              {result.imported} membres importés · {result.skipped} non trouvés · {result.total} lignes traitées
            </div>
            {result.periode_debut && result.periode_fin && (
              <div style={{ fontSize:12, color:'#065F46', marginTop:4 }}>
                Période : du {new Date(result.periode_debut).toLocaleDateString('fr-FR')} au {new Date(result.periode_fin).toLocaleDateString('fr-FR')} · Import au {new Date(result.dateImport).toLocaleDateString('fr-FR')} · {result.jeudisCouverts}/{result.jeudisTotalMois} réunions couvertes
              </div>
            )}
            {result.scoreResult && (
              <div style={{ fontSize:12, color:'#065F46', marginTop:4, padding:'6px 10px', background:'rgba(255,255,255,0.5)', borderRadius:6 }}>
                📊 Scores recalculés : {result.scoreResult.count} membres · {result.scoreResult.nbSemaines} semaine{result.scoreResult.nbSemaines > 1 ? 's' : ''} couverte{result.scoreResult.nbSemaines > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop:12, fontSize:11, color:'#9CA3AF', lineHeight:1.6 }}>
          💡 Exportez depuis BNI Connect → Rapports → PALMS → Export XLS. Les données existantes seront mises à jour automatiquement.
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
