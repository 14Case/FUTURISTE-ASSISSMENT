/**
 * Résolution des barèmes et conversion des données brutes — fonctions pures.
 */
import type {
  ComponentInput,
  EvaluationStatus,
  ResolvedRubric,
  RubricConfig,
  TestInput,
} from "./types";

export interface RubricRow {
  id: string;
  test_id: string;
  category_id: string | null;
  sex: "M" | "F" | null;
  version: number;
  status: "draft" | "active" | "archived";
  effective_from: string;
  config: RubricConfig;
}

/**
 * Sélectionne le barème actif le plus spécifique pour un test :
 * (catégorie + sexe) > (catégorie) > (sexe) > (général).
 * Le sexe n'est pris en compte que si `useSex` est vrai et le sexe renseigné.
 */
export function resolveRubricRow(
  rows: RubricRow[],
  testId: string,
  categoryId: string | null,
  sex: "M" | "F" | null,
  useSex = true,
): RubricRow | null {
  const s = useSex ? sex : null;
  const candidates = rows.filter((r) => r.test_id === testId && r.status === "active");
  const score = (r: RubricRow): number => {
    if (r.category_id && r.category_id !== categoryId) return -1;
    if (r.sex && r.sex !== s) return -1;
    return (r.category_id ? 2 : 0) + (r.sex ? 1 : 0);
  };
  let best: RubricRow | null = null;
  let bestScore = -1;
  for (const r of candidates) {
    const sc = score(r);
    if (sc > bestScore || (sc === bestScore && best && r.version > best.version)) {
      best = r;
      bestScore = sc;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function toResolved(row: RubricRow | null, testCode: string, testMax: number): ResolvedRubric | null {
  if (!row) return null;
  return { id: row.id, version: row.version, test_code: testCode, test_max_points: testMax, config: row.config };
}

export interface AttemptRow {
  component_key: string;
  attempt_number: number;
  value: number | string | null;
  penalties: number;
  is_valid: boolean;
}

/** Reconstitue l'entrée de calcul à partir des tentatives stockées. */
export function attemptsToTestInput(status: EvaluationStatus, attempts: AttemptRow[]): TestInput {
  const byKey = new Map<string, ComponentInput>();
  const sorted = [...attempts].sort((a, b) => a.attempt_number - b.attempt_number);
  for (const a of sorted) {
    if (!byKey.has(a.component_key)) byKey.set(a.component_key, { key: a.component_key, attempts: [] });
    const ci = byKey.get(a.component_key)!;
    // Combler les trous éventuels (tentative 2 saisie sans la 1).
    while (ci.attempts.length < a.attempt_number - 1) ci.attempts.push({ value: null, penalties: 0, is_valid: true });
    ci.attempts.push({
      value: a.value === null || a.value === "" ? null : Number(a.value),
      penalties: a.penalties ?? 0,
      is_valid: a.is_valid ?? true,
    });
  }
  return { status, components: [...byKey.values()] };
}

/** Conversion inverse : entrée de calcul → lignes de tentatives à stocker. */
export function testInputToAttempts(input: TestInput): AttemptRow[] {
  const rows: AttemptRow[] = [];
  for (const c of input.components) {
    c.attempts.forEach((a, i) => {
      if (a.value === null && a.is_valid !== false && !(a.penalties ?? 0)) return;
      rows.push({
        component_key: c.key,
        attempt_number: i + 1,
        value: a.value,
        penalties: a.penalties ?? 0,
        is_valid: a.is_valid ?? true,
      });
    });
  }
  return rows;
}
