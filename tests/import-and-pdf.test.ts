import { describe, expect, it } from "vitest";
import {
  autoMapColumns,
  buildImportErrorReportCsv,
  validateMappedImportRows,
} from "@/lib/import-export/csv";
import { generatePlayerReportPdfBuffer } from "@/lib/pdf/report-document";
import { DEFAULT_DOMAINS, DEFAULT_TESTS } from "@/lib/scoring/default-catalog";
import { scoreTotal } from "@/lib/scoring/engine";
import { analyze } from "@/lib/analysis/rules";
import type { PlayerSessionAssessment } from "@/lib/server/consolidation";
import { playerDuplicateKey } from "@/lib/utils";

describe("Import CSV / Détection de doublons & Génération PDF 4 pages", () => {
  const categories = [
    { id: "11111111-1111-4111-8111-111111111111", code: "U6-U9", label: "U6–U9", min_age: 6, max_age: 9 },
    { id: "22222222-2222-4222-8222-222222222222", code: "U10-U13", label: "U10–U13", min_age: 10, max_age: 13 },
  ];

  it("valide les lignes CSV, convertit JJ/MM/AAAA, détecte les doublons et génère le rapport d'erreurs", () => {
    const headers = ["Nom", "Prénom", "Date de naissance", "Sexe", "Téléphone Parent"];
    const mapping = autoMapColumns(headers);
    expect(mapping.nom).toBe("Nom");
    expect(mapping.prenom).toBe("Prénom");
    expect(mapping.date_naissance).toBe("Date de naissance");

    const existingSet = new Set([
      playerDuplicateKey("MBIDA", "Lucas", "2015-03-10"),
    ]);

    const rawRows = [
      {
        Nom: "NGONO",
        Prénom: "Amina",
        "Date de naissance": "15/06/2015",
        Sexe: "F",
        "Téléphone Parent": "+237699112233",
      },
      {
        Nom: "MBIDA",
        Prénom: "Lucas",
        "Date de naissance": "10/03/2015",
        Sexe: "M",
        "Téléphone Parent": "+237677000000",
      },
      {
        Nom: "",
        Prénom: "SansNom",
        "Date de naissance": "date_invalide",
        Sexe: "X",
        "Téléphone Parent": "12",
      },
    ];

    const summary = validateMappedImportRows(rawRows, mapping, {
      categories,
      existingDuplicateKeys: existingSet,
      referenceDateIso: "2026-11-28",
    });

    expect(summary.validCount).toBe(1);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.rows[0].parsed?.birth_date).toBe("2015-06-15");
    expect(summary.rows[0].parsed?.category_id).toBe(categories[1].id);

    const errCsv = buildImportErrorReportCsv(summary.rows);
    expect(errCsv).toContain("DOUBLON_BASE");
    expect(errCsv).toContain("ERREUR");
  });

  it("génère un fichier PDF binaire valide d'exactement 4 pages sans inventer de données", async () => {
    const entries = DEFAULT_TESTS.map((t) => ({
      test_id: `id-${t.code}`,
      test_code: t.code,
      test_name: t.name,
      domain: t.domain,
      max_points: t.max_points,
      evaluation_status: "completed" as const,
      rubric_version_id: "rub-1",
      rubric_version_number: 1,
      comment: t.code === "I1" ? "Bonne lecture des espaces libres." : null,
      evaluated_at: "2026-11-28T10:30:00Z",
      validated_at: "2026-11-28T15:00:00Z",
      protocol_text: "Protocole officiel FAFC",
      attempts: [],
      result: {
        status: "complete" as const,
        points: Number((t.max_points * 0.8).toFixed(1)),
        max_points: t.max_points,
        components: [],
        issues: [],
      },
    }));

    const total = scoreTotal(DEFAULT_DOMAINS, entries);
    const analysis = analyze({
      total,
      entries,
      categoryCode: "U10-U13",
      firstName: "Clarisse",
    });

    const assessment: PlayerSessionAssessment = {
      session: {
        id: "sess-1",
        name: "Test d'aptitude FUTURISTE ACADÉMIE FC – Saison 2026–2027",
        description: null,
        session_date: "2026-11-28",
        start_time: "09:30",
        location: "École Publique de Japoma, Douala, Cameroun",
        season_id: "sea-1",
        status: "finalized",
        is_demo: false,
        created_by: null,
        created_at: "2026-11-25T10:00:00Z",
        updated_at: "2026-11-28T16:00:00Z",
        finalized_at: "2026-11-28T16:00:00Z",
        finalized_by: null,
      },
      player: {
        id: "pl-1",
        player_number: "FA-0042",
        last_name: "NGONO",
        first_name: "Clarisse",
        birth_date: "2014-09-03",
        sex: "F",
        photo_path: null,
        category_id: "cat-u10",
        preferred_position: "Milieu offensif",
        dominant_foot: "left",
        previous_club: null,
        academy_entry_year: 2026,
        notes: null,
        status: "active",
        consent_obtained: true,
        consent_date: "2026-11-25",
        consent_note: null,
        is_demo: false,
        external_ref: null,
        archived_at: null,
        created_by: null,
        created_at: "2026-11-25T10:00:00Z",
        updated_at: "2026-11-25T10:00:00Z",
      },
      session_player: {
        id: "sp-1",
        session_id: "sess-1",
        player_id: "pl-1",
        category_id: "cat-u10",
        bib_number: "10",
        status: "present",
        added_at: "2026-11-25T10:00:00Z",
      },
      category: {
        id: "cat-u10",
        code: "U10-U13",
        label: "U10–U13",
        min_age: 10,
        max_age: 13,
        sort_order: 2,
        description: null,
        is_active: true,
        created_at: "2026-11-25T10:00:00Z",
        updated_at: "2026-11-25T10:00:00Z",
      },
      age_at_session: 12,
      domains: DEFAULT_DOMAINS.map((d) => ({ ...d, description: d.description })),
      entries,
      total,
      analysis,
      rubric_version_ids: ["rub-1"],
      stored_score: null,
      club_settings: null,
    };

    const buffer = await generatePlayerReportPdfBuffer({
      assessment,
      seasonLabel: "2026–2027",
      validatorName: "Directeur Technique FAFC",
      generatedAtIso: "2026-11-28T17:00:00Z",
    });

    expect(buffer.byteLength).toBeGreaterThan(3000);
    const rawPdf = buffer.toString("latin1");
    expect(rawPdf.startsWith("%PDF-")).toBe(true);

    // Vérification stricte de la pagination : exactement 4 objets Page PDF
    const pageMatches = rawPdf.match(/\/Type\s*\/Page\b/g) ?? [];
    expect(pageMatches.length).toBe(4);
  });
});
