import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader, SectionTitle, Card, canWrite, ReadOnlyBanner } from './ui'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, Brush } from 'recharts'

const MOIS_NOMS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
const moisLabelFromNum = (m) => MOIS_COURT[(m - 1) % 12] || '?'

const scoreTl = (s) => s >= 70 ? { bg:'#D1FAE5', color:'#065F46', label:'Vert' }
  : s >= 50 ? { bg:'#FEF9C3', color:'#854D0E', label:'Orange' }
  : s >= 30 ? { bg:'#FEE2E2', color:'#991B1B', label:'Rouge' }
  : { bg:'#F3F4F6', color:'#4B5563', label:'Gris' }

// Parseur SpreadsheetML 2003 du rapport Traffic Light régional PALMS
function parseRegionTrafficLightXml(xml) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.getElementsByTagName('parsererror').length) return null
    const SS = 'urn:schemas-microsoft-com:office:spreadsheet'
    const getElems = (p, n) => {
      const ns = p.getElementsByTagNameNS ? p.getElementsByTagNameNS(SS, n) : null
      if (ns && ns.length) return Array.from(ns)
      return Array.from(p.getElementsByTagName(n))
    }
    const getAttr = (el, n) => {
      const v = el.getAttributeNS ? el.getAttributeNS(SS, n) : null
      return v || el.getAttribute('ss:' + n) || el.getAttribute(n)
    }
    const rows = getElems(doc, 'Row')
    const parsedRows = []
    for (const row of rows) {
      const cells = getElems(row, 'Cell')
      const vals = []
      let colIdx = 1
      for (const cell of cells) {
        const idx = parseInt(getAttr(cell, 'Index')) || colIdx
        while (vals.length < idx - 1) { vals.push(''); colIdx++ }
        const data = getElems(cell, 'Data')[0]
        vals.push(data ? (data.textContent || '').trim() : '')
        colIdx = idx + 1
        const merge = parseInt(getAttr(cell, 'MergeAcross')) || 0
        for (let k = 0; k < merge; k++) { vals.push(''); colIdx++ }
      }
      parsedRows.push(vals)
    }
    let region = 'Kenitra', annee = new Date().getFullYear(), moisNom = ''
    for (const r of parsedRows) {
      if (r[0] === 'Région :' && r[1]) region = r[1]
      if (r[0] === 'Année :' && r[1]) annee = parseInt(r[1]) || annee
      if (r[0] === 'Mois :' && r[1]) moisNom = r[1].toLowerCase()
    }
    const moisNum = MOIS_NOMS.indexOf(moisNom) + 1
    if (!moisNum) return null
    const groupes = []
    let headerFound = false
    for (const r of parsedRows) {
      if (!headerFound) { if (r[0] === 'Nom du Groupe') headerFound = true; continue }
      if (!r[0] || r[0].trim() === '') continue
      groupes.push({
        nom: r[0].trim(),
        taille: parseFloat(r[1]) || 0,
        croissance: parseFloat(r[2]) || 0,
        stabilite: parseFloat(r[3]) || 0,
        recommandations: parseFloat(r[4]) || 0,
        invites: parseFloat(r[5]) || 0,
        conversion: parseFloat(r[6]) || 0,
        absenteisme: parseFloat(r[7]) || 0,
        score: parseInt(r[8]) || 0,
      })
    }
    return { region, annee, mois: moisNum, groupes }
  } catch (e) {
    console.error('[RTL parse]', e)
    return null
  }
}

const groupColorFor = (nom, i) => {
  if (nom.startsWith('MK-01')) return '#C41E3A'
  if (nom.startsWith('MK-02')) return '#3B82F6'
  return ['#059669', '#7C3AED', '#D97706', '#0EA5E9', '#EC4899'][i % 5]
}

