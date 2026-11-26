"use client";

import * as React from "react";
import Link from "next/link";
import { Trophy, Download, AlertTriangle } from "lucide-react";
import {
  buildRanking,
  type RankableEntry,
  type RankingMetric,
} from "@/lib/ranking/compare";
import type { AssessmentCategory, AssessmentSession } from "@/lib/types/database";
import { formatDateFr } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";

const METRIC_LABELS: Record<RankingMetric, { label: string; max: number }> = {
  total: { label: "Score global", max: 100 },
  athletic: { label: "Score athlétique", max: 40 },
  technical: { label: "Score technique", max: 30 },
  physical: { label: "Score physique", max: 10 },
  game_intelligence: { label: "Intelligence de jeu", max: 15 },
  team_spirit: { label: "Esprit d'équipe", max: 5 },
};

export function RankingClient({
  sessions,
  categories,
  scoresBySession,
  isAdmin,
}: {
  sessions: Pick<AssessmentSession, "id" | "name" | "session_date">[];
  categories: AssessmentCategory[];
  scoresBySession: Record<string, RankableEntry[]>;
  isAdmin: boolean;
}) {
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id ?? "");
  const [categoryId, setCategoryId] = React.useState<string>(
    categories[0]?.id ?? "",
  );
  const [metric, setMetric] = React.useState<RankingMetric>("total");

  const ranking = React.useMemo(
    () =>
      buildRanking(
        scoresBySession[sessionId] ?? [],
        metric,
        categoryId || null,
      ),
    [scoresBySession, sessionId, metric, categoryId],
  );

  const exportHref = `/api/exports/classements?session_id=${encodeURIComponent(
    sessionId,
  )}&category_id=${encodeURIComponent(categoryId)}&metric=${encodeURIComponent(
    metric,
  )}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Classement Interne & Comparaison Cohérente
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Usage strictement interne au staff autorisé • Aucun classement public ni
            accès parent aux résultats d&apos;autres enfants.
          </p>
        </div>

        {isAdmin && sessionId ? (
          <a
            href={exportHref}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <Download className="h-4 w-4 text-violet-700" />
            <span>Exporter ce classement (CSV)</span>
          </a>
        ) : null}
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <div className="grid sm:grid-cols-3 gap-3.5">
          <div>
            <Label>Session d&apos;évaluation</Label>
            <Select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateFr(s.session_date)} — {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Catégorie (recommandé pour cohérence)</Label>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Toutes catégories confondues</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.min_age}–{c.max_age} ans)
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Critère de classement</Label>
            <Select
              value={metric}
              onChange={(e) => setMetric(e.target.value as RankingMetric)}
            >
              {(Object.keys(METRIC_LABELS) as RankingMetric[]).map((k) => (
                <option key={k} value={k}>
                  {METRIC_LABELS[k].label} (/{METRIC_LABELS[k].max})
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Avertissements de pertinence méthodologique */}
      {ranking.warnings.length > 0 ? (
        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4 text-xs text-orange-950 flex items-start gap-3 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
          <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Avertissement méthodologique</p>
            {ranking.warnings.map((w, idx) => (
              <p key={idx}>• {w}</p>
            ))}
          </div>
        </div>
      ) : null}

      {ranking.entries.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Aucun score consolidé dans cette sélection"
          description="Consolidez les évaluations d'une session ou validez une fiche joueur pour alimenter le classement interne."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3.5 font-bold">Rang</th>
                  <th className="px-4 py-3.5 font-bold">Numéro</th>
                  <th className="px-4 py-3.5 font-bold">Joueur</th>
                  <th className="px-4 py-3.5 font-bold">Catégorie</th>
                  <th className="px-4 py-3.5 font-bold text-right">
                    {METRIC_LABELS[metric].label}
                  </th>
                  <th className="px-4 py-3.5 font-bold">Profil descriptif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ranking.entries.map((row) => (
                  <tr key={row.player_id}>
                    <td className="px-4 py-3.5 font-black">
                      {row.rank !== null ? (
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                            row.rank === 1
                              ? "bg-violet-800 text-white"
                              : row.rank <= 3
                                ? "bg-sky-100 text-sky-900"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {row.rank}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">NC</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-violet-800 dark:text-sky-300">
                      {row.player_number}
                    </td>
                    <td className="px-4 py-3.5 font-bold">
                      <Link
                        href={`/joueurs/${row.player_id}`}
                        className="hover:text-violet-800"
                      >
                        {row.last_name.toUpperCase()} {row.first_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="violet">{row.category_label}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-black text-base">
                      {row.metric_score !== null ? (
                        <span className="text-violet-900 dark:text-sky-300">
                          {row.metric_score.toFixed(1)}{" "}
                          <span className="text-xs font-normal text-slate-400">
                            / {METRIC_LABELS[metric].max}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-orange-600">Incomplet</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {row.profile_labels.map((lbl) => (
                          <Badge key={lbl} variant="sky">
                            {lbl}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
