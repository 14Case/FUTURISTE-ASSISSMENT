"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Download,
  Eye,
  Share2,
  RefreshCw,
  FolderArchive,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateFr } from "@/lib/utils";
import { ShareReportModal } from "@/components/reports/share-report-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, Label } from "@/components/ui/input";
import { DemoTag, EmptyState } from "@/components/ui/states";

export interface ReportRowItem {
  id: string;
  session_id: string;
  player_id: string;
  file_name: string;
  version: number;
  status: "generated" | "outdated" | "archived";
  file_size: number | null;
  generated_at: string;
  player: {
    id: string;
    player_number: string;
    last_name: string;
    first_name: string;
    is_demo: boolean;
  };
  guardian: {
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
}

export interface SessionParticipantLite {
  session_id: string;
  player_id: string;
  player_label: string;
}

export function ReportsCenterClient({
  sessions,
  reports,
  participants,
  parentMessageTemplate,
}: {
  sessions: { id: string; name: string; session_date: string; season_label: string }[];
  reports: ReportRowItem[];
  participants: SessionParticipantLite[];
  parentMessageTemplate: string;
}) {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = React.useState(
    sessions[0]?.id ?? "",
  );
  const [generatingBatch, setGeneratingBatch] = React.useState(false);
  const [shareTarget, setShareTarget] = React.useState<ReportRowItem | null>(
    null,
  );

  const currentSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
  const sessionReports = reports.filter(
    (r) => r.session_id === selectedSessionId && r.status !== "archived",
  );
  const sessionParticipants = participants.filter(
    (p) => p.session_id === selectedSessionId,
  );

  const generateForPlayers = async (playerIds: string[]) => {
    if (!selectedSessionId || playerIds.length === 0) return;
    setGeneratingBatch(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: selectedSessionId,
          player_ids: playerIds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Échec de génération.");
        return;
      }
      toast.success(
        `${body.reports?.length ?? 0} rapport(s) PDF généré(s) et stocké(s) en espace privé.`,
      );
      router.refresh();
    } finally {
      setGeneratingBatch(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Centre des Rapports PDF Individuels
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Format 4 pages maximum • Stockage privé Supabase Storage • Aucun lien
            public permanent.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {sessionParticipants.length > 0 ? (
            <Button
              disabled={generatingBatch}
              onClick={() =>
                generateForPlayers(sessionParticipants.map((p) => p.player_id))
              }
            >
              <Sparkles className="h-4 w-4" />
              <span>
                {generatingBatch
                  ? "Génération en cours..."
                  : `Générer toute la session (${sessionParticipants.length})`}
              </span>
            </Button>
          ) : null}

          {sessionReports.length > 0 ? (
            <a
              href={`/api/reports/archive?session_id=${selectedSessionId}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <FolderArchive className="h-4 w-4 text-violet-700" />
              <span>Exporter l&apos;archive ZIP ({sessionReports.length} PDF)</span>
            </a>
          ) : null}
        </div>
      </div>

      <Card className="p-4">
        <div className="max-w-md">
          <Label>Filtrer par session</Label>
          <Select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDateFr(s.session_date)} — {s.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {sessionReports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun rapport PDF généré pour cette session"
          description={
            sessionParticipants.length > 0
              ? `Cliquez sur « Générer toute la session » ci-dessus pour produire les rapports des ${sessionParticipants.length} joueurs inscrits.`
              : "Inscrivez d'abord des joueurs à cette session puis saisissez leurs performances."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3.5">Joueur</th>
                  <th className="px-4 py-3.5">Fichier PDF</th>
                  <th className="px-4 py-3.5">Version & État</th>
                  <th className="px-4 py-3.5">Généré le</th>
                  <th className="px-4 py-3.5 text-right">Actions & Partage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessionReports.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3.5 font-bold">
                      <div className="flex items-center gap-2">
                        <span>
                          {r.player.last_name.toUpperCase()}{" "}
                          {r.player.first_name}
                        </span>
                        <DemoTag isDemo={r.player.is_demo} />
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {r.player.player_number}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {r.file_name}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="violet">v{r.version}</Badge>
                        {r.status === "outdated" ? (
                          <Badge variant="warning">À regénérer</Badge>
                        ) : (
                          <Badge variant="success">À jour</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {formatDateFr(r.generated_at, true)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <a
                          href={`/api/reports/${r.id}/download?inline=1`}
                          target="_blank"
                          rel="noreferrer"
                          title="Prévisualiser"
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <a
                          href={`/api/reports/${r.id}/download`}
                          title="Télécharger"
                          className="rounded-lg p-2 text-violet-800 hover:bg-violet-50 dark:text-sky-300"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => generateForPlayers([r.player_id])}
                          disabled={generatingBatch}
                          title="Regénérer une nouvelle version"
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => setShareTarget(r)}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          <span>Transmettre</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {shareTarget ? (
        <ShareReportModal
          open={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
          reportId={shareTarget.id}
          fileName={shareTarget.file_name}
          playerFullName={`${shareTarget.player.last_name.toUpperCase()} ${shareTarget.player.first_name}`}
          seasonLabel={currentSession?.season_label ?? "2026–2027"}
          messageTemplate={parentMessageTemplate}
          guardianWhatsapp={shareTarget.guardian?.whatsapp}
          guardianPhone={shareTarget.guardian?.phone}
          guardianEmail={shareTarget.guardian?.email}
        />
      ) : null}
    </div>
  );
}
