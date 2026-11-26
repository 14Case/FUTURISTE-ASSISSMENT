import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOMAINS,
  DEFAULT_TESTS,
} from "@/lib/scoring/default-catalog";
import {
  scoreComponent,
  scoreTest,
  scoreTotal,
  validateRubricConfig,
} from "@/lib/scoring/engine";
import { resolveRubricRow, type RubricRow } from "@/lib/scoring/resolve";
import type {
  MeasuredComponent,
  ResolvedRubric,
  RubricConfig,
  TestScoreEntry,
} from "@/lib/scoring/types";

function getCatalogRubric(code: string, customMeasuredThresholds?: { key: string; thresholds: { bound: number; points: number }[] }): ResolvedRubric {
  const t = DEFAULT_TESTS.find((x) => x.code === code);
  if (!t) throw new Error(`Test ${code} introuvable`);
  const cfg: RubricConfig = structuredClone(t.rubric);
  if (customMeasuredThresholds) {
    cfg.components = cfg.components.map((c) =>
      c.kind === "measured" && c.key === customMeasuredThresholds.key
        ? {
            ...c,
            scoring: {
              mode: "thresholds",
              thresholds: customMeasuredThresholds.thresholds,
            },
          }
        : c,
    );
  }
  return {
    id: `rub-${code}`,
    version: 1,
    test_code: t.code,
    test_max_points: t.max_points,
    config: cfg,
  };
}

