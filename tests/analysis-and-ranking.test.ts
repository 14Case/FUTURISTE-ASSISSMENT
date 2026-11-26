import { describe, expect, it } from "vitest";
import { analyze } from "@/lib/analysis/rules";
import {
  buildRanking,
  checkHistoryComparability,
  type RankableEntry,
} from "@/lib/ranking/compare";
import { DEFAULT_DOMAINS, DEFAULT_TESTS } from "@/lib/scoring/default-catalog";
import { scoreTotal } from "@/lib/scoring/engine";
import type { TestScoreEntry } from "@/lib/scoring/types";
import { buildReportFileName, calculateAgeAtDate } from "@/lib/utils";

describe("Analyse sportive, classement interne et cohérence historique", () => {
  it("calcule l'âge exact à la date du test (jamais la date courante de consultation)", () => {
    // Joueur né le 29 novembre 2015 : au test du 28 novembre 2026 il a encore 10 ans !
    expect(calculateAgeAtDate("2015-11-29", "2026-11-28")).toBe(10);
    // Le lendemain (29 novembre 2026), il a 11 ans
    expect(calculateAgeAtDate("2015-11-29", "2026-11-29")).toBe(11);
  });

  it("génère un profil descriptif et des recommandations adaptées à la catégorie d'âge sans inventer d'observations", () => {
    const entries: TestScoreEntry[] = DEFAULT_TESTS.map((t) => {
      const high = t.domain === "technical" || t.domain === "team_spirit";
      const pts = high ? t.max_points * 0.85 : t.max_points * 0.4;
      return {
        test_id: t.code,
        test_code: t.code,
        test_name: t.name,
        domain: t.domain,
        max_points: t.max_points,
        evaluation_status: "completed",
        rubric_version_id: "v1",
        result: {
          status: "complete",
          points: pts,
          max_points: t.max_points,
          components: [],
          issues: [],
        },
      };
    });

    const total = scoreTotal(DEFAULT_DOMAINS, entries);
    const u6Analysis = analyze({
      total,
      entries,
      categoryCode: "U6-U9",
      firstName: "Samuel",
    });
    const u14Analysis = analyze({
      total,
      entries,
      categoryCode: "U14-U16",
      firstName: "Samuel",
    });

    expect(u6Analysis.profiles).toContain("Profil technique");
    expect(u6Analysis.strengths.length).toBeGreaterThan(0);
    expect(u6Analysis.improvements.length).toBeGreaterThan(0);
    // Les recommandations U6-U9 diffèrent des recommandations U14-U16
    expect(u6Analysis.recommendations[0]).not.toEqual(
      u14Analysis.recommendations[0],
    );
  });

  it("avertit lorsque le classement mélange plusieurs catégories ou versions de barèmes et gère les ex-aequo", () => {
    const sample: RankableEntry[] = [
      {
        player_id: "1",
        player_number: "FA-0001",
        last_name: "ABENA",
        first_name: "Loïc",
        category_id: "u10",
        category_label: "U10–U13",
        is_complete: true,
        rubric_version_ids: ["r1"],
        profile_labels: ["Profil technique"],
        total: 82,
        athletic: 32,
        technical: 25,
        physical: 8,
        game_intelligence: 12,
        team_spirit: 5,
      },
      {
        player_id: "2",
        player_number: "FA-0002",
        last_name: "BELLA",
        first_name: "Yann",
        category_id: "u10",
        category_label: "U10–U13",
        is_complete: true,
        rubric_version_ids: ["r1"],
        profile_labels: ["Profil athlétique"],
        total: 82,
        athletic: 35,
        technical: 22,
        physical: 8,
        game_intelligence: 12,
        team_spirit: 5,
      },
      {
        player_id: "3",
        player_number: "FA-0003",
        last_name: "CAMARA",
        first_name: "Idriss",
        category_id: "u14",
        category_label: "U14–U16",
        is_complete: false,
        rubric_version_ids: ["r2"],
        profile_labels: [],
        total: null,
        athletic: 30,
        technical: null,
        physical: 7,
        game_intelligence: 10,
        team_spirit: 4,
      },
    ];

    const mixed = buildRanking(sample, "total", null);
    expect(mixed.is_coherent).toBe(false);
    expect(mixed.warnings.some((w) => w.includes("plusieurs catégories"))).toBe(
      true,
    );

    const coherentU10 = buildRanking(sample, "total", "u10");
    expect(coherentU10.is_coherent).toBe(true);
    expect(coherentU10.entries[0].rank).toBe(1);
    expect(coherentU10.entries[1].rank).toBe(1); // ex-aequo
  });

  it("interdit la comparaison directe de deux sessions historiques avec catégories ou barèmes incompatibles", () => {
    const check = checkHistoryComparability(
      {
        session_id: "s1",
        session_name: "Saison 2025",
        session_date: "2025-11-20",
        category_id: "u10",
        category_code: "U10-U13",
        category_label: "U10–U13",
        age_at_session: 13,
        rubric_version_ids: ["v1"],
        total: 74,
        athletic: 30,
        technical: 22,
        physical: 7,
        game_intelligence: 11,
        team_spirit: 4,
      },
      {
        session_id: "s2",
        session_name: "Saison 2026",
        session_date: "2026-11-28",
        category_id: "u14",
        category_code: "U14-U16",
        category_label: "U14–U16",
        age_at_session: 14,
        rubric_version_ids: ["v2"],
        total: 71,
        athletic: 28,
        technical: 21,
        physical: 7,
        game_intelligence: 11,
        team_spirit: 4,
      },
    );

    expect(check.directly_comparable).toBe(false);
    expect(check.reasons.length).toBeGreaterThanOrEqual(2);
    expect(buildReportFileName("Éto'o", "Jean-Marc", "2026-11-28")).toBe(
      "FAFC_Rapport_Eto_o_Jean_Marc_2026.pdf",
    );
  });
});
