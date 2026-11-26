# Guide de déploiement réel sur Vercel (20 étapes)

Ce guide détaille la mise en production complète de **FUTURISTE ASSESSMENT** sur Vercel + Supabase Cloud :

1. **Organisation du projet** : vérifiez que `npm run typecheck`, `npm test` et `npm run build` réussissent localement sans erreur.
2. **Dépendances** : `package.json` et `package-lock.json` sont figés et propres (`@react-pdf/renderer` est déclaré dans `serverExternalPackages` dans `next.config.ts` pour une exécution native dans les fonctions Node.js de Vercel).
3. **Création du projet Supabase Cloud** : créez un nouveau projet sur https://supabase.com/dashboard et conservez le mot de passe PostgreSQL dans un gestionnaire de secrets.
4. **Exécution des migrations** : exécutez `20261125000001_schema.sql` → `20261125000002_security.sql` → `20261125000003_storage.sql` → `20261125000004_reference_data.sql` dans le SQL Editor Supabase.
5. **Configuration Auth** : dans Supabase > Authentication > URL Configuration, renseignez votre future URL Vercel en `Site URL`.
6. **Vérification RLS** : dans Supabase > Table Editor, vérifiez que toutes les tables portent le badge `RLS enabled`.
7. **Vérification Storage** : dans Supabase > Storage, vérifiez que `reports` et `player-photos` sont **Private** (non publics).
8. **Variables locales** : renseignez `.env.local` (jamais commité grâce à `.gitignore`).
9. **Test local** : lancez `npm run dev`, créez le premier admin sur `/initialisation` et testez la connexion.
10. **Dépôt GitHub** : créez un dépôt GitHub privé `futuriste-assessment`, puis poussez la branche `main` :
    ```bash
    git init
    git add .
    git commit -m "feat: initial release of FUTURISTE ASSESSMENT"
    git branch -M main
    git remote add origin https://github.com/<organisation>/futuriste-assessment.git
    git push -u origin main
    ```
11. **Connexion Vercel** : sur https://vercel.com/new, importez le dépôt GitHub `futuriste-assessment` (Framework Preset : **Next.js**).
12. **Variables d'environnement Vercel** : dans Project Settings > Environment Variables, ajoutez :
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY` (cochez *Sensitive*)
    - `NEXT_PUBLIC_APP_URL` (ex: `https://futuriste-assessment.vercel.app`)
    - `BOOTSTRAP_ADMIN_SECRET` (à retirer après création du premier compte admin)
13. **Déploiement** : cliquez sur **Deploy** et attendez la fin du build Vercel.
14. **Test de production** : ouvrez `/api/health` sur l'URL Vercel et vérifiez `{"ok":true,"supabase_configured":true}`.
15. **Vérification de l'authentification** : connectez-vous avec votre compte Admin puis avec un compte Coach de test.
16. **Vérification des données** : vérifiez la présence de la session du **28 novembre 2026 (Japoma)** dans `/sessions`.
17. **Vérification des rapports PDF** : générez un rapport PDF de test, prévisualisez les 4 pages et vérifiez sa présence dans le bucket privé `reports`.
18. **Vérification sécurité** : vérifiez qu'une navigation privée non connectée est systématiquement redirigée vers `/connexion` et que `/robots.txt` affiche `Disallow: /`.
19. **Vérification mobile & PWA** : sur iPhone (Safari > *Sur l'écran d'accueil*) et Android (Chrome > *Installer l'application*), préchargez la session, activez le mode avion, saisissez un résultat, puis désactivez le mode avion pour vérifier la synchronisation automatique.
20. **Domaine personnalisé & Maintenance** : dans Vercel > Domains, associez ultérieurement votre sous-domaine officiel (ex: `assessment.futuriste-academie.cm`) et mettez à jour `NEXT_PUBLIC_APP_URL` ainsi que `Site URL` dans Supabase Auth.