export default function RegionTrafficLight({ profil }) {
  const [rtlData, setRtlData] = useState([])
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [activeMetric, setActiveMetric] = useState('score') // score | recommandations | invites | conversion | absenteisme | taille_groupe
  const fileRef = useRef(null)

  const loadData = () => {
    supabase.from('region_traffic_light').select('*')
      .order('annee', { ascending: true }).order('mois', { ascending: true })
      .then(({ data }) => setRtlData(data || []))
  }
  useEffect(() => { loadData() }, [])

  const handleUpload = async (files) => {
    if (!files || files.length === 0) return
    setUploading(true); setMsg('')
    let imported = 0, errors = 0
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = parseRegionTrafficLightXml(text)
        if (!parsed) { errors++; continue }
        for (const g of parsed.groupes) {
          const payload = {
            region: parsed.region, annee: parsed.annee, mois: parsed.mois,
            groupe_nom: g.nom, taille_groupe: g.taille, croissance: g.croissance,
            stabilite: g.stabilite, recommandations: g.recommandations, invites: g.invites,
            conversion: g.conversion, absenteisme: g.absenteisme, score: g.score,
            imported_at: new Date().toISOString(),
          }
          const { error } = await supabase.from('region_traffic_light').upsert(payload, { onConflict: 'region,annee,mois,groupe_nom' })
          if (error) { errors++; console.error('[RTL upsert]', error) } else imported++
        }
      } catch (e) { errors++; console.error('[RTL file]', e) }
    }
    setMsg(`${imported} lignes importées${errors > 0 ? ` · ${errors} erreur(s)` : ''}`)
    await loadData()
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette entrée ?')) return
    await supabase.from('region_traffic_light').delete().eq('id', id)
    await loadData()
  }

  // Build unique groupes list + chart data
  const groupesNoms = Array.from(new Set(rtlData.map(r => r.groupe_nom))).sort()
  const allPoints = new Map()
  rtlData.forEach(r => {
    const key = `${r.annee}-${String(r.mois).padStart(2,'0')}`
    if (!allPoints.has(key)) allPoints.set(key, {
      annee: r.annee, mois: r.mois, key,
      label: `${moisLabelFromNum(r.mois)} ${String(r.annee).slice(-2)}`,
    })
    const pt = allPoints.get(key)
    pt[r.groupe_nom] = r[activeMetric]
  })
  const chartData = Array.from(allPoints.values()).sort((a, b) => (a.annee*12+a.mois) - (b.annee*12+b.mois))

  // Stats mois en cours
  const now = new Date()
  const anneeCourante = now.getFullYear()
  const moisCourantNum = now.getMonth() + 1
  const rowsMoisCourant = rtlData.filter(r => r.annee === anneeCourante && r.mois === moisCourantNum)
  const scoreMoyenMoisCourant = rowsMoisCourant.length > 0
    ? Math.round(rowsMoisCourant.reduce((s, r) => s + (r.score || 0), 0) / rowsMoisCourant.length)
    : null

  // Delta vs mois précédent
  const moisPrev = moisCourantNum === 1 ? { annee: anneeCourante - 1, mois: 12 } : { annee: anneeCourante, mois: moisCourantNum - 1 }
  const rowsMoisPrev = rtlData.filter(r => r.annee === moisPrev.annee && r.mois === moisPrev.mois)
  const scoreMoyenMoisPrev = rowsMoisPrev.length > 0
    ? Math.round(rowsMoisPrev.reduce((s, r) => s + (r.score || 0), 0) / rowsMoisPrev.length)
    : null
  const delta = (scoreMoyenMoisCourant !== null && scoreMoyenMoisPrev !== null) ? scoreMoyenMoisCourant - scoreMoyenMoisPrev : null

  const METRICS = [
    { key:'score', label:'Score global', suffix:'', max:100 },
    { key:'recommandations', label:'Recos / sem', suffix:'', max:null },
    { key:'invites', label:'Invités / sem', suffix:'', max:null },
    { key:'conversion', label:'Conversion', suffix:'%', max:null },
    { key:'absenteisme', label:'Absentéisme', suffix:'%', max:null },
    { key:'taille_groupe', label:'Taille groupe', suffix:'', max:null },
  ]
  const activeMetricDef = METRICS.find(m => m.key === activeMetric)

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <ReadOnlyBanner profil={profil} />
      <PageHeader
        title="🚦 Traffic Light Régional"
        sub={`Progression mensuelle · ${rtlData.length} lignes importées · ${groupesNoms.length} groupe${groupesNoms.length > 1 ? 's' : ''}`}
        right={canWrite(profil) ? (
          <div>
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.xml" multiple hidden onChange={e => handleUpload(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ background: uploading ? '#E8E6E1' : '#1C1C2E', color:'#fff', border:'none', padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:700, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
              {uploading ? '⏳ Import...' : '📂 Importer .xls (multi)'}
            </button>
            {msg && <div style={{ marginTop:4, fontSize:11, color: msg.includes('erreur') ? '#DC2626' : '#059669', fontWeight:600 }}>{msg}</div>}
          </div>
        ) : null}
      />

      {rtlData.length === 0 ? (
        <Card style={{ marginTop:24 }}>
          <div style={{ padding:32, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
            Aucun rapport Traffic Light importé.<br/>
            {canWrite(profil) && <span style={{ fontSize:12, marginTop:8, display:'inline-block' }}>Cliquez sur "Importer" en haut à droite pour uploader les rapports mensuels .xls depuis PALMS.</span>}
          </div>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, marginBottom:20 }}>
            <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Mois en cours</div>
              <div style={{ fontSize:24, fontWeight:700, color: scoreMoyenMoisCourant !== null ? scoreTl(scoreMoyenMoisCourant).color : '#9CA3AF', fontFamily:'DM Sans, sans-serif' }}>
                {scoreMoyenMoisCourant !== null ? `${scoreMoyenMoisCourant} / 100` : '—'}
              </div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                {moisLabelFromNum(moisCourantNum)} {anneeCourante} · score moyen
                {scoreMoyenMoisCourant !== null && <span style={{ marginLeft:8, fontSize:9, padding:'2px 6px', borderRadius:4, ...scoreTl(scoreMoyenMoisCourant) }}>{scoreTl(scoreMoyenMoisCourant).label}</span>}
              </div>
            </div>
            <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Évolution</div>
              <div style={{ fontSize:24, fontWeight:700, color: delta === null ? '#9CA3AF' : delta > 0 ? '#059669' : delta < 0 ? '#DC2626' : '#6B7280', fontFamily:'DM Sans, sans-serif' }}>
                {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta} pts`}
              </div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>vs {moisLabelFromNum(moisPrev.mois)} {moisPrev.annee}</div>
            </div>
            <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Historique</div>
              <div style={{ fontSize:24, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>{chartData.length} mois</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                {chartData.length > 0 && `de ${chartData[0].label} à ${chartData[chartData.length-1].label}`}
              </div>
            </div>
            <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Groupes suivis</div>
              <div style={{ fontSize:24, fontWeight:700, color:'#1C1C2E', fontFamily:'DM Sans, sans-serif' }}>{groupesNoms.length}</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>
                {groupesNoms.map(g => g.split(' ')[0]).join(' · ')}
              </div>
            </div>
          </div>

          {/* Metric selector */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
            {METRICS.map(m => (
              <button key={m.key} onClick={() => setActiveMetric(m.key)}
                style={{
                  padding:'6px 14px', borderRadius:20, border:'1px solid',
                  borderColor: activeMetric === m.key ? '#C41E3A' : '#E8E6E1',
                  background: activeMetric === m.key ? '#C41E3A' : '#fff',
                  color: activeMetric === m.key ? '#fff' : '#6B7280',
                  fontSize:12, fontWeight: activeMetric === m.key ? 700 : 500,
                  cursor:'pointer', fontFamily:'DM Sans, sans-serif', transition:'0.15s',
                }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Graphique principal avec Brush */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden', marginBottom:20 }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
              <SectionTitle>📈 {activeMetricDef.label} par groupe</SectionTitle>
              <span style={{ fontSize:10, color:'#6B7280' }}>
                {activeMetric === 'score' ? 'Seuils BNI : ≥70 vert · ≥50 orange · ≥30 rouge · <30 gris' : '↕️ Glisser la poignée en bas pour filtrer la période'}
              </span>
            </div>
            <div style={{ padding:'12px 8px 4px', height: 340, minWidth:0 }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EF" />
                  <XAxis dataKey="label" tick={{ fontSize:11, fill:'#6B7280' }} />
                  <YAxis domain={activeMetricDef.max ? [0, activeMetricDef.max] : ['auto', 'auto']} tick={{ fontSize:10, fill:'#9CA3AF' }} tickFormatter={(v) => `${v}${activeMetricDef.suffix}`} />
                  <Tooltip contentStyle={{ borderRadius:8, border:'1px solid #E8E6E1', fontSize:12 }} formatter={(v) => [`${Number(v).toFixed(2)}${activeMetricDef.suffix}`, '']} />
                  <Legend wrapperStyle={{ fontSize:11 }} />
                  {activeMetric === 'score' && <>
                    <ReferenceLine y={70} stroke="#059669" strokeDasharray="4 4" label={{ value:'Vert', position:'right', fill:'#059669', fontSize:10, fontWeight:600 }} />
                    <ReferenceLine y={50} stroke="#D97706" strokeDasharray="4 4" label={{ value:'Orange', position:'right', fill:'#D97706', fontSize:10, fontWeight:600 }} />
                    <ReferenceLine y={30} stroke="#DC2626" strokeDasharray="4 4" label={{ value:'Rouge', position:'right', fill:'#DC2626', fontSize:10, fontWeight:600 }} />
                  </>}
                  {groupesNoms.map((nom, i) => (
                    <Line key={nom} type="monotone" dataKey={nom} name={nom} stroke={groupColorFor(nom, i)} strokeWidth={3} dot={{ r:5 }} activeDot={{ r:8 }} connectNulls />
                  ))}
                  {chartData.length > 3 && (
                    <Brush dataKey="label" height={36} stroke="#C41E3A" fill="#FEF2F2" travellerWidth={10} tickFormatter={(i) => chartData[i]?.label || ''} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Barres comparatives : dernier mois */}
          {rowsMoisCourant.length > 0 && (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden', marginBottom:20 }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}>
                <SectionTitle>📊 Comparatif groupes — {moisLabelFromNum(moisCourantNum)} {anneeCourante}</SectionTitle>
              </div>
              <div style={{ padding:'12px 8px 4px', height:220, minWidth:0 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={rowsMoisCourant.map(r => ({ nom: r.groupe_nom.split(' ')[0], score: r.score, recos: r.recommandations, invites: r.invites }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EF" />
                    <XAxis dataKey="nom" tick={{ fontSize:11, fill:'#6B7280' }} />
                    <YAxis tick={{ fontSize:10, fill:'#9CA3AF' }} />
                    <Tooltip contentStyle={{ borderRadius:8, border:'1px solid #E8E6E1', fontSize:12 }} />
                    <Legend wrapperStyle={{ fontSize:11 }} />
                    <Bar dataKey="score" name="Score" fill="#C41E3A" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tableau détaillé */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}>
              <SectionTitle>📋 Détail mensuel</SectionTitle>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr>{['Période','Groupe','Taille','Crois.','Stab.','Recos/sem','Invités/sem','Conv.%','Absent.%','Score', ...(canWrite(profil) ? [''] : [])].map(h => (
                  <th key={h} style={{ background:'#F9F8F6', padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1', whiteSpace:'nowrap' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {[...rtlData].sort((a, b) => (b.annee*12+b.mois) - (a.annee*12+a.mois)).map((r, i) => {
                    const enCours = r.annee === anneeCourante && r.mois === moisCourantNum
                    const sc = scoreTl(r.score)
                    return (
                      <tr key={r.id} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', background: enCours ? '#FFFBEB' : undefined }}>
                        <td style={{ padding:'8px 12px', fontSize:12, fontWeight:600, color:'#1C1C2E', whiteSpace:'nowrap' }}>
                          {moisLabelFromNum(r.mois)} {r.annee}
                          {enCours && <span style={{ marginLeft:6, fontSize:8, padding:'2px 6px', borderRadius:4, background:'#FEF3C7', color:'#92400E', fontWeight:700, textTransform:'uppercase' }}>En cours</span>}
                        </td>
                        <td style={{ padding:'8px 12px', fontSize:11, color:'#4B5563' }}>{r.groupe_nom}</td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#1C1C2E', textAlign:'right' }}>{Number(r.taille_groupe).toFixed(0)}</td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#1C1C2E', textAlign:'right' }}>{Number(r.croissance).toFixed(0)}</td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#1C1C2E', textAlign:'right' }}>{Number(r.stabilite).toFixed(2)}</td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#1C1C2E', textAlign:'right' }}>{Number(r.recommandations).toFixed(2)}</td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#1C1C2E', textAlign:'right' }}>{Number(r.invites).toFixed(2)}</td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#1C1C2E', textAlign:'right' }}>{Number(r.conversion).toFixed(2)}</td>
                        <td style={{ padding:'8px 12px', fontSize:12, color:'#1C1C2E', textAlign:'right' }}>{Number(r.absenteisme).toFixed(2)}</td>
                        <td style={{ padding:'8px 12px', fontWeight:700, textAlign:'center', background:sc.bg, color:sc.color }}>{r.score}</td>
                        {canWrite(profil) && (
                          <td style={{ padding:'8px 12px', textAlign:'center' }}>
                            <button onClick={() => handleDelete(r.id)} title="Supprimer cette ligne" style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:'#DC2626', opacity:0.5 }}
                              onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>🗑</button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
