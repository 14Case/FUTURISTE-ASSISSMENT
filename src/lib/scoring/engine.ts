/**
 * Moteur de calcul centralisé — FUTURISTE ASSESSMENT.
 *
 * Fonctions pures et déterministes : score d'une tentative, score retenu pour
 * un critère, score d'un test, d'un domaine, total, normalisation, états
 * incomplets, pénalités et erreurs de données.
 *
 * Règles fondamentales :
 *  - Aucun score automatique n'est produit sans barème de référence configuré
 *    (statut « unconfigured »). Le moteur n'invente aucun seuil.
 *  - Aucun classement relatif entre joueurs n'intervient dans le calcul.
 *  - Un test incomplet n'a pas de score (null) : jamais de 0 implicite.
 */

import type {
  AttemptInput,
  ComponentInput,
  ComponentResult,
  DomainCode,
  DomainResult,
  MeasuredComponent,
  QualitativeComponent,
  ResolvedRubric,
  RubricComponent,
  RubricConfig,
  ScoreIssue,
  ScoreStatus,
  TestInput,
  TestResult,
  TestScoreEntry,
  TotalResult,
} from "./types";

const EPS = 1e-9;

/** Arrondi décimal stable (évite 0.1 + 0.2 = 0.30000000000000004). */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Arrondi au pas le plus proche (ex : 0,5 point). */
export function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return round(value);
  return round(Math.round(value / step + EPS) * step);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const STATUS_PRIORITY: Record<ScoreStatus, number> = {
  invalid: 4,
  unconfigured: 3,
  incomplete: 2,
  not_applicable: 1,
  complete: 0,
};

export function worstStatus(statuses: ScoreStatus[]): ScoreStatus {
  return statuses.reduce<ScoreStatus>(
    (acc, s) => (STATUS_PRIORITY[s] > STATUS_PRIORITY[acc] ? s : acc),
    "complete",
  );
}

// ---------------------------------------------------------------------------
// Validation des barèmes
// ---------------------------------------------------------------------------

