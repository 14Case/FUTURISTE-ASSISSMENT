import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { toCsvWithBom } from "@/lib/import-export/csv";
import { buildRanking, type RankableEntry, type RankingMetric } from "@/lib/ranking/compare";
import { DOMINANT_FOOT_LABELS, SESSION_STATUS_LABELS } from "@/lib/utils";

/**
 * Exports CSV administrateur (Section 20) :
 * - /api/exports/joueurs
 * - /api/exports/sessions
 * - /api/exports/resultats?session_id=...
 * - /api/exports/classements?session_id=...&category_id=...&metric=...
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { kind } = await params;
  const supabase = auth.ctx.supabase;
  const { searchParams } = request.nextUrl;
  const today = new Date().toISOString().slice(0, 10);

  if (kind === "joueurs") {
    const { data, error } = await supabase
      .from("players")
      .select(
        "*, category:assessment_categories(code, label), guardians:player_guardians(relationship, is_primary, guardian:guardians(*))",
      )
      .order("player_number");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((p: Record<string, unknown>) => {
      const cat = (Array.isArray(p.category) ? p.category[0] : p.category) as
        | { label?: string }
        | null;
      const gLinks = (p.guardians as {
        relationship: string | null;
        is_primary: boolean;
        guardian: {
          last_name: string;
          first_name: string | null;
          phone: string;
          whatsapp: string | null;
          email: string | null;
        };
      }[]) ?? [];
      const primaryG = gLinks.find((g) => g.is_primary)?.guardian ?? gLinks[0]?.guardian;

      return {
        id_uuid: String(p.id),
        numero_joueur: String(p.player_number ?? ""),
        nom: String(p.last_name ?? ""),
        prenom: String(p.first_name ?? ""),
        date_naissance: String(p.birth_date ?? ""),
        sexe: String(p.sex ?? ""),
        categorie: cat?.label ?? "",
        poste_prefere: String(p.preferred_position ?? ""),
        pied_dominant: p.dominant_foot
          ? (DOMINANT_FOOT_LABELS[String(p.dominant_foot)] ?? String(p.dominant_foot))
          : "",
        ancien_club: String(p.previous_club ?? ""),
        annee_entree: p.academy_entry_year ? String(p.academy_entry_year) : "",
        statut: String(p.status ?? ""),
        consentement_parental: p.consent_obtained ? "Oui" : "Non",
        responsable_nom: primaryG?.last_name ?? "",
        responsable_prenom: primaryG?.first_name ?? "",
        responsable_telephone: primaryG?.phone ?? "",
        responsable_whatsapp: primaryG?.whatsapp ?? "",
        responsable_email: primaryG?.email ?? "",
        reference_externe: String(p.external_ref ?? ""),
        demo: p.is_demo ? "DEMO" : "",
      };
    });

    return csvResponse(toCsvWithBom(rows), `FAFC_Joueurs_${today}.csv`);
  }

  if (kind === "sessions") {
    const { data, error } = await supabase
      .from("assessment_sessions")
      .select("*, season:seasons(label)")
      .order("session_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((s: Record<string, unknown>) => ({
      id_uuid: String(s.id),
      nom: String(s.name ?? ""),
      date: String(s.session_date ?? ""),
      heure: String(s.start_time ?? ""),
      lieu: String(s.location ?? ""),
      saison:
        ((Array.isArray(s.season) ? s.season[0] : s.season) as { label?: string } | null)
          ?.label ?? "",
      statut: SESSION_STATUS_LABELS[String(s.status)] ?? String(s.status),
      finalisee_le: String(s.finalized_at ?? ""),
      demo: s.is_demo ? "DEMO" : "",
    }));

    return csvResponse(toCsvWithBom(rows), `FAFC_Sessions_${today}.csv`);
  }

  if (kind === "resultats") {
    const sessionId = searchParams.get("session_id");
    let query = supabase
      .from("test_evaluations")
      .select(
        "*, player:players(player_number, last_name, first_name), test:assessment_tests(code, name, domain, max_points), session:assessment_sessions(name, session_date)",
      )
      .order("evaluated_at", { ascending: false });

    if (sessionId) query = query.eq("session_id", sessionId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((ev: Record<string, unknown>) => {
      const p = (Array.isArray(ev.player) ? ev.player[0] : ev.player) as Record<
        string,
        string
      > | null;
      const t = (Array.isArray(ev.test) ? ev.test[0] : ev.test) as Record<
        string,
        string | number
      > | null;
      const s = (Array.isArray(ev.session) ? ev.session[0] : ev.session) as Record<
        string,
        string
      > | null;

      return {
        session: s?.name ?? "",
        date_session: s?.session_date ?? "",
        numero_joueur: p?.player_number ?? "",
        nom: p?.last_name ?? "",
        prenom: p?.first_name ?? "",
        code_atelier: t?.code ?? "",
        atelier: t?.name ?? "",
        domaine: t?.domain ?? "",
        statut_saisie: String(ev.status ?? ""),
        score: ev.points !== null && ev.points !== undefined ? String(ev.points) : "",
        maximum: t?.max_points ?? "",
        commentaire: String(ev.comment ?? ""),
        valide_le: String(ev.validated_at ?? ""),
      };
    });

    return csvResponse(toCsvWithBom(rows), `FAFC_Resultats_${today}.csv`);
  }

  if (kind === "classements") {
    const sessionId = searchParams.get("session_id");
    const categoryId = searchParams.get("category_id") || null;
    const metric = (searchParams.get("metric") ?? "total") as RankingMetric;

    let query = supabase
      .from("assessment_scores")
      .select(
        "*, player:players(id, player_number, last_name, first_name), category:assessment_categories(id, label)",
      );

    if (sessionId) query = query.eq("session_id", sessionId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries: RankableEntry[] = (data ?? []).map((sc: Record<string, unknown>) => {
      const p = (Array.isArray(sc.player) ? sc.player[0] : sc.player) as Record<
        string,
        string
      >;
      const c = (Array.isArray(sc.category) ? sc.category[0] : sc.category) as Record<
        string,
        string
      >;
      return {
        player_id: p?.id ?? String(sc.player_id),
        player_number: p?.player_number ?? "",
        last_name: p?.last_name ?? "",
        first_name: p?.first_name ?? "",
        category_id: c?.id ?? String(sc.category_id),
        category_label: c?.label ?? "",
        is_complete: Boolean(sc.is_complete),
        rubric_version_ids: (sc.rubric_version_ids as string[]) ?? [],
        profile_labels: (sc.profile_labels as string[]) ?? [],
        total: sc.total !== null ? Number(sc.total) : null,
        athletic: sc.athletic !== null ? Number(sc.athletic) : null,
        technical: sc.technical !== null ? Number(sc.technical) : null,
        physical: sc.physical !== null ? Number(sc.physical) : null,
        game_intelligence:
          sc.game_intelligence !== null ? Number(sc.game_intelligence) : null,
        team_spirit: sc.team_spirit !== null ? Number(sc.team_spirit) : null,
      };
    });

    const ranked = buildRanking(entries, metric, categoryId);
    const rows = ranked.entries.map((r) => ({
      rang: r.rank ?? "Hors classement",
      numero_joueur: r.player_number,
      nom: r.last_name,
      prenom: r.first_name,
      categorie: r.category_label,
      score_global_100: r.total ?? "",
      athletique_40: r.athletic ?? "",
      technique_30: r.technical ?? "",
      physique_10: r.physical ?? "",
      intelligence_15: r.game_intelligence ?? "",
      esprit_equipe_5: r.team_spirit ?? "",
      profil: r.profile_labels.join(" / "),
      complet: r.is_complete ? "Oui" : "Non",
    }));

    return csvResponse(toCsvWithBom(rows), `FAFC_Classement_${today}.csv`);
  }

  return NextResponse.json({ error: "Type d'export inconnu." }, { status: 400 });
}

function csvResponse(csvContent: string, fileName: string) {
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
