import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchDashboardKPIs } from '../lib/bniService'
import { PageHeader, Card, SectionTitle, TableWrap, Spinner, fullName } from './ui'

export default function Alertes() {
  const [alertes, setAlertes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('actives')
  const [catFilter, setCatFilter] = useState('tous')

  const load = async () => {
    setLoading(true)
    try {
      // Charger toutes les alertes (actives + résolues)
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

      // Combiner
      const fromAlertes = (alertesData || []).map(a => ({
        ...a,
        source: 'alertes',
        categorie: a.type_alerte === 'renouvellement' ? 'membres' : 'invites',
        displayName: a.membres ? fullName(a.membres.prenom, a.membres.nom) : a.titre,
      }))

      const fromRecontact = (recontactData || []).map(r => ({
        id: 'recontact-' + r.id,
        inviteId: r.id,
        source: 'invites',
        categorie: 'recontact',
        niveau: 'relance',
        titre: `Recontacter ${fullName(r.prenom, r.nom)}`,
        message: `${r.profession || r.societe || 'Invité'} — visite le ${r.date_visite ? new Date(r.date_visite + 'T12:00:00').toLocaleDateString('fr-FR') : '?'}`,
        displayName: fullName(r.prenom, r.nom),
        lue: false,
        created_at: r.date_visite,
        date_echeance: null,
      }))

      setAlertes([...fromAlertes, ...fromRecontact])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleResolve = async (alerte) => {
    if (alerte.source === 'alertes') {
      await supabase.from('alertes').update({ lue: true }).eq('id', alerte.id)
    } else if (alerte.inviteId) {
      await supabase.from('invites').update({ statut: 'Traité' }).eq('id', alerte.inviteId)
    }
    load()
  }

  const handleReopen = async (alerte) => {
    if (alerte.source === 'alertes') {
      await supabase.from('alertes').update({ lue: false }).eq('id', alerte.id)
    }
    load()
  }

  // Filtrage
  const actives = alertes.filter(a => !a.lue)
  const resolues = alertes.filter(a => a.lue)
  const displayed = filter === 'actives' ? actives : filter === 'resolues' ? resolues : alertes
  const finalList = catFilter === 'tous' ? displayed : displayed.filter(a => a.categorie === catFilter)

  // Stats
  const catStats = {
    membres: actives.filter(a => a.categorie === 'membres').length,
    invites: actives.filter(a => a.categorie === 'invites').length,
    recontact: actives.filter(a => a.categorie === 'recontact').length,
  }

  const niveauStyle = (niveau) => {
    if (niveau === 'danger') return { bg:'#FEE2E2', border:'#FECACA', dot:'#DC2626', color:'#991B1B', label:'Urgent' }
    if (niveau === 'relance') return { bg:'#DBEAFE', border:'#BFDBFE', dot:'#3B82F6', color:'#1E40AF', label:'Relance' }
    return { bg:'#FEF9C3', border:'#FDE68A', dot:'#D97706', color:'#854D0E', label:'Attention' }
  }

  const catIcon = { membres:'👤', invites:'◉', recontact:'📞' }
  const catLabel = { membres:'Membres', invites:'Invités', recontact:'À recontacter' }
  const catColor = { membres:'#DC2626', invites:'#D97706', recontact:'#3B82F6' }

  return (
    <div style={{ padding:'28px 32px', animation:'fadeIn 0.25s ease' }}>
      <PageHeader title="Centre d'alertes" sub={`${actives.length} alerte${actives.length > 1 ? 's' : ''} active${actives.length > 1 ? 's' : ''}`} />

      {/* Stats cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <div onClick={() => { setFilter('actives'); setCatFilter('tous') }}
          style={{ background:'#1C1C2E', borderRadius:12, padding:'14px 18px', cursor:'pointer' }}
          onMouseEnter={e=>e.currentTarget.style.opacity='0.9'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
          <div style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Actives</div>
          <div style={{ fontSize:28, fontWeight:700, color:'#fff', fontFamily:'Playfair Display, serif' }}>{actives.length}</div>
        </div>
        {Object.entries(catStats).map(([cat, n]) => (
          <div key={cat} onClick={() => { setFilter('actives'); setCatFilter(cat) }}
            style={{ background: n > 0 ? (cat === 'membres' ? '#FEE2E2' : cat === 'recontact' ? '#DBEAFE' : '#FEF9C3') : '#F9FAFB', borderRadius:12, padding:'14px 18px', cursor:'pointer', border:`1px solid ${n > 0 ? 'rgba(0,0,0,0.06)' : '#E8E6E1'}` }}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.9'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <div style={{ fontSize:10, fontWeight:600, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>{catIcon[cat]} {catLabel[cat]}</div>
            <div style={{ fontSize:28, fontWeight:700, color: catColor[cat], fontFamily:'Playfair Display, serif' }}>{n}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['actives','Actives',actives.length],['resolues','Résolues',resolues.length],['toutes','Toutes',alertes.length]].map(([key, label, n]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{ padding:'6px 14px', borderRadius:20, border: filter===key ? '2px solid #1C1C2E' : '1px solid #E8E6E1', fontSize:12, fontWeight: filter===key ? 700 : 400, background: filter===key ? '#1C1C2E' : '#fff', color: filter===key ? '#fff' : '#6B7280', cursor:'pointer' }}>
            {label} ({n})
          </button>
        ))}
        <div style={{ width:1, background:'#E8E6E1', margin:'0 4px' }} />
        {[['tous','Tous'],['membres','👤 Membres'],['invites','◉ Invités'],['recontact','📞 Recontact']].map(([key, label]) => (
          <button key={key} onClick={() => setCatFilter(key)}
            style={{ padding:'6px 14px', borderRadius:20, border: catFilter===key ? `2px solid ${catColor[key]||'#1C1C2E'}` : '1px solid #E8E6E1', fontSize:11, fontWeight: catFilter===key ? 600 : 400, background: catFilter===key ? '#F7F6F3' : '#fff', color: catFilter===key ? '#1C1C2E' : '#9CA3AF', cursor:'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Liste des alertes */}
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div> : (
        <div>
          {finalList.length === 0 ? (
            <Card><div style={{ padding:20, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
              {filter === 'actives' ? '✅ Aucune alerte active' : 'Aucune alerte trouvée'}
            </div></Card>
          ) : finalList.map((a, i) => {
            const ns = niveauStyle(a.niveau)
            const isResolved = a.lue
            return (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 18px', borderRadius:10, marginBottom:8, background: isResolved ? '#F9FAFB' : ns.bg, border:`1px solid ${isResolved ? '#E8E6E1' : ns.border}`, opacity: isResolved ? 0.6 : 1, transition:'all 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.transform='translateX(2px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>

                {/* Dot + catégorie */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, paddingTop:2 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: isResolved ? '#9CA3AF' : ns.dot }} />
                  <span style={{ fontSize:8, color:'#9CA3AF', textTransform:'uppercase', fontWeight:600 }}>{catLabel[a.categorie]}</span>
                </div>

                {/* Contenu */}
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                    <span style={{ fontSize:13, fontWeight:600, color: isResolved ? '#6B7280' : ns.color }}>{a.titre}</span>
                    <span style={{ fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:6, background: isResolved ? '#E5E7EB' : ns.border, color: isResolved ? '#6B7280' : ns.color }}>
                      {isResolved ? 'Résolu' : ns.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{a.message}</div>
                  <div style={{ display:'flex', gap:12, marginTop:4, fontSize:10, color:'#9CA3AF' }}>
                    {a.date_echeance && <span>Échéance : {new Date(a.date_echeance).toLocaleDateString('fr-FR')}</span>}
                    {a.created_at && <span>Créé le {new Date(a.created_at).toLocaleDateString('fr-FR')}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {!isResolved ? (
                    <button onClick={() => handleResolve(a)}
                      style={{ padding:'6px 12px', background:'#059669', color:'#fff', border:'none', borderRadius:6, fontSize:10, fontWeight:600, cursor:'pointer' }}>
                      ✓ Résoudre
                    </button>
                  ) : a.source === 'alertes' && (
                    <button onClick={() => handleReopen(a)}
                      style={{ padding:'6px 12px', background:'#D97706', color:'#fff', border:'none', borderRadius:6, fontSize:10, fontWeight:600, cursor:'pointer' }}>
                      ↩ Réouvrir
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