/** Vérifie la cohérence d'une configuration de barème pour un test. */
export function validateRubricConfig(
  config: RubricConfig,
  testMaxPoints: number,
): ScoreIssue[] {
  const issues: ScoreIssue[] = [];
  if (!config || !Array.isArray(config.components) || config.components.length === 0) {
    return [{ code: "invalid_config", message: "Le barème ne contient aucun critère." }];
  }
  const keys = new Set<string>();
  let sum = 0;
  for (const c of config.components) {
    if (keys.has(c.key)) {
      issues.push({ code: "invalid_config", component: c.key, message: `Clé de critère en double : ${c.key}.` });
    }
    keys.add(c.key);
    if (!(c.max_points > 0)) {
      issues.push({ code: "invalid_config", component: c.key, message: `« ${c.label} » : maximum invalide.` });
    }
    sum += c.max_points;
    if (c.kind === "qualitative") {
      if (!c.levels?.length) {
        issues.push({ code: "invalid_config", component: c.key, message: `« ${c.label} » : aucune échelle de niveaux.` });
      }
      for (const l of c.levels ?? []) {
        if (l.value < 0 || l.value > c.max_points + EPS) {
          issues.push({
            code: "invalid_config",
            component: c.key,
            message: `« ${c.label} » : le niveau ${l.value} dépasse le maximum (${c.max_points}).`,
          });
        }
      }
    } else {
      if (!(c.attempts >= 1 && c.attempts <= 20)) {
        issues.push({ code: "invalid_config", component: c.key, message: `« ${c.label} » : nombre de tentatives invalide.` });
      }
      const s = c.scoring;
      if (s.mode === "thresholds") {
        if (!s.thresholds.length) {
          issues.push({ code: "unconfigured", component: c.key, message: `« ${c.label} » : aucun seuil défini.` });
        }
        for (const t of s.thresholds) {
          if (t.points < 0 || t.points > c.max_points + EPS) {
            issues.push({
              code: "invalid_config",
              component: c.key,
              message: `« ${c.label} » : un palier attribue ${t.points} pt (max ${c.max_points}).`,
            });
          }
        }
      } else if (s.mode === "linear") {
        if (Math.abs(s.best - s.worst) < EPS) {
          issues.push({ code: "invalid_config", component: c.key, message: `« ${c.label} » : références identiques.` });
        }
        const expectsLower = c.direction === "lower_better";
        if ((expectsLower && s.best > s.worst) || (!expectsLower && s.best < s.worst)) {
          issues.push({
            code: "invalid_config",
            component: c.key,
            message: `« ${c.label} » : les références sont incohérentes avec le sens de performance.`,
          });
        }
      } else {
        issues.push({ code: "unconfigured", component: c.key, message: `« ${c.label} » : barème non configuré.` });
      }
      if (c.penalty && !(c.penalty.amount >= 0)) {
        issues.push({ code: "invalid_config", component: c.key, message: `« ${c.label} » : pénalité invalide.` });
      }
    }
  }
  if (Math.abs(sum - testMaxPoints) > 0.001) {
    issues.push({
      code: "invalid_config",
      message: `La somme des critères (${round(sum)}) ne correspond pas au maximum du test (${testMaxPoints}).`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Tentatives
// ---------------------------------------------------------------------------

/** Contrôle d'une tentative de mesure (limites, signe, réussites). */
export function checkAttempt(
  component: MeasuredComponent,
  attempt: AttemptInput,
  index: number,
): ScoreIssue[] {
  const issues: ScoreIssue[] = [];
  const n = index + 1;
  if (attempt.value === null || attempt.value === undefined) return issues;
  const v = attempt.value;
  if (!Number.isFinite(v)) {
    issues.push({ code: "out_of_range", component: component.key, attempt: n, message: `Tentative ${n} : valeur non numérique.` });
    return issues;
  }
  if (v < 0) {
    issues.push({ code: "negative_value", component: component.key, attempt: n, message: `Tentative ${n} : valeur négative.` });
  }
  if (component.min_value != null && v < component.min_value) {
    issues.push({
      code: "out_of_range",
      component: component.key,
      attempt: n,
      message: `Tentative ${n} : ${v} ${component.unit} est inférieur au minimum autorisé (${component.min_value}).`,
    });
  }
  if (component.max_value != null && v > component.max_value) {
    issues.push({
      code: "out_of_range",
      component: component.key,
      attempt: n,
      message: `Tentative ${n} : ${v} ${component.unit} dépasse le maximum autorisé (${component.max_value}).`,
    });
  }
  if (component.measure_type === "successes" || component.measure_type === "repetitions") {
    if (!Number.isInteger(v)) {
      issues.push({ code: "out_of_range", component: component.key, attempt: n, message: `Tentative ${n} : un nombre entier est attendu.` });
    }
    if (component.out_of != null && v > component.out_of) {
      issues.push({
        code: "out_of_range",
        component: component.key,
        attempt: n,
        message: `Tentative ${n} : ${v} réussites sur ${component.out_of} essais est impossible.`,
      });
    }
  }
  if (component.measure_type === "percentage" && v > 100) {
    issues.push({ code: "out_of_range", component: component.key, attempt: n, message: `Tentative ${n} : pourcentage supérieur à 100.` });
  }
  const pen = attempt.penalties ?? 0;
  if (pen < 0 || !Number.isInteger(pen)) {
    issues.push({ code: "out_of_range", component: component.key, attempt: n, message: `Tentative ${n} : nombre de pénalités invalide.` });
  }
  if (pen > 0 && !component.penalty) {
    issues.push({
      code: "invalid_config",
      component: component.key,
      attempt: n,
      message: `Tentative ${n} : pénalités saisies alors qu'aucune règle de pénalité n'est configurée.`,
    });
  }
  return issues;
}

/** Valeur d'une tentative après application d'une pénalité « add_to_value ». */
export function adjustedAttemptValue(component: MeasuredComponent, attempt: AttemptInput): number | null {
  if (attempt.value === null || attempt.value === undefined) return null;
  const pen = attempt.penalties ?? 0;
  if (component.penalty?.mode === "add_to_value" && pen > 0) {
    const delta = component.penalty.amount * pen;
    // Pour un sens « plus élevé = meilleur », une pénalité réduit la valeur.
    return round(
      component.direction === "lower_better" ? attempt.value + delta : Math.max(0, attempt.value - delta),
      3,
    );
  }
  return attempt.value;
}

/** Points attribués à une valeur selon le barème (null si non configuré). */
export function pointsForValue(component: MeasuredComponent, value: number): number | null {
  const s = component.scoring;
  if (s.mode === "none") return null;
  if (s.mode === "thresholds") {
    if (!s.thresholds.length) return null;
    let best = 0;
    for (const t of s.thresholds) {
      const reached =
        component.direction === "lower_better" ? value <= t.bound + EPS : value >= t.bound - EPS;
      if (reached && t.points > best) best = t.points;
    }
    return clamp(round(best), 0, component.max_points);
  }
  // linéaire
  const span = s.worst - s.best;
  if (Math.abs(span) < EPS) return null;
  const ratio = clamp((s.worst - value) / span, 0, 1);
  return clamp(roundToStep(ratio * component.max_points, s.round_to), 0, component.max_points);
}

// ---------------------------------------------------------------------------
// Critères
// ---------------------------------------------------------------------------

function emptyResult(c: RubricComponent, attempts: AttemptInput[]): ComponentResult {
  return {
    key: c.key,
    label: c.label,
    kind: c.kind,
    max_points: c.max_points,
    status: "incomplete",
    retained_value: null,
    raw_value: null,
    unit: c.kind === "measured" ? c.unit : null,
    points: null,
    penalty_points: 0,
    attempts,
    level_label: null,
    issues: [],
  };
}

export function scoreMeasuredComponent(
  component: MeasuredComponent,
  input: ComponentInput | undefined,
): ComponentResult {
  const attempts = (input?.attempts ?? []).map((a) => ({
    value: a.value ?? null,
    penalties: a.penalties ?? 0,
    is_valid: a.is_valid ?? true,
  }));
  const result = emptyResult(component, attempts);
  const issues: ScoreIssue[] = [];

  if (attempts.length > component.attempts) {
    issues.push({
      code: "too_many_attempts",
      component: component.key,
      message: `${attempts.length} tentatives saisies pour ${component.attempts} prévues.`,
    });
  }
  attempts.forEach((a, i) => issues.push(...checkAttempt(component, a, i)));

  const valid = attempts
    .map((a, i) => ({ a, i, adj: adjustedAttemptValue(component, a) }))
    .filter((x) => x.a.is_valid !== false && x.adj !== null) as {
    a: AttemptInput;
    i: number;
    adj: number;
  }[];

  if (issues.some((i) => i.code !== "unconfigured")) {
    result.issues = issues;
    result.status = "invalid";
    return result;
  }

  // Agrégation
  let retained: { adj: number; raw: number; penalties: number } | null = null;
  if (valid.length > 0) {
    switch (component.aggregation) {
      case "best": {
        const pick = valid.reduce((acc, x) =>
          component.direction === "lower_better" ? (x.adj < acc.adj ? x : acc) : x.adj > acc.adj ? x : acc,
        );
        retained = { adj: pick.adj, raw: pick.a.value as number, penalties: pick.a.penalties ?? 0 };
        break;
      }
      case "last": {
        const pick = valid[valid.length - 1];
        retained = { adj: pick.adj, raw: pick.a.value as number, penalties: pick.a.penalties ?? 0 };
        break;
      }
      case "average": {
        const avg = valid.reduce((s, x) => s + x.adj, 0) / valid.length;
        const rawAvg = valid.reduce((s, x) => s + (x.a.value as number), 0) / valid.length;
        const penAvg = valid.reduce((s, x) => s + (x.a.penalties ?? 0), 0) / valid.length;
        retained = { adj: round(avg, 3), raw: round(rawAvg, 3), penalties: penAvg };
        break;
      }
      case "sum": {
        // Le total exige que toutes les tentatives prévues soient renseignées.
        const entered = attempts.filter((a) => a.value !== null || a.is_valid === false).length;
        if (entered < component.attempts) break;
        retained = {
          adj: round(valid.reduce((s, x) => s + x.adj, 0), 3),
          raw: round(valid.reduce((s, x) => s + (x.a.value as number), 0), 3),
          penalties: valid.reduce((s, x) => s + (x.a.penalties ?? 0), 0),
        };
        break;
      }
    }
  } else if (attempts.length > 0 && attempts.every((a) => a.is_valid === false || a.value === null) && attempts.some((a) => a.is_valid === false)) {
    issues.push({
      code: "no_valid_attempt",
      component: component.key,
      message: "Aucune tentative valide : refaire l'essai ou marquer le test comme non réalisé.",
    });
  }

  if (!retained) {
    if (!issues.length) {
      issues.push({ code: "missing_value", component: component.key, message: `« ${component.label} » : résultat manquant.` });
    }
    result.issues = issues;
    result.status = "incomplete";
    return result;
  }

  result.raw_value = retained.raw;
  result.retained_value = retained.adj;

  const base = pointsForValue(component, retained.adj);
  if (base === null) {
    result.status = "unconfigured";
    result.issues = [
      ...issues,
      {
        code: "unconfigured",
        component: component.key,
        message: `« ${component.label} » : aucun barème de référence configuré. Le score ne peut pas être calculé.`,
      },
    ];
    return result;
  }

  let penaltyPoints = 0;
  if (component.penalty?.mode === "subtract_points") {
    penaltyPoints = round(component.penalty.amount * retained.penalties);
  }
  result.penalty_points = penaltyPoints;
  result.points = clamp(round(base - penaltyPoints), 0, component.max_points);
  result.status = "complete";
  result.issues = issues;
  return result;
}

export function scoreQualitativeComponent(
  component: QualitativeComponent,
  input: ComponentInput | undefined,
): ComponentResult {
  const attempts = (input?.attempts ?? []).slice(0, 1).map((a) => ({ value: a.value ?? null }));
  const result = emptyResult(component, attempts);
  const v = attempts[0]?.value;
  if (v === null || v === undefined) {
    result.issues = [{ code: "missing_value", component: component.key, message: `« ${component.label} » : note manquante.` }];
    return result;
  }
  const level = component.levels.find((l) => Math.abs(l.value - v) < EPS);
  if (!level || v > component.max_points + EPS || v < 0) {
    result.status = "invalid";
    result.issues = [
      { code: "unknown_level", component: component.key, message: `« ${component.label} » : la note ${v} ne correspond à aucun niveau de la grille.` },
    ];
    return result;
  }
  result.raw_value = v;
  result.retained_value = v;
  result.points = round(v);
  result.level_label = level.label;
  result.status = "complete";
  return result;
}

export function scoreComponent(component: RubricComponent, input: ComponentInput | undefined): ComponentResult {
  return component.kind === "qualitative"
    ? scoreQualitativeComponent(component, input)
    : scoreMeasuredComponent(component, input);
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

export function scoreTest(rubric: ResolvedRubric | null, input: TestInput | null): TestResult {
  const max = rubric?.test_max_points ?? 0;
  if (!rubric) {
    return {
      status: "unconfigured",
      points: null,
      max_points: max,
      components: [],
      issues: [{ code: "unconfigured", message: "Aucun barème actif pour ce test et cette catégorie." }],
    };
  }
  if (input && (input.status === "absent" || input.status === "exempt")) {
    return {
      status: "not_applicable",
      points: null,
      max_points: max,
      components: [],
      issues: [],
    };
  }
  const configIssues = validateRubricConfig(rubric.config, rubric.test_max_points).filter(
    (i) => i.code === "invalid_config",
  );
  const byKey = new Map((input?.components ?? []).map((c) => [c.key, c]));
  const components = rubric.config.components.map((c) => scoreComponent(c, byKey.get(c.key)));
  const statuses = components.map((c) => c.status);
  if (configIssues.length) statuses.push("invalid");
  const status = worstStatus(statuses);
  const points =
    status === "complete" ? round(components.reduce((s, c) => s + (c.points ?? 0), 0)) : null;
  return {
    status,
    points: points === null ? null : clamp(points, 0, max),
    max_points: max,
    components,
    issues: [...configIssues, ...components.flatMap((c) => c.issues)],
  };
}

// ---------------------------------------------------------------------------
// Domaines et total
// ---------------------------------------------------------------------------

export interface DomainDefinition {
  code: DomainCode;
  label: string;
  max_points: number;
}

export function normalize(points: number | null, max: number): number | null {
  if (points === null || !(max > 0)) return null;
  return round(clamp((points / max) * 100, 0, 100), 1);
}

export function scoreDomain(def: DomainDefinition, entries: TestScoreEntry[]): DomainResult {
  const tests = entries.filter((e) => e.domain === def.code);
  const completeTests = tests.filter((e) => e.result?.status === "complete" && e.result.points !== null);
  const partial = round(completeTests.reduce((s, e) => s + (e.result?.points ?? 0), 0));
  const complete = tests.length > 0 && completeTests.length === tests.length;
  const points = complete ? clamp(partial, 0, def.max_points) : null;
  return {
    domain: def.code,
    label: def.label,
    max_points: def.max_points,
    points,
    partial_points: partial,
    normalized: normalize(points, def.max_points),
    complete,
    tests_total: tests.length,
    tests_complete: completeTests.length,
  };
}

export function scoreTotal(domains: DomainDefinition[], entries: TestScoreEntry[]): TotalResult {
  const warnings: string[] = [];
  const results = domains.map((d) => {
    const sumTests = round(entries.filter((e) => e.domain === d.code).reduce((s, e) => s + e.max_points, 0));
    if (entries.some((e) => e.domain === d.code) && Math.abs(sumTests - d.max_points) > 0.001) {
      warnings.push(
        `Domaine « ${d.label} » : la somme des tests (${sumTests}) diffère du maximum du domaine (${d.max_points}).`,
      );
    }
    return scoreDomain(d, entries);
  });
  const complete = results.length > 0 && results.every((r) => r.complete);
  const totalTests = entries.length;
  const completeTests = entries.filter((e) => e.result?.status === "complete").length;
  const unconfigured = entries.filter((e) => e.result?.status === "unconfigured" || !e.rubric_version_id);
  if (unconfigured.length) {
    warnings.push(
      `${unconfigured.length} test(s) sans barème de référence configuré : ${unconfigured.map((e) => e.test_code).join(", ")}.`,
    );
  }
  return {
    domains: results,
    total: complete ? round(results.reduce((s, r) => s + (r.points ?? 0), 0)) : null,
    partial_total: round(results.reduce((s, r) => s + r.partial_points, 0)),
    max_total: round(domains.reduce((s, d) => s + d.max_points, 0)),
    complete,
    completion_ratio: totalTests ? round(completeTests / totalTests, 3) : 0,
    warnings,
  };
}

/** Statut de saisie suggéré à partir des critères renseignés. */
export function suggestEvaluationStatus(rubric: ResolvedRubric | null, input: TestInput): TestInput["status"] {
  if (input.status === "absent" || input.status === "exempt") return input.status;
  if (!rubric) return "in_progress";
  const anyValue = input.components.some((c) => c.attempts.some((a) => a.value !== null || a.is_valid === false));
  if (!anyValue) return "pending";
  const allFilled = rubric.config.components.every((c) => {
    const ci = input.components.find((x) => x.key === c.key);
    if (!ci) return false;
    if (c.kind === "qualitative") return ci.attempts[0]?.value != null;
    const entered = ci.attempts.filter((a) => a.value !== null || a.is_valid === false).length;
    return entered >= c.attempts;
  });
  return allFilled ? "completed" : "in_progress";
}
