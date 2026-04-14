import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, Spinner, fullName } from './ui'

export default function Alertes() {
  const [alertes, setAlertes] = useState([])
  const [archives, setArchives] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('actives')
  const [catFilter, setCatFilter] = useState('tous')
  const [expandedDay, setExpandedDay] = useState(null)
  const [resolvedKeys, setResolvedKeys] = useState(new Set())

  const load = async () => {
    setLoading(true)
    try {
      // Charger les alertes résolues (clés) pour filtrer les auto-générées
      const { data: resolvedData } = await supabase.from('alertes_resolues')
        .select('alerte_key')
      const rKeys = new Set((resolvedData || []).map(r => r.alerte_key))
      setResolvedKeys(rKeys)

      // Charger les archives résolues pour l'accordéon
      const { data: archivesData } = await supabase.from('alertes_resolues')
        .select('*')
        .order('resolved_at', { ascending: false })
      setArchives(archivesData || [])

      // Charger toutes les alertes table
      const { data: alertesData } = await supabase.from('alertes')
        .select('*, membres(prenom, nom)')
        .order('created_at', { ascending: false })

      // Charger les invités à recontacter (3 derniers mois)
      const troisMois = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0]
      const { data: recontactData } = await supabase.from('invites')
        .select('id, prenom, nom, statut, date_visite, profession, societe')
        .eq('statut', 'A recontacter')
        .gte('date_visite', troisMois)
        .order('date_visite')

      // Charger les scores pour alertes performance
      const { data: scoresData } = await supabase.from('scores_bni')
        .select('*, membres(prenom, nom, date_renouvellement)')
        .eq('groupe_id', (await supabase.from('groupes').select('id').eq('code', 'MK-01').single()).data?.id)

      // Charger les invités en stand-by
      const deuxSemaines = new Date(Date.now() - 14*24*60*60*1000).toISOString().split('T')[0]
      const { data: standbyData } = await supabase.from('invites')
        .select('id, prenom, nom, statut, date_visite, profession, societe')
        .in('statut', ['En stand-by', 'A temporiser'])
        .lte('date_visite', deuxSemaines)

      // Charger les données hebdo du mois pour détecter les inactifs
      const now = new Date()
      const moisDebut = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
      const { data: hebdoData } = await supabase.from('palms_hebdo')
        .select('membre_id, tat').gte('date_reunion', moisDebut)

      const hebdoTat = {}
      ;(hebdoData || []).forEach(h => { hebdoTat[h.membre_id] = (hebdoTat[h.membre_id]||0) + (h.tat||0) })

      // Combiner toutes les sources d'alertes
      const fromAlertes = (alertesData || []).filter(a => !a.lue).map(a => ({
        ...a,
        source: 'alertes',
        categorie: a.type_alerte === 'renouvellement' ? 'membres' : 'invites',
        displayName: a.membres ? fullName(a.membres.prenom, a.membres.nom) : a.titre,
        priorite: a.niveau === 'danger' ? 1 : 2,
        alerteKey: `alertes-${a.id}`,
      }))

      const fromRecontact = (recontactData || []).map(r => ({
        id: 'recontact-' + r.id, inviteId: r.id, source: 'invites', categorie: 'recontact', niveau: 'relance',
        titre: `Recontacter ${fullName(r.prenom, r.nom)}`,
        message: `${r.profession || r.societe || 'Invité'} — visite le ${r.date_visite ? new Date(r.date_visite + 'T12:00:00').toLocaleDateString('fr-FR') : '?'}`,
        displayName: fullName(r.prenom, r.nom), lue: false, created_at: r.date_visite, date_echeance: null, priorite: 3,
        alerteKey: `recontact-${r.id}`,
      }))

      const fromScoreFaible = (scoresData || []).filter(s => Number(s.total_score||0) < 20 && s.membres).map(s => ({
        id: 'score-' + s.id, source: 'auto', categorie: 'performance', niveau: 'info',
        titre: `Score faible — ${fullName(s.membres.prenom, s.membres.nom)}`,
        message: `Score ${Number(s.total_score).toFixed(0)}/100 (gris). Accompagnement nécessaire.`,
        displayName: fullName(s.membres.prenom, s.membres.nom), lue: false, created_at: null, date_echeance: null, priorite: 5,
        alerteKey: `score-${s.membre_id}`,
      }))

      const fromPresence = (scoresData || []).filter(s => Number(s.attendance_rate||0) < 0.88 && Number(s.attendance_rate||0) > 0 && s.membres).map(s => ({
        id: 'pres-' + s.id, source: 'auto', categorie: 'performance', niveau: 'info',
        titre: `Présence faible — ${fullName(s.membres.prenom, s.membres.nom)}`,
        message: `Taux de présence ${Math.round(Number(s.attendance_rate)*100)}% (< 88%). Risque de perte de points.`,
        displayName: fullName(s.membres.prenom, s.membres.nom), lue: false, created_at: null, date_echeance: null, priorite: 5,
        alerteKey: `pres-${s.membre_id}`,
      }))

      const sixMois = new Date(Date.now() + 180*24*60*60*1000)
      const fromRenouvellement = (scoresData || []).filter(s => {
        if (!s.membres?.date_renouvellement) return false
        const d = new Date(s.membres.date_renouvellement)
        return d > new Date() && d <= sixMois
      }).map(s => {
        const d = new Date(s.membres.date_renouvellement)
        const jours = Math.round((d - new Date()) / (1000*60*60*24))
        return {
          id: 'renouv-' + s.id, source: 'auto', categorie: 'membres', niveau: jours < 90 ? 'danger' : 'info',
          titre: `Renouvellement ${fullName(s.membres.prenom, s.membres.nom)}`,
          message: `Renouvellement le ${d.toLocaleDateString('fr-FR')} (dans ${jours} jours).${jours < 90 ? ' Planifier l\'appel maintenant.' : ''}`,
          displayName: fullName(s.membres.prenom, s.membres.nom), lue: false, created_at: null,
          date_echeance: s.membres.date_renouvellement, priorite: jours < 90 ? 2 : 4,
          alerteKey: `renouv-${s.membre_id}`,
        }
      })

      const fromStandby = (standbyData || []).map(r => ({
        id: 'standby-' + r.id, inviteId: r.id, source: 'invites', categorie: 'invites', niveau: 'info',
        titre: `En attente — ${fullName(r.prenom, r.nom)}`,
        message: `${r.statut} depuis le ${r.date_visite ? new Date(r.date_visite+'T12:00:00').toLocaleDateString('fr-FR') : '?'}. Relancer ou clore.`,
        displayName: fullName(r.prenom, r.nom), lue: false, created_at: r.date_visite, date_echeance: null, priorite: 4,
        alerteKey: `standby-${r.id}`,
      }))

      const fromInactifs = (scoresData || []).filter(s => s.membres && !hebdoTat[s.membre_id]).map(s => ({
        id: 'inactif-' + s.id, source: 'auto', categorie: 'performance', niveau: 'info',
        titre: `Aucun TàT ce mois — ${fullName(s.membres.prenom, s.membres.nom)}`,
        message: `Pas de tête-à-tête enregistré ce mois. Score 1-2-1 = 0/20.`,
        displayName: fullName(s.membres.prenom, s.membres.nom), lue: false, created_at: null, date_echeance: null, priorite: 5,
        alerteKey: `inactif-${s.membre_id}`,
      }))

      // Combiner, filtrer les déjà résolues, trier
      const all = [...fromAlertes, ...fromRecontact, ...fromRenouvellement, ...fromStandby, ...fromScoreFaible, ...fromPresence, ...fromInactifs]
        .filter(a => !rKeys.has(a.alerteKey))
        .sort((a, b) => (a.priorite||5) - (b.priorite||5))
      setAlertes(all)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleResolve = async (alerte) => {
    // 1. Archiver dans alertes_resolues
    await supabase.from('alertes_resolues').insert({
      alerte_key: alerte.alerteKey,
      titre: alerte.titre,
      message: alerte.message,
      niveau: alerte.niveau,
      categorie: alerte.categorie,
      source: alerte.source,
    })

    // 2. Marquer lue dans la table alertes si c'est une alerte DB
    if (alerte.source === 'alertes') {
      await supabase.from('alertes').update({ lue: true }).eq('id', alerte.id)
    } else if (alerte.inviteId) {
      await supabase.from('invites').update({ statut: 'Traité' }).eq('id', alerte.inviteId)
    }

    // 3. Supprimer immédiatement de la liste (sans re-fetch)
    setAlertes(prev => prev.filter(a => a.alerteKey !== alerte.alerteKey))
    setResolvedKeys(prev => new Set([...prev, alerte.alerteKey]))

    // 4. Ajouter à l'archive locale (sans recharger la page)
    const now = new Date()
    setArchives(prev => [{
      alerte_key: alerte.alerteKey,
      titre: alerte.titre,
      message: alerte.message,
      niveau: alerte.niveau,
      categorie: alerte.categorie,
      source: alerte.source,
      resolved_at: now.toISOString(),
      resolved_date: now.toISOString().split('T')[0],
    }, ...prev])
  }

  // Filtrage
  const finalList = catFilter === 'tous' ? alertes : alertes.filter(a => a.categorie === catFilter)

  // Stats
  const catStats = {
    membres: alertes.filter(a => a.categorie === 'membres').length,
    invites: alertes.filter(a => a.categorie === 'invites').length,
    recontact: alertes.filter(a => a.categorie === 'recontact').length,
    performance: alertes.filter(a => a.categorie === 'performance').length,
  }

  const niveauStyle = (niveau) => {
    if (niveau === 'danger') return { bg:'#FEE2E2', border:'#FECACA', dot:'#DC2626', color:'#991B1B', label:'Urgent' }
    if (niveau === 'relance') return { bg:'#DBEAFE', border:'#BFDBFE', dot:'#3B82F6', color:'#1E40AF', label:'Relance' }
    if (niveau === 'info') return { bg:'#F3F4F6', border:'#E5E7EB', dot:'#6B7280', color:'#4B5563', label:'Info' }
    return { bg:'#FEF9C3', border:'#FDE68A', dot:'#D97706', color:'#854D0E', label:'Attention' }
  }

  const catIcon = { membres:'👤', invites:'◉', recontact:'📞', performance:'📊' }
  const catLabel = { membres:'Membres', invites:'Invités', recontact:'À recontacter', performance:'Performance' }
  const catColor = { membres:'#DC2626', invites:'#D97706', recontact:'#3B82F6', performance:'#6B7280' }

  // Grouper archives par jour
  const archivesByDay = {}
  archives.forEach(a => {
    const day = a.resolved_date || new Date(a.resolved_at).toISOString().split('T')[0]
    if (!archivesByDay[day]) archivesByDay[day] = []
    archivesByDay[day].push(a)
  })
  const sortedDays = Object.keys(archivesByDay).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Centre d'alertes" sub={`${alertes.length} alerte${alertes.length > 1 ? 's' : ''} active${alertes.length > 1 ? 's' : ''}`} />

      {/* Stats cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        <div onClick={() => setCatFilter('tous')}
          style={{ background:'#1C1C2E', borderRadius:12, padding:'14px 18px', cursor:'pointer' }}
          onMouseEnter={e=>e.currentTarget.style.opacity='0.9'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
          <div style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Actives</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#fff', fontFamily:'DM Sans, sans-serif' }}>{alertes.length}</div>
        </div>
        {Object.entries(catStats).map(([cat, n]) => (
          <div key={cat} onClick={() => setCatFilter(cat)}
            style={{ background: n > 0 ? (cat === 'membres' ? '#FEE2E2' : cat === 'recontact' ? '#DBEAFE' : '#FEF9C3') : '#F9FAFB', borderRadius:12, padding:'14px 18px', cursor:'pointer', border:`1px solid ${n > 0 ? 'rgba(0,0,0,0.06)' : '#E8E6E1'}` }}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.9'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>{catIcon[cat]} {catLabel[cat]}</div>
            <div style={{ fontSize:28, fontWeight:700, color: catColor[cat], fontFamily:'DM Sans, sans-serif' }}>{n}</div>
          </div>
        ))}
      </div>

      {/* Filtres catégorie */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['tous','Tous'],['membres','👤 Membres'],['invites','◉ Invités'],['recontact','📞 Recontact'],['performance','📊 Performance']].map(([key, label]) => (
          <button key={key} onClick={() => setCatFilter(key)}
            style={{ padding:'6px 14px', borderRadius:20, border: catFilter===key ? `2px solid ${catColor[key]||'#1C1C2E'}` : '1px solid #E8E6E1', fontSize:11, fontWeight: catFilter===key ? 600 : 400, background: catFilter===key ? '#F7F6F3' : '#fff', color: catFilter===key ? '#1C1C2E' : '#9CA3AF', cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Liste des alertes actives */}
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div> : (
        <div>
          {finalList.length === 0 ? (
            <Card><div style={{ padding:20, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
              Aucune alerte active
            </div></Card>
          ) : finalList.map((a, i) => {
            const ns = niveauStyle(a.niveau)
            return (
              <div key={a.alerteKey || i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 18px', borderRadius:10, marginBottom:8, background: ns.bg, border:`1px solid ${ns.border}`, transition:'all 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.transform='translateX(2px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>

                {/* Dot + catégorie */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, paddingTop:2 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: ns.dot }} />
                  <span style={{ fontSize:8, color:'#9CA3AF', textTransform:'uppercase', fontWeight:600 }}>{catLabel[a.categorie]}</span>
                </div>

                {/* Contenu */}
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                    <span style={{ fontSize:13, fontWeight:600, color: ns.color }}>{a.titre}</span>
                    <span style={{ fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:6, background: ns.border, color: ns.color }}>
                      {ns.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{a.message}</div>
                  <div style={{ display:'flex', gap:12, marginTop:4, fontSize:10, color:'#9CA3AF' }}>
                    {a.date_echeance && <span>Échéance : {new Date(a.date_echeance).toLocaleDateString('fr-FR')}</span>}
                    {a.created_at && <span>Créé le {new Date(a.created_at).toLocaleDateString('fr-FR')}</span>}
                  </div>
                </div>

                {/* Bouton résoudre */}
                <div style={{ flexShrink:0 }}>
                  <button onClick={() => handleResolve(a)}
                    style={{ padding:'6px 12px', background:'#059669', color:'#fff', border:'none', borderRadius:6, fontSize:10, fontWeight:600, cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#047857'} onMouseLeave={e=>e.currentTarget.style.background='#059669'}>
                    ✓ Résoudre
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── ARCHIVES RÉSOLUES — Accordéon journalier ─── */}
      {sortedDays.length > 0 && (
        <div style={{ marginTop:32 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#1C1C2E', marginBottom:12, fontFamily:'DM Sans, sans-serif' }}>Alertes résolues</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {sortedDays.map(day => {
              const dayAlerts = archivesByDay[day]
              const isDayOpen = expandedDay === day
              const dateObj = new Date(day + 'T12:00:00')
              const dayLabel = dateObj.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
              const isToday = day === new Date().toISOString().split('T')[0]

              // Compter par niveau
              const niveauCounts = {}
              dayAlerts.forEach(a => { niveauCounts[a.niveau] = (niveauCounts[a.niveau]||0) + 1 })

              return (
                <div key={day}>
                  {/* Header accordéon */}
                  <div onClick={() => setExpandedDay(isDayOpen ? null : day)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#1C1C2E', borderRadius: isDayOpen ? '10px 10px 0 0' : 10, cursor:'pointer', userSelect:'none' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#2D2D42'} onMouseLeave={e=>e.currentTarget.style.background='#1C1C2E'}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ color:'#fff', fontSize:13, fontWeight:700, textTransform:'capitalize' }}>{dayLabel}</span>
                      {isToday && <span style={{ fontSize:8, padding:'2px 6px', borderRadius:4, background:'#059669', color:'#fff', fontWeight:700 }}>AUJOURD'HUI</span>}
                      <span style={{ fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:8, background:'rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.7)' }}>
                        {dayAlerts.length} résolu{dayAlerts.length > 1 ? 'es' : 'e'}
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {/* Dots par niveau */}
                      {dayAlerts.map((a, i) => {
                        const ns = niveauStyle(a.niveau)
                        return <div key={i} style={{ width:8, height:8, borderRadius:'50%', background: ns.dot, opacity:0.8 }} />
                      })}
                      <span style={{ color:'rgba(255,255,255,0.5)', fontSize:11, marginLeft:4, transition:'transform 0.2s', transform: isDayOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    </div>
                  </div>

                  {/* Contenu accordéon */}
                  {isDayOpen && (
                    <div style={{ background:'#fff', border:'1px solid #E8E6E1', borderTop:'none', borderRadius:'0 0 10px 10px', padding:'12px 14px 12px 0' }}>
                      <div style={{ marginLeft:12, borderLeft:'2px solid #D1FAE5', paddingLeft:20 }}>
                        {dayAlerts.map((a, i) => {
                          const ns = niveauStyle(a.niveau)
                          const time = a.resolved_at ? new Date(a.resolved_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '—'
                          return (
                            <div key={i} style={{ marginBottom:8, position:'relative' }}>
                              {/* Dot timeline */}
                              <div style={{ position:'absolute', left:-28, top:10, width:10, height:10, borderRadius:'50%', background:'#059669', border:'2px solid #fff' }} />
                              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, background:'#F7F6F3', border:'1px solid #E8E6E1' }}>
                                <div style={{ width:8, height:8, borderRadius:'50%', background: ns.dot, flexShrink:0 }} />
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:12, fontWeight:600, color:'#1C1C2E' }}>{a.titre}</div>
                                  <div style={{ fontSize:10, color:'#6B7280', marginTop:1 }}>{a.message}</div>
                                </div>
                                <span style={{ fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:4, background: ns.bg, color: ns.color }}>{a.categorie}</span>
                                <span style={{ fontSize:10, color:'#9CA3AF', flexShrink:0 }}>{time}</span>
                                <span style={{ fontSize:9, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#D1FAE5', color:'#065F46' }}>Résolu</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
