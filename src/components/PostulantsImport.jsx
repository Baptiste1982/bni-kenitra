import React, { useState, useEffect, useRef } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { upsertPostulant, uploadPostulantPDF, extractPostulantFromImages } from '../lib/bniService'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const BLANK = {
  prenom:'', nom:'', email:'', phone:'', date_naissance:'',
  profession:'', categorie:'', entreprise:'', adresse_entreprise:'', ville:'',
  site_web:'', linkedin:'', parrain_nom:'', notes:'',
  statut:'contacte', source:'import_pdf',
}

export default function PostulantsImport({ groupes = [], defaultGroupeCode = 'MK-02', onClose, onSaved }) {
  const [file, setFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [scale, setScale] = useState(1.3)
  const [form, setForm] = useState({ ...BLANK, groupe_code: defaultGroupeCode })
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractedFields, setExtractedFields] = useState(new Set())
  const [extractInfo, setExtractInfo] = useState('')
  const [error, setError] = useState('')
  const canvasRef = useRef(null)
  const dropRef = useRef(null)

  // Charger le PDF dès qu'un fichier est sélectionné
  useEffect(() => {
    if (!file) { setPdfDoc(null); setNumPages(0); return }
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const doc = await pdfjs.getDocument({ data }).promise
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
      } catch (err) { setError('Erreur lecture PDF : ' + err.message) }
    }
    reader.readAsArrayBuffer(file)
  }, [file])

  // Rendu de la page courante
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: ctx, viewport }).promise
    })()
    return () => { cancelled = true }
  }, [pdfDoc, pageNum, scale])

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f && f.type === 'application/pdf') setFile(f)
    else setError('Glisse un fichier PDF')
  }

  const set = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }))
    // Si l'utilisateur modifie manuellement, on retire le flag "extrait"
    if (extractedFields.has(k)) {
      setExtractedFields(prev => { const n = new Set(prev); n.delete(k); return n })
    }
  }

  // Rend une page PDF en data URL JPEG (compact pour la vision API)
  const renderPageToDataURL = async (doc, pageNum, scale = 1.6) => {
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.82)
  }

  const handleExtract = async () => {
    if (!pdfDoc) return
    setExtracting(true); setError(''); setExtractInfo('')
    try {
      const maxPages = Math.min(pdfDoc.numPages, 8)
      setExtractInfo(`Rendu des ${maxPages} page(s)…`)
      const images = []
      for (let i = 1; i <= maxPages; i++) {
        images.push(await renderPageToDataURL(pdfDoc, i, 1.6))
      }
      setExtractInfo('Analyse IA en cours…')
      const res = await extractPostulantFromImages(images)
      const extracted = res?.extracted || {}
      const filled = new Set()
      setForm(prev => {
        const next = { ...prev }
        Object.entries(extracted).forEach(([k, v]) => {
          if (v !== null && v !== undefined && v !== '' && k in BLANK) {
            next[k] = String(v)
            filled.add(k)
          }
        })
        return next
      })
      setExtractedFields(filled)
      setExtractInfo(filled.size > 0 ? `✓ ${filled.size} champ(s) extrait(s) — vérifie et complète si besoin` : 'Aucune donnée extraite — remplis manuellement')
    } catch (err) {
      setError('Erreur extraction : ' + (err.message || err))
      setExtractInfo('')
    } finally {
      setExtracting(false)
    }
  }

  const canSave = form.prenom.trim() && form.nom.trim() && form.groupe_code

  const save = async () => {
    if (!canSave) return
    setSaving(true); setError('')
    try {
      let pdfUrl = null
      if (file) {
        pdfUrl = await uploadPostulantPDF(file, form.groupe_code, form.prenom, form.nom)
      }
      const payload = {
        ...form,
        email: form.email || null,
        phone: form.phone || null,
        date_naissance: form.date_naissance || null,
        pdf_url: pdfUrl,
      }
      await upsertPostulant(payload)
      if (onSaved) onSaved()
      onClose?.()
    } catch (err) {
      setError('Erreur enregistrement : ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  const mob = window.innerWidth <= 768
  const lbl = { fontSize:11, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4, display:'block' }
  const inpBase = { width:'100%', padding:'8px 10px', fontSize:13, border:'1px solid #E5E7EB', borderRadius:6, outline:'none', fontFamily:'inherit', background:'#fff' }
  const fieldStyle = (k) => extractedFields.has(k)
    ? { ...inpBase, border:'2px solid #F59E0B', background:'#FFFBEB', padding:'7px 9px' }
    : inpBase
  const inp = inpBase
  const LabelWithBadge = ({ k, children }) => (
    <label style={{ ...lbl, display:'flex', alignItems:'center', gap:6 }}>
      {children}
      {extractedFields.has(k) && (
        <span style={{ fontSize:8, padding:'1px 5px', borderRadius:3, background:'#F59E0B', color:'#fff', fontWeight:700, letterSpacing:'0.04em' }}>IA</span>
      )}
    </label>
  )

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(17,24,39,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding: mob ? 8 : 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:1200, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ background:'#1C1C2E', padding:'16px 22px', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>Importer une postulation</div>
            <div style={{ fontSize:12, opacity:0.7, marginTop:2 }}>Visualise le PDF à gauche, remplis les champs à droite</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'#fff', fontSize:22, cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>

        {/* Body split */}
        <div style={{ display:'flex', flex:1, minHeight:0, flexDirection: mob ? 'column' : 'row' }}>
          {/* PDF viewer */}
          <div style={{ flex: mob ? 'none' : 1.2, display:'flex', flexDirection:'column', background:'#F3F2EF', borderRight: mob ? 'none' : '1px solid #E8E6E1', borderBottom: mob ? '1px solid #E8E6E1' : 'none', minHeight: mob ? 320 : 'auto', maxHeight: mob ? '40vh' : 'auto' }}>
            {!file ? (
              <div
                ref={dropRef}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }}>
                <div style={{ width:64, height:64, borderRadius:'50%', background:'#E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, marginBottom:14 }}>📄</div>
                <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Dépose la fiche PDF ici</div>
                <div style={{ fontSize:12, color:'#6B7280', marginBottom:16 }}>ou clique pour sélectionner un fichier</div>
                <label style={{ padding:'8px 16px', background:'#1C1C2E', color:'#fff', borderRadius:8, fontSize:13, cursor:'pointer', fontWeight:600 }}>
                  Choisir un fichier
                  <input type="file" accept="application/pdf" style={{ display:'none' }} onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                </label>
              </div>
            ) : (
              <>
                <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:10, background:'#fff', borderBottom:'1px solid #E8E6E1', flexWrap:'wrap' }}>
                  <button onClick={() => setPageNum(p => Math.max(1, p-1))} disabled={pageNum<=1} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor: pageNum<=1?'default':'pointer', fontSize:13 }}>◀</button>
                  <span style={{ fontSize:13, fontWeight:600, minWidth:60, textAlign:'center' }}>{pageNum} / {numPages}</span>
                  <button onClick={() => setPageNum(p => Math.min(numPages, p+1))} disabled={pageNum>=numPages} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor: pageNum>=numPages?'default':'pointer', fontSize:13 }}>▶</button>
                  <button
                    onClick={handleExtract}
                    disabled={extracting}
                    title="Extraire automatiquement les infos du PDF avec Claude Vision"
                    style={{
                      padding:'5px 12px', borderRadius:6, border:'none',
                      background: extracting ? '#9CA3AF' : 'linear-gradient(135deg, #C41E3A 0%, #7C1428 100%)',
                      color:'#fff', cursor: extracting ? 'default' : 'pointer', fontSize:12, fontWeight:700,
                      display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
                      boxShadow: extracting ? 'none' : '0 2px 6px rgba(196,30,58,0.3)',
                    }}>
                    {extracting ? '⏳ Extraction…' : '✨ Extraire avec IA'}
                  </button>
                  <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                    <button onClick={() => setScale(s => Math.max(0.6, s-0.2))} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13 }}>−</button>
                    <button onClick={() => setScale(s => Math.min(3, s+0.2))} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13 }}>+</button>
                    <button onClick={() => { setFile(null); setExtractedFields(new Set()); setExtractInfo('') }} title="Changer de fichier" style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #FCA5A5', background:'#fff', color:'#B91C1C', cursor:'pointer', fontSize:13 }}>Retirer</button>
                  </div>
                </div>
                {extractInfo && (
                  <div style={{ padding:'8px 14px', background:'#FEF9C3', borderBottom:'1px solid #FDE68A', color:'#854D0E', fontSize:12, fontWeight:500 }}>
                    {extractInfo}
                  </div>
                )}
                <div style={{ flex:1, overflow:'auto', padding:14, display:'flex', justifyContent:'center' }}>
                  <canvas ref={canvasRef} style={{ boxShadow:'0 2px 8px rgba(0,0,0,0.12)', background:'#fff' }} />
                </div>
              </>
            )}
          </div>

          {/* Form */}
          <div style={{ flex:1, overflow:'auto', padding: mob ? 16 : 22, minWidth: mob ? 'auto' : 380 }}>
            <div style={{ display:'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap:12 }}>
              <div style={{ gridColumn:'1 / -1' }}>
                <label style={lbl}>Groupe cible *</label>
                <select value={form.groupe_code} onChange={e => set('groupe_code', e.target.value)} style={inp}>
                  {groupes.map(g => <option key={g.code} value={g.code}>{g.code} — {g.nom}</option>)}
                </select>
              </div>
              <div>
                <LabelWithBadge k="prenom">Prénom *</LabelWithBadge>
                <input value={form.prenom} onChange={e => set('prenom', e.target.value)} style={fieldStyle('prenom')} />
              </div>
              <div>
                <LabelWithBadge k="nom">Nom *</LabelWithBadge>
                <input value={form.nom} onChange={e => set('nom', e.target.value)} style={fieldStyle('nom')} />
              </div>
              <div>
                <LabelWithBadge k="email">Email</LabelWithBadge>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={fieldStyle('email')} />
              </div>
              <div>
                <LabelWithBadge k="phone">Téléphone</LabelWithBadge>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} style={fieldStyle('phone')} />
              </div>
              <div>
                <LabelWithBadge k="date_naissance">Date de naissance</LabelWithBadge>
                <input type="date" value={form.date_naissance} onChange={e => set('date_naissance', e.target.value)} style={fieldStyle('date_naissance')} />
              </div>
              <div>
                <LabelWithBadge k="ville">Ville</LabelWithBadge>
                <input value={form.ville} onChange={e => set('ville', e.target.value)} style={fieldStyle('ville')} />
              </div>
              <div>
                <LabelWithBadge k="profession">Profession</LabelWithBadge>
                <input value={form.profession} onChange={e => set('profession', e.target.value)} style={fieldStyle('profession')} />
              </div>
              <div>
                <LabelWithBadge k="categorie">Catégorie BNI</LabelWithBadge>
                <input value={form.categorie} onChange={e => set('categorie', e.target.value)} style={fieldStyle('categorie')} placeholder="ex: Assurance, Immobilier…" />
              </div>
              <div style={{ gridColumn:'1 / -1' }}>
                <LabelWithBadge k="entreprise">Entreprise / Raison sociale</LabelWithBadge>
                <input value={form.entreprise} onChange={e => set('entreprise', e.target.value)} style={fieldStyle('entreprise')} />
              </div>
              <div style={{ gridColumn:'1 / -1' }}>
                <LabelWithBadge k="adresse_entreprise">Adresse entreprise</LabelWithBadge>
                <input value={form.adresse_entreprise} onChange={e => set('adresse_entreprise', e.target.value)} style={fieldStyle('adresse_entreprise')} />
              </div>
              <div>
                <LabelWithBadge k="site_web">Site web</LabelWithBadge>
                <input value={form.site_web} onChange={e => set('site_web', e.target.value)} style={fieldStyle('site_web')} />
              </div>
              <div>
                <LabelWithBadge k="linkedin">LinkedIn</LabelWithBadge>
                <input value={form.linkedin} onChange={e => set('linkedin', e.target.value)} style={fieldStyle('linkedin')} />
              </div>
              <div style={{ gridColumn:'1 / -1' }}>
                <LabelWithBadge k="parrain_nom">Parrain / Source</LabelWithBadge>
                <input value={form.parrain_nom} onChange={e => set('parrain_nom', e.target.value)} style={fieldStyle('parrain_nom')} placeholder="Nom du parrain, site BNI, etc." />
              </div>
              <div>
                <label style={lbl}>Statut initial</label>
                <select value={form.statut} onChange={e => set('statut', e.target.value)} style={inp}>
                  <option value="contacte">Contacté</option>
                  <option value="rdv_planifie">RDV planifié</option>
                  <option value="visiteur">Visiteur</option>
                  <option value="inscrit">Inscrit</option>
                </select>
              </div>
              <div style={{ gridColumn:'1 / -1' }}>
                <LabelWithBadge k="notes">Notes</LabelWithBadge>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} style={{ ...fieldStyle('notes'), resize:'vertical', fontFamily:'inherit' }} />
              </div>
            </div>

            {error && (
              <div style={{ marginTop:14, padding:'10px 12px', background:'#FEE2E2', color:'#991B1B', borderRadius:8, fontSize:13 }}>{error}</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 22px', borderTop:'1px solid #E8E6E1', display:'flex', justifyContent:'flex-end', gap:10, background:'#FAFAF7' }}>
          <button onClick={onClose} disabled={saving} style={{ padding:'9px 16px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>Annuler</button>
          <button onClick={save} disabled={!canSave || saving} style={{ padding:'9px 18px', borderRadius:8, border:'none', background: !canSave || saving ? '#9CA3AF' : '#C41E3A', color:'#fff', cursor: !canSave || saving ? 'default' : 'pointer', fontSize:13, fontWeight:700 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer le postulant'}
          </button>
        </div>
      </div>
    </div>
  )
}
