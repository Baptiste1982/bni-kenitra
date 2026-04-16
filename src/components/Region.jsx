import React, { useState, useEffect, useRef } from 'react'
import { fetchRegionKPIs } from '../lib/bniService'
import { supabase } from '../lib/supabase'
import { PageHeader, SectionTitle, TableWrap, fullName, canWrite } from './ui'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts'

const MOIS_NOMS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const MOIS_COURT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']
const moisLabelFromNum = (m) => MOIS_COURT[(m - 1) % 12] || '?'

// Parseur du rapport Traffic Light régional PALMS (.xls SpreadsheetML 2003)
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
    // Extraire region / annee / mois depuis les lignes "Region :" / "Année :" / "Mois :"
    let region = 'Kenitra', annee = new Date().getFullYear(), moisNom = ''
    for (const r of parsedRows) {
      if (r[0] === 'Région :' && r[1]) region = r[1]
      if (r[0] === 'Année :' && r[1]) annee = parseInt(r[1]) || annee
      if (r[0] === 'Mois :' && r[1]) moisNom = r[1].toLowerCase()
    }
    const moisNum = MOIS_NOMS.indexOf(moisNom) + 1
    if (!moisNum) return null
    // Lignes de donnees : commencent apres la ligne d'en-tete contenant "Nom du Groupe"
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

const GROUP_COLORS = { 'MK-01': '#C41E3A', 'MK-02': '#3B82F6' }
const fmtMAD = v => Math.round(v).toLocaleString('de-DE') + ' MAD'
const fmtNum = v => Number(v).toLocaleString('de-DE')

// Même logique de couleurs conditionnelles que Dashboard
const kpiBg = (good, mid, val, threshGood, threshMid) =>
  val >= threshGood ? { bg:'#D1FAE5', topBg:'#A7F3D0', color:'#065F46' }
  : val >= threshMid ? { bg:'#FEF9C3', topBg:'#FDE68A', color:'#854D0E' }
  : { bg:'#FEE2E2', topBg:'#FECACA', color:'#991B1B' }