describe("Moteur de calcul — Catalogue complet des 12 ateliers FAFC", () => {
  it("valide la cohérence mathématique des 12 ateliers initiaux et des 5 domaines (total = 100)", () => {
    const sumDomains = DEFAULT_DOMAINS.reduce((s, d) => s + d.max_points, 0);
    expect(sumDomains).toBe(100);

    for (const d of DEFAULT_DOMAINS) {
      const sumTests = DEFAULT_TESTS.filter((t) => t.domain === d.code).reduce(
        (s, t) => s + t.max_points,
        0,
      );
      expect(sumTests).toBe(d.max_points);
    }

    for (const t of DEFAULT_TESTS) {
      const structuralIssues = validateRubricConfig(t.rubric, t.max_points).filter(
        (i) => i.code === "invalid_config",
      );
      expect(structuralIssues).toEqual([]);
    }
  });

  it("refuse d'inventer un score automatique lorsque les seuils chronométrés ne sont pas configurés (A1 Sprint par défaut)", () => {
    const a1Default = getCatalogRubric("A1");
    const res = scoreTest(a1Default, {
      status: "completed",
      components: [
        {
          key: "time",
          attempts: [{ value: 3.65 }, { value: 3.52 }],
        },
      ],
    });
    expect(res.status).toBe("unconfigured");
    expect(res.points).toBeNull();
    expect(res.components[0].retained_value).toBe(3.52); // meilleur temps retenu
  });

  it("calcule exactement chacun des 12 ateliers (A1..E1) et le score global /100", () => {
    // Barèmes avec seuils configurés par l'administrateur pour les tests chronométrés/distance/volume
    const a1 = scoreTest(
      getCatalogRubric("A1", {
        key: "time",
        thresholds: [
          { bound: 3.4, points: 10 },
          { bound: 3.7, points: 8 },
          { bound: 4.1, points: 5 },
        ],
      }),
      {
        status: "completed",
        components: [{ key: "time", attempts: [{ value: 3.85 }, { value: 3.62 }] }],
      },
    );
    expect(a1.points).toBe(8);

    const a2 = scoreTest(
      getCatalogRubric("A2", {
        key: "time",
        thresholds: [
          { bound: 7.5, points: 6 },
          { bound: 8.5, points: 4 },
        ],
      }),
      {
        status: "completed",
        components: [
          { key: "time", attempts: [{ value: 7.4 }, { value: 7.9 }] },
          { key: "direction_quality", attempts: [{ value: 3 }] },
        ],
      },
    );
    expect(a2.points).toBe(9); // 6 + 3

    const a3 = scoreTest(
      getCatalogRubric("A3", {
        key: "time",
        thresholds: [
          { bound: 6.0, points: 4 },
          { bound: 7.0, points: 3 },
        ],
      }),
      {
        status: "completed",
        components: [
          { key: "time", attempts: [{ value: 6.5 }, { value: 6.8 }] },
          { key: "precision", attempts: [{ value: 4 }] },
        ],
      },
    );
    expect(a3.points).toBe(7); // 3 + 4

    const a4 = scoreTest(getCatalogRubric("A4"), {
      status: "completed",
      components: [
        { key: "reaction", attempts: [{ value: 3 }] },
        { key: "precision", attempts: [{ value: 3 }] }, // 3/4 * 3 = 2.25 -> arrondi 0.5 -> 2.5
      ],
    });
    expect(a4.points).toBe(5.5);

    const a5 = scoreTest(
      getCatalogRubric("A5", {
        key: "distance",
        thresholds: [
          { bound: 1.8, points: 4 },
          { bound: 1.5, points: 3 },
        ],
      }),
      {
        status: "completed",
        components: [
          { key: "distance", attempts: [{ value: 1.55 }, { value: 1.82 }] },
          { key: "technique", attempts: [{ value: 2 }] },
        ],
      },
    );
    expect(a5.points).toBe(6);

    const t1 = scoreTest(getCatalogRubric("T1"), {
      status: "completed",
      components: [
        { key: "precision", attempts: [{ value: 8 }] }, // 8/10 * 5 = 4
        { key: "quality", attempts: [{ value: 2 }] },
      ],
    });
    expect(t1.points).toBe(6);

    const t2 = scoreTest(getCatalogRubric("T2"), {
      status: "completed",
      components: [
        { key: "control_quality", attempts: [{ value: 3 }] },
        { key: "orientation", attempts: [{ value: 2 }] },
      ],
    });
    expect(t2.points).toBe(5);

    const t3 = scoreTest(
      getCatalogRubric("T3", {
        key: "time",
        thresholds: [
          { bound: 9.0, points: 4 },
          { bound: 10.5, points: 3 },
        ],
      }),
      {
        status: "completed",
        components: [
          { key: "time", attempts: [{ value: 9.8 }, { value: 8.9 }] },
          { key: "mastery", attempts: [{ value: 3 }] },
        ],
      },
    );
    expect(t3.points).toBe(7);

    const t4 = scoreTest(getCatalogRubric("T4"), {
      status: "completed",
      components: [
        { key: "precision", attempts: [{ value: 6 }] }, // 6/8 * 5 = 3.75 -> arrondi 0.5 -> 4
        { key: "strike_quality", attempts: [{ value: 2 }] },
      ],
    });
    expect(t4.points).toBe(6);

    const p1 = scoreTest(
      getCatalogRubric("P1", {
        key: "volume",
        thresholds: [
          { bound: 45, points: 6 },
          { bound: 38, points: 5 },
        ],
      }),
      {
        status: "completed",
        components: [
          { key: "volume", attempts: [{ value: 40 }] },
          { key: "rhythm", attempts: [{ value: 2 }] },
          { key: "movement_quality", attempts: [{ value: 2 }] },
        ],
      },
    );
    expect(p1.points).toBe(9);

    const i1 = scoreTest(getCatalogRubric("I1"), {
      status: "completed",
      components: [
        { key: "information", attempts: [{ value: 2 }] },
        { key: "decision", attempts: [{ value: 3 }] },
        { key: "positioning", attempts: [{ value: 2 }] },
        { key: "understanding", attempts: [{ value: 2 }] },
        { key: "anticipation", attempts: [{ value: 3 }] },
      ],
    });
    expect(i1.points).toBe(12);

    const e1 = scoreTest(getCatalogRubric("E1"), {
      status: "completed",
      components: [
        { key: "support", attempts: [{ value: 1 }] },
        { key: "respect", attempts: [{ value: 1 }] },
        { key: "resilience", attempts: [{ value: 0.5 }] },
        { key: "cooperation", attempts: [{ value: 1 }] },
        { key: "fair_play", attempts: [{ value: 1 }] },
      ],
    });
    expect(e1.points).toBe(4.5);

    const byCode: Record<string, ReturnType<typeof scoreTest>> = {
      A1: a1,
      A2: a2,
      A3: a3,
      A4: a4,
      A5: a5,
      T1: t1,
      T2: t2,
      T3: t3,
      T4: t4,
      P1: p1,
      I1: i1,
      E1: e1,
    };

    const entries: TestScoreEntry[] = DEFAULT_TESTS.map((t) => ({
      test_id: t.code,
      test_code: t.code,
      test_name: t.name,
      domain: t.domain,
      max_points: t.max_points,
      evaluation_status: "completed",
      result: byCode[t.code],
      rubric_version_id: `rub-${t.code}`,
    }));

    const total = scoreTotal(DEFAULT_DOMAINS, entries);
    expect(total.complete).toBe(true);
    expect(total.domains.find((d) => d.domain === "athletic")?.points).toBe(35.5); // 8+9+7+5.5+6
    expect(total.domains.find((d) => d.domain === "technical")?.points).toBe(24); // 6+5+7+6
    expect(total.domains.find((d) => d.domain === "physical")?.points).toBe(9);
    expect(total.domains.find((d) => d.domain === "game_intelligence")?.points).toBe(12);
    expect(total.domains.find((d) => d.domain === "team_spirit")?.points).toBe(4.5);
    expect(total.total).toBe(85);
    expect(total.domains.find((d) => d.domain === "technical")?.normalized).toBe(80);
  });

  it("gère les pénalités (temps majoré et retrait de points), les tentatives annulées et les états incomplets", () => {
    const slalomWithPenalty: MeasuredComponent = {
      key: "time",
      label: "Slalom",
      kind: "measured",
      max_points: 6,
      measure_type: "time",
      unit: "s",
      direction: "lower_better",
      attempts: 2,
      aggregation: "best",
      min_value: 2,
      max_value: 30,
      scoring: {
        mode: "thresholds",
        thresholds: [
          { bound: 8.0, points: 6 },
          { bound: 9.0, points: 4 },
          { bound: 10.0, points: 2 },
        ],
      },
      penalty: { label: "Cône touché (+0.5s)", mode: "add_to_value", amount: 0.5 },
    };

    // Essai 1 : 7.8s mais 2 cônes touchés -> 8.8s ; Essai 2 : faux départ (is_valid=false)
    const res = scoreComponent(slalomWithPenalty, {
      key: "time",
      attempts: [
        { value: 7.8, penalties: 2, is_valid: true },
        { value: 7.2, penalties: 0, is_valid: false },
      ],
    });
    expect(res.retained_value).toBe(8.8);
    expect(res.points).toBe(4);

    // Valeur hors limites (ex: 12 réussites sur 10 passes)
    const t1Rubric = getCatalogRubric("T1");
    const invalidPasses = scoreTest(t1Rubric, {
      status: "completed",
      components: [
        { key: "precision", attempts: [{ value: 12 }] },
        { key: "quality", attempts: [{ value: 2 }] },
      ],
    });
    expect(invalidPasses.status).toBe("invalid");
    expect(invalidPasses.points).toBeNull();
  });

  it("résout toujours le barème actif le plus spécifique (catégorie + sexe > catégorie > général)", () => {
    const dummyCfg = DEFAULT_TESTS[0].rubric;
    const rows: RubricRow[] = [
      {
        id: "global-v1",
        test_id: "t1",
        category_id: null,
        sex: null,
        version: 1,
        status: "active",
        effective_from: "2026-11-01",
        config: dummyCfg,
      },
      {
        id: "cat-u10-v1",
        test_id: "t1",
        category_id: "cat-u10",
        sex: null,
        version: 1,
        status: "active",
        effective_from: "2026-11-01",
        config: dummyCfg,
      },
      {
        id: "cat-u10-f-v1",
        test_id: "t1",
        category_id: "cat-u10",
        sex: "F",
        version: 1,
        status: "active",
        effective_from: "2026-11-01",
        config: dummyCfg,
      },
    ];

    expect(resolveRubricRow(rows, "t1", "cat-u10", "F", true)?.id).toBe("cat-u10-f-v1");
    expect(resolveRubricRow(rows, "t1", "cat-u10", "M", true)?.id).toBe("cat-u10-v1");
    expect(resolveRubricRow(rows, "t1", "cat-u14", "M", true)?.id).toBe("global-v1");
  });
});
