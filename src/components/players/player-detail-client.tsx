"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Share2,
  CheckCircle2,
  Eye,
  Download,
  GitCompare,
  AlertTriangle,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import type { PlayerSessionAssessment } from "@/lib/server/consolidation";
import type {
  AssessmentReport,
  GuardianLink,
  Player,
} from "@/lib/types/database";
import {
  checkHistoryComparability,
  type HistoricalSessionSnapshot,
} from "@/lib/ranking/compare";
import {
  DOMINANT_FOOT_LABELS,
  formatDateFr,
  SEX_LABELS,
} from "@/lib/utils";
import { DomainBarsChart, PlayerRadarChart } from "@/components/charts/player-radar-chart";
import { ShareReportModal } from "@/components/reports/share-report-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, Textarea, Label } from "@/components/ui/input";
import { AlertBanner, DemoTag, EmptyState } from "@/components/ui/states";

export interface SessionHistoryBundle {
  session_id: string;
  session_name: string;
  session_date: string;
  season_label: string;
  assessment: PlayerSessionAssessment;
  latest_report: AssessmentReport | null;
}

export function PlayerDetailClient({
  player,
  guardians,
  history,
  isAdmin,
  parentMessageTemplate,
}: {
  player: Player;
  guardians: GuardianLink[];
  history: SessionHistoryBundle[];
  isAdmin: boolean;
  parentMessageTemplate: string;
}) {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = React.useState(
    history[0]?.session_id ?? "",
  );
  const [compareSessionId, setCompareSessionId] = React.useState(
    history[1]?.session_id ?? "",
  );

  const current =
    history.find((h) => h.session_id === selectedSessionId) ?? history[0] ?? null;

  const [coachComment, setCoachComment] = React.useState(
    current?.assessment.stored_score?.coach_comment ?? "",
  );
  const [analysisEnabled, setAnalysisEnabled] = React.useState(
    current?.assessment.stored_score?.analysis_enabled ?? true,
  );
  const [overrideSummary, setOverrideSummary] = React.useState(
    current?.assessment.stored_score?.analysis_overridden
      ? (current.assessment.stored_score.analysis?.summary ?? "")
      : "",
  );
  const [savingScore, setSavingScore] = React.useState(false);
  const [generatingPdf, setGeneratingPdf] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

  const handleSelectSession = (nextSessionId: string) => {
    setSelectedSessionId(nextSessionId);
    const nextItem =
      history.find((h) => h.session_id === nextSessionId) ?? null;
    if (nextItem) {
      setCoachComment(nextItem.assessment.stored_score?.coach_comment ?? "");
      setAnalysisEnabled(
        nextItem.assessment.stored_score?.analysis_enabled ?? true,
      );
      setOverrideSummary(
        nextItem.assessment.stored_score?.analysis_overridden
          ? (nextItem.assessment.stored_score.analysis?.summary ?? "")
          : "",
      );
    }
  };

  const handleSaveConsolidation = async (validate: boolean) => {
    if (!current) return;
    setSavingScore(true);
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: current.session_id,
          player_id: player.id,
          analysis_enabled: analysisEnabled,
          coach_comment: coachComment.trim() || null,
          override_summary: overrideSummary.trim() || null,
          validate,
          reason:
            current.assessment.session.status === "finalized"
              ? "Mise à jour de l'appréciation par l'administrateur"
              : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Impossible d'enregistrer.");
        return;
      }
      toast.success(
        validate
          ? "Évaluation du joueur consolidée et validée."
          : "Appréciation et paramètres d'analyse enregistrés.",
      );
      router.refresh();
    } finally {
      setSavingScore(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!current) return;
    setGeneratingPdf(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: current.session_id,
          player_id: player.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || (body?.errors && body.errors.length > 0)) {
        toast.error(
          body?.errors?.[0]?.error ?? body?.error ?? "Échec de génération du PDF.",
        );
        return;
      }
      toast.success("Rapport PDF généré et archivé dans l'espace privé.");
      router.refresh();
    } finally {
      setGeneratingPdf(false);
    }
  };

  const primaryGuardian =
    guardians.find((g) => g.is_primary)?.guardian ?? guardians[0]?.guardian ?? null;

  // Snapshots pour le comparateur d'historique
  const toSnapshot = (b: SessionHistoryBundle): HistoricalSessionSnapshot => {
    const dom = (code: string) =>
      b.assessment.total.domains.find((d) => d.domain === code)?.points ?? null;
    return {
      session_id: b.session_id,
      session_name: b.session_name,
      session_date: b.session_date,
      category_id: b.assessment.category.id,
      category_code: b.assessment.category.code,
      category_label: b.assessment.category.label,
      age_at_session: b.assessment.age_at_session,
      rubric_version_ids: b.assessment.rubric_version_ids,
      total: b.assessment.total.total,
      athletic: dom("athletic"),
      technical: dom("technical"),
      physical: dom("physical"),
      game_intelligence: dom("game_intelligence"),
      team_spirit: dom("team_spirit"),
    };
  };

  const compared =
    history.find(
      (h) => h.session_id === compareSessionId && h.session_id !== current?.session_id,
    ) ?? null;

  const comparability =
    current && compared
      ? checkHistoryComparability(toSnapshot(compared), toSnapshot(current))
      : null;

  const fullName = `${player.last_name.toUpperCase()} ${player.first_name}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/joueurs"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800 hover:underline mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Retour à la liste des joueurs</span>
        </Link>

        <div className="pitch-pattern rounded-3xl p-6 text-white shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-white/15 px-2.5 py-0.5 font-mono text-xs font-bold text-sky-200">
                {player.player_number}
              </span>
              <DemoTag isDemo={player.is_demo} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mt-1">{fullName}</h1>
            <p className="text-sm text-white/85 mt-1">
              Né(e) le {formatDateFr(player.birth_date)}
              {player.sex ? ` • ${SEX_LABELS[player.sex]}` : ""}
              {player.preferred_position ? ` • ${player.preferred_position}` : ""}
              {player.dominant_foot
                ? ` • Pied ${DOMINANT_FOOT_LABELS[player.dominant_foot]}`
                : ""}
            </p>
          </div>

          {current && isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={generatingPdf}
                onClick={handleGeneratePdf}
              >
                <FileText className="h-4 w-4" />
                <span>
                  {generatingPdf
                    ? "Génération PDF..."
                    : current.latest_report
                      ? "Regénérer le PDF"
                      : "Générer le rapport PDF"}
                </span>
              </Button>

              {current.latest_report ? (
                <>
                  <a
                    href={`/api/reports/${current.latest_report.id}/download?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20"
                  >
                    <Eye className="h-4 w-4" />
                    <span>Aperçu</span>
                  </a>
                  <a
                    href={`/api/reports/${current.latest_report.id}/download`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20"
                  >
                    <Download className="h-4 w-4" />
                    <span>PDF</span>
                  </a>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => setShareOpen(true)}
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Partager au parent</span>
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Responsables légaux (Admin) */}
      {isAdmin && guardians.length > 0 ? (
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            Responsable(s) légal(aux) & consentement
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            {guardians.map((g) => (
              <div
                key={g.guardian.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950"
              >
                <p className="font-bold">
                  {g.guardian.last_name} {g.guardian.first_name ?? ""}{" "}
                  {g.relationship ? `(${g.relationship})` : ""}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Tél : {g.guardian.phone}
                  {g.guardian.whatsapp ? ` • WhatsApp : ${g.guardian.whatsapp}` : ""}
                  {g.guardian.email ? ` • ${g.guardian.email}` : ""}
                </p>
              </div>
            ))}
            <div className="ml-auto self-center">
              <Badge variant={player.consent_obtained ? "success" : "warning"}>
                {player.consent_obtained
                  ? "Consentement parental enregistré"
                  : "Consentement parental en attente"}
              </Badge>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Contenu d'évaluation par session */}
      {!current ? (
        <EmptyState
          title="Aucune participation à une session d'évaluation"
          description="Inscrivez ce joueur à une session (ex: Test d'Aptitude du 28 novembre 2026) pour saisir ses performances et générer son profil."
        />
      ) : (
        <>
          {/* Sélecteur de session dans l'historique */}
          <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-violet-800 dark:text-sky-300">
                Session consultée ({history.length} session(s) dans l&apos;historique)
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Catégorie à la date du test :{" "}
                <strong>{current.assessment.category.label}</strong>
                {current.assessment.age_at_session !== null
                  ? ` • Âge exact au jour du test : ${current.assessment.age_at_session} ans`
                  : ""}
              </p>
            </div>
            <div className="w-full sm:w-88">
              <Select
                value={current.session_id}
                onChange={(e) => handleSelectSession(e.target.value)}
              >
                {history.map((h) => (
                  <option key={h.session_id} value={h.session_id}>
                    {formatDateFr(h.session_date)} — {h.session_name}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          {current.latest_report?.status === "outdated" ? (
            <AlertBanner
              variant="warning"
              title="Rapport PDF à regénérer"
            >
              Une évaluation ou appréciation a été modifiée depuis la dernière édition
              du PDF. Cliquez sur <strong>Regénérer le PDF</strong> pour mettre le
              document à jour.
            </AlertBanner>
          ) : null}

          {current.assessment.total.warnings.length > 0 ? (
            <AlertBanner variant="warning" title="Points d'attention sur les barèmes">
              <ul className="list-disc pl-4 space-y-0.5">
                {current.assessment.total.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </AlertBanner>
          ) : null}

          {/* Score global + Profils */}
          <div className="grid lg:grid-cols-3 gap-5">
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">
                  Score global ({current.assessment.category.label})
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-violet-800 dark:text-sky-300">
                    {current.assessment.total.total !== null
                      ? current.assessment.total.total.toFixed(1)
                      : `${current.assessment.total.partial_total.toFixed(1)}*`}
                  </span>
                  <span className="text-base font-semibold text-slate-500">
                    / {current.assessment.total.max_total}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  {current.assessment.total.complete
                    ? current.assessment.analysis.interpretation
                    : `*Score partiel (${Math.round(current.assessment.total.completion_ratio * 100)} % des ateliers complets).`}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Profil(s) sportif(s) descriptif(s)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {current.assessment.analysis.profiles.map((prof) => (
                    <Badge key={prof} variant="sky">
                      {prof}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Profil Radar & Équilibre par Domaine</CardTitle>
                <CardDescription>
                  Normalisation graphique sur 100 • Scores bruts conservés (/40, /30,
                  /10, /15, /5)
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4 items-center">
                <PlayerRadarChart domains={current.assessment.total.domains} />
                <DomainBarsChart domains={current.assessment.total.domains} />
              </CardContent>
            </Card>
          </div>

          {/* Détail des 12 exercices */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Détail des ateliers évalués</CardTitle>
              <CardDescription>
                Résultats bruts, tentatives, scores retenus et observations factuelles
              </CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3">Atelier</th>
                    <th className="px-4 py-3">Protocole catégorie</th>
                    <th className="px-4 py-3">Résultats & Tentatives</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3">Observations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {current.assessment.entries.map((entry) => (
                    <tr key={entry.test_id}>
                      <td className="px-4 py-3 font-bold">
                        <span className="text-violet-800 dark:text-sky-300">
                          {entry.test_code}
                        </span>{" "}
                        — {entry.test_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {entry.protocol_text ?? "—"}
                        {entry.rubric_version_number ? (
                          <span className="ml-1 text-[11px] text-slate-400">
                            (Barème v{entry.rubric_version_number})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {entry.result?.components.length ? (
                          <div className="space-y-0.5">
                            {entry.result.components.map((c) => (
                              <div key={c.key}>
                                <span className="font-semibold">{c.label} :</span>{" "}
                                {c.retained_value !== null
                                  ? `${c.retained_value} ${c.unit ?? ""}`
                                  : "Non renseigné"}
                                {c.level_label ? ` (${c.level_label})` : ""}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">Non saisi</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        {entry.result?.points !== null &&
                        entry.result?.points !== undefined ? (
                          <span className="text-violet-800 dark:text-sky-300">
                            {entry.result.points.toFixed(1)} / {entry.max_points}
                          </span>
                        ) : entry.result?.status === "unconfigured" ? (
                          <Badge variant="warning">Sans seuils</Badge>
                        ) : (
                          <span className="text-slate-400">— / {entry.max_points}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {entry.comment || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Analyse automatique & Validation Admin */}
          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Analyse & Recommandations ({current.assessment.category.label})</CardTitle>
                <CardDescription>
                  Moteur de règles déterministe fondé exclusivement sur les résultats
                  observés
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {current.assessment.analysis.summary}
                </p>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 dark:bg-emerald-950/30 dark:border-emerald-900">
                    <p className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300 mb-1.5">
                      Points forts (≥ 75 %)
                    </p>
                    {current.assessment.analysis.strengths.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {current.assessment.analysis.strengths.map((s, i) => (
                          <li key={i}>• {s.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-500">Aucun à ce stade.</p>
                    )}
                  </div>

                  <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 dark:bg-orange-950/30 dark:border-orange-900">
                    <p className="text-xs font-bold uppercase text-orange-800 dark:text-orange-300 mb-1.5">
                      Axes de progression (&lt; 50 %)
                    </p>
                    {current.assessment.analysis.improvements.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {current.assessment.analysis.improvements.map((s, i) => (
                          <li key={i}>• {s.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-500">Aucun axe critique.</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1.5">
                    Pistes d&apos;entraînement adaptées à l&apos;âge
                  </p>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    {current.assessment.analysis.recommendations.map((r, i) => (
                      <li key={i}>
                        {i + 1}. {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {isAdmin ? (
              <Card>
                <CardHeader>
                  <CardTitle>Validation & Appréciation du Responsable</CardTitle>
                  <CardDescription>
                    Personnalisez le commentaire du rapport PDF ou désactivez l&apos;analyse
                    automatique si souhaité
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={analysisEnabled}
                      onChange={(e) => setAnalysisEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-800"
                    />
                    <span>
                      Inclure l&apos;analyse automatique (points forts, axes et recommandations)
                      dans le rapport PDF
                    </span>
                  </label>

                  <div>
                    <Label>Commentaire du coach / responsable technique (Page 4 du PDF)</Label>
                    <Textarea
                      rows={3}
                      value={coachComment}
                      onChange={(e) => setCoachComment(e.target.value)}
                      placeholder="Observation bienveillante et factuelle destinée au parent..."
                    />
                  </div>

                  <div>
                    <Label>
                      Remplacer la synthèse automatique (facultatif — laisser vide pour
                      conserver le texte généré)
                    </Label>
                    <Textarea
                      rows={2}
                      value={overrideSummary}
                      onChange={(e) => setOverrideSummary(e.target.value)}
                      placeholder="Synthèse personnalisée..."
                    />
                  </div>

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <Button
                      variant="outline"
                      disabled={savingScore}
                      onClick={() => handleSaveConsolidation(false)}
                    >
                      <Save className="h-4 w-4" />
                      <span>Enregistrer le brouillon</span>
                    </Button>
                    <Button
                      variant="success"
                      disabled={savingScore}
                      onClick={() => handleSaveConsolidation(true)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Valider l&apos;évaluation du joueur</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Comparaison historique multi-sessions (Section 19) */}
          {history.length >= 2 ? (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GitCompare className="h-5 w-5 text-violet-700" />
                    <span>Évolution entre deux sessions d&apos;évaluation</span>
                  </CardTitle>
                  <CardDescription>
                    Contrôle automatique de compatibilité des catégories et des versions de
                    barèmes
                  </CardDescription>
                </div>
                <div className="w-full sm:w-80">
                  <Select
                    value={compareSessionId}
                    onChange={(e) => setCompareSessionId(e.target.value)}
                  >
                    {history
                      .filter((h) => h.session_id !== current.session_id)
                      .map((h) => (
                        <option key={h.session_id} value={h.session_id}>
                          Comparer avec : {formatDateFr(h.session_date)} ({h.assessment.category.label})
                        </option>
                      ))}
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {comparability && !comparability.directly_comparable ? (
                  <div className="rounded-xl border border-orange-300 bg-orange-50 p-3.5 text-xs text-orange-950 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">
                        Comparaison directe non pertinente — protocoles ou barèmes différents :
                      </p>
                      <ul className="list-disc pl-4 mt-1">
                        {comparability.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}

                {compared ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-600 dark:bg-slate-950">
                        <tr>
                          <th className="px-3 py-2.5">Domaine</th>
                          <th className="px-3 py-2.5">
                            {formatDateFr(compared.session_date)} ({compared.assessment.category.label})
                          </th>
                          <th className="px-3 py-2.5">
                            {formatDateFr(current.session_date)} ({current.assessment.category.label})
                          </th>
                          <th className="px-3 py-2.5">Écart</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {current.assessment.total.domains.map((dom) => {
                          const prevDom = compared.assessment.total.domains.find(
                            (d) => d.domain === dom.domain,
                          );
                          const delta =
                            comparability?.directly_comparable &&
                            dom.points !== null &&
                            prevDom?.points !== null &&
                            prevDom?.points !== undefined
                              ? dom.points - prevDom.points
                              : null;

                          return (
                            <tr key={dom.domain}>
                              <td className="px-3 py-2.5 font-semibold">{dom.label}</td>
                              <td className="px-3 py-2.5 font-mono">
                                {prevDom?.points !== null && prevDom?.points !== undefined
                                  ? `${prevDom.points.toFixed(1)} / ${dom.max_points}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2.5 font-mono font-bold text-violet-800 dark:text-sky-300">
                                {dom.points !== null
                                  ? `${dom.points.toFixed(1)} / ${dom.max_points}`
                                  : "—"}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs">
                                {delta !== null ? (
                                  <span
                                    className={
                                      delta >= 0
                                        ? "text-emerald-700 font-bold"
                                        : "text-orange-700 font-bold"
                                    }
                                  >
                                    {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Non comparable</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {current.latest_report ? (
            <ShareReportModal
              open={shareOpen}
              onClose={() => setShareOpen(false)}
              reportId={current.latest_report.id}
              fileName={current.latest_report.file_name}
              playerFullName={fullName}
              seasonLabel={current.season_label}
              messageTemplate={parentMessageTemplate}
              guardianWhatsapp={primaryGuardian?.whatsapp}
              guardianPhone={primaryGuardian?.phone}
              guardianEmail={primaryGuardian?.email}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
