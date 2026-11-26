/**
 * Moteur d'analyse sportive — règles déterministes et explicables.
 *
 * - Fondé exclusivement sur les scores calculés et les observations saisies.
 * - N'invente aucune observation ; les commentaires des encadreurs sont
 *   restitués tels quels, jamais reformulés.
 * - N'attribue aucun poste définitif et ne fait aucune prédiction de carrière.
 * - Ne modifie jamais les scores. Peut être désactivé / corrigé par un responsable.
 */
import { round } from "../scoring/engine";
import type { DomainCode, TestScoreEntry, TotalResult } from "../scoring/types";

/** Bandes d'interprétation internes (échelle du club, pas des normes universelles). */
export const ANALYSIS_BANDS = {
  strength: 0.75, // ≥ 75 % du maximum d'un test → point fort
  improvement: 0.5, // < 50 % du maximum → axe de progression
};

export type AgeBand = "U6-U9" | "U10-U13" | "U14-U16" | "other";

export function ageBandFromCategoryCode(code: string | null | undefined): AgeBand {
  if (code === "U6-U9" || code === "U10-U13" || code === "U14-U16") return code;
  return "other";
}

export interface AnalysisItem {
  test_code: string | null;
  domain: DomainCode | null;
  text: string;
}

export interface AnalysisResult {
  profiles: string[];
  strengths: AnalysisItem[];
  improvements: AnalysisItem[];
  recommendations: string[];
  summary: string;
  interpretation: string | null;
  partial: boolean;
  generated_at: string;
}

const STRENGTH_TEXT: Record<string, string> = {
  A1: "Vitesse de course linéaire",
  A2: "Agilité et changements de direction",
  A3: "Coordination et rythme des appuis",
  A4: "Réactivité au signal",
  A5: "Explosivité (détente horizontale)",
  T1: "Qualité et précision de passe",
  T2: "Contrôle orienté et première touche",
  T3: "Conduite de balle et dribble",
  T4: "Finition et qualité de frappe",
  P1: "Endurance et maintien de l'effort",
  I1: "Lecture et compréhension du jeu",
  E1: "Esprit d'équipe et attitude collective",
};

