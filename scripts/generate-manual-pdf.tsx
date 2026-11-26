import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const COLORS = {
  violet: "#5B21B6",
  violetDark: "#3B0764",
  violetSoft: "#F3E8FF",
  sky: "#7DD3FC",
  skyDeep: "#0284C7",
  skySoft: "#E0F2FE",
  slate: "#0F172A",
  muted: "#475569",
  border: "#E2E8F0",
  bgSoft: "#F8FAFC",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  orange: "#EA580C",
  orangeSoft: "#FFEDD5",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLORS.slate,
    backgroundColor: COLORS.white,
    paddingTop: 28,
    paddingBottom: 42,
    paddingHorizontal: 32,
    lineHeight: 1.4,
  },
  hero: {
    backgroundColor: COLORS.violet,
    borderRadius: 10,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    color: COLORS.white,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    color: COLORS.violet,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 3,
  },
  box: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: COLORS.bgSoft,
    marginBottom: 8,
  },
  stepTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: COLORS.slate,
    marginBottom: 3,
  },
  bullet: {
    fontSize: 9,
    color: COLORS.slate,
    marginBottom: 2.5,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.muted,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
});

const logoPath = join(process.cwd(), "public", "brand", "logo-pdf.png");
const logoDataUri = `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`;

function Footer({ page }: { page: number }) {
  return (
    <View style={s.footer} fixed>
      <Text>FUTURISTE ACADÉMIE FC — Manuel Opérationnel FUTURISTE ASSESSMENT</Text>
      <Text>Page {page} / 3</Text>
    </View>
  );
}

