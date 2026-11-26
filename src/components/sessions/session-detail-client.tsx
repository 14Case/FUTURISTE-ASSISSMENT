"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CloudDownload,
  Play,
  Lock,
  CheckCircle2,
  UserPlus,
  Trash2,
  Timer,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AssessmentCategory,
  AssessmentSession,
  AssessmentTest,
  Player,
  Profile,
  SessionStatus,
} from "@/lib/types/database";
import { preloadSessionForOffline } from "@/lib/offline/sync";
import {
  calculateAgeAtDate,
  formatDateFr,
  SESSION_STATUS_LABELS,
  suggestCategoryForAge,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";

export interface SessionPlayerRow {
  id: string;
  player_id: string;
  category_id: string;
  bib_number: string | null;
  status: string;
  player: Pick<
    Player,
    "id" | "player_number" | "last_name" | "first_name" | "birth_date" | "is_demo"
  >;
  completed_tests: number;
}

export interface AssignmentRow {
  id: string;
  user_id: string;
  test_id: string | null;
  category_id: string | null;
  user: Pick<Profile, "id" | "full_name" | "email" | "role"> | null;
}

export function SessionDetailClient({
  session,
  seasonLabel,
  categories,
  activeTests,
  sessionPlayers,
  availablePlayers,
  assignments,
  coaches,
  isAdmin,
}: {
  session: AssessmentSession;
  seasonLabel: string;
  categories: AssessmentCategory[];
  activeTests: AssessmentTest[];
  sessionPlayers: SessionPlayerRow[];
  availablePlayers: Pick<
    Player,
    "id" | "player_number" | "last_name" | "first_name" | "birth_date" | "category_id"
  >[];
  assignments: AssignmentRow[];
  coaches: Pick<Profile, "id" | "full_name" | "email" | "role">[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [preloading, setPreloading] = React.useState(false);
  const [statusDialog, setStatusDialog] = React.useState<{
    nextStatus: SessionStatus;
    requireReason: boolean;
    title: string;
    description: string;
  } | null>(null);
  const [loadingAction, setLoadingAction] = React.useState(false);

  // Ajout individuel joueur
  const [selectedPlayerId, setSelectedPlayerId] = React.useState("");
  const [selectedCategoryId, setSelectedCategoryId] = React.useState(
    categories[0]?.id ?? "",
  );
  const [bibNumber, setBibNumber] = React.useState("");

  // Affectation encadreur
  const [assignCoachId, setAssignCoachId] = React.useState(coaches[0]?.id ?? "");
  const [assignTestId, setAssignTestId] = React.useState("");
  const [assignCatId, setAssignCatId] = React.useState("");

  const [playerViewFilter, setPlayerViewFilter] = React.useState<
    "all" | "complete" | "incomplete"
  >("all");

  const isLocked =
    session.status === "finalized" || session.status === "archived";

  const handlePreloadOffline = async () => {
    setPreloading(true);
    try {
      const bundle = await preloadSessionForOffline(session.id);
      toast.success(
        `Session préchargée pour le mode hors ligne (${bundle.session_players.length} joueurs, ${bundle.tests.length} ateliers).`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Échec du préchargement.",
      );
    } finally {
      setPreloading(false);
    }
  };

  const handleStatusConfirm = async (reason?: string) => {
    if (!statusDialog) return;
    setLoadingAction(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusDialog.nextStatus,
          reason: reason ?? null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Transition de statut refusée.");
        return;
      }
      toast.success(
        `Statut de la session passé à « ${SESSION_STATUS_LABELS[statusDialog.nextStatus]} ».`,
      );
      setStatusDialog(null);
      router.refresh();
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAddSinglePlayer = async () => {
    if (!selectedPlayerId || !selectedCategoryId) return;
    const res = await fetch(`/api/sessions/${session.id}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        players: [
          {
            player_id: selectedPlayerId,
            category_id: selectedCategoryId,
            bib_number: bibNumber.trim() || null,
          },
        ],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Inscription refusée.");
      return;
    }
    toast.success("Joueur inscrit à la session.");
    setSelectedPlayerId("");
    setBibNumber("");
    router.refresh();
  };

  const handleEnrollAllMatching = async () => {
    const catIds = new Set(categories.map((c) => c.id));
    const alreadyIds = new Set(sessionPlayers.map((sp) => sp.player_id));

    const batch = availablePlayers
      .filter((p) => !alreadyIds.has(p.id))
      .map((p) => {
        const suggested =
          suggestCategoryForAge(categories, p.birth_date, session.session_date) ??
          categories.find((c) => c.id === p.category_id) ??
          null;
        if (!suggested || !catIds.has(suggested.id)) return null;
        return {
          player_id: p.id,
          category_id: suggested.id,
          bib_number: null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (batch.length === 0) {
      toast.info("Aucun nouveau joueur éligible à ajouter.");
      return;
    }

    const res = await fetch(`/api/sessions/${session.id}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ players: batch }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Inscription en lot impossible.");
      return;
    }
    toast.success(`${batch.length} joueur(s) inscrit(s) avec leur catégorie à la date du test.`);
    router.refresh();
  };

  const handleRemovePlayer = async (playerId: string) => {
    const res = await fetch(
      `/api/sessions/${session.id}/players?player_id=${playerId}`,
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Retrait impossible.");
      return;
    }
    toast.success(
      body.mode === "withdrawn"
        ? "Joueur marqué comme retiré (évaluations existantes préservées)."
        : "Joueur retiré de la session.",
    );
    router.refresh();
  };

  const handleAddAssignment = async () => {
    if (!assignCoachId) return;
    const res = await fetch(`/api/sessions/${session.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: assignCoachId,
        test_id: assignTestId || null,
        category_id: assignCatId || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Affectation impossible.");
      return;
    }
    toast.success("Encadreur affecté.");
    router.refresh();
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    const res = await fetch(
      `/api/sessions/${session.id}/assignments?assignment_id=${assignmentId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      toast.success("Affectation retirée.");
      router.refresh();
    }
  };

  const handleGenerateAllReports = async () => {
    if (sessionPlayers.length === 0) return;
    setLoadingAction(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          player_ids: sessionPlayers.map((sp) => sp.player_id),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Erreur lors de la génération groupée.");
        return;
      }
      toast.success(
        `${body.reports?.length ?? 0} rapport(s) PDF généré(s) pour la session.`,
      );
      router.refresh();
    } finally {
      setLoadingAction(false);
    }
  };

  const totalTests = activeTests.length;
  const expectedTotal = sessionPlayers.length * totalTests;
  const doneTotal = sessionPlayers.reduce((s, p) => s + p.completed_tests, 0);
  const progressPct =
    expectedTotal > 0 ? Math.round((doneTotal / expectedTotal) * 100) : 0;

  const completePlayersCount = sessionPlayers.filter(
    (p) => totalTests > 0 && p.completed_tests >= totalTests,
  ).length;
  const incompletePlayersCount = sessionPlayers.length - completePlayersCount;

  const displayedPlayers = sessionPlayers.filter((p) => {
    const isComplete = totalTests > 0 && p.completed_tests >= totalTests;
    if (playerViewFilter === "complete") return isComplete;
    if (playerViewFilter === "incomplete") return !isComplete;
    return true;
  });

  const catMap = new Map(categories.map((c) => [c.id, c.label]));
  const testMap = new Map(
    activeTests.map((t) => [t.id, `${t.code} — ${t.name}`]),
  );
  const enrolledIds = new Set(sessionPlayers.map((sp) => sp.player_id));
  const unenrolledPlayers = availablePlayers.filter(
    (p) => !enrolledIds.has(p.id),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800 hover:underline mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Toutes les sessions</span>
        </Link>

        <div className="pitch-pattern rounded-3xl p-6 text-white shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="sky">Saison {seasonLabel}</Badge>
              <Badge
                variant={
                  session.status === "in_progress"
                    ? "success"
                    : session.status === "finalized"
                      ? "violet"
                      : "warning"
                }
              >
                {SESSION_STATUS_LABELS[session.status] ?? session.status}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mt-2">
              {session.name}
            </h1>
            <p className="text-sm text-white/85 mt-1">
              {formatDateFr(session.session_date)}
              {session.start_time ? ` • Début ${session.start_time.slice(0, 5)}` : ""}
              {session.location ? ` • ${session.location}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={preloading}
              onClick={handlePreloadOffline}
            >
              <CloudDownload className="h-4 w-4" />
              <span>
                {preloading
                  ? "Préchargement..."
                  : "Précharger hors ligne"}
              </span>
            </Button>

            <Link
              href={`/terrain?session_id=${session.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600"
            >
              <Timer className="h-4 w-4" />
              <span>Ouvrir la saisie terrain</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Contrôle du cycle de vie de la session (Admin) */}
      {isAdmin ? (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm">
            <ShieldCheck className="h-5 w-5 text-violet-700 shrink-0" />
            <span>
              <strong>Pilotage du statut :</strong>{" "}
              {session.status === "draft"
                ? "Ouvrez la session (« En cours ») pour autoriser la saisie par les encadreurs sur le terrain."
                : session.status === "in_progress"
                  ? "La saisie terrain est ouverte aux encadreurs affectés."
                  : session.status === "to_validate"
                    ? "La saisie encadreur est suspendue pendant la vérification des résultats."
                    : "Session verrouillée : toute modification exige un motif enregistré dans l'audit."}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            {session.status === "draft" ? (
              <Button
                variant="success"
                size="sm"
                onClick={() =>
                  setStatusDialog({
                    nextStatus: "in_progress",
                    requireReason: false,
                    title: "Démarrer la session sur le terrain ?",
                    description:
                      "Les encadreurs affectés pourront immédiatement saisir les performances de leurs ateliers.",
                  })
                }
              >
                <Play className="h-3.5 w-3.5" />
                <span>Passer « En cours »</span>
              </Button>
            ) : null}

            {session.status === "in_progress" ? (
              <Button
                variant="warning"
                size="sm"
                onClick={() =>
                  setStatusDialog({
                    nextStatus: "to_validate",
                    requireReason: false,
                    title: "Passer la session « À valider » ?",
                    description:
                      "La saisie des encadreurs sera suspendue afin de vous permettre de contrôler les scores avant finalisation.",
                  })
                }
              >
                <span>Clôturer la saisie (À valider)</span>
              </Button>
            ) : null}

            {(session.status === "in_progress" ||
              session.status === "to_validate") && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  setStatusDialog({
                    nextStatus: "finalized",
                    requireReason: false,
                    title: "Finaliser officiellement la session ?",
                    description:
                      "Les scores consolidés seront figés et la session sera protégée contre toute modification libre.",
                  })
                }
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Finaliser la session</span>
              </Button>
            )}

            {session.status === "finalized" ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loadingAction}
                  onClick={handleGenerateAllReports}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Générer tous les PDF</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setStatusDialog({
                      nextStatus: "to_validate",
                      requireReason: true,
                      title: "Réouvrir une session finalisée (action auditée)",
                      description:
                        "Cette correction après finalisation sera tracée dans le journal d'audit avec votre motif.",
                    })
                  }
                >
                  <span>Réouvrir pour correction</span>
                </Button>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Progression globale */}
      <Card>
        <CardHeader>
          <CardTitle>
            Progression : {doneTotal} / {expectedTotal} évaluations ({progressPct} %)
          </CardTitle>
          <CardDescription>
            {sessionPlayers.length} joueur(s) inscrit(s) • {completePlayersCount}{" "}
            complet(s) • {incompletePlayersCount} incomplet(s) sur {totalTests} ateliers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-700 to-emerald-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Joueurs inscrits + Affectations encadreurs */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>Joueurs participants ({sessionPlayers.length})</CardTitle>
                <CardDescription>
                  Catégorie figée à la date de la session ({formatDateFr(session.session_date)})
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                {(["all", "incomplete", "complete"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPlayerViewFilter(f)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                      playerViewFilter === f
                        ? "bg-violet-800 text-white"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {f === "all"
                      ? "Tous"
                      : f === "incomplete"
                        ? `Incomplets (${incompletePlayersCount})`
                        : `Complets (${completePlayersCount})`}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {isAdmin && !isLocked ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase text-slate-600">
                      Ajouter des joueurs à cette session
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleEnrollAllMatching}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Inscrire tous les joueurs actifs des catégories</span>
                    </Button>
                  </div>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <Select
                      value={selectedPlayerId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setSelectedPlayerId(pid);
                        const pl = unenrolledPlayers.find((x) => x.id === pid);
                        if (pl) {
                          const sug = suggestCategoryForAge(
                            categories,
                            pl.birth_date,
                            session.session_date,
                          );
                          if (sug) setSelectedCategoryId(sug.id);
                        }
                      }}
                      className="sm:col-span-2"
                    >
                      <option value="">Choisir un joueur...</option>
                      {unenrolledPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.player_number} — {p.last_name} {p.first_name}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                    <div className="flex gap-1.5">
                      <Input
                        placeholder="Dossard"
                        value={bibNumber}
                        onChange={(e) => setBibNumber(e.target.value)}
                      />
                      <Button
                        size="sm"
                        onClick={handleAddSinglePlayer}
                        disabled={!selectedPlayerId}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2.5 pr-3">N° / Dossard</th>
                      <th className="py-2.5 px-3">Joueur</th>
                      <th className="py-2.5 px-3">Catégorie (Âge test)</th>
                      <th className="py-2.5 px-3">Avancement</th>
                      <th className="py-2.5 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {displayedPlayers.map((sp) => {
                      const ageTest = calculateAgeAtDate(
                        sp.player.birth_date,
                        session.session_date,
                      );
                      const complete =
                        totalTests > 0 && sp.completed_tests >= totalTests;

                      return (
                        <tr key={sp.id}>
                          <td className="py-2.5 pr-3 font-mono text-xs font-bold text-violet-800 dark:text-sky-300">
                            {sp.player.player_number}
                            {sp.bib_number ? ` (#${sp.bib_number})` : ""}
                          </td>
                          <td className="py-2.5 px-3 font-bold">
                            <Link
                              href={`/joueurs/${sp.player_id}`}
                              className="hover:text-violet-800"
                            >
                              {sp.player.last_name.toUpperCase()}{" "}
                              {sp.player.first_name}
                            </Link>
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            <Badge variant="violet">
                              {catMap.get(sp.category_id) ?? "—"}
                            </Badge>
                            {ageTest !== null ? (
                              <span className="ml-1.5 text-slate-500">
                                ({ageTest} ans)
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            {complete ? (
                              <Badge variant="success">
                                <CheckCircle2 className="h-3 w-3" />
                                Complet ({sp.completed_tests}/{totalTests})
                              </Badge>
                            ) : (
                              <Badge variant="warning">
                                {sp.completed_tests} / {totalTests} ateliers
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            {isAdmin && !isLocked ? (
                              <button
                                type="button"
                                onClick={() => handleRemovePlayer(sp.player_id)}
                                title="Retirer de la session"
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Affectation des encadreurs */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Encadreurs affectés ({assignments.length})</CardTitle>
              <CardDescription>
                Contrôle les droits de saisie RLS par atelier et catégorie
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAdmin ? (
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div>
                    <Label>Encadreur</Label>
                    <Select
                      value={assignCoachId}
                      onChange={(e) => setAssignCoachId(e.target.value)}
                    >
                      <option value="">Sélectionner...</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name || c.email} ({c.role})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Atelier (vide = tous les ateliers)</Label>
                    <Select
                      value={assignTestId}
                      onChange={(e) => setAssignTestId(e.target.value)}
                    >
                      <option value="">Tous les ateliers</option>
                      {activeTests.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} — {t.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Catégorie (vide = toutes les catégories)</Label>
                    <Select
                      value={assignCatId}
                      onChange={(e) => setAssignCatId(e.target.value)}
                    >
                      <option value="">Toutes les catégories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!assignCoachId}
                    onClick={handleAddAssignment}
                  >
                    Affecter l&apos;encadreur
                  </Button>
                </div>
              ) : null}

              <div className="space-y-2">
                {assignments.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Aucun encadreur affecté pour le moment.
                  </p>
                ) : (
                  assignments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-800"
                    >
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {a.user?.full_name || a.user?.email || "Encadreur"}
                        </p>
                        <p className="text-slate-500">
                          {a.test_id
                            ? (testMap.get(a.test_id) ?? "Atelier")
                            : "Tous ateliers"}{" "}
                          •{" "}
                          {a.category_id
                            ? (catMap.get(a.category_id) ?? "Catégorie")
                            : "Toutes catégories"}
                        </p>
                      </div>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignment(a.id)}
                          className="rounded-lg p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(statusDialog)}
        onClose={() => setStatusDialog(null)}
        onConfirm={handleStatusConfirm}
        loading={loadingAction}
        requireReason={Boolean(statusDialog?.requireReason)}
        variant={
          statusDialog?.nextStatus === "finalized" ? "primary" : "warning"
        }
        title={statusDialog?.title ?? ""}
        description={statusDialog?.description ?? ""}
        confirmLabel="Confirmer"
      />
    </div>
  );
}
