import React, { useState, useEffect } from 'react'
import { fetchUsers, createUser, deleteUser, toggleUserActive, fetchGroupes } from '../lib/bniService'
import { PageHeader, Card, SectionTitle, TableWrap, Spinner } from './ui'

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', desc: 'Accès total + gestion utilisateurs' },
  { value: 'directeur_executif', label: 'Directeur Exécutif', desc: 'Accès total + gestion utilisateurs' },
  { value: 'directrice_consultante', label: 'Directrice Consultante', desc: 'Tous les modules sauf Admin' },
  { value: 'lecture', label: 'Lecture seule', desc: 'Dashboard + Membres uniquement' },
]

const roleLabel = (role) => ROLES.find(r => r.value === role)?.label || role

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [groupes, setGroupes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [form, setForm] = useState({ prenom: '', nom: '', email: '', password: '', role: 'directrice_consultante', groupe_id: '', titre: '', telephone: '' })

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

  const handleCreate = async () => {
    setError(''); setSuccess(''); setSaving(true)
    try {
      if (!form.email || !form.password || !form.prenom || !form.nom) throw new Error('Prénom, nom, email et mot de passe sont requis')
      if (form.password.length < 6) throw new Error('Le mot de passe doit faire au moins 6 caractères')
      await createUser({ ...form, groupe_id: form.groupe_id || null })
      setSuccess(`Compte créé pour ${form.prenom} ${form.nom}`)
      setForm({ prenom: '', nom: '', email: '', password: '', role: 'directrice_consultante', groupe_id: '', titre: '', telephone: '' })
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

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #E8E6E1', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.25s ease' }}>
      <PageHeader
        title="Gestion des utilisateurs"
        sub={`${users.length} compte${users.length > 1 ? 's' : ''} · Rôles et accès`}
        right={
          <button onClick={() => setShowForm(!showForm)}
            style={{ padding: '9px 16px', background: showForm ? '#1C1C2E' : '#C41E3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            {showForm ? '✕ Annuler' : '+ Nouveau compte'}
          </button>
        }
      />

      {error && <div style={{ marginBottom: 16, padding: 12, background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>{error}</div>}
      {success && <div style={{ marginBottom: 16, padding: 12, background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 13, color: '#065F46' }}>{success}</div>}

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
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
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
        <TableWrap>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Utilisateur', 'Email', 'Rôle', 'Groupe', 'Statut', 'Actions'].map(h => (
              <th key={h} style={{ background: '#F9F8F6', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E8E6E1' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #F3F2EF' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 500 }}>{u.prenom} {u.nom}</div>
                    {u.titre && <div style={{ fontSize: 11, color: '#6B7280' }}>{u.titre}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 12, background: u.role === 'super_admin' || u.role === 'directeur_executif' ? '#FEF3C7' : u.role === 'directrice_consultante' ? '#DBEAFE' : '#F3F4F6', color: u.role === 'super_admin' || u.role === 'directeur_executif' ? '#92400E' : u.role === 'directrice_consultante' ? '#1E40AF' : '#4B5563' }}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{u.groupes?.code || 'Tous'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span onClick={() => handleToggle(u.id, u.actif)} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 12, background: u.actif ? '#D1FAE5' : '#FEE2E2', color: u.actif ? '#065F46' : '#991B1B' }}>
                      {u.actif ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {confirmDelete === u.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#DC2626' }}>Confirmer ?</span>
                        <button onClick={() => handleDelete(u.id)} style={{ padding: '4px 10px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Oui</button>
                        <button onClick={() => setConfirmDelete(null)} style={{ padding: '4px 10px', background: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Non</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(u.id)} style={{ padding: '4px 10px', background: 'transparent', color: '#DC2626', border: '1px solid #FEE2E2', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  )
}
