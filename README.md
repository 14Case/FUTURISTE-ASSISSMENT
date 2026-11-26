# FUTURISTE ASSESSMENT

**Application web d'évaluation terrain, d'analyse de profils sportifs et de reporting PDF individuel — FUTURISTE ACADÉMIE FC**

---

## Présentation

**FUTURISTE ASSESSMENT** numérise l'ensemble du processus des tests d'aptitude de **FUTURISTE ACADÉMIE FC** (en commençant par le *Test d'Aptitude Saison 2026–2027 du 28 novembre 2026 à l'École Publique de Japoma, Douala, Cameroun*, et pour toutes les sessions et saisons suivantes) :

1. **Gestion de l'effectif & des responsables légaux** : fiches joueurs, numérotation automatique `FA-XXXX`, consentement parental, import CSV/Excel avec détection des doublons et rapport d'erreurs.
2. **Sessions d'évaluation** : création, duplication, affectation granulaire des encadreurs (par atelier et/ou catégorie), suivi d'avancement en direct et verrouillage après finalisation.
3. **12 ateliers initiaux & barèmes versionnés sans code** : Compétences athlétiques (`/40`), Compétences techniques (`/30`), Capacités physiques (`/10`), Intelligence de jeu (`/15`), Esprit d'équipe (`/5`) — total `/100`.
4. **Saisie au bord du terrain (PWA hors ligne)** : mode Atelier (liste rapide) et mode Individuel (passage joueur suivant), grilles qualitatives explicites, sauvegarde locale IndexedDB, opérations idempotentes et arbitrage des conflits.
5. **Moteur d'analyse & Classement interne** : graphiques radar normalisés sur 100, profils descriptifs, recommandations adaptées à l'âge (`U6–U9`, `U10–U13`, `U14–U16`), comparaison historique contrôlée.
6. **Rapports PDF individuels (4 pages max)** : générés côté serveur (`@react-pdf/renderer`), archivés dans un bucket privé Supabase Storage (`reports`), téléchargement sécurisé et préparation du partage parent (WhatsApp / Email / Partage natif).

---

## Stack Technique

- **Frontend** : Next.js 16.4 (App Router, `src/proxy.ts`), React 19, TypeScript strict, Tailwind CSS v4, composants accessibles style `shadcn/ui`, Lucide Icons, Recharts, React Hook Form, Zod.
- **Backend & Sécurité** : Supabase (PostgreSQL, Supabase Auth, Row Level Security intégrale, Triggers d'audit et de verrouillage, Supabase Storage privé), Route Handlers Next.js validés côté serveur.
- **PWA & Mode hors ligne** : Manifest Web App, Service Worker (`public/sw.js`), IndexedDB via Dexie.js, synchronisation contrôlée `/api/sync/evaluations`.
- **PDF** : `@react-pdf/renderer` (rendu vectoriel natif Node.js compatible Vercel Serverless, sans navigateur headless).
- **Tests automatisés** : Vitest, `@electric-sql/pglite` (vérification réelle des migrations PostgreSQL et des politiques RLS), `fake-indexeddb`.

---

## Commandes principales

```bash
npm install               # Installation des dépendances
npm run dev               # Serveur de développement (http://localhost:3000)
npm run typecheck         # Vérification TypeScript stricte
npm test                  # Exécution de toute la suite de tests automatisés (calculs, PDF, PWA, RLS PostgreSQL)
npm run build             # Compilation de production Next.js
npm run db:generate-seed  # Régénération de la migration SQL de référence depuis le catalogue TS
```

---

## Documentation complète (`docs/`)

1. [Guide d'installation et de configuration](docs/01-INSTALLATION-ET-CONFIGURATION.md)
2. [Guide Supabase et schéma PostgreSQL](docs/02-GUIDE-SUPABASE-ET-BASE-DE-DONNEES.md)
3. [Guide de déploiement Vercel (20 étapes)](docs/03-GUIDE-DEPLOIEMENT-VERCEL.md)
4. [Guide d'utilisation, encadreurs terrain et importation CSV/Excel](docs/04-GUIDE-UTILISATION-ET-ENCADREURS.md)
5. [Guide des barèmes, génération PDF et mode hors ligne PWA](docs/05-GUIDE-BAREMES-PDF-ET-HORS-LIGNE.md)
6. [Guide de sécurité, sauvegarde, maintenance et API d'intégration](docs/06-SECURITE-SAUVEGARDE-ET-MAINTENANCE.md)
