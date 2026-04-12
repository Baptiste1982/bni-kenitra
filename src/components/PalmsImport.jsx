import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function PalmsImport({ onImportDone }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef()

  const parseXML = (text) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const rows = doc.querySelectorAll('Row')
    const data = []
    let headers = []
    
    rows.forEach((row, i) => {
      const cells = Array.from(row.querySelectorAll('Cell'))
      const vals = cells.map(c => c.querySelector('Data')?.textContent?.trim() || '')
      
      if (i === 0) { headers = vals; return }
      if (vals.every(v => !v)) return
      
      const obj = {}
      headers.forEach((h, j) => { obj[h] = vals[j] || '' })
      if (obj['Prénom'] || obj['Nom']) data.push(obj)
    })
    return data
  }

  const processFile = async (file) => {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const text = await file.text()
      let rows = []

      // Try XML (SpreadsheetML)
      if (text.includes('<?xml') || text.includes('<Workbook')) {
        rows = parseXML(text)
      } else {
        setError('Format non reconnu. Utilisez l\'export XLS de BNI Connect.')
        setLoading(false)
        return
      }

      if (rows.length === 0) {
        setError('Aucune donnée trouvée dans le fichier.')
        setLoading(false)
        return
      }

      // Get groupe MK-01
      const { data: groupes } = await supabase.from('groupes').select('id,code').eq('code', 'MK-01').single()
      const groupeId = groupes?.id

      // Get existing membres
      const { data: membres } = await supabase.from('membres').select('id,prenom,nom').eq('groupe_id', groupeId)
      
      let imported = 0, skipped = 0
      const periode_debut = '2025-10-01'
      const periode_fin = '2026-03-31'

      for (const row of rows) {
        const prenom = (row['Prénom'] || '').trim()
        const nom = (row['Nom'] || '').trim()
        if (!prenom && !nom) continue

        // Find membre
        const membre = membres?.find(m => 
          m.prenom.toLowerCase().includes(prenom.toLowerCase()) || 
          prenom.toLowerCase().includes(m.prenom.toLowerCase()) ||
          m.nom.toLowerCase().includes(nom.toLowerCase())
        )

        if (!membre) { skipped++; continue }

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
        await supabase.from('palms_imports').upsert(palmsData, { onConflict: 'membre_id,periode_debut' })
        imported++
      }

      setResult({ imported, skipped, total: rows.length })
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
