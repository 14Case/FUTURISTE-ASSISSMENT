# Guide d'installation et de configuration

## 1. Prérequis

- **Node.js** `>= 20.x` et **npm**
- Un projet **Supabase Cloud** (région Europe de l'Ouest recommandée pour Douala/Cameroun afin de réduire la latence)
- Un compte **GitHub** et un compte **Vercel** pour le déploiement HTTPS

## 2. Installation locale

```bash
git clone <url-du-depot>
cd "FUTURISTE ASSESSMENT"
npm install
cp .env.example .env.local
```

## 3. Variables d'environnement (`.env.local`)

Toutes les variables sont documentées dans `.env.example` :

| Variable | Exposition | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Serveur | URL HTTPS du projet Supabase (`https://xxx.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Serveur | Clé publique `anon` : toutes les requêtes sont filtrées par Row Level Security (RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Serveur uniquement** | Clé privilégiée utilisée exclusivement dans `src/lib/supabase/admin.ts` (`server-only`) pour créer les comptes encadreurs via Auth Admin et amorcer le premier compte ADMIN. Ne jamais l'exposer côté client. |
| `NEXT_PUBLIC_APP_URL` | Client & Serveur | URL canonique de l'application (`http://localhost:3000` en local, domaine Vercel en production). |
| `BOOTSTRAP_ADMIN_SECRET` | **Serveur uniquement** | Code secret optionnel demandé sur `/initialisation` lors de la création du tout premier compte administrateur. |

## 4. Première mise en service

1. Exécutez les 4 fichiers SQL situés dans `supabase/migrations/` dans l'éditeur SQL Supabase (voir `02-GUIDE-SUPABASE-ET-BASE-DE-DONNEES.md`).
2. Lancez `npm run dev` et ouvrez `http://localhost:3000/initialisation`.
3. Créez le premier compte **ADMIN** : l'écran d'amorçage se verrouille automatiquement et définitivement dès qu'un administrateur existe.
4. Connectez-vous sur `/connexion`, configurez vos seuils chronométrés par catégorie dans **Ateliers & Barèmes**, puis créez les comptes de vos encadreurs dans **Comptes & Encadreurs**.
