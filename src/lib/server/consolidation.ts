import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreTest, scoreTotal } from "@/lib/scoring/engine";
import { attemptsToTestInput, resolveRubricRow, toResolved, type RubricRow } from "@/lib/scoring/resolve";
import { analyze, type AnalysisResult } from "@/lib/analysis/rules";
import type { TestScoreEntry, TotalResult } from "@/lib/scoring/types";
import type {
  AssessmentCategory,
  AssessmentDomain,
  AssessmentScore,
  AssessmentSession,
  AssessmentTest,
  ClubSettings,
  Player,
  SessionPlayer,
  TestAgeRule,
  TestAttempt,
  TestEvaluation,
} from "@/lib/types/database";
import { calculateAgeAtDate } from "@/lib/utils";

export interface DetailedTestEvaluation extends TestScoreEntry {
  comment: string | null;
  evaluated_at: string | null;
  validated_at: string | null;
  protocol_text: string | null;
  rubric_version_number: number | null;
  attempts: TestAttempt[];
}

export interface PlayerSessionAssessment {
  session: AssessmentSession;
  player: Player;
  session_player: SessionPlayer;
  category: AssessmentCategory;
  age_at_session: number | null;
  domains: AssessmentDomain[];
  entries: DetailedTestEvaluation[];
  total: TotalResult;
  analysis: AnalysisResult;
  rubric_version_ids: string[];
  stored_score: AssessmentScore | null;
  club_settings: ClubSettings | null;
}

/**
 * Calcule l'évaluation complète d'un joueur pour une session donnée à partir
 * des données réelles stockées en base (barèmes versionnés inclus).
 */
