# BNI Directeur Exécutif — Kénitra

Application de pilotage BNI pour le Directeur Exécutif Jean Baptiste CHIOTTI.

## Stack
- React 18 + Vite
- Supabase (base de données)
- Anthropic API (Agent IA)

## Déploiement Vercel (3 étapes)

### 1. Pousser sur GitHub
```bash
git init
git add .
git commit -m "feat: BNI Directeur Exécutif v1.0"
git remote add origin https://github.com/TON_USERNAME/bni-directeur-executif.git
git push -u origin main
```

### 2. Importer sur Vercel
- Aller sur https://vercel.com/new
- Importer le repo GitHub
- Framework : Vite (détecté automatiquement)

### 3. Variables d'environnement Vercel
Ajouter dans Settings > Environment Variables :
```
VITE_SUPABASE_URL=https://bqpamuzsibitvdikzxij.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Développement local
```bash
npm install
npm run dev
```

## Structure
```
src/
├── App.jsx              # Layout principal + navigation
├── components/
│   ├── Dashboard.jsx    # Tableau de bord
│   ├── Membres.jsx      # Gestion membres
│   ├── modules.jsx      # Invités, Groupes, Reporting, Agent IA
│   └── ui.jsx           # Composants réutilisables
├── data/
│   └── bniData.js       # Données BNI + contexte IA
└── lib/
    └── supabase.js      # Client Supabase
```
