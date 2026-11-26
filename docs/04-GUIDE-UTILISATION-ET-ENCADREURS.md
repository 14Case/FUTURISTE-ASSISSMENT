# Guide d'utilisation, Guide des Encadreurs & Guide d'importation

## 1. Parcours Administrateur (Avant, Pendant et Après le Test d'Aptitude)

### Avant le jour J (ex: préparation du 28 novembre 2026)
1. **Paramétrer les seuils** (`/baremes`) : définissez les paliers chronométrés et distances par catégorie (`U6–U9`, `U10–U13`, `U14–U16`) pour les ateliers `A1`, `A2`, `A3`, `A5`, `T3` et `P1`.
2. **Importer ou créer les joueurs** (`/joueurs` ou `/joueurs/importer`) avec leurs responsables légaux et le consentement parental.
3. **Créer les comptes encadreurs** (`/encadreurs`).
4. **Préparer la session** (`/sessions/[id]`) :
   - Cliquez sur *« Inscrire tous les joueurs actifs des catégories »* (la catégorie de chaque enfant au jour précis du test est enregistrée automatiquement).
   - Affectez chaque encadreur à son atelier (ex: Coach A sur `A1 Sprint`, Coach B sur `T1 Passes`).
   - Passez la session au statut **« En cours »**.

### Après la saisie terrain
1. Passez la session au statut **« À valider »** pour figer la saisie des encadreurs.
2. Vérifiez les fiches joueurs (`/joueurs/[id]`), ajoutez si souhaité une appréciation personnalisée, puis cliquez sur **Finaliser la session**.
3. Ouvrez **Rapports PDF** (`/rapports`), cliquez sur **Générer toute la session**, puis utilisez **Transmettre** (ou l'archive ZIP) pour remettre chaque rapport individuel à son parent.

---

## 2. Guide des Encadreurs Terrain (Téléphone / Tablette)

1. **Avant de quitter une zone Wi-Fi / 4G** :
   - Connectez-vous sur l'application et installez-la sur l'écran d'accueil.
   - Ouvrez **Mode hors ligne & Sync** (`/synchronisation`) et cliquez sur **Précharger pour hors ligne** sur la session du jour.
2. **Au bord du terrain (`/terrain`)** :
   - **Mode Atelier** (idéal pour un poste fixe comme le Sprint ou les Passes) : choisissez la session, votre atelier et la catégorie ; saisissez les essais directement sur chaque ligne joueur.
   - **Mode Individuel** : suivez un joueur et passez d'une fiche à l'autre via le grand bouton **Joueur suivant →**.
   - **Grilles qualitatives** : lisez le descriptif affiché sur chaque bouton avant d'attribuer la note. Pour l'atelier `E1 Esprit d'équipe`, évaluez les comportements observés (entraide, respect, coopération) sans confondre aisance verbale et esprit d'équipe.
3. **Synchronisation** :
   - Badge orange *« Local (en attente) »* : la donnée est sauvegardée sur votre téléphone mais pas encore reçue par le serveur.
   - Badge vert *« Synchronisé »* : le serveur a confirmé l'enregistrement. Ne vous déconnectez pas tant qu'il reste des opérations locales en attente.

---

## 3. Guide d'importation CSV / Excel

1. Rendez-vous dans **Joueurs → Importer CSV / Excel** (`/joueurs/importer`).
2. Cliquez sur **Télécharger le modèle CSV** (`modele_import_joueurs_FAFC.csv`).
3. Remplissez vos lignes dans Excel ou Google Sheets (formats de date acceptés : `JJ/MM/AAAA` comme `14/05/2015` ou `AAAA-MM-JJ` comme `2015-05-14`).
4. Chargez votre fichier `.csv` ou `.xlsx` : l'application associe automatiquement les colonnes, vérifie chaque ligne et détecte les doublons.
5. Si des erreurs sont signalées, cliquez sur **Télécharger le rapport d'erreurs**, corrigez votre fichier ou importez uniquement les lignes valides.
