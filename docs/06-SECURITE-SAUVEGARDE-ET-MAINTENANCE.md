# Guide de Sécurité, Sauvegarde, Maintenance & Intégration Future

## 1. Sécurité & Protection des données de mineurs

- **Défense en profondeur** :
  1. Proxy Next.js 16 (`src/proxy.ts`) + gardes serveur (`requirePageAuth`, `requirePageAdmin`, `requireApiAuth`, `requireApiAdmin`).
  2. Validation systématique Zod côté serveur sur toutes les routes API.
  3. **Row Level Security (RLS) PostgreSQL** sur 100 % des tables publiques et des buckets Storage :
     - Aucun droit pour le rôle `anon`.
     - Un `coach` ne peut lire/écrire que les sessions auxquelles il est affecté, dans la limite stricte de ses catégories et ateliers, et uniquement lorsque la session est `in_progress`.
     - Les coordonnées des responsables légaux (`guardians`), les rapports PDF (`assessment_reports`) et le journal d'audit (`audit_logs`) sont strictement réservés au rôle `admin`.
- **Non-indexation** : `src/app/robots.ts` (`Disallow: /`), métadonnées `noindex, nofollow` et en-tête HTTP global `X-Robots-Tag: noindex, nofollow, noarchive`.
- **Minimisation & Consentement** : seules les données sportives et de contact responsable nécessaires sont collectées ; chaque fiche joueur trace `consent_obtained` et `consent_date`. L'archivage permet de retirer un joueur des listes actives tout en respectant la conservation maîtrisée, et la suppression complète est possible pour les fiches sans historique (ou après purge réglementaire).

---

## 2. Sauvegardes & Restauration

1. **Sauvegardes automatiques Supabase** : activez les sauvegardes quotidiennes automatiques dans Supabase Dashboard > Database > Backups (et Point-in-Time Recovery selon votre plan).
2. **Exports réguliers de sécurité** : après chaque session finalisée, téléchargez et conservez sur un support chiffré du club :
   - `/api/exports/joueurs` (`.csv`)
   - `/api/exports/resultats` (`.csv`)
   - `/api/exports/classements` (`.csv`)
   - `/api/reports/archive?session_id=...` (`.zip` de tous les PDF officiels)

---

## 3. Maintenance courante

- **Changement de saison** : ajoutez la nouvelle saison (ex: `2027–2028`) dans `/parametres` et définissez-la comme saison active.
- **Purge des données DEMO** : avant un événement officiel, vérifiez dans `/parametres` que le compteur de fiches `DEMO` est bien à `0` (bouton *Supprimer toutes les données DEMO*).
- **Mises à jour logicielles** : exécutez systématiquement `npm run typecheck && npm test && npm run build` avant tout déploiement sur `main`.

---

## 4. Architecture d'intégration future (`FUTURISTE FC MANAGEMENT`)

L'application sépare strictement les couches :
- `src/lib/scoring/` — Moteur mathématique pur
- `src/lib/analysis/` & `src/lib/ranking/` — Règles d'analyse et de comparabilité
- `src/lib/server/consolidation.ts` — Consolidation métier serveur
- `src/lib/pdf/` — Génération documentaire
- `src/lib/offline/` — Couche PWA IndexedDB

Tous les enregistrements possèdent des **UUID v4 stables** et la table `players` expose `external_ref` (contrainte `UNIQUE`) permettant une réconciliation bidirectionnelle immédiate avec la future plateforme globale **FUTURISTE FC MANAGEMENT** via les endpoints authentifiés `/api/players`, `/api/sessions`, `/api/evaluations`, `/api/scores` et `/api/reports`.