const RECO: Record<string, Record<AgeBand, string>> = {
  A1: {
    "U6-U9": "Jeux de poursuite et courses courtes ludiques (relais, « chat ») pour développer la vitesse.",
    "U10-U13": "Travail de fréquence et de technique de course (montées de genoux, départs variés) sur 10–20 m.",
    "U14-U16": "Sprints courts répétés avec récupération complète et travail technique de mise en action.",
    other: "Travail de vitesse adapté à l'âge, sur distances courtes et avec récupération complète.",
  },
  A2: {
    "U6-U9": "Parcours ludiques avec changements de direction (slaloms, jeux de miroir).",
    "U10-U13": "Circuits d'appuis et changements de direction avec et sans ballon.",
    "U14-U16": "Exercices de changement de direction en réaction à un stimulus, avec contrôle postural.",
    other: "Exercices d'agilité et de changements de direction adaptés à l'âge.",
  },
  A3: {
    "U6-U9": "Jeux de motricité variés (échelle, cerceaux, sauts) sous forme ludique.",
    "U10-U13": "Séquences d'échelle de coordination de complexité croissante, 2 à 3 fois par semaine.",
    "U14-U16": "Coordination spécifique enchaînée avec une action technique (passe, contrôle).",
    other: "Exercices de coordination réguliers de complexité progressive.",
  },
  A4: {
    "U6-U9": "Jeux de réaction à des signaux visuels et sonores (couleurs, sifflet).",
    "U10-U13": "Départs sur signaux variés et jeux de réaction-décision.",
    "U14-U16": "Réaction à des stimuli de jeu réels (ballon, adversaire) en situation.",
    other: "Jeux de réaction à des signaux variés.",
  },
  A5: {
    "U6-U9": "Jeux de sauts variés (marelle, sauts de haies basses) pour le plaisir de sauter.",
    "U10-U13": "Éducatifs de sauts et de réception (pieds joints, multibonds courts) avec technique soignée.",
    "U14-U16": "Pliométrie légère encadrée et renforcement au poids du corps, priorité à la réception.",
    other: "Travail de sauts et de réception adapté à l'âge.",
  },
  T1: {
    "U6-U9": "Jeux de passes à deux et à trois, avec les deux pieds, sur courte distance.",
    "U10-U13": "Répétitions de passes des deux pieds avec cibles, en insistant sur la surface de contact.",
    "U14-U16": "Passes sous contrainte de temps et d'espace, enchaînées avec un déplacement.",
    other: "Répétitions de passes des deux pieds avec cibles.",
  },
  T2: {
    "U6-U9": "Jeux de réception du ballon avec différentes surfaces du pied.",
    "U10-U13": "Contrôles orientés vers une porte, avec prise d'information préalable.",
    "U14-U16": "Contrôles orientés sous pression d'un adversaire et enchaînement rapide.",
    other: "Exercices de contrôle orienté vers une cible.",
  },
  T3: {
    "U6-U9": "Beaucoup de touches de balle : conduites libres, jeux du « béret » balle au pied.",
    "U10-U13": "Slaloms et conduites avec les deux pieds, toutes surfaces, à vitesse progressive.",
    "U14-U16": "Dribbles en 1 contre 1 et conduite à haute vitesse avec changement de rythme.",
    other: "Travail de conduite de balle avec les deux pieds.",
  },
  T4: {
    "U6-U9": "Jeux de tir ludiques sur petits buts, avec les deux pieds.",
    "U10-U13": "Répétitions de frappes cadrées en soignant le pied d'appui et l'équilibre.",
    "U14-U16": "Finition après action (contrôle, dribble) et sous pression du temps.",
    other: "Répétitions de frappes en soignant la technique.",
  },
  P1: {
    "U6-U9": "Jeux collectifs en mouvement continu ; l'endurance se développe par le jeu.",
    "U10-U13": "Jeux réduits de durée progressive et courses à allure régulière.",
    "U14-U16": "Développement aérobie progressif (intermittent, jeux réduits), suivi de la récupération.",
    other: "Activités d'endurance progressives adaptées à l'âge.",
  },
  I1: {
    "U6-U9": "Petits jeux réduits (2c2, 3c3) pour multiplier les prises de décision.",
    "U10-U13": "Jeux à thème (supériorité numérique, conservation) avec questionnement de l'éducateur.",
    "U14-U16": "Situations de jeu à effectif réduit avec consignes tactiques et analyse vidéo si disponible.",
    other: "Jeux réduits favorisant la prise d'information et la décision.",
  },
  E1: {
    "U6-U9": "Jeux coopératifs valorisant l'entraide et le partage du ballon.",
    "U10-U13": "Responsabilisation au sein du groupe (rôles, encouragements) et valorisation du fair-play.",
    "U14-U16": "Responsabilités collectives (capitanat tournant, tutorat des plus jeunes).",
    other: "Activités valorisant la coopération et le respect.",
  },
};

const DOMAIN_LABEL: Record<DomainCode, string> = {
  athletic: "athlétique",
  technical: "technique",
  physical: "physique",
  game_intelligence: "intelligence de jeu",
  team_spirit: "esprit d'équipe",
};

export function interpretGlobalScore(total: number | null, max = 100): string | null {
  if (total === null) return null;
  const pct = (total / max) * 100;
  if (pct >= 80) return "Très bon niveau d'ensemble au regard des exigences du test pour sa catégorie.";
  if (pct >= 65) return "Bon niveau d'ensemble, avec des acquis solides et des axes de progression identifiés.";
  if (pct >= 50) return "Niveau en développement : des bases sont présentes et plusieurs axes sont à travailler.";
  return "Bases à consolider : un accompagnement régulier permettra de progresser sur les fondamentaux.";
}

function ratio(e: TestScoreEntry): number | null {
  if (!e.result || e.result.status !== "complete" || e.result.points === null || !(e.max_points > 0)) return null;
  return e.result.points / e.max_points;
}

function componentRatio(e: TestScoreEntry | undefined, key: string): number | null {
  const c = e?.result?.components.find((x) => x.key === key);
  if (!c || c.points === null) return null;
  return c.points / c.max_points;
}

