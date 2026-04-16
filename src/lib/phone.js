// Utilitaire de formatage des numéros de téléphone marocains
// Format cible : "+212 XXX-XXXXXX" (3 chiffres puis tiret puis 6 chiffres)
//
// Accepte les formats d'entrée courants :
//   "0612345678"          → "+212 612-345678"
//   "612345678"           → "+212 612-345678"
//   "212612345678"        → "+212 612-345678"
//   "+212612345678"       → "+212 612-345678"
//   "+212 6 12 34 56 78"  → "+212 612-345678"
//   "00212612345678"      → "+212 612-345678"
//
// Si le numéro ne peut pas être normalisé en 9 chiffres marocains,
// renvoie la valeur nettoyée (digits + "+" initial) sans reformatage.

export function formatMoroccanPhone(raw) {
  if (raw == null) return ''
  const str = String(raw).trim()
  if (!str) return ''

  // Garder uniquement chiffres et "+"
  let cleaned = str.replace(/[^\d+]/g, '')

  // Normaliser les préfixes internationaux
  if (cleaned.startsWith('00212')) cleaned = cleaned.slice(5)
  else if (cleaned.startsWith('+212')) cleaned = cleaned.slice(4)
  else if (cleaned.startsWith('212') && cleaned.length >= 11) cleaned = cleaned.slice(3)

  // Retirer un éventuel "0" initial (format local marocain)
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1)

  // Ne garder que les chiffres après normalisation
  const digits = cleaned.replace(/\D/g, '')

  // Format final si on a bien 9 chiffres
  if (digits.length === 9) {
    return `+212 ${digits.slice(0, 3)}-${digits.slice(3)}`
  }

  // Sinon on renvoie la valeur d'origine trimmée (permet la saisie libre)
  return str
}

// Renvoie true si la chaîne ressemble à un numéro marocain valide (9 chiffres)
export function isValidMoroccanPhone(raw) {
  if (!raw) return false
  let cleaned = String(raw).replace(/[^\d+]/g, '')
  if (cleaned.startsWith('00212')) cleaned = cleaned.slice(5)
  else if (cleaned.startsWith('+212')) cleaned = cleaned.slice(4)
  else if (cleaned.startsWith('212') && cleaned.length >= 11) cleaned = cleaned.slice(3)
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1)
  return cleaned.replace(/\D/g, '').length === 9
}
