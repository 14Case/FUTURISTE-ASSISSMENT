/**
 * Catalogue initial des tests FUTURISTE ACADÉMIE FC — Saison 2026–2027.
 *
 * Source unique de vérité utilisée pour :
 *  - générer le seed SQL de référence (scripts/generate-seed.ts) ;
 *  - les tests automatisés du moteur de calcul.
 *
 * IMPORTANT — aucun seuil sportif universel n'est inventé :
 *  - Les mesures chronométrées / de distance / de volume sont livrées SANS
 *    seuils (scoring.mode = "none") : l'administrateur doit configurer les
 *    barèmes de référence par catégorie dans le module « Barèmes ».
 *  - Les comptages de réussites (passes, tirs, réactions correctes) utilisent
 *    une conversion proportionnelle transparente (réussites / essais × max),
 *    modifiable.
 *  - Les critères qualitatifs utilisent des grilles descriptives éditables.
 */

import type { DomainCode, QualitativeLevel, RubricComponent, RubricConfig } from "./types";

export interface CatalogCategory {
  code: string;
  label: string;
  min_age: number;
  max_age: number;
  sort_order: number;
}

export const DEFAULT_CATEGORIES: CatalogCategory[] = [
  { code: "U6-U9", label: "U6–U9", min_age: 6, max_age: 9, sort_order: 1 },
  { code: "U10-U13", label: "U10–U13", min_age: 10, max_age: 13, sort_order: 2 },
  { code: "U14-U16", label: "U14–U16", min_age: 14, max_age: 16, sort_order: 3 },
];

export const DEFAULT_DOMAINS: { code: DomainCode; label: string; max_points: number; sort_order: number; description: string }[] = [
  { code: "athletic", label: "Compétences athlétiques", max_points: 40, sort_order: 1, description: "Vitesse, agilité, coordination, réaction, explosivité." },
  { code: "technical", label: "Compétences techniques", max_points: 30, sort_order: 2, description: "Passes, contrôle orienté, conduite et dribble, finition." },
  { code: "physical", label: "Capacités physiques", max_points: 10, sort_order: 3, description: "Endurance à effort contrôlé." },
  { code: "game_intelligence", label: "Intelligence de jeu", max_points: 15, sort_order: 4, description: "Compréhension et lecture du jeu en mini-matchs." },
  { code: "team_spirit", label: "Esprit d'équipe", max_points: 5, sort_order: 5, description: "Attitude collective observée durant l'ensemble des tests." },
];

// ---------------------------------------------------------------------------
// Grilles qualitatives
// ---------------------------------------------------------------------------

const LABELS: Record<number, string[]> = {
  1: ["Non observé", "Parfois", "Régulièrement"],
  2: ["Insuffisant", "En acquisition", "Acquis"],
  3: ["Insuffisant", "En acquisition", "Acquis", "Maîtrisé"],
  4: ["Insuffisant", "Fragile", "En acquisition", "Acquis", "Maîtrisé"],
};

/** Construit une grille 0..max (pas de 0,5 pour un critère sur 1 point). */
function grid(max: 1 | 2 | 3 | 4, descriptions: string[]): QualitativeLevel[] {
  const values = max === 1 ? [0, 0.5, 1] : Array.from({ length: max + 1 }, (_, i) => i);
  const labels = LABELS[max];
  if (descriptions.length !== values.length) {
    throw new Error(`Grille invalide : ${values.length} descriptions attendues.`);
  }
  return values.map((value, i) => ({ value, label: labels[i], description: descriptions[i] }));
}