export default function Region({ profil }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rtlData, setRtlData] = useState([]) // Historique Traffic Light regional
  const [rtlUploading, setRtlUploading] = useState(false)
  const [rtlMsg, setRtlMsg] = useState('')
  const rtlFileRef = useRef(null)

  const loadRtl = () => {
    supabase.from('region_traffic_light').select('*').order('annee',{ascending:true}).order('mois',{ascending:true}).then(({ data }) => setRtlData(data || []))
  }

  useEffect(() => {
    fetchRegionKPIs().then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
    loadRtl()
  }, [])

  const handleRtlUpload = async (files) => {
    if (!files || files.length === 0) return
    setRtlUploading(true); setRtlMsg('')
    let imported = 0, skipped = 0, errors = 0
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
    setRtlMsg(`${imported} lignes importées${errors > 0 ? ` · ${errors} erreur(s)` : ''}`)
    await loadRtl()
    setRtlUploading(false)
    if (rtlFileRef.current) rtlFileRef.current.value = ''
  }

  const isMobile = window.innerWidth <= 768

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, border:'3px solid #E8E6E1', borderTopColor:'#C41E3A', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
        <div style={{ color:'#9CA3AF', fontSize:13 }}>Chargement des données régionales...</div>
      </div>
    </div>
  )

  if (!data) return <div style={{ padding:32, color:'#9CA3AF', textAlign:'center' }}>Aucune donnée disponible</div>

  const groupeCodes = Object.keys(data.byGroupe)
  const hover = e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform='translateY(-1px)' }
  const unhover = e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' }

  // Barre comparative horizontale
  const CompareBar = ({ label, values, format = 'num', max }) => {
    const maxVal = max || Math.max(...values.map(v => v.value), 1)
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
        {values.map((v, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <div style={{ width:48, fontSize:10, fontWeight:600, color:v.color || '#6B7280', textAlign:'right', flexShrink:0 }}>{v.label}</div>
            <div style={{ flex:1, background:'#F3F2EF', borderRadius:4, height:22, overflow:'hidden', position:'relative' }}>
              <div style={{ height:'100%', width:`${Math.min(100, v.value / maxVal * 100)}%`, background:v.color || '#C41E3A', borderRadius:4, transition:'width 0.6s ease', minWidth: v.value > 0 ? 2 : 0 }} />
            </div>
            <div style={{ width:80, fontSize:12, fontWeight:700, color:'#1C1C2E', textAlign:'right', flexShrink:0 }}>
              {format === 'mad' ? fmtMAD(v.value) : format === 'pct' ? v.value + '%' : fmtNum(v.value)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Top table — même style que Dashboard
  const TopTable = ({ title, icon, items, valueLabel, formatFn = fmtNum }) => (
    <TableWrap>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <SectionTitle>{icon} {title}</SectionTitle>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr>
          {['#', 'Membre', 'Groupe', valueLabel].map(h => (
            <th key={h} style={{ background:'#F9F8F6', padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1' }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)' }}
              onMouseEnter={e => e.currentTarget.style.opacity='0.85'} onMouseLeave={e => e.currentTarget.style.opacity='1'}>
              <td style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:12, width:30 }}>{i + 1}</td>
              <td style={{ padding:'8px 12px', fontWeight:600, fontSize:13, color:'#1C1C2E' }}>
                {item.membres ? fullName(item.membres.prenom, item.membres.nom) : fullName(item.prenom, item.nom)}
              </td>
              <td style={{ padding:'8px 12px' }}>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background: (GROUP_COLORS[item.groupeCode] || '#6B7280') + '15', color: GROUP_COLORS[item.groupeCode] || '#6B7280', fontWeight:600 }}>{item.groupeCode}</span>
              </td>
              <td style={{ padding:'8px 12px', fontWeight:700, fontSize:13, color:'#1C1C2E', textAlign:'right' }}>{formatFn(item.total_score ?? item.tyfcb ?? item.total)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontSize:12 }}>Aucune donnée</td></tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  )

  // KPI cards data — même esthétique que Dashboard
  const objRegional = groupeCodes.length * 30
  const kpiCards = [
    { label:'Membres actifs', value: data.totalMembres, sub:`Objectif régional : ${objRegional}`,
      ...kpiBg(null,null, data.totalMembres, objRegional*0.83, objRegional*0.66),
      prog: data.totalMembres / objRegional * 100,
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].membresActifs}`) },
    { label:'Taux de présence', value: data.pRateRegion + '%', sub:'Moyenne pondérée région',
      ...kpiBg(null,null, data.pRateRegion, 95, 88),
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].pRate}%`) },
    { label:'TYFCB généré', value: fmtMAD(data.tyfcbRegion), sub:'Business total référencé',
      ...kpiBg(null,null, data.tyfcbRegion, 500000, 100000),
      detail: groupeCodes.map(c => `${c}: ${fmtMAD(data.byGroupe[c].tyfcb)}`) },
    { label:'Recommandations', value: fmtNum(data.totalRecosRegion), sub:`${data.recosParMembreRegion} par membre`,
      ...kpiBg(null,null, data.totalRecosRegion, 80, 30),
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].totalRecos}`) },
    { label:'Score PALMS moyen', value: data.scoreMoyenRegion, sub:'Moyenne régionale',
      ...kpiBg(null,null, data.scoreMoyenRegion, 70, 50),
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].scoreMoyen}`) },
    { label:'Membres zone rouge', value: data.zoneRougeRegion, sub:'Sous les seuils BNI',
      bg: data.zoneRougeRegion <= 2 ? '#D1FAE5' : data.zoneRougeRegion <= 5 ? '#FEF9C3' : '#FEE2E2',
      topBg: data.zoneRougeRegion <= 2 ? '#A7F3D0' : data.zoneRougeRegion <= 5 ? '#FDE68A' : '#FECACA',
      color: data.zoneRougeRegion <= 2 ? '#065F46' : data.zoneRougeRegion <= 5 ? '#854D0E' : '#991B1B',
      detail: groupeCodes.map(c => `${c}: ${data.byGroupe[c].zoneRouge}`) },
  ]

  return (
    <div style={{ padding: isMobile ? '20px 16px' : '28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Suivi Régional"
        sub="Vue consolidée de tous les groupes BNI Kénitra"
      />

      {/* Bandeau résumé — même style que Dashboard mois en cours */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: isMobile ? '10px 14px' : '14px 20px', background:'#1C1C2E', borderRadius:12, marginBottom:20, color:'#fff', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap: isMobile ? 8 : 16, flex:1, minWidth:0 }}>
          <div style={{ fontSize: isMobile ? 16 : 22, fontWeight:700, fontFamily:'DM Sans, sans-serif' }}>Région Kénitra</div>
          <div style={{ display:'flex', gap:6 }}>
            {groupeCodes.map(code => (
              <span key={code} style={{ fontSize:10, padding:'3px 10px', borderRadius:8, background: GROUP_COLORS[code], color:'#fff', fontWeight:600 }}>{code}</span>
            ))}
          </div>
        </div>
        <div style={{ fontSize:12, opacity:0.6 }}>{data.totalMembres} membres actifs</div>
      </div>

      {/* KPI cards — même esthétique que Dashboard */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: isMobile ? 10 : 16, marginBottom:24 }}>
        {kpiCards.map(c => (
          <div key={c.label} onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:c.bg, borderRadius:12, border:'1px solid rgba(0,0,0,0.06)', overflow:'hidden', cursor:'default', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ background:c.topBg, padding: isMobile ? '6px 12px' : '10px 20px' }}>
              <div style={{ fontSize: isMobile ? 9 : 11, fontWeight:600, color:c.color, textTransform:'uppercase', letterSpacing:'0.07em', opacity:0.8 }}>{c.label}</div>
            </div>
            <div style={{ padding: isMobile ? '8px 12px 12px' : '14px 20px 18px' }}>
              <div style={{ fontSize: isMobile ? 18 : 28, fontWeight:700, fontFamily:'DM Sans, sans-serif', color:c.color }}>{c.value}</div>
              <div style={{ fontSize: isMobile ? 10 : 12, color:'#6B7280', marginTop:4 }}>{c.sub}</div>
              {c.prog !== undefined && <div style={{ height:4, background:'rgba(255,255,255,0.5)', borderRadius:2, marginTop:10 }}><div style={{ height:4, width:`${Math.min(100,c.prog)}%`, background:c.color, borderRadius:2, opacity:0.5 }} /></div>}
              <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                {c.detail.map((d, i) => (
                  <span key={i} style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background:'rgba(255,255,255,0.6)', color:c.color, fontWeight:600 }}>{d}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparatif + Traffic Light + Pipeline — même layout 2 colonnes que Dashboard */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap:16, marginBottom:24 }}>
        {/* Barres comparatives */}
        <TableWrap>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <SectionTitle>📊 Comparatif groupes</SectionTitle>
          </div>
          <div style={{ padding:16 }}>
            <CompareBar label="Membres actifs" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].membresActifs, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Taux de présence" format="pct" max={100} values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].pRate, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Score PALMS moyen" max={100} values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].scoreMoyen, color: GROUP_COLORS[c] }))} />
            <CompareBar label="TYFCB" format="mad" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].tyfcb, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Recommandations" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalRecos, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Recos/membre" values={groupeCodes.map(c => ({ label: c, value: parseFloat(data.byGroupe[c].recosParMembre), color: GROUP_COLORS[c] }))} />
            <CompareBar label="TaT réalisés" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalTaT, color: GROUP_COLORS[c] }))} />
            <CompareBar label="MPB" format="mad" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalMPB, color: GROUP_COLORS[c] }))} />
            <CompareBar label="Invités apportés" values={groupeCodes.map(c => ({ label: c, value: data.byGroupe[c].totalInvites, color: GROUP_COLORS[c] }))} />
          </div>
        </TableWrap>

        {/* Colonne droite — même layout que Dashboard */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Traffic Light régional */}
          <div onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Traffic Light</SectionTitle>
            </div>
            {[['vert', data.tlCountsRegion.vert, '#059669', '#D1FAE5'], ['orange', data.tlCountsRegion.orange, '#854D0E', '#FEF9C3'], ['rouge', data.tlCountsRegion.rouge, '#991B1B', '#FEE2E2'], ['gris', data.tlCountsRegion.gris, '#4B5563', '#E5E7EB']].map(([t, n, col, bg]) => (
              <div key={t} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'8px 12px', borderRadius:8, background:bg }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:({ vert:'#059669', orange:'#D97706', rouge:'#DC2626', gris:'#9CA3AF' })[t], flexShrink:0 }} />
                <span style={{ fontSize:12, width:50, fontWeight:700, color:col }}>{t}</span>
                <div style={{ flex:1, background:'rgba(255,255,255,0.6)', height:8, borderRadius:4 }}>
                  <div style={{ width:`${(n || 0) / Math.max(data.totalMembres, 1) * 100}%`, height:8, borderRadius:4, background:({ vert:'#059669', orange:'#D97706', rouge:'#DC2626', gris:'#9CA3AF' })[t], transition:'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize:16, fontWeight:700, width:28, textAlign:'right', color:col }}>{n || 0}</span>
              </div>
            ))}
            <div style={{ display:'flex', gap:4, marginTop:10, flexWrap:'wrap' }}>
              {groupeCodes.map(c => (
                <div key={c} style={{ fontSize:9, padding:'3px 8px', borderRadius:6, background:GROUP_COLORS[c] + '12', color:GROUP_COLORS[c], fontWeight:600 }}>
                  {c}: {Object.entries(data.byGroupe[c].tlCounts).map(([k,v]) => `${v}${k[0]}`).join(' ')}
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline invités */}
          <div onMouseEnter={hover} onMouseLeave={unhover}
            style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #E8E6E1', transition:'box-shadow 0.15s, transform 0.15s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <SectionTitle>Pipeline invités</SectionTitle>
            </div>
            {[
              ['Total', data.invitesTotalRegion, '#1C1C2E'],
              ['Devenus membres', data.invitesConvertisRegion, '#059669'],
              ['En cours', data.invitesEnCoursRegion, '#D97706'],
            ].map(([l, v, col]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:12, color:'#6B7280' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:col }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:8, padding:'6px 10px', background:'#F9F8F6', borderRadius:6, fontSize:11, color:'#6B7280' }}>
              Conversion : <strong style={{ color:'#065F46' }}>{data.invitesTotalRegion > 0 ? Math.round(data.invitesConvertisRegion / data.invitesTotalRegion * 100) : 0}%</strong>
            </div>
            <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
              {groupeCodes.map(c => (
                <span key={c} style={{ fontSize:9, padding:'2px 8px', borderRadius:6, background:GROUP_COLORS[c] + '12', color:GROUP_COLORS[c], fontWeight:600 }}>
                  {c}: {data.byGroupe[c].invitesTotal} inv.
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── TRAFFIC LIGHT RÉGIONAL — PROGRESSION MENSUELLE ────────────── */}
      {(() => {
        // Grouper par groupe, trier par date (annee*100+mois)
        const moisCourant = new Date()
        const anneeCourante = moisCourant.getFullYear()
        const moisCourantNum = moisCourant.getMonth() + 1
        const byGroupe = {}
        rtlData.forEach(r => {
          if (!byGroupe[r.groupe_nom]) byGroupe[r.groupe_nom] = []
          byGroupe[r.groupe_nom].push(r)
        })
        Object.values(byGroupe).forEach(arr => arr.sort((a, b) => (a.annee * 12 + a.mois) - (b.annee * 12 + b.mois)))
        const groupesNoms = Object.keys(byGroupe)
        // Preparer les donnees chart : un point par (annee, mois), valeur = score moyen ou par groupe
        const allPoints = new Map()
        rtlData.forEach(r => {
          const key = `${r.annee}-${String(r.mois).padStart(2,'0')}`
          if (!allPoints.has(key)) allPoints.set(key, { annee:r.annee, mois:r.mois, key, label:`${moisLabelFromNum(r.mois)} ${String(r.annee).slice(-2)}` })
          const pt = allPoints.get(key)
          pt[r.groupe_nom] = r.score
        })
        const chartData = Array.from(allPoints.values()).sort((a, b) => (a.annee*12+a.mois) - (b.annee*12+b.mois))
        const groupColorFor = (nom, i) => {
          if (nom.startsWith('MK-01')) return '#C41E3A'
          if (nom.startsWith('MK-02')) return '#3B82F6'
          return ['#059669','#7C3AED','#D97706','#0EA5E9'][i % 4]
        }
        return (
          <div style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
              <SectionTitle>🚦 Traffic Light régional — progression mensuelle</SectionTitle>
              {canWrite(profil) && (
                <div>
                  <input ref={rtlFileRef} type="file" accept=".xls,.xlsx,.xml" multiple hidden
                    onChange={e => handleRtlUpload(e.target.files)} />
                  <button onClick={() => rtlFileRef.current?.click()} disabled={rtlUploading}
                    style={{ background: rtlUploading ? '#E8E6E1' : '#1C1C2E', color:'#fff', border:'none', padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, cursor: rtlUploading ? 'not-allowed' : 'pointer', fontFamily:'DM Sans, sans-serif' }}>
                    {rtlUploading ? '⏳ Import...' : '📂 Importer .xls (multi-fichiers)'}
                  </button>
                  {rtlMsg && <span style={{ marginLeft:10, fontSize:11, color: rtlMsg.includes('erreur') ? '#DC2626' : '#059669', fontWeight:600 }}>{rtlMsg}</span>}
                </div>
              )}
            </div>
            {rtlData.length === 0 ? (
              <div style={{ background:'#fff', border:'1px dashed #E8E6E1', borderRadius:12, padding:32, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                Aucun rapport Traffic Light importé. {canWrite(profil) && 'Cliquez sur "Importer" pour ajouter les .xls mensuels.'}
              </div>
            ) : (
              <>
                {/* Graphique de progression */}
                <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden', marginBottom:16 }}>
                  <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                    <SectionTitle>📈 Évolution du score par groupe</SectionTitle>
                    <span style={{ fontSize:10, color:'#6B7280' }}>Seuils BNI : ≥70 vert · ≥50 orange · ≥30 rouge · &lt;30 gris</span>
                  </div>
                  <div style={{ padding:'12px 8px 4px', height:280, minWidth:0 }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EF" />
                        <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9CA3AF' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize:10, fill:'#9CA3AF' }} />
                        <Tooltip contentStyle={{ borderRadius:8, border:'1px solid #E8E6E1', fontSize:12 }} />
                        <Legend wrapperStyle={{ fontSize:11 }} />
                        <ReferenceLine y={70} stroke="#059669" strokeDasharray="4 4" label={{ value:'Vert 70+', position:'right', fill:'#059669', fontSize:10, fontWeight:600 }} />
                        <ReferenceLine y={50} stroke="#D97706" strokeDasharray="4 4" label={{ value:'Orange 50+', position:'right', fill:'#D97706', fontSize:10, fontWeight:600 }} />
                        <ReferenceLine y={30} stroke="#DC2626" strokeDasharray="4 4" label={{ value:'Rouge 30+', position:'right', fill:'#DC2626', fontSize:10, fontWeight:600 }} />
                        {groupesNoms.map((nom, i) => (
                          <Line key={nom} type="monotone" dataKey={nom} name={nom} stroke={groupColorFor(nom, i)} strokeWidth={3} dot={{ r:5 }} activeDot={{ r:7 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* Tableau mois par mois */}
                <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1', overflow:'hidden' }}>
                  <div style={{ padding:'14px 16px', borderBottom:'1px solid #E8E6E1' }}>
                    <SectionTitle>📋 Détail mensuel</SectionTitle>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead><tr>{['Période','Groupe','Taille','Croissance','Stabilité','Recos/sem','Invités/sem','Conv.%','Absent.%','Score'].map(h => (
                        <th key={h} style={{ background:'#F9F8F6', padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid #E8E6E1', whiteSpace:'nowrap' }}>{h}</th>
                      ))}</tr></thead>
                      <tbody>
                        {[...rtlData].sort((a, b) => (b.annee*12+b.mois) - (a.annee*12+a.mois)).map((r, i) => {
                          const enCours = r.annee === anneeCourante && r.mois === moisCourantNum
                          const scoreBgC = r.score >= 70 ? '#D1FAE5' : r.score >= 50 ? '#FEF9C3' : r.score >= 30 ? '#FEE2E2' : '#F3F4F6'
                          const scoreColC = r.score >= 70 ? '#065F46' : r.score >= 50 ? '#854D0E' : r.score >= 30 ? '#991B1B' : '#4B5563'
                          return (
                            <tr key={i} style={{ borderBottom:'1px solid rgba(0,0,0,0.05)', background: enCours ? '#FFFBEB' : undefined }}>
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
                              <td style={{ padding:'8px 12px', fontWeight:700, textAlign:'center', background:scoreBgC, color:scoreColC }}>{r.score}</td>
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
      })()}

      {/* Top classements — même style tables que Dashboard */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,1fr)', gap:16, marginBottom:24 }}>
        <TopTable title="Top scores région" icon="🏆" items={data.topScoresRegion} valueLabel="Score" formatFn={v => Number(v).toFixed(0)} />
        <TopTable title="Top TYFCB région" icon="💰" items={data.topTyfcbRegion} valueLabel="TYFCB" formatFn={fmtMAD} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap:16 }}>
        <TopTable title="Top recommandations" icon="🤝" items={data.topRecosRegion} valueLabel="Total" />
        <TopTable title="Top TaT" icon="☕" items={data.topTaTRegion} valueLabel="Total" />
        <TopTable title="Top invités" icon="🎯" items={data.topInvitesRegion} valueLabel="Total" />
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
