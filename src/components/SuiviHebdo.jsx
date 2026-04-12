import React, { useState, useEffect } from 'react'
import { fetchMembresForMatch, insertPalmsHebdo, fetchPalmsHebdoMois } from '../lib/bniService'
import { PageHeader, SectionTitle, TableWrap, Card, Spinner } from './ui'

const HEADERS_MAP = { 'Prénom': 'prenom', 'Nom': 'nom', 'PALMS': 'palms', 'RDI': 'rdi', 'RDE': 'rde', 'RRI': 'rri', 'RRE': 'rre', 'Inv.': 'invites', 'TàT': 'tat', 'MPB': 'mpb', 'UEG': 'ueg' }

// Objectifs mensuels (4 réunions/mois)

function normalize(s) { return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

function matchMembre(prenom, nom, membres) {
  const p = normalize(prenom), n = normalize(nom)
  return membres.find(m => normalize(m.prenom) === p && normalize(m.nom) === n)
    || membres.find(m => normalize(m.nom) === n && normalize(m.prenom).includes(p))
    || membres.find(m => normalize(m.nom) === n)
    || null
}

export default function SuiviHebdo() {
  const [rawText, setRawText] = useState('')
  const [dateReunion, setDateReunion] = useState(new Date().toISOString().split('T')[0])
  const [nbReunions, setNbReunions] = useState(1)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [monthData, setMonthData] = useState([])
  const [loading, setLoading] = useState(true)

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
    const data = await fetchPalmsHebdoMois(mois, annee)
    setMonthData(data)
    setLoading(false)
  }

  useEffect(() => { loadMonth() }, [])

  // ─── PARSING & IMPORT ───────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!rawText.trim()) return
    setImporting(true)
    setResult(null)

    try {
      const membres = await fetchMembresForMatch()
      const lines = rawText.trim().split('\n').map(l => l.split('\t'))

      // Detect headers
      const headerRow = lines[0]
      const colMap = {}
      headerRow.forEach((h, i) => { if (HEADERS_MAP[h.trim()]) colMap[HEADERS_MAP[h.trim()]] = i })

      let imported = 0, skipped = 0, bniRow = null
      const rows = []

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]
        const prenom = (cols[colMap.prenom] || '').trim()
        const nom = (cols[colMap.nom] || '').trim()

        // Skip empty, "Invité", "Total"
        if (!prenom || normalize(prenom) === 'total' || normalize(prenom) === 'invité') continue

        // BNI line (contribution externe)
        if (normalize(prenom) === 'bni') {
          bniRow = {
            membre_id: null,
            palms: 'P',
            rdi: parseInt(cols[colMap.rdi]) || 0,
            rde: parseInt(cols[colMap.rde]) || 0,
            rri: parseInt(cols[colMap.rri]) || 0,
            rre: parseInt(cols[colMap.rre]) || 0,
            invites: parseInt(cols[colMap.invites]) || 0,
            tat: parseInt(cols[colMap.tat]) || 0,
            mpb: parseFloat(cols[colMap.mpb]) || 0,
            ueg: parseInt(cols[colMap.ueg]) || 0,
          }
          continue
        }

        const membre = matchMembre(prenom, nom, membres)
        if (!membre) { skipped++; continue }

        rows.push({
          membre_id: membre.id,
          palms: (cols[colMap.palms] || 'P').trim(),
          rdi: parseInt(cols[colMap.rdi]) || 0,
          rde: parseInt(cols[colMap.rde]) || 0,
          rri: parseInt(cols[colMap.rri]) || 0,
          rre: parseInt(cols[colMap.rre]) || 0,
          invites: parseInt(cols[colMap.invites]) || 0,
          tat: parseInt(cols[colMap.tat]) || 0,
          mpb: parseFloat(cols[colMap.mpb]) || 0,
          ueg: parseInt(cols[colMap.ueg]) || 0,
        })
        imported++
      }

      if (rows.length > 0) await insertPalmsHebdo(rows, dateReunion, nbReunions)
      if (bniRow) await insertPalmsHebdo([bniRow], dateReunion, nbReunions)

      setResult({ imported, skipped, bni: !!bniRow })
      setRawText('')
      await loadMonth()
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

  memberRows.forEach(r => {
    const key = r.membre_id
    if (!membresMap[key]) {
      membresMap[key] = {
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

  const sorted = Object.values(membresMap).sort((a, b) => b.cumul.tat + b.cumul.refs - (a.cumul.tat + a.cumul.refs))

  const th = { padding: '8px 10px', fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', fontSize: 12, textAlign: 'center', borderBottom: '1px solid #F3F2EF' }
  const tdName = { ...td, textAlign: 'left', fontWeight: 500, color: '#1C1C2E' }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.25s ease' }}>
      <PageHeader title="Suivi Hebdomadaire" sub={`Données PALMS intermédiaires — ${moisLabel}`} />

      {/* ─── SAISIE ──────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle>Coller les données PALMS</SectionTitle>
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
          onChange={e => setRawText(e.target.value)}
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
            </span>
          )}
          {result?.error && <span style={{ fontSize: 12, color: '#DC2626' }}>Erreur : {result.error}</span>}
        </div>
      </Card>

      {/* ─── TABLEAU MENSUEL ─────────────────────────────────────────────── */}
      <SectionTitle>Suivi du mois — {moisLabel} ({totalReunionsSaisies}/{nbJeudis} réunions saisies, {Math.max(0, nbJeudis - totalReunionsSaisies)} restante{Math.max(0, nbJeudis - totalReunionsSaisies) > 1 ? 's' : ''})</SectionTitle>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : dates.length === 0 ? (
        <Card><p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', margin: 0 }}>Aucune donnée hebdomadaire pour {moisLabel}. Collez les données ci-dessus pour commencer.</p></Card>
      ) : (
        <TableWrap>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E8E6E1' }}>
                  <th style={{ ...th, textAlign: 'left', minWidth: 140 }}>Membre</th>
                  <th style={{ ...th, background: '#F7F6F3' }}>Prés.</th>
                  <th style={th} colSpan={3}>Tête-à-tête</th>
                  <th style={th} colSpan={3}>Références données</th>
                  <th style={th}>Visiteurs</th>
                  <th style={th}>TYFCB</th>
                  <th style={th}>CEU</th>
                </tr>
                <tr style={{ borderBottom: '1px solid #E8E6E1' }}>
                  <th style={th}></th>
                  <th style={{ ...th, background: '#F7F6F3', fontSize: 9 }}>mois</th>
                  <th style={{ ...th, fontSize: 9 }}>mois</th>
                  <th style={{ ...th, fontSize: 9, color: '#C41E3A' }}>sem.</th>
                  <th style={{ ...th, fontSize: 9, color: '#DC2626' }}>manque</th>
                  <th style={{ ...th, fontSize: 9 }}>mois</th>
                  <th style={{ ...th, fontSize: 9, color: '#C41E3A' }}>sem.</th>
                  <th style={{ ...th, fontSize: 9, color: '#DC2626' }}>manque</th>
                  <th style={{ ...th, fontSize: 9 }}>mois</th>
                  <th style={{ ...th, fontSize: 9 }}>mois</th>
                  <th style={{ ...th, fontSize: 9 }}>mois</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m, i) => {
                  const mTat = manque(m.cumul.tat, objTat)
                  const mRefs = manque(m.cumul.refs, objRefs)
                  return (
                    <tr key={i} onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdName}>{m.prenom} {m.nom}</td>
                      <td style={{ ...td, background: '#F7F6F3', fontWeight: 600 }}>{m.cumul.presences}/{m.cumul.presences + m.cumul.absences}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{m.cumul.tat}</td>
                      <td style={{ ...td, color: '#C41E3A', fontWeight: 600 }}>{m.derniere.tat}</td>
                      <td style={{ ...td, fontWeight: 700, color: manqueColor(mTat) }}>{mTat === 0 ? '✓' : mTat}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{m.cumul.refs}</td>
                      <td style={{ ...td, color: '#C41E3A', fontWeight: 600 }}>{m.derniere.refs}</td>
                      <td style={{ ...td, fontWeight: 700, color: manqueColor(mRefs) }}>{mRefs === 0 ? '✓' : mRefs}</td>
                      <td style={td}>{m.cumul.invites}</td>
                      <td style={td}>{Number(m.cumul.mpb).toLocaleString('fr-FR')}</td>
                      <td style={td}>{m.cumul.ueg}</td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Ligne BNI (contribution externe) */}
              {(bniCumul.tat > 0 || bniCumul.refs > 0 || bniCumul.mpb > 0) && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #E8E6E1', background: '#F7F6F3' }}>
                    <td style={{ ...tdName, fontStyle: 'italic', color: '#6B7280' }}>Contribution BNI externe</td>
                    <td style={{ ...td, background: '#F0EFEC' }}>—</td>
                    <td style={td}>{bniCumul.tat}</td>
                    <td style={{ ...td, color: '#C41E3A' }}>{bniDerniere.tat}</td>
                    <td style={td}>—</td>
                    <td style={td}>{bniCumul.refs}</td>
                    <td style={{ ...td, color: '#C41E3A' }}>{bniDerniere.refs}</td>
                    <td style={td}>—</td>
                    <td style={td}>{bniCumul.invites}</td>
                    <td style={td}>{Number(bniCumul.mpb).toLocaleString('fr-FR')}</td>
                    <td style={td}>{bniCumul.ueg}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </TableWrap>
      )}
    </div>
  )
}