function qual(key: string, label: string, max: 1 | 2 | 3 | 4, descriptions: string[], help?: string): RubricComponent {
  return { key, label, kind: "qualitative", max_points: max, levels: grid(max, descriptions), help };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export interface CatalogProtocol {
  protocol: Record<string, string | number | boolean>;
  text: string;
}

export interface CatalogTest {
  code: string;
  name: string;
  domain: DomainCode;
  max_points: number;
  sort_order: number;
  description: string;
  instructions: string;
  protocols: Record<string, CatalogProtocol>;
  rubric: RubricConfig;
}

export const DEFAULT_TESTS: CatalogTest[] = [
  // ======================= ATHLÉTIQUE — 40 =======================
  {
    code: "A1",
    name: "Sprint",
    domain: "athletic",
    max_points: 10,
    sort_order: 1,
    description: "Vitesse de course linéaire sur distance adaptée à l'âge.",
    instructions:
      "Départ arrêté derrière la ligne, sans élan. Chronométrer du premier mouvement au franchissement de la ligne d'arrivée. 2 tentatives, récupération complète entre les essais. Le meilleur temps est retenu.",
    protocols: {
      "U6-U9": { protocol: { distance_m: 10, attempts: 2 }, text: "10 m — 2 tentatives — meilleur temps" },
      "U10-U13": { protocol: { distance_m: 20, attempts: 2 }, text: "20 m — 2 tentatives — meilleur temps" },
      "U14-U16": { protocol: { distance_m: 30, attempts: 2 }, text: "30 m — 2 tentatives — meilleur temps" },
    },
    rubric: {
      schema_version: 1,
      calculation_note: "Meilleur temps retenu. Seuils à définir par catégorie dans le module Barèmes.",
      components: [
        {
          key: "time",
          label: "Temps de sprint",
          kind: "measured",
          max_points: 10,
          measure_type: "time",
          unit: "s",
          direction: "lower_better",
          attempts: 2,
          aggregation: "best",
          min_value: 1,
          max_value: 15,
          scoring: { mode: "none" },
          penalty: null,
        },
      ],
    },
  },
  {
    code: "A2",
    name: "Agilité",
    domain: "athletic",
    max_points: 10,
    sort_order: 2,
    description: "Parcours en zigzag entre cônes : vitesse et changements de direction.",
    instructions:
      "Parcours en zigzag. 2 tentatives, meilleur temps retenu. Observer la qualité des appuis et des changements de direction (abaissement du centre de gravité, orientation du corps, relance).",
    protocols: {
      "U6-U9": { protocol: { cones: 4, spacing_m: "3–4", attempts: 2 }, text: "4 cônes — 3 à 4 m entre les cônes — 2 tentatives" },
      "U10-U13": { protocol: { cones: 5, spacing_m: 5, attempts: 2 }, text: "5 cônes — 5 m — 2 tentatives" },
      "U14-U16": { protocol: { cones: 5, spacing_m: 5, attempts: 2 }, text: "5 cônes — 5 m — 2 tentatives" },
    },
    rubric: {
      schema_version: 1,
      components: [
        {
          key: "time",
          label: "Temps du parcours",
          kind: "measured",
          max_points: 6,
          measure_type: "time",
          unit: "s",
          direction: "lower_better",
          attempts: 2,
          aggregation: "best",
          min_value: 2,
          max_value: 60,
          scoring: { mode: "none" },
          penalty: null,
        },
        qual("direction_quality", "Qualité des changements de direction", 4, [
          "Perd l'équilibre ou s'arrête à chaque changement de direction.",
          "Changements lents, appuis instables, trajectoires larges.",
          "Changements corrects mais irréguliers ; relance parfois lente.",
          "Appuis stables, centre de gravité abaissé, relance efficace.",
          "Changements rapides, fluides et contrôlés sur tout le parcours.",
        ]),
      ],
    },
  },
  {
    code: "A3",
    name: "Coordination",
    domain: "athletic",
    max_points: 8,
    sort_order: 3,
    description: "Échelle de coordination : vitesse d'exécution, précision et fluidité.",
    instructions:
      "Exercice d'échelle de coordination défini pour la session (pas simples, pas latéraux, entrées-sorties…). Chronométrer l'exécution et observer la précision des appuis (aucun barreau touché), la fluidité et la coordination bras-jambes.",
    protocols: {
      "U6-U9": { protocol: { exercise: "Échelle — 1 appui par case", attempts: 2 }, text: "Échelle de coordination — exercice simple — 2 tentatives" },
      "U10-U13": { protocol: { exercise: "Échelle — 2 appuis par case + latéral", attempts: 2 }, text: "Échelle de coordination — exercice intermédiaire — 2 tentatives" },
      "U14-U16": { protocol: { exercise: "Échelle — entrées/sorties", attempts: 2 }, text: "Échelle de coordination — exercice avancé — 2 tentatives" },
    },
    rubric: {
      schema_version: 1,
      components: [
        {
          key: "time",
          label: "Vitesse d'exécution (temps)",
          kind: "measured",
          max_points: 4,
          measure_type: "time",
          unit: "s",
          direction: "lower_better",
          attempts: 2,
          aggregation: "best",
          min_value: 1,
          max_value: 60,
          scoring: { mode: "none" },
          penalty: null,
        },
        qual("precision", "Précision, fluidité et coordination", 4, [
          "Ne parvient pas à suivre la séquence d'appuis.",
          "Nombreux barreaux touchés, rythme haché.",
          "Séquence respectée avec quelques erreurs d'appui.",
          "Appuis précis, rythme régulier, bonne coordination bras-jambes.",
          "Exécution précise, fluide et rythmée du début à la fin.",
        ]),
      ],
    },
  },
  {
    code: "A4",
    name: "Réaction",
    domain: "athletic",
    max_points: 6,
    sort_order: 4,
    description: "Réaction à un signal et déplacement vers la direction indiquée.",
    instructions:
      "Au signal (visuel ou sonore), le joueur se déplace vers la direction indiquée. 4 essais. Noter la rapidité de réaction et compter le nombre d'essais où la bonne direction est prise et le déplacement correctement réalisé.",
    protocols: {
      "U6-U9": { protocol: { distance_m: 3, trials: 4 }, text: "Déplacement de 3 m — 4 essais" },
      "U10-U13": { protocol: { distance_m: 5, trials: 4 }, text: "Déplacement de 5 m — 4 essais" },
      "U14-U16": { protocol: { distance_m: "5–7", trials: 4 }, text: "Déplacement de 5 à 7 m — 4 essais" },
    },
    rubric: {
      schema_version: 1,
      calculation_note: "Précision : conversion proportionnelle (essais réussis / 4 × 3 pts), arrondie au demi-point.",
      components: [
        qual("reaction", "Réaction au signal", 3, [
          "Réaction très tardive ou absente.",
          "Réaction lente ou hésitante sur la plupart des essais.",
          "Réaction rapide sur la majorité des essais.",
          "Réaction immédiate et constante sur tous les essais.",
        ]),
        {
          key: "precision",
          label: "Précision du déplacement (essais réussis)",
          kind: "measured",
          max_points: 3,
          measure_type: "successes",
          unit: "réussites",
          direction: "higher_better",
          attempts: 1,
          aggregation: "best",
          min_value: 0,
          max_value: 4,
          out_of: 4,
          scoring: { mode: "linear", best: 4, worst: 0, round_to: 0.5 },
          penalty: null,
        },
      ],
    },
  },
  {
    code: "A5",
    name: "Explosivité",
    domain: "athletic",
    max_points: 6,
    sort_order: 5,
    description: "Saut en longueur sans élan.",
    instructions:
      "Pieds joints derrière la ligne, sans élan. Mesurer du bord de la ligne au talon le plus proche à la réception. 2 tentatives, meilleure distance retenue. Observer l'impulsion des bras, l'extension et la stabilité de la réception.",
    protocols: {
      "U6-U9": { protocol: { attempts: 2 }, text: "Saut sans élan — 2 tentatives — meilleure distance" },
      "U10-U13": { protocol: { attempts: 2 }, text: "Saut sans élan — 2 tentatives — meilleure distance" },
      "U14-U16": { protocol: { attempts: 2 }, text: "Saut sans élan — 2 tentatives — meilleure distance" },
    },
    rubric: {
      schema_version: 1,
      components: [
        {
          key: "distance",
          label: "Distance du saut",
          kind: "measured",
          max_points: 4,
          measure_type: "distance",
          unit: "m",
          direction: "higher_better",
          attempts: 2,
          aggregation: "best",
          min_value: 0.2,
          max_value: 3.5,
          scoring: { mode: "none" },
          penalty: null,
        },
        qual("technique", "Technique et réception", 2, [
          "Impulsion désordonnée, réception déséquilibrée (chute, mains au sol).",
          "Impulsion correcte mais réception instable.",
          "Impulsion coordonnée bras-jambes et réception stable, genoux fléchis.",
        ]),
      ],
    },
  },

  // ======================= TECHNIQUE — 30 =======================
  {
    code: "T1",
    name: "Passes",
    domain: "technical",
    max_points: 8,
    sort_order: 6,
    description: "Précision et qualité de transmission sur 10 passes.",
    instructions:
      "10 passes vers une cible (porte de cônes ou partenaire), 5 par pied lorsque le niveau le permet. Compter les passes réussies dans la cible. Observer la surface de contact, le dosage et la tension de la passe.",
    protocols: {
      "U6-U9": { protocol: { passes: 10, distance_m: "4–5", per_foot: "si adapté" }, text: "10 passes — 4 à 5 m — 5 par pied si adapté" },
      "U10-U13": { protocol: { passes: 10, distance_m: "6–8", per_foot: 5 }, text: "10 passes — 6 à 8 m — 5 par pied" },
      "U14-U16": { protocol: { passes: 10, distance_m: "8–10", per_foot: 5 }, text: "10 passes — 8 à 10 m — 5 par pied" },
    },
    rubric: {
      schema_version: 1,
      calculation_note: "Précision : conversion proportionnelle (passes réussies / 10 × 5 pts), arrondie au demi-point.",
      components: [
        {
          key: "precision",
          label: "Précision (passes réussies)",
          kind: "measured",
          max_points: 5,
          measure_type: "successes",
          unit: "réussites",
          direction: "higher_better",
          attempts: 1,
          aggregation: "best",
          min_value: 0,
          max_value: 10,
          out_of: 10,
          scoring: { mode: "linear", best: 10, worst: 0, round_to: 0.5 },
          penalty: null,
        },
        qual("quality", "Qualité technique et transmission", 3, [
          "Surface de contact inadaptée, ballon non maîtrisé.",
          "Gestuelle correcte avec un seul pied ; dosage irrégulier.",
          "Bonne surface de contact, passes bien dosées, pied faible utilisé.",
          "Passes tendues, précises et bien dosées des deux pieds.",
        ]),
      ],
    },
  },
  {
    code: "T2",
    name: "Contrôle orienté",
    domain: "technical",
    max_points: 6,
    sort_order: 7,
    description: "Qualité du contrôle et orientation de la première touche.",
    instructions:
      "8 répétitions : réception d'un ballon transmis et contrôle orienté vers une porte indiquée. Observer la qualité de l'amorti et l'orientation / la vitesse de la première touche.",
    protocols: {
      "U6-U9": { protocol: { repetitions: 8 }, text: "8 répétitions — ballon à la main ou au sol" },
      "U10-U13": { protocol: { repetitions: 8 }, text: "8 répétitions — passe au sol" },
      "U14-U16": { protocol: { repetitions: 8 }, text: "8 répétitions — passe au sol et aérienne" },
    },
    rubric: {
      schema_version: 1,
      components: [
        qual("control_quality", "Qualité du contrôle", 4, [
          "Le ballon échappe au joueur sur la plupart des répétitions.",
          "Contrôle souvent trop long ou non amorti.",
          "Contrôle correct sur environ la moitié des répétitions.",
          "Contrôle propre et amorti sur la majorité des répétitions.",
          "Contrôle propre, amorti et sûr sur toutes les répétitions.",
        ]),
        qual("orientation", "Orientation et vitesse de la première touche", 2, [
          "Contrôle statique, sans orientation.",
          "Orientation présente mais lente ou imprécise.",
          "Première touche orientée, rapide et enchaînée.",
        ]),
      ],
    },
  },
  {
    code: "T3",
    name: "Conduite et dribble",
    domain: "technical",
    max_points: 8,
    sort_order: 8,
    description: "Slalom balle au pied : vitesse et maîtrise.",
    instructions:
      "Slalom entre les cônes balle au pied, aller-retour selon le protocole. 2 tentatives, meilleur temps retenu. Observer la maîtrise, la précision, l'équilibre et l'utilisation des deux pieds.",
    protocols: {
      "U6-U9": { protocol: { cones: 5, spacing_m: 2.5, attempts: 2 }, text: "5 cônes — 2,5 m — 2 tentatives" },
      "U10-U13": { protocol: { cones: 6, spacing_m: 3, attempts: 2 }, text: "6 cônes — 3 m — 2 tentatives" },
      "U14-U16": { protocol: { cones: 6, spacing_m: 3, attempts: 2 }, text: "6 cônes — 3 m — 2 tentatives" },
    },
    rubric: {
      schema_version: 1,
      components: [
        {
          key: "time",
          label: "Temps du slalom",
          kind: "measured",
          max_points: 4,
          measure_type: "time",
          unit: "s",
          direction: "lower_better",
          attempts: 2,
          aggregation: "best",
          min_value: 2,
          max_value: 90,
          scoring: { mode: "none" },
          penalty: null,
        },
        qual("mastery", "Maîtrise, précision, équilibre et utilisation des pieds", 4, [
          "Perd le ballon à plusieurs reprises.",
          "Ballon souvent éloigné, cônes touchés, un seul pied.",
          "Conduite correcte, quelques pertes de contrôle.",
          "Ballon proche, bon équilibre, utilisation des deux pieds.",
          "Conduite rapide, précise et équilibrée avec les deux pieds.",
        ]),
      ],
    },
  },
  {
    code: "T4",
    name: "Finition",
    domain: "technical",
    max_points: 8,
    sort_order: 9,
    description: "Précision et qualité de frappe sur 8 tirs.",
    instructions:
      "8 tirs vers le but (zones cibles selon le protocole de la session). Compter les tirs cadrés dans la cible. Observer la qualité de frappe : pied d'appui, surface de contact, équilibre et puissance contrôlée.",
    protocols: {
      "U6-U9": { protocol: { shots: 8, distance_m: "5–7" }, text: "8 tirs — 5 à 7 m" },
      "U10-U13": { protocol: { shots: 8, distance_m: "8–10" }, text: "8 tirs — 8 à 10 m" },
      "U14-U16": { protocol: { shots: 8, distance_m: "10–14" }, text: "8 tirs — 10 à 14 m" },
    },
    rubric: {
      schema_version: 1,
      calculation_note: "Précision : conversion proportionnelle (tirs réussis / 8 × 5 pts), arrondie au demi-point.",
      components: [
        {
          key: "precision",
          label: "Précision (tirs réussis)",
          kind: "measured",
          max_points: 5,
          measure_type: "successes",
          unit: "réussites",
          direction: "higher_better",
          attempts: 1,
          aggregation: "best",
          min_value: 0,
          max_value: 8,
          out_of: 8,
          scoring: { mode: "linear", best: 8, worst: 0, round_to: 0.5 },
          penalty: null,
        },
        qual("strike_quality", "Qualité de frappe et exécution", 3, [
          "Frappe désordonnée, pied d'appui mal placé.",
          "Frappe correcte mais manque de contrôle ou de puissance.",
          "Bonne frappe, équilibrée, surface de contact adaptée.",
          "Frappe maîtrisée, puissante et précise, exécution rapide.",
        ]),
      ],
    },
  },

  // ======================= PHYSIQUE — 10 =======================
  {
    code: "P1",
    name: "Endurance",
    domain: "physical",
    max_points: 10,
    sort_order: 10,
    description: "Navettes à effort contrôlé sur durée adaptée à l'âge.",
    instructions:
      "Allers-retours entre deux lignes à allure contrôlée pendant la durée prévue. Compter le nombre de longueurs (navettes) réalisées. Observer le maintien du rythme et la qualité de déplacement. Arrêter immédiatement en cas de signe de malaise.",
    protocols: {
      "U6-U9": { protocol: { line_distance_m: 10, duration_min: 3 }, text: "10 m entre les lignes — 3 minutes" },
      "U10-U13": { protocol: { line_distance_m: 15, duration_min: 4 }, text: "15 m entre les lignes — 4 minutes" },
      "U14-U16": { protocol: { line_distance_m: 20, duration_min: 5 }, text: "20 m entre les lignes — 5 minutes" },
    },
    rubric: {
      schema_version: 1,
      components: [
        {
          key: "volume",
          label: "Volume de déplacement (navettes)",
          kind: "measured",
          max_points: 6,
          measure_type: "repetitions",
          unit: "navettes",
          direction: "higher_better",
          attempts: 1,
          aggregation: "best",
          min_value: 0,
          max_value: 300,
          scoring: { mode: "none" },
          penalty: null,
        },
        qual("rhythm", "Maintien du rythme", 2, [
          "Rythme très irrégulier, arrêts fréquents.",
          "Baisse de rythme nette en fin d'effort.",
          "Rythme régulier maintenu jusqu'à la fin.",
        ]),
        qual("movement_quality", "Qualité de déplacement", 2, [
          "Foulée désorganisée, demi-tours non maîtrisés.",
          "Foulée correcte, demi-tours perfectibles.",
          "Foulée économique et demi-tours efficaces.",
        ]),
      ],
    },
  },

  // ======================= INTELLIGENCE DE JEU — 15 =======================
  {
    code: "I1",
    name: "Mini-matchs",
    domain: "game_intelligence",
    max_points: 15,
    sort_order: 11,
    description: "Observation de la compréhension du jeu en situation réduite.",
    instructions:
      "Mini-matchs au format adapté. Chaque encadreur observe un groupe restreint de joueurs. Noter chaque critère selon la grille et ajouter un commentaire factuel.",
    protocols: {
      "U6-U9": { protocol: { format: "3c3 ou 4c4", matches: 2, duration_min: 5 }, text: "3 contre 3 ou 4 contre 4 — 2 matchs de 5 min" },
      "U10-U13": { protocol: { format: "4c4 ou 5c5", matches: 2, duration_min: 7 }, text: "4 contre 4 ou 5 contre 5 — 2 matchs de 7 min" },
      "U14-U16": { protocol: { format: "5c5 ou 6c6", matches: 2, duration_min: 8 }, text: "5 contre 5 ou 6 contre 6 — 2 matchs de 8 min" },
    },
    rubric: {
      schema_version: 1,
      components: [
        qual("information", "Prise d'information", 3, [
          "Joue tête baissée, ne regarde pas autour de lui.",
          "Lève parfois la tête, surtout sans ballon.",
          "Observe régulièrement avant de recevoir le ballon.",
          "Prend l'information en permanence, avant et pendant l'action.",
        ]),
        qual("decision", "Prise de décision", 3, [
          "Choix souvent inadaptés (perte de balle systématique).",
          "Choix simples, parfois inadaptés à la situation.",
          "Choix majoritairement pertinents (passer, conduire, tirer).",
          "Choix rapides et pertinents, y compris sous pression.",
        ]),
        qual("positioning", "Placement et déplacement", 3, [
          "Reste statique ou suit le ballon en grappe.",
          "Se déplace mais occupe mal l'espace.",
          "Se démarque et occupe l'espace de façon cohérente.",
          "Placement intelligent, crée et exploite les espaces.",
        ]),
        qual("understanding", "Compréhension offensive et défensive", 3, [
          "Ne distingue pas les phases d'attaque et de défense.",
          "Participe surtout à une seule phase de jeu.",
          "Participe aux deux phases et réagit à la perte du ballon.",
          "Comprend les transitions et adapte son rôle en permanence.",
        ]),
        qual("anticipation", "Anticipation", 3, [
          "Réagit toujours après l'action.",
          "Anticipe rarement les trajectoires ou intentions.",
          "Anticipe régulièrement passes et déplacements.",
          "Lit le jeu en avance, intercepte et se projette.",
        ]),
      ],
    },
  },

  // ======================= ESPRIT D'ÉQUIPE — 5 =======================
  {
    code: "E1",
    name: "Esprit d'équipe",
    domain: "team_spirit",
    max_points: 5,
    sort_order: 12,
    description:
      "Observation durant l'ensemble des tests, en particulier les mini-matchs. Ne pas confondre communication verbale et esprit d'équipe.",
    instructions:
      "Évaluer des comportements observés, pas la personnalité ni l'aisance verbale. Un joueur discret peut faire preuve d'un excellent esprit d'équipe.",
    protocols: {
      "U6-U9": { protocol: { observation: "Ensemble des ateliers + mini-matchs" }, text: "Observation continue" },
      "U10-U13": { protocol: { observation: "Ensemble des ateliers + mini-matchs" }, text: "Observation continue" },
      "U14-U16": { protocol: { observation: "Ensemble des ateliers + mini-matchs" }, text: "Observation continue" },
    },
    rubric: {
      schema_version: 1,
      components: [
        qual("support", "Encourage et aide ses partenaires", 1, [
          "Comportement non observé.",
          "Aide ou encourage ponctuellement.",
          "Aide et encourage ses partenaires de façon régulière.",
        ]),
        qual("respect", "Respecte les consignes et les personnes", 1, [
          "Consignes ou personnes non respectées.",
          "Respect partiel, rappels nécessaires.",
          "Respecte constamment consignes, encadreurs et partenaires.",
        ]),
        qual("resilience", "Accepte les erreurs et garde une attitude positive", 1, [
          "Se décourage ou s'énerve face à l'erreur.",
          "Attitude variable selon les situations.",
          "Reste positif face à ses erreurs et à celles des autres.",
        ]),
        qual("cooperation", "Coopère et partage le ballon", 1, [
          "Garde le ballon, joue seul.",
          "Partage le ballon de façon irrégulière.",
          "Coopère et partage le ballon naturellement.",
        ]),
        qual("fair_play", "Discipline et fair-play", 1, [
          "Gestes ou comportements antisportifs observés.",
          "Quelques écarts de discipline.",
          "Discipliné et fair-play en toutes circonstances.",
        ]),
      ],
    },
  },
];

/** Session réelle fournie par le club (pas une donnée fictive). */
export const INITIAL_SESSION = {
  name: "Test d'aptitude FUTURISTE ACADÉMIE FC - Saison 2026-2027",
  description: "Test d'aptitude de début de saison pour les catégories U6-U9, U10-U13 et U14-U16.",
  session_date: "2026-11-28",
  start_time: "09:30",
  location: "École Publique de Japoma, Douala, Cameroun",
  season: "2026-2027",
};

export const DEFAULT_PARENT_MESSAGE = `Bonjour,

FUTURISTE ACADÉMIE FC vous transmet le rapport individuel d'évaluation de votre enfant, réalisé lors du Test d'Aptitude de la saison {saison}.

Ce rapport présente ses résultats athlétiques, techniques, physiques, de compréhension du jeu et d'esprit d'équipe, ainsi que les principaux axes de progression identifiés.

Nous vous remercions pour votre confiance et votre engagement dans le développement sportif de votre enfant.

FUTURISTE ACADÉMIE FC
Former, développer et révéler les talents.`;