export async function computePlayerSessionAssessment(
  supabase: SupabaseClient,
  sessionId: string,
  playerId: string,
): Promise<PlayerSessionAssessment> {
  const [
    sessionRes,
    spRes,
    playerRes,
    domainsRes,
    sessionTestsRes,
    evalsRes,
    rubricsRes,
    storedScoreRes,
    settingsRes,
  ] = await Promise.all([
    supabase.from("assessment_sessions").select("*").eq("id", sessionId).single(),
    supabase
      .from("session_players")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_id", playerId)
      .single(),
    supabase.from("players").select("*").eq("id", playerId).single(),
    supabase.from("assessment_domains").select("*").order("sort_order"),
    supabase
      .from("session_tests")
      .select("sort_order, test:assessment_tests(*)")
      .eq("session_id", sessionId)
      .order("sort_order"),
    supabase
      .from("test_evaluations")
      .select("*, attempts:test_attempts(*)")
      .eq("session_id", sessionId)
      .eq("player_id", playerId),
    supabase.from("rubric_versions").select("*"),
    supabase
      .from("assessment_scores")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase.from("club_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (sessionRes.error || !sessionRes.data) {
    throw new Error("Session introuvable ou accès non autorisé.");
  }
  if (spRes.error || !spRes.data) {
    throw new Error("Ce joueur n'est pas inscrit à cette session.");
  }
  if (playerRes.error || !playerRes.data) {
    throw new Error("Fiche joueur introuvable.");
  }

  const session = sessionRes.data as AssessmentSession;
  const sessionPlayer = spRes.data as SessionPlayer;
  const player = playerRes.data as Player;

  const [catRes, ageRulesRes] = await Promise.all([
    supabase
      .from("assessment_categories")
      .select("*")
      .eq("id", sessionPlayer.category_id)
      .single(),
    supabase
      .from("test_age_rules")
      .select("*")
      .eq("category_id", sessionPlayer.category_id),
  ]);

  if (catRes.error || !catRes.data) {
    throw new Error("Catégorie de la session introuvable.");
  }
  const category = catRes.data as AssessmentCategory;
  const ageRules = (ageRulesRes.data ?? []) as TestAgeRule[];
  const ageRuleByTest = new Map(ageRules.map((r) => [r.test_id, r]));

  const domains = ((domainsRes.data ?? []) as AssessmentDomain[]).map((d) => ({
    ...d,
    max_points: Number(d.max_points),
  }));

  const tests = ((sessionTestsRes.data ?? []) as unknown as {
    sort_order: number;
    test: AssessmentTest | AssessmentTest[] | null;
  }[])
    .map((row) => (Array.isArray(row.test) ? row.test[0] : row.test))
    .filter((t): t is AssessmentTest => Boolean(t))
    .map((t) => ({ ...t, max_points: Number(t.max_points) }));

  const evaluations = (evalsRes.data ?? []) as (TestEvaluation & {
    attempts?: TestAttempt[];
  })[];
  const evalByTest = new Map(evaluations.map((e) => [e.test_id, e]));

  const allRubrics = (rubricsRes.data ?? []) as RubricRow[];
  const rubricById = new Map(allRubrics.map((r) => [r.id, r]));
  const settings = (settingsRes.data as ClubSettings | null) ?? null;
  const useSex = settings?.sex_field_enabled ?? true;

  const entries: DetailedTestEvaluation[] = tests.map((test) => {
    const ev = evalByTest.get(test.id) ?? null;
    // Priorité au barème figé lors de la saisie (historique), sinon résolution du barème actif
    const rubricRow =
      (ev?.rubric_version_id ? rubricById.get(ev.rubric_version_id) ?? null : null) ??
      resolveRubricRow(allRubrics, test.id, category.id, player.sex, useSex);

    const resolved = toResolved(rubricRow, test.code, test.max_points);
    const attempts = (ev?.attempts ?? []).map((a) => ({
      ...a,
      value: a.value === null ? null : Number(a.value),
    }));

    const input = ev
      ? attemptsToTestInput(ev.status, attempts)
      : null;

    const result = ev ? scoreTest(resolved, input) : null;

    return {
      test_id: test.id,
      test_code: test.code,
      test_name: test.name,
      domain: test.domain,
      max_points: test.max_points,
      evaluation_status: ev?.status ?? null,
      result,
      rubric_version_id: rubricRow?.id ?? null,
      rubric_version_number: rubricRow?.version ?? null,
      comment: ev?.comment ?? null,
      evaluated_at: ev?.evaluated_at ?? null,
      validated_at: ev?.validated_at ?? null,
      protocol_text: ageRuleByTest.get(test.id)?.protocol_text ?? null,
      attempts,
    };
  });

  const total = scoreTotal(domains, entries);
  const autoAnalysis = analyze({
    total,
    entries,
    categoryCode: category.code,
    firstName: player.first_name,
  });

  const storedScore = (storedScoreRes.data as AssessmentScore | null) ?? null;
  const analysis: AnalysisResult =
    storedScore?.analysis_overridden && storedScore.analysis?.summary
      ? {
          ...autoAnalysis,
          summary: storedScore.analysis.summary,
          recommendations:
            storedScore.analysis.recommendations ?? autoAnalysis.recommendations,
        }
      : autoAnalysis;

  const rubricVersionIds = [
    ...new Set(
      entries
        .map((e) => e.rubric_version_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  // Âge exact calculé À LA DATE DE LA SESSION (jamais la date du jour)
  const ageAtSession = calculateAgeAtDate(player.birth_date, session.session_date);

  return {
    session,
    player,
    session_player: sessionPlayer,
    category,
    age_at_session: ageAtSession,
    domains,
    entries,
    total,
    analysis,
    rubric_version_ids: rubricVersionIds,
    stored_score: storedScore,
    club_settings: settings,
  };
}

/**
 * Recalcule et persiste le score consolidé d'un joueur (appel réservé Admin via RPC).
 */
export async function persistConsolidatedScore(
  supabase: SupabaseClient,
  sessionId: string,
  playerId: string,
  options: {
    validate?: boolean;
    analysis_enabled?: boolean;
    coach_comment?: string | null;
    override_summary?: string | null;
    override_recommendations?: string[];
    reason?: string | null;
  } = {},
): Promise<AssessmentScore> {
  const computed = await computePlayerSessionAssessment(supabase, sessionId, playerId);
  const domainMap = new Map(
    computed.total.domains.map((d) => [d.domain, d.points]),
  );

  const hasOverride = Boolean(
    (options.override_summary && options.override_summary.trim().length > 0) ||
      (options.override_recommendations &&
        options.override_recommendations.length > 0),
  );

  const finalAnalysis: AnalysisResult = hasOverride
    ? {
        ...computed.analysis,
        summary: options.override_summary?.trim() || computed.analysis.summary,
        recommendations:
          options.override_recommendations && options.override_recommendations.length > 0
            ? options.override_recommendations
            : computed.analysis.recommendations,
      }
    : computed.analysis;

  const payload = {
    session_id: sessionId,
    player_id: playerId,
    category_id: computed.category.id,
    athletic: domainMap.get("athletic") ?? null,
    technical: domainMap.get("technical") ?? null,
    physical: domainMap.get("physical") ?? null,
    game_intelligence: domainMap.get("game_intelligence") ?? null,
    team_spirit: domainMap.get("team_spirit") ?? null,
    total: computed.total.total,
    is_complete: computed.total.complete,
    details: computed.total,
    rubric_version_ids: computed.rubric_version_ids,
    profile_labels: finalAnalysis.profiles,
    analysis: finalAnalysis,
    analysis_enabled:
      options.analysis_enabled ??
      computed.stored_score?.analysis_enabled ??
      computed.club_settings?.analysis_enabled ??
      true,
    analysis_overridden:
      hasOverride || Boolean(computed.stored_score?.analysis_overridden),
    coach_comment:
      options.coach_comment !== undefined
        ? options.coach_comment
        : (computed.stored_score?.coach_comment ?? null),
    validate: Boolean(options.validate),
  };

  const { data, error } = await supabase.rpc("upsert_assessment_score", {
    p_score: payload,
    p_reason: options.reason ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
  return data as AssessmentScore;
}
