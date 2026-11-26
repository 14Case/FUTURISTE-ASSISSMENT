# Guide des Barèmes, Guide PDF & Guide Hors Ligne (PWA)

## 1. Guide des Barèmes (`/baremes`)

- **Zéro seuil universel inventé** : les épreuves physiques/chronométrées (`A1`, `A2`, `A3`, `A5`, `T3`, `P1`) sont livrées avec `mode: "none"` tant que la Direction Technique n'a pas saisi ses propres seuils par catégorie. Tant qu'un barème est `none`, les temps/distances bruts sont enregistrés mais la validation finale d'un score automatique non défini est bloquée.
- **Modes de calcul disponibles** :
  - *Seuils / Paliers* : attribue les points du meilleur palier atteint (`≤ seuil` pour un temps, `≥ seuil` pour une distance ou un volume).
  - *Interpolation linéaire* : calcule un score proportionnel entre une valeur plancher (`0 pt`) et une valeur cible (`max_points`), arrondi au pas configuré (ex: `0.5 pt`). Utilisé par défaut pour les comptages de réussites (`A4` sur 4 essais, `T1` sur 10 passes, `T4` sur 8 tirs).
- **Versionnage immuable** : publier un barème crée une version `v2`, `v3`, etc. et archive automatiquement la version précédente de même portée (`test + catégorie + sexe`). Les sessions passées conservent la version exacte utilisée le jour du test.

---

## 2. Guide PDF (`/rapports`)

- **Technologie** : `@react-pdf/renderer` côté serveur Node.js (polices vectorielles Helvetica, graphiques SVG natifs, aucun exécutable Chromium requis sur Vercel).
- **Structure stricte en 4 pages A4** :
  - *Page 1* : Emblème et identité du club, saison, joueur, numéro/dossard, catégorie et âge exact à la date du test, score global `/100` et interprétation indicative.
  - *Page 2* : Graphique radar vectoriel sur 5 axes normalisés `/100`, barres de progression par domaine et résumé du profil sportif.
  - *Page 3* : Tableau complet des 12 ateliers, résultats bruts retenus, tentatives détaillées, scores `/max` et observations terrain exactes.
  - *Page 4* : Points forts, axes d'amélioration, recommandations d'entraînement adaptées à la tranche d'âge, commentaire de l'encadrement, visa de validation et date d'édition.
- **Nommage** : `FAFC_Rapport_Nom_Prenom_AAAA.pdf`.
- **Sécurité d'accès** : stocké dans le bucket privé `reports`. Toute modification ultérieure d'une note passe automatiquement le rapport existant au statut `À regénérer` (`outdated`).

---

## 3. Guide du Mode Hors Ligne (PWA) & Limites documentées

- **Fonctionnement** :
  - `IndexedDB` (`FuturisteOfflineDB` via Dexie) conserve deux tables locales : `sessionBundles` (session préchargée) et `outbox` (file d'opérations de saisie).
  - Chaque saisie génère un `op_id` UUID v4. Si un encadreur corrige plusieurs fois le même joueur hors ligne, l'application fusionne l'opération en chaînant `supersedes` afin d'éviter tout doublon.
  - À la reconnexion, `/api/sync/evaluations` enregistre chaque `op_id` dans `public.sync_operations` (idempotence garantie en cas de coupure pendant l'envoi).
- **Limites connues et assumées** :
  1. La première connexion authentifiée et le préchargement initial de la session doivent être réalisés avec du réseau avant le départ au terrain.
  2. La génération des fichiers PDF et la gestion administrative des comptes/barèmes requièrent une connexion active.
  3. Sur iOS/Safari, évitez le mode « Navigation privée » qui désactive ou purge prématurément IndexedDB à la fermeture de l'onglet.
