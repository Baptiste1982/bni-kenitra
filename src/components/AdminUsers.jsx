import React, { useState, useEffect, useRef } from 'react'
import { fetchUsers, createUser, deleteUser, toggleUserActive, resetUserPassword, fetchGroupes } from '../lib/bniService'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, SectionTitle, TableWrap, Spinner } from './ui'

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', abbr: 'SA' },
  { value: 'directeur_executif', label: 'Directeur Exécutif', abbr: 'DE' },
  { value: 'directrice_consultante', label: 'Directrice Consultante', abbr: 'DC' },
  { value: 'president', label: 'Président', abbr: 'P' },
  { value: 'vice_president', label: 'Vice-Président', abbr: 'VP' },
  { value: 'secretaire_tresorier', label: 'Secrétaire Trésorier', abbr: 'ST' },
  { value: 'lecture', label: 'Lecture seule', abbr: 'L' },
]

const MODULES = [
  { id: 'dashboard', label: 'Tableau de bord' },
  { id: 'membres', label: 'Membres' },
  { id: 'hebdo', label: 'Suivi Hebdo' },
  { id: 'invites', label: 'Invités' },
  { id: 'groupes', label: 'Groupes' },
  { id: 'reporting', label: 'Reporting' },
  { id: 'agent', label: 'Agent IA' },
  { id: 'admin', label: 'Admin' },
]

// Accès par défaut selon le rôle
const DEFAULT_ACCESS = {
  super_admin: ['dashboard', 'membres', 'hebdo', 'invites', 'groupes', 'reporting', 'agent', 'admin'],
  directeur_executif: ['dashboard', 'membres', 'hebdo', 'invites', 'groupes', 'reporting', 'agent', 'admin'],
  directrice_consultante: ['dashboard', 'membres', 'hebdo', 'invites', 'groupes', 'reporting', 'agent'],
  president: ['dashboard', 'membres', 'hebdo', 'invites', 'reporting'],
  vice_president: ['dashboard', 'membres', 'hebdo', 'invites', 'reporting'],
  secretaire_tresorier: ['dashboard', 'membres', 'invites', 'reporting'],
  lecture: ['dashboard', 'membres'],
}