export function computeProfiles(total: TotalResult, entries: TestScoreEntry[]): string[] {
  const n = (d: DomainCode) => total.domains.find((x) => x.domain === d)?.normalized ?? null;
  const t = (code: string) => entries.find((e) => e.test_code === code);
  const profiles: string[] = [];
  const ath = n("athletic");
  const tech = n("technical");
  const phys = n("physical");
  const team = n("team_spirit");

  if (ath !== null && ath >= 75) profiles.push("Profil athlétique");
  if (tech !== null && tech >= 75) profiles.push("Profil technique");

  const dribble = t("T3") ? ratio(t("T3")!) : null;
  const decision = componentRatio(t("I1"), "decision");
  const anticipation = componentRatio(t("I1"), "anticipation");
  if (dribble !== null && dribble >= 0.75 && decision !== null && decision >= 0.66 && anticipation !== null && anticipation >= 0.66) {
    profiles.push("Profil créatif");
  }
  if (phys !== null && phys >= 75) profiles.push("Profil endurant");

  const positioning = componentRatio(t("I1"), "positioning");
  if (team !== null && team >= 80 && positioning !== null && positioning >= 0.66) {
    profiles.push("Profil collectif");
  }

  if (!profiles.length) {
    const vals = total.domains.map((d) => d.normalized).filter((v): v is number => v !== null);
    if (vals.length === total.domains.length && vals.length > 0) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (min >= 55 && max - min <= 20) profiles.push("Profil polyvalent");
    }
  }
  if (!profiles.length) profiles.push("Profil en construction");
  return profiles;
}

export interface AnalysisInput {
  total: TotalResult;
  entries: TestScoreEntry[];
  categoryCode: string | null;
  firstName: string;
}

export function analyze({ total, entries, categoryCode, firstName }: AnalysisInput): AnalysisResult {
  const band = ageBandFromCategoryCode(categoryCode);
  const scored = entries
    .map((e) => ({ e, r: ratio(e) }))
    .filter((x): x is { e: TestScoreEntry; r: number } => x.r !== null);

  const strengths = scored
    .filter((x) => x.r >= ANALYSIS_BANDS.strength)
    .sort((a, b) => b.r - a.r)
    .slice(0, 4)
    .map(({ e, r }) => ({
      test_code: e.test_code,
      domain: e.domain,
      text: `${STRENGTH_TEXT[e.test_code] ?? e.test_name} (${round(e.result!.points!, 1)}/${e.max_points}, ${Math.round(r * 100)} %)`,
    }));

  const improvements = scored
    .filter((x) => x.r < ANALYSIS_BANDS.improvement)
    .sort((a, b) => a.r - b.r)
    .slice(0, 4)
    .map(({ e, r }) => ({
      test_code: e.test_code,
      domain: e.domain,
      text: `${STRENGTH_TEXT[e.test_code] ?? e.test_name} (${round(e.result!.points!, 1)}/${e.max_points}, ${Math.round(r * 100)} %)`,
    }));

  const recommendations = improvements
    .map((i) => (i.test_code ? RECO[i.test_code]?.[band] : undefined))
    .filter((x): x is string => Boolean(x));
  // Si aucun axe faible, recommander la consolidation du test le moins réussi.
  if (!recommendations.length && scored.length) {
    const weakest = [...scored].sort((a, b) => a.r - b.r)[0];
    const reco = RECO[weakest.e.test_code]?.[band];
    if (reco) recommendations.push(reco);
  }

  const profiles = computeProfiles(total, entries);
  const partial = !total.complete;
  const interpretation = interpretGlobalScore(total.total, total.max_total);

  const parts: string[] = [];
  if (partial) {
    parts.push(
      `L'évaluation de ${firstName} est incomplète (${Math.round(total.completion_ratio * 100)} % des tests disponibles) : cette synthèse est partielle.`,
    );
  }
  const ranked = total.domains
    .filter((d) => d.normalized !== null)
    .sort((a, b) => (b.normalized ?? 0) - (a.normalized ?? 0));
  if (ranked.length >= 2) {
    parts.push(
      `Son domaine le plus abouti lors de ce test est le volet ${DOMAIN_LABEL[ranked[0].domain]} (${ranked[0].normalized} %), ` +
        `le volet ${DOMAIN_LABEL[ranked[ranked.length - 1].domain]} (${ranked[ranked.length - 1].normalized} %) offrant la plus grande marge de progression.`,
    );
  }
  if (strengths.length) parts.push(`Points forts observés : ${strengths.map((s) => s.text.split(" (")[0].toLowerCase()).join(", ")}.`);
  if (improvements.length) parts.push(`Axes de progression : ${improvements.map((s) => s.text.split(" (")[0].toLowerCase()).join(", ")}.`);
  parts.push(
    "Ces résultats reflètent une performance à une date donnée et ne constituent ni une sélection définitive, ni une prédiction de carrière.",
  );

  return {
    profiles,
    strengths,
    improvements,
    recommendations,
    summary: parts.join(" "),
    interpretation,
    partial,
    generated_at: new Date().toISOString(),
  };
}
