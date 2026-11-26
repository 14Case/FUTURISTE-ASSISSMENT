/**
 * Types du moteur de calcul FUTURISTE ASSESSMENT.
 *
 * Ce module est PUR : aucune dépendance à React, Next.js ou Supabase.
 * Il est exécuté à l'identique côté client (aperçu instantané, hors ligne)
 * et côté serveur (calcul faisant foi lors de l'enregistrement).
 */

export const DOMAIN_CODES = [
  "athletic",
  "technical",
  "physical",
  "game_intelligence",
  "team_spirit",
] as const;
export type DomainCode = (typeof DOMAIN_CODES)[number];

export const MEASURE_TYPES = [
  "time",
  "distance",
  "repetitions",
  "successes",
  "percentage",
] as const;
export type MeasureType = (typeof MEASURE_TYPES)[number];

export type Direction = "higher_better" | "lower_better";
export type Aggregation = "best" | "average" | "sum" | "last";

/**
 * Seuil de barème.
 * - lower_better  : la valeur doit être ≤ bound pour obtenir `points`.
 * - higher_better : la valeur doit être ≥ bound pour obtenir `points`.
 * Le meilleur palier atteint est retenu ; sinon 0 point.
 */
export interface Threshold {
  bound: number;
  points: number;
}

export type MeasuredScoring =
  | { mode: "thresholds"; thresholds: Threshold[] }
  /**
   * Interpolation linéaire entre une valeur de référence « best » (points max)
   * et « worst » (0 point), arrondie au pas `round_to`.
   */
  | { mode: "linear"; best: number; worst: number; round_to: number }
  /** Aucun barème défini : le score automatique est impossible. */
  | { mode: "none" };

export interface Penalty {
  label: string;
  /** add_to_value : ajoute amount × nb à la valeur (ex : +1 s par cône) ;
   *  subtract_points : retire amount × nb points au score du critère. */
  mode: "add_to_value" | "subtract_points";
  amount: number;
}

export interface MeasuredComponent {
  key: string;
  label: string;
  kind: "measured";
  max_points: number;
  measure_type: MeasureType;
  unit: string;
  direction: Direction;
  attempts: number;
  aggregation: Aggregation;
  /** Limites de saisie (contrôle de cohérence), facultatives. */
  min_value?: number | null;
  max_value?: number | null;
  /** Nombre d'essais de référence pour un comptage de réussites (ex : 10 passes). */
  out_of?: number | null;
  scoring: MeasuredScoring;
  penalty?: Penalty | null;
  help?: string;
}

export interface QualitativeLevel {
  value: number;
  label: string;
  description: string;
}

export interface QualitativeComponent {
  key: string;
  label: string;
  kind: "qualitative";
  max_points: number;
  levels: QualitativeLevel[];
  help?: string;
}

export type RubricComponent = MeasuredComponent | QualitativeComponent;

export interface RubricConfig {
  schema_version: 1;
  components: RubricComponent[];
  calculation_note?: string;
}

/** Barème résolu pour un test (version précise). */
export interface ResolvedRubric {
  id: string | null;
  version: number;
  test_code: string;
  test_max_points: number;
  config: RubricConfig;
}

// ---------------------------------------------------------------------------
// Entrées de saisie
// ---------------------------------------------------------------------------

export interface AttemptInput {
  value: number | null;
  penalties?: number;
  /** Tentative annulée (faute, faux départ…) : non prise en compte. */
  is_valid?: boolean;
}

export interface ComponentInput {
  key: string;
  /** Mesures : une entrée par tentative. Qualitatif : une seule entrée. */
  attempts: AttemptInput[];
}

export type EvaluationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "absent"
  | "exempt";

export interface TestInput {
  status: EvaluationStatus;
  components: ComponentInput[];
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

export type ScoreStatus =
  | "complete"
  | "incomplete"
  | "unconfigured"
  | "invalid"
  | "not_applicable";

export interface ScoreIssue {
  code:
    | "missing_value"
    | "out_of_range"
    | "unconfigured"
    | "invalid_config"
    | "unknown_level"
    | "too_many_attempts"
    | "negative_value"
    | "no_valid_attempt";
  message: string;
  component?: string;
  attempt?: number;
}

export interface ComponentResult {
  key: string;
  label: string;
  kind: RubricComponent["kind"];
  max_points: number;
  status: ScoreStatus;
  /** Valeur retenue (après agrégation et pénalités), null si indisponible. */
  retained_value: number | null;
  /** Valeur brute retenue avant pénalité. */
  raw_value: number | null;
  unit: string | null;
  points: number | null;
  penalty_points: number;
  attempts: AttemptInput[];
  level_label?: string | null;
  issues: ScoreIssue[];
}

export interface TestResult {
  status: ScoreStatus;
  points: number | null;
  max_points: number;
  components: ComponentResult[];
  issues: ScoreIssue[];
}

export interface TestScoreEntry {
  test_id: string;
  test_code: string;
  test_name: string;
  domain: DomainCode;
  max_points: number;
  evaluation_status: EvaluationStatus | null;
  result: TestResult | null;
  rubric_version_id: string | null;
}

export interface DomainResult {
  domain: DomainCode;
  label: string;
  max_points: number;
  points: number | null;
  /** Somme partielle des tests complets (affichage de progression). */
  partial_points: number;
  normalized: number | null;
  complete: boolean;
  tests_total: number;
  tests_complete: number;
}

export interface TotalResult {
  domains: DomainResult[];
  total: number | null;
  partial_total: number;
  max_total: number;
  complete: boolean;
  completion_ratio: number;
  warnings: string[];
}
