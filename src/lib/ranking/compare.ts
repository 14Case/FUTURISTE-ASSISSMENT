/**
 * Classement interne & comparaison d'historique — contrôles de cohérence.
 *
 * Règles métier (Sections 14 & 19) :
 * - Comparer uniquement au sein de groupes cohérents (même session, même catégorie,
 *   mêmes barèmes). Avertir explicitement lorsqu'une comparaison n'est pas pertinente.
 * - Ne pas comparer directement des résultats historiques obtenus avec des
 *   catégories ou des versions de barèmes incompatibles.
 */

export type RankingMetric =
  | "total"
  | "athletic"
  | "technical"
  | "physical"
  | "game_intelligence"
  | "team_spirit";

export interface RankableEntry {
  player_id: string;
  player_number: string;
  last_name: string;
  first_name: string;
  category_id: string;
  category_label: string;
  is_complete: boolean;
  rubric_version_ids: string[];
  profile_labels: string[];
  total: number | null;
  athletic: number | null;
  technical: number | null;
  physical: number | null;
  game_intelligence: number | null;
  team_spirit: number | null;
}

export interface RankedPlayer extends RankableEntry {
  rank: number | null;
  metric_score: number | null;
}

export interface RankingOutput {
  entries: RankedPlayer[];
  warnings: string[];
  is_coherent: boolean;
}

function rubricSignature(ids: string[]): string {
  return [...ids].sort().join("|");
}

export function buildRanking(
  rows: RankableEntry[],
  metric: RankingMetric,
  categoryFilter: string | null,
): RankingOutput {
  const warnings: string[] = [];
  const filtered = categoryFilter
    ? rows.filter((r) => r.category_id === categoryFilter)
    : rows;

  const categories = new Set(filtered.map((r) => r.category_id));
  if (categories.size > 1) {
    warnings.push(
      "Attention : plusieurs catégories d'âge sont affichées simultanément. Les protocoles (distances, durées, formats) et barèmes diffèrent selon l'âge ; filtrez par catégorie pour une comparaison pertinente.",
    );
  }

  const signatures = new Set(
    filtered
      .filter((r) => r.rubric_version_ids.length > 0)
      .map((r) => rubricSignature(r.rubric_version_ids)),
  );
  if (signatures.size > 1 && categories.size <= 1) {
    warnings.push(
      "Attention : certains joueurs de ce groupe ont été évalués avec des versions de barèmes différentes.",
    );
  }

  const incompleteCount = filtered.filter((r) => r[metric] === null).length;
  if (incompleteCount > 0) {
    warnings.push(
      `${incompleteCount} joueur(s) ont un score incomplet sur ce critère et apparaissent hors classement.`,
    );
  }

  const withMetric = filtered.map((r) => ({
    ...r,
    metric_score: r[metric],
    rank: null as number | null,
  }));

  withMetric.sort((a, b) => {
    if (a.metric_score === null && b.metric_score === null) {
      return a.last_name.localeCompare(b.last_name, "fr");
    }
    if (a.metric_score === null) return 1;
    if (b.metric_score === null) return -1;
    if (b.metric_score !== a.metric_score) return b.metric_score - a.metric_score;
    return a.last_name.localeCompare(b.last_name, "fr");
  });

  // Classement olympique (ex-aequo partagent le même rang : 1, 1, 3).
  let currentRank = 0;
  let lastScore: number | null = null;
  withMetric.forEach((entry, index) => {
    if (entry.metric_score === null) {
      entry.rank = null;
      return;
    }
    if (lastScore === null || entry.metric_score !== lastScore) {
      currentRank = index + 1;
      lastScore = entry.metric_score;
    }
    entry.rank = currentRank;
  });

  return {
    entries: withMetric,
    warnings,
    is_coherent: categories.size <= 1 && signatures.size <= 1,
  };
}

export interface HistoricalSessionSnapshot {
  session_id: string;
  session_name: string;
  session_date: string;
  category_id: string;
  category_code: string;
  category_label: string;
  age_at_session: number | null;
  rubric_version_ids: string[];
  total: number | null;
  athletic: number | null;
  technical: number | null;
  physical: number | null;
  game_intelligence: number | null;
  team_spirit: number | null;
}

export interface HistoryComparisonCheck {
  directly_comparable: boolean;
  reasons: string[];
}

/**
 * Vérifie si deux sessions de l'historique d'un joueur peuvent être comparées
 * directement (même catégorie à la date du test ET mêmes versions de barèmes).
 */
export function checkHistoryComparability(
  a: HistoricalSessionSnapshot,
  b: HistoricalSessionSnapshot,
): HistoryComparisonCheck {
  const reasons: string[] = [];
  if (a.category_id !== b.category_id) {
    reasons.push(
      `Changement de catégorie (${a.category_label} → ${b.category_label}) : les protocoles (distances, durées, formats) diffèrent.`,
    );
  }
  const sigA = rubricSignature(a.rubric_version_ids);
  const sigB = rubricSignature(b.rubric_version_ids);
  if (sigA && sigB && sigA !== sigB) {
    reasons.push(
      "Les versions de barèmes utilisées lors de ces deux sessions ne sont pas identiques.",
    );
  }
  if (!sigA || !sigB) {
    reasons.push(
      "Références de barèmes incomplètes sur au moins l'une des sessions.",
    );
  }
  return {
    directly_comparable: reasons.length === 0,
    reasons,
  };
}