const ManualDoc = (
  <Document
    title="Manuel Opérationnel — FUTURISTE ASSESSMENT"
    author="FUTURISTE ACADÉMIE FC"
    language="fr"
  >
    {/* PAGE 1 : RÔLES, PRÉPARATION & ATELIERS */}
    <Page size="A4" style={s.page}>
      <View style={s.hero}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: COLORS.white,
              padding: 2,
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src={logoDataUri}
              style={{ width: 48, height: 48, borderRadius: 24 }}
            />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={s.h1}>FUTURISTE ASSESSMENT — GUIDE PRATIQUE</Text>
            <Text style={{ fontSize: 9, color: COLORS.sky, marginTop: 2 }}>
              FUTURISTE ACADÉMIE FC • Réaliser un test d&apos;aptitude de A à Z
            </Text>
          </View>
        </View>
      </View>

      <Text style={s.h2}>1. Rôles et sécurité d&apos;accès</Text>
      <View style={s.box}>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>ADMIN (Direction & Coordinateurs)</Text> : crée les comptes encadreurs (/encadreurs), configure les barèmes (/baremes), importe ou ajoute les joueurs (/joueurs), pilote les sessions (/sessions), consulte le classement (/classement) et génère/partage les rapports PDF (/rapports).
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>COACH (Éducateurs terrain)</Text> : voit uniquement les sessions, catégories et ateliers auxquels il est affecté, et saisit les notes sur téléphone ou tablette (/terrain) lorsque la session est « En cours ».
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Parents</Text> : pas de compte en ligne dans la V1 ; chaque parent reçoit uniquement le rapport PDF individuel (4 pages) de son enfant.
        </Text>
      </View>

      <Text style={s.h2}>2. Préparation avant le jour du test (Administrateur)</Text>
      <View style={s.box}>
        <Text style={s.stepTitle}>Étape A — Configurer les seuils dans « Ateliers & Barèmes » (/baremes)</Text>
        <Text style={s.bullet}>
          Le logiciel n&apos;invente aucun seuil universel : pour les épreuves chronométrées ou de distance (A1 Sprint, A2 Agilité, A3 Coordination, A5 Explosivité, T3 Dribble, P1 Endurance), choisissez la catégorie (U6–U9, U10–U13, U14–U16), définissez vos paliers de référence et cliquez sur « Publier et activer cette nouvelle version ».
        </Text>
        <Text style={[s.stepTitle, { marginTop: 6 }]}>Étape B — Enregistrer ou importer les joueurs (/joueurs ou /joueurs/importer)</Text>
        <Text style={s.bullet}>
          Ajoutez les joueurs manuellement (numéro FA-XXXX automatique, parents, consentement) ou téléchargez le modèle CSV dans /joueurs/importer pour importer votre liste Excel/CSV en masse avec détection automatique des doublons.
        </Text>
        <Text style={[s.stepTitle, { marginTop: 6 }]}>Étape C — Ouvrir la session (/sessions)</Text>
        <Text style={s.bullet}>
          Ouvrez la session (ex. Test d&apos;aptitude du 28 novembre 2026 à Japoma), cliquez sur « Inscrire tous les joueurs actifs des catégories », affectez vos éducateurs par atelier, puis cliquez sur « Passer En cours ».
        </Text>
      </View>

      <Text style={s.h2}>3. Référentiel des 12 ateliers officiels (Total : 100 points)</Text>
      <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 6 }}>
        <View style={[s.row, { backgroundColor: COLORS.violet }]}>
          <Text style={{ width: "28%", color: COLORS.white, fontFamily: "Helvetica-Bold", fontSize: 8 }}>Domaine</Text>
          <Text style={{ width: "54%", color: COLORS.white, fontFamily: "Helvetica-Bold", fontSize: 8 }}>Ateliers</Text>
          <Text style={{ width: "18%", color: COLORS.white, fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "right" }}>Barème</Text>
        </View>
        <View style={s.row}>
          <Text style={{ width: "28%", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>Athlétique</Text>
          <Text style={{ width: "54%", fontSize: 8 }}>A1 Sprint (10 pts), A2 Agilité (10), A3 Coordination (8), A4 Réaction (6), A5 Explosivité (6)</Text>
          <Text style={{ width: "18%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>40 pts</Text>
        </View>
        <View style={[s.row, { backgroundColor: COLORS.bgSoft }]}>
          <Text style={{ width: "28%", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>Technique</Text>
          <Text style={{ width: "54%", fontSize: 8 }}>T1 Passes /10 (8 pts), T2 Contrôle orienté (6), T3 Conduite & dribble (8), T4 Finition /8 (8)</Text>
          <Text style={{ width: "18%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>30 pts</Text>
        </View>
        <View style={s.row}>
          <Text style={{ width: "28%", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>Physique</Text>
          <Text style={{ width: "54%", fontSize: 8 }}>P1 Endurance — navettes à effort contrôlé (3, 4 ou 5 min selon catégorie)</Text>
          <Text style={{ width: "18%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>10 pts</Text>
        </View>
        <View style={[s.row, { backgroundColor: COLORS.bgSoft }]}>
          <Text style={{ width: "28%", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>Intelligence de jeu</Text>
          <Text style={{ width: "54%", fontSize: 8 }}>I1 Mini-matchs — 5 critères sur 3 pts (Information, Décision, Placement, Phases, Anticipation)</Text>
          <Text style={{ width: "18%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>15 pts</Text>
        </View>
        <View style={[s.row, { borderBottomWidth: 0 }]}>
          <Text style={{ width: "28%", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>Esprit d&apos;équipe</Text>
          <Text style={{ width: "54%", fontSize: 8 }}>E1 Attitude collective observée — 5 critères comportementaux sur 1 pt (0 / 0,5 / 1)</Text>
          <Text style={{ width: "18%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>5 pts</Text>
        </View>
      </View>

      <Footer page={1} />
    </Page>

    {/* PAGE 2 : SAISIE TERRAIN EN LIGNE & HORS LIGNE */}
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>4. Préparation Mobile & Saisie au bord du terrain (/terrain)</Text>

      <View style={[s.box, { backgroundColor: COLORS.skySoft, borderColor: COLORS.skyDeep }]}>
        <Text style={[s.stepTitle, { color: COLORS.skyDeep }]}>
          Avant de rejoindre le terrain (avec Wi-Fi ou 4G active)
        </Text>
        <Text style={s.bullet}>
          1. Installez l&apos;application sur l&apos;écran d&apos;accueil (Safari iPhone : Partager → Sur l&apos;écran d&apos;accueil ; Chrome Android : Installer l&apos;application).
        </Text>
        <Text style={s.bullet}>
          2. Ouvrez « Mode hors ligne & Sync » (/synchronisation) et appuyez sur « Précharger pour hors ligne » sur la session du jour : tous les joueurs, dossards et barèmes sont stockés dans le téléphone.
        </Text>
      </View>

      <View style={s.box}>
        <Text style={s.stepTitle}>Deux modes de saisie sur le terrain (/terrain)</Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Mode Atelier (poste fixe)</Text> : sélectionnez la Session, l&apos;Atelier (ex. A1 Sprint) et la Catégorie (ex. U10–U13). Tous les joueurs s&apos;affichent en liste. Saisissez les essais numériques ou touchez directement la carte qualitative correspondant au niveau observé (chaque niveau rappelle explicitement sa signification).
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Mode Individuel (suivi joueur)</Text> : sélectionnez un joueur, renseignez ses essais et votre commentaire, enregistrez, puis appuyez sur « Joueur suivant → ».
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Absent / Dispensé</Text> : ouvrez « Obs. / Statut » pour signaler un joueur absent ou blessé afin de ne pas bloquer le suivi d&apos;avancement.
        </Text>
      </View>

      <View style={s.box}>
        <Text style={s.stepTitle}>Indicateurs de synchronisation</Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold", color: COLORS.green }}>Badge vert « Synchronisé »</Text> : la performance est enregistrée et confirmée par la base Supabase.
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold", color: COLORS.orange }}>Badge orange « Local (en attente) »</Text> : réseau coupé ou instable ; la saisie est sauvegardée localement sur l&apos;appareil (même si l&apos;onglet est fermé) et sera envoyée dès le retour d&apos;internet.
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Conflit éventuel</Text> : si deux coachs ont noté le même test du même enfant hors ligne, l&apos;écran /synchronisation permet de choisir quelle saisie conserver.
        </Text>
      </View>

      <Text style={s.h2}>5. Lecture, Analyse des Résultats & Validation</Text>
      <View style={s.box}>
        <Text style={s.bullet}>
          1. <Text style={{ fontFamily: "Helvetica-Bold" }}>Contrôle d&apos;avancement (/sessions/[id])</Text> : filtrez sur « Incomplets » pour vérifier qu&apos;aucun enfant n&apos;a oublié un atelier avant de quitter le stade, puis passez la session sur « Clôturer la saisie (À valider) ».
        </Text>
        <Text style={s.bullet}>
          2. <Text style={{ fontFamily: "Helvetica-Bold" }}>Bilan individuel joueur (/joueurs/[id])</Text> : consultez le score global /100, le graphique Radar normalisé sur 100, les barres des 5 domaines, le profil sportif descriptif (ex. Profil technique, Profil athlétique, Profil collectif), les points forts (≥ 75 %), les axes de progression (&lt; 50 %) et les recommandations d&apos;entraînement adaptées à l&apos;âge.
        </Text>
        <Text style={s.bullet}>
          3. <Text style={{ fontFamily: "Helvetica-Bold" }}>Appréciation du coach & Validation</Text> : sur la fiche du joueur, l&apos;administrateur peut saisir un commentaire personnalisé pour les parents et cliquer sur « Valider l&apos;évaluation du joueur ».
        </Text>
        <Text style={s.bullet}>
          4. <Text style={{ fontFamily: "Helvetica-Bold" }}>Classement interne (/classement)</Text> : comparez les joueurs au sein d&apos;une même catégorie (global ou par domaine) et exportez en CSV si besoin.
        </Text>
        <Text style={s.bullet}>
          5. <Text style={{ fontFamily: "Helvetica-Bold" }}>Finalisation (/sessions/[id])</Text> : cliquez sur « Finaliser la session » pour verrouiller officiellement les résultats (toute correction ultérieure exigera un motif tracé dans /audit).
        </Text>
      </View>

      <Footer page={2} />
    </Page>

    {/* PAGE 3 : RAPPORTS PDF & TRANSMISSION AUX PARENTS */}
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>6. Générer, Télécharger et Partager les Rapports PDF (/rapports)</Text>

      <View style={s.box}>
        <Text style={s.stepTitle}>Contenu du rapport officiel individuel (4 pages A4 maximum)</Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Page 1</Text> : Logo officiel et en-tête FUTURISTE ACADÉMIE FC, saison, identité du joueur, catégorie et âge exact au jour du test, score global /100 et note pédagogique aux parents.
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Page 2</Text> : Graphique radar des 5 domaines, scores détaillés (/40, /30, /10, /15, /5) et résumé du profil sportif.
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Page 3</Text> : Tableau complet des 12 ateliers avec résultats bruts, essais, scores et observations terrain exactes.
        </Text>
        <Text style={s.bullet}>
          • <Text style={{ fontFamily: "Helvetica-Bold" }}>Page 4</Text> : Points forts, axes d&apos;amélioration, recommandations d&apos;entraînement selon l&apos;âge, appréciation de l&apos;encadrement et visa de validation.
        </Text>
      </View>

      <View style={[s.box, { backgroundColor: COLORS.violetSoft, borderColor: COLORS.violet }]}>
        <Text style={[s.stepTitle, { color: COLORS.violet }]}>
          Procédure de génération et de téléchargement
        </Text>
        <Text style={s.bullet}>
          1. Ouvrez le menu <Text style={{ fontFamily: "Helvetica-Bold" }}>« Rapports PDF » (/rapports)</Text> et sélectionnez la session.
        </Text>
        <Text style={s.bullet}>
          2. Cliquez sur <Text style={{ fontFamily: "Helvetica-Bold" }}>« Générer toute la session »</Text> (ou générez joueur par joueur depuis sa fiche). Chaque fichier est nommé automatiquement <Text style={{ fontFamily: "Helvetica-Bold" }}>FAFC_Rapport_Nom_Prenom_2026.pdf</Text> et stocké dans un espace privé sécurisé (aucun lien public permanent).
        </Text>
        <Text style={s.bullet}>
          3. Sur chaque ligne, utilisez l&apos;icône <Text style={{ fontFamily: "Helvetica-Bold" }}>Œil</Text> pour prévisualiser le PDF dans votre navigateur, l&apos;icône <Text style={{ fontFamily: "Helvetica-Bold" }}>Télécharger</Text> pour récupérer un PDF individuel, ou le bouton <Text style={{ fontFamily: "Helvetica-Bold" }}>« Exporter l&apos;archive ZIP »</Text> en haut à droite pour télécharger tous les PDF de la session en une seule fois.
        </Text>
        <Text style={s.bullet}>
          4. Si une note est rectifiée après coup, le rapport passe automatiquement au statut orange <Text style={{ fontFamily: "Helvetica-Bold" }}>« À regénérer »</Text> : cliquez sur l&apos;icône d&apos;actualisation pour produire la nouvelle version à jour.
        </Text>
      </View>

      <View style={[s.box, { backgroundColor: COLORS.greenSoft, borderColor: COLORS.green }]}>
        <Text style={[s.stepTitle, { color: COLORS.green }]}>
          Transmettre le rapport au parent (WhatsApp, Email ou Partage natif)
        </Text>
        <Text style={s.bullet}>
          1. Cliquez sur le bouton vert <Text style={{ fontFamily: "Helvetica-Bold" }}>« Transmettre »</Text> en face du joueur.
        </Text>
        <Text style={s.bullet}>
          2. Vérifiez ou personnalisez le message officiel d&apos;accompagnement de FUTURISTE ACADÉMIE FC.
        </Text>
        <Text style={s.bullet}>
          3. <Text style={{ fontFamily: "Helvetica-Bold" }}>Depuis un téléphone ou une tablette</Text> : appuyez sur « Partage natif téléphone / tablette » pour envoyer directement le fichier PDF joint vers WhatsApp ou Mail.
        </Text>
        <Text style={s.bullet}>
          4. <Text style={{ fontFamily: "Helvetica-Bold" }}>Depuis un ordinateur</Text> : cliquez sur « 1. Télécharger le PDF », puis sur « Préparer WhatsApp » (ouvre automatiquement la discussion au numéro du responsable légal avec le message pré-rempli) ou « Préparer Email », et joignez le PDF téléchargé.
        </Text>
      </View>

      <Footer page={3} />
    </Page>
  </Document>
);

async function main() {
  const buf = await renderToBuffer(ManualDoc);
  const outDocs = join(
    process.cwd(),
    "docs",
    "Guide_Operationnel_FUTURISTE_ASSESSMENT_FAFC.pdf",
  );
  writeFileSync(outDocs, buf);
  console.log(`PDF généré (${buf.byteLength} octets) : ${outDocs}`);
}

main();