const roleLabel = (role) => ROLES.find(r => r.value === role)?.label || role
const roleAbbr = (role) => ROLES.find(r => r.value === role)?.abbr || '?'
const roleBadge = (role) => {
  const colors = {
    super_admin: { bg: '#FEF3C7', color: '#92400E' },
    directeur_executif: { bg: '#FEF3C7', color: '#92400E' },
    directrice_consultante: { bg: '#DBEAFE', color: '#1E40AF' },
    president: { bg: '#E0E7FF', color: '#3730A3' },
    vice_president: { bg: '#EDE9FE', color: '#5B21B6' },
    secretaire_tresorier: { bg: '#FEE2E2', color: '#991B1B' },
    lecture: { bg: '#F3F4F6', color: '#4B5563' },
  }
  return colors[role] || colors.lecture
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [groupes, setGroupes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editAccess, setEditAccess] = useState(null)
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [copied, setCopied] = useState(false)
  const [resetPwd, setResetPwd] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [actionMenu, setActionMenu] = useState(null) // user id for dropdown
  const [editUser, setEditUser] = useState(null) // user being edited
  const [editForm, setEditForm] = useState({})

  const [form, setForm] = useState({ prenom: '', nom: '', email: '', password: '', role: 'directrice_consultante', groupe_id: '', titre: '', telephone: '' })
  const [formAccess, setFormAccess] = useState([...DEFAULT_ACCESS.directrice_consultante])

  const menuRef = useRef(null)
  useEffect(() => {
    if (!actionMenu) return
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setActionMenu(null) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [actionMenu])

  const load = async () => {
    setLoading(true)
    try {
      const [u, g] = await Promise.all([fetchUsers(), fetchGroupes()])
      setUsers(u)
      setGroupes(g)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Quand le rôle change dans le formulaire, mettre à jour les accès par défaut
  const handleRoleChange = (role) => {
    setForm({ ...form, role })
    setFormAccess([...(DEFAULT_ACCESS[role] || DEFAULT_ACCESS.lecture)])
  }

  const toggleFormModule = (moduleId) => {
    setFormAccess(prev => prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId])
  }

  const handleCreate = async () => {
    setError(''); setSuccess(''); setSaving(true)
    try {
      if (!form.email || !form.password || !form.prenom || !form.nom) throw new Error('Prénom, nom, email et mot de passe sont requis')
      if (form.password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères')
      await createUser({ ...form, groupe_id: form.groupe_id || null, modules_access: formAccess })
      setCreatedCredentials({ prenom: form.prenom, nom: form.nom, email: form.email, password: form.password, role: roleLabel(form.role) })
      setCopied(false)
      setSuccess(`Compte créé pour ${form.prenom} ${form.nom}`)
      setForm({ prenom: '', nom: '', email: '', password: '', role: 'directrice_consultante', groupe_id: '', titre: '', telephone: '' })
      setFormAccess([...DEFAULT_ACCESS.directrice_consultante])
      setShowForm(false)
      await load()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const handleDelete = async (userId) => {
    setError(''); setSuccess('')
    try {
      await deleteUser(userId)
      setSuccess('Compte supprimé')
      setConfirmDelete(null)
      await load()
    } catch (e) { setError(e.message) }
  }

  const handleToggle = async (userId, actif) => {
    try {
      await toggleUserActive(userId, !actif)
      await load()
    } catch (e) { setError(e.message) }
  }

  const startEdit = (u) => {
    setEditUser(u.id)
    setEditForm({ prenom: u.prenom, nom: u.nom, email: u.email, role: u.role, titre: u.titre || '', telephone: u.telephone || '', groupe_id: u.groupe_id || '' })
    setActionMenu(null)
  }

  const handleSaveEdit = async () => {
    setError(''); setSaving(true)
    try {
      const { error } = await supabase.from('profils').update({
        prenom: editForm.prenom, nom: editForm.nom, email: editForm.email,
        role: editForm.role, titre: editForm.titre || null, telephone: editForm.telephone || null,
        groupe_id: editForm.groupe_id || null
      }).eq('id', editUser)
      if (error) throw error
      setSuccess('Utilisateur mis à jour')
      setEditUser(null)
      await load()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  // Sauvegarder les accès modifiés d'un utilisateur existant
  const saveAccess = async (userId, modules) => {
    try {
      const { error } = await supabase.from('profils').update({ modules_access: modules }).eq('id', userId)
      if (error) throw error
      setEditAccess(null)
      setSuccess('Accès mis à jour')
      await load()
    } catch (e) { setError(e.message) }
  }

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #E8E6E1', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' }
  const checkboxStyle = { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, padding: '4px 0' }

  const AccessCheckboxes = ({ modules, onToggle, disabled }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
      {MODULES.map(m => (
        <label key={m.id} style={{ ...checkboxStyle, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={modules.includes(m.id)} onChange={() => !disabled && onToggle(m.id)} disabled={disabled}
            style={{ accentColor: '#C41E3A' }} />
          <span style={{ color: modules.includes(m.id) ? '#1C1C2E' : '#9CA3AF', fontWeight: modules.includes(m.id) ? 500 : 400 }}>{m.label}</span>
        </label>
      ))}
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Gestion des utilisateurs"
        sub={`${users.length} compte${users.length > 1 ? 's' : ''} · Rôles et accès aux modules`}
        right={
          <button onClick={() => setShowForm(!showForm)}
            style={{ padding: '9px 16px', background: showForm ? '#1C1C2E' : '#C41E3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {showForm ? '✕ Annuler' : '+ Nouveau compte'}
          </button>
        }
      />

      {error && <div style={{ marginBottom: 16, padding: 12, background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>{error}</div>}
      {success && <div style={{ marginBottom: 16, padding: 12, background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 13, color: '#065F46' }}>{success}</div>}

      {/* Message identifiants à copier */}
      {createdCredentials && (
        <Card style={{ marginBottom: 24, borderLeft: '4px solid #C41E3A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <SectionTitle>Identifiants du nouveau compte</SectionTitle>
            <button onClick={() => setCreatedCredentials(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9CA3AF' }}>✕</button>
          </div>
          <div style={{ background: '#F7F6F3', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#1C1C2E' }}>
{`Bonjour ${createdCredentials.prenom},

Votre compte BNI Kénitra a été créé.

Application : https://project-sa2gw.vercel.app
Email : ${createdCredentials.email}
Mot de passe : ${createdCredentials.password}
Rôle : ${createdCredentials.role}

Merci de changer votre mot de passe après votre première connexion.

Cordialement,
Jean Baptiste CHIOTTI
Directeur Exécutif BNI Kénitra`}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button onClick={() => {
              const msg = `Bonjour ${createdCredentials.prenom},\n\nVotre compte BNI Kénitra a été créé.\n\nApplication : https://project-sa2gw.vercel.app\nEmail : ${createdCredentials.email}\nMot de passe : ${createdCredentials.password}\nRôle : ${createdCredentials.role}\n\nMerci de changer votre mot de passe après votre première connexion.\n\nCordialement,\nJean Baptiste CHIOTTI\nDirecteur Exécutif BNI Kénitra`
              navigator.clipboard.writeText(msg)
              setCopied(true)
              setTimeout(() => setCopied(false), 3000)
            }}
              style={{ padding: '8px 18px', background: copied ? '#059669' : '#1C1C2E', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'background 0.2s' }}>
              {copied ? '✓ Copié !' : 'Copier le message'}
            </button>
          </div>
        </Card>
      )}

      {/* Formulaire création */}
      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <SectionTitle>Créer un nouveau compte</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Prénom *</label>
              <input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} style={inputStyle} placeholder="Chrystel" />
            </div>
            <div>
              <label style={labelStyle}>Nom *</label>
              <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} style={inputStyle} placeholder="DUPONT" />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} placeholder="chrystel@example.com" />
            </div>
            <div>
              <label style={labelStyle}>Mot de passe *</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} placeholder="Min. 6 caractères" />
            </div>
            <div>
              <label style={labelStyle}>Rôle *</label>
              <select value={form.role} onChange={e => handleRoleChange(e.target.value)} style={inputStyle}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.abbr} — {r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Groupe</label>
              <select value={form.groupe_id} onChange={e => setForm({ ...form, groupe_id: e.target.value })} style={inputStyle}>
                <option value="">Tous les groupes</option>
                {groupes.map(g => <option key={g.id} value={g.id}>{g.code} — {g.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Titre</label>
              <input value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} style={inputStyle} placeholder="Directrice Consultante" />
            </div>
            <div>
              <label style={labelStyle}>Téléphone</label>
              <input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} style={inputStyle} placeholder="+212 6 00 00 00 00" />
            </div>
          </div>
          {/* Cases à cocher modules */}
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Accès aux modules</label>
            <div style={{ padding: 12, background: '#F7F6F3', borderRadius: 8 }}>
              <AccessCheckboxes modules={formAccess} onToggle={toggleFormModule} />
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={handleCreate} disabled={saving}
              style={{ padding: '10px 24px', background: saving ? 'rgba(196,30,58,0.5)' : '#C41E3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: 8 }}>
              {saving ? <><Spinner size={14} color="#fff" /> Création...</> : 'Créer le compte'}
            </button>
          </div>
        </Card>
      )}

      {/* Liste des utilisateurs */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E8E6E1' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Utilisateur', 'Email', 'Rôle', 'Groupe', 'Accès modules', 'Statut', 'Actions'].map(h => (
              <th key={h} style={{ background: '#F9F8F6', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {users.map(u => {
                const badge = roleBadge(u.role)
                const userModules = u.modules_access || DEFAULT_ACCESS[u.role] || []
                const isEditing = editAccess === u.id
                return (
                  <React.Fragment key={u.id}>
                    <tr style={{ borderBottom: isEditing ? 'none' : '1px solid #F3F2EF' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 500 }}>{u.prenom} {u.nom}</div>
                        {u.titre && <div style={{ fontSize: 11, color: '#6B7280' }}>{u.titre}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{u.email}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12, background: badge.bg, color: badge.color }}>
                          {roleAbbr(u.role)} · {roleLabel(u.role)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{u.groupes?.code || 'Tous'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                          {MODULES.map(m => (
                            <span key={m.id} style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, background: userModules.includes(m.id) ? '#D1FAE5' : '#F3F4F6', color: userModules.includes(m.id) ? '#065F46' : '#9CA3AF', fontWeight: 500 }}>
                              {m.label}
                            </span>
                          ))}
                          <button onClick={() => setEditAccess(isEditing ? null : u.id)}
                            style={{ fontSize: 10, color: '#C41E3A', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginLeft: 4 }}>
                            {isEditing ? '✕' : 'Modifier'}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span onClick={() => handleToggle(u.id, u.actif)} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 12, background: u.actif ? '#D1FAE5' : '#FEE2E2', color: u.actif ? '#065F46' : '#991B1B' }}>
                          {u.actif ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', position:'relative', overflow:'visible' }}>
                        <div ref={actionMenu === u.id ? menuRef : null} style={{ position:'relative', display:'inline-block' }}>
                          <button onClick={() => setActionMenu(actionMenu === u.id ? null : u.id)}
                            style={{ padding:'6px 12px', background: actionMenu === u.id ? '#1C1C2E' : '#fff', color: actionMenu === u.id ? '#fff' : '#1C1C2E', border:'1px solid #E8E6E1', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                            Actions ▾
                          </button>
                          {actionMenu === u.id && (
                            <div style={{ position:'absolute', right:0, top:32, background:'#fff', border:'1px solid #E8E6E1', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', zIndex:9999, minWidth:200, overflow:'hidden' }}>
                              <div onClick={() => startEdit(u)} style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}
                                onMouseEnter={e => e.currentTarget.style.background='#F7F6F3'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                ✏️ Éditer le profil
                              </div>
                              <div onClick={() => { setEditAccess(isEditing ? null : u.id); setActionMenu(null) }} style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderTop:'1px solid #F3F2EF' }}
                                onMouseEnter={e => e.currentTarget.style.background='#F7F6F3'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                🔑 Modifier les accès
                              </div>
                              <div onClick={() => { setResetPwd(u.id); setNewPassword(''); setActionMenu(null) }} style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderTop:'1px solid #F3F2EF', color:'#D97706' }}
                                onMouseEnter={e => e.currentTarget.style.background='#F7F6F3'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                🔄 Réinitialiser le mot de passe
                              </div>
                              <div onClick={() => { setConfirmDelete(u.id); setActionMenu(null) }} style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderTop:'1px solid #F3F2EF', color:'#DC2626' }}
                                onMouseEnter={e => e.currentTarget.style.background='#FEF2F2'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                🗑️ Supprimer
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Réinitialisation mot de passe inline */}
                    {resetPwd === u.id && (
                      <tr style={{ borderBottom:'1px solid #F3F2EF' }}>
                        <td colSpan={7} style={{ padding:'12px 14px', background:'#FFFBEB' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:'#854D0E' }}>Nouveau mot de passe :</span>
                            <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 caractères"
                              style={{ padding:'6px 10px', border:'1px solid #FDE68A', borderRadius:6, fontSize:12, fontFamily:'DM Sans, sans-serif', width:200 }} />
                            <button onClick={async () => {
                              try {
                                if (newPassword.length < 6) { setError('Min. 6 caractères'); return }
                                await resetUserPassword(u.id, newPassword)
                                setCreatedCredentials({ prenom:u.prenom, nom:u.nom, email:u.email, password:newPassword, role:roleLabel(u.role) })
                                setCopied(false)
                                setSuccess(`Mot de passe réinitialisé pour ${u.prenom} ${u.nom}`)
                                setResetPwd(null); setNewPassword('')
                              } catch(e) { setError(e.message) }
                            }} style={{ padding:'6px 14px', background:'#D97706', color:'#fff', border:'none', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer' }}>Valider</button>
                            <button onClick={() => { setResetPwd(null); setNewPassword('') }} style={{ padding:'6px 14px', background:'#F3F4F6', color:'#4B5563', border:'none', borderRadius:6, fontSize:11, cursor:'pointer' }}>Annuler</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {/* Confirmation suppression */}
                    {confirmDelete === u.id && (
                      <tr style={{ borderBottom:'1px solid #F3F2EF' }}>
                        <td colSpan={7} style={{ padding:'12px 14px', background:'#FEF2F2' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:'#991B1B' }}>Confirmer la suppression de {u.prenom} {u.nom} ?</span>
                            <button onClick={() => handleDelete(u.id)} style={{ padding:'6px 14px', background:'#DC2626', color:'#fff', border:'none', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer' }}>Supprimer</button>
                            <button onClick={() => setConfirmDelete(null)} style={{ padding:'6px 14px', background:'#F3F4F6', color:'#4B5563', border:'none', borderRadius:6, fontSize:11, cursor:'pointer' }}>Annuler</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {/* Édition du profil */}
                    {editUser === u.id && (
                      <tr style={{ borderBottom:'1px solid #F3F2EF' }}>
                        <td colSpan={7} style={{ padding:'14px', background:'#F7F6F3' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                            <div><label style={labelStyle}>Prénom</label><input value={editForm.prenom} onChange={e=>setEditForm({...editForm,prenom:e.target.value})} style={inputStyle}/></div>
                            <div><label style={labelStyle}>Nom</label><input value={editForm.nom} onChange={e=>setEditForm({...editForm,nom:e.target.value})} style={inputStyle}/></div>
                            <div><label style={labelStyle}>Email</label><input value={editForm.email} onChange={e=>setEditForm({...editForm,email:e.target.value})} style={inputStyle}/></div>
                            <div><label style={labelStyle}>Rôle</label><select value={editForm.role} onChange={e=>setEditForm({...editForm,role:e.target.value})} style={inputStyle}>{ROLES.map(r=><option key={r.value} value={r.value}>{r.abbr} — {r.label}</option>)}</select></div>
                            <div><label style={labelStyle}>Titre</label><input value={editForm.titre} onChange={e=>setEditForm({...editForm,titre:e.target.value})} style={inputStyle}/></div>
                            <div><label style={labelStyle}>Téléphone</label><input value={editForm.telephone} onChange={e=>setEditForm({...editForm,telephone:e.target.value})} style={inputStyle}/></div>
                            <div><label style={labelStyle}>Groupe</label><select value={editForm.groupe_id} onChange={e=>setEditForm({...editForm,groupe_id:e.target.value})} style={inputStyle}><option value="">Tous</option>{groupes.map(g=><option key={g.id} value={g.id}>{g.code} — {g.nom}</option>)}</select></div>
                            <div style={{display:'flex',alignItems:'flex-end',gap:8}}>
                              <button onClick={handleSaveEdit} disabled={saving} style={{ padding:'8px 18px', background:'#C41E3A', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>{saving?'...':'Sauvegarder'}</button>
                              <button onClick={()=>setEditUser(null)} style={{ padding:'8px 18px', background:'#F3F4F6', color:'#4B5563', border:'none', borderRadius:8, fontSize:12, cursor:'pointer' }}>Annuler</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {/* Ligne d'édition des accès */}
                    {isEditing && (
                      <tr style={{ borderBottom: '1px solid #F3F2EF' }}>
                        <td colSpan={7} style={{ padding: '12px 14px', background: '#F7F6F3' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' }}>Modifier les accès :</span>
                            <AccessCheckboxes
                              modules={userModules}
                              onToggle={(moduleId) => {
                                const updated = userModules.includes(moduleId) ? userModules.filter(m => m !== moduleId) : [...userModules, moduleId]
                                setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, modules_access: updated } : usr))
                              }}
                            />
                            <button onClick={() => saveAccess(u.id, users.find(usr => usr.id === u.id)?.modules_access || userModules)}
                              style={{ padding: '6px 14px', background: '#C41E3A', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              Sauvegarder
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
