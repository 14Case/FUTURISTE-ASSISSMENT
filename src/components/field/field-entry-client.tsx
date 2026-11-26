"use client";

import * as React from "react";
import {
  Users,
  User,
  ChevronRight,
  ChevronLeft,
  CloudDownload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Info,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  enqueueEvaluationOp,
  getOfflineDb,
  type OfflineSessionBundle,
  type OutboxOperation,
  type SessionPlayerEntry,
} from "@/lib/offline/db";
import { flushOutbox, preloadSessionForOffline } from "@/lib/offline/sync";
import { scoreTest, suggestEvaluationStatus } from "@/lib/scoring/engine";
import {
  attemptsToTestInput,
  resolveRubricRow,
  toResolved,
  type RubricRow,
} from "@/lib/scoring/resolve";
import type {
  ComponentInput,
  EvaluationStatus,
  MeasuredComponent,
  QualitativeComponent,
} from "@/lib/scoring/types";
import { EVALUATION_STATUS_LABELS, formatDateFr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { AlertBanner, DemoTag, EmptyState } from "@/components/ui/states";

interface SessionSummary {
  id: string;
  name: string;
  session_date: string;
  status: string;
}

interface DraftState {
  status: EvaluationStatus;
  components: ComponentInput[];
  comment: string;
  knownServerVersion: number;
  dirty: boolean;
  syncBadge: "none" | "local" | "synced" | "conflict";
}

function buildInitialComponents(
  rubricComponents: (MeasuredComponent | QualitativeComponent)[],
  existing: ComponentInput[],
): ComponentInput[] {
  const byKey = new Map(existing.map((c) => [c.key, c]));
  return rubricComponents.map((rc) => {
    const prev = byKey.get(rc.key);
    const count = rc.kind === "qualitative" ? 1 : rc.attempts;
    const attempts = Array.from({ length: count }, (_, idx) => ({
      value: prev?.attempts[idx]?.value ?? null,
      penalties: prev?.attempts[idx]?.penalties ?? 0,
      is_valid: prev?.attempts[idx]?.is_valid ?? true,
    }));
    return { key: rc.key, attempts };
  });
}

export function FieldEntryClient({
  initialSessions,
  initialSessionId,
  currentUserId,
  isAdmin,
}: {
  initialSessions: SessionSummary[];
  initialSessionId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [sessions, setSessions] = React.useState<SessionSummary[]>(initialSessions);
  const [selectedSessionId, setSelectedSessionId] = React.useState(
    initialSessionId || initialSessions[0]?.id || "",
  );
  const [bundle, setBundle] = React.useState<OfflineSessionBundle | null>(null);
  const [loadingBundle, setLoadingBundle] = React.useState(false);
  const [mode, setMode] = React.useState<"workshop" | "individual">("workshop");

  const [selectedTestId, setSelectedTestId] = React.useState("");
  const [selectedCategoryId, setSelectedCategoryId] = React.useState("");
  const [selectedPlayerId, setSelectedPlayerId] = React.useState("");

  // Brouillons indexés par `${player_id}:${test_id}`
  const [drafts, setDrafts] = React.useState<Record<string, DraftState>>({});
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  // Chargement des sessions préchargées en IndexedDB si hors connexion
  React.useEffect(() => {
    const loadCachedSessions = async () => {
      try {
        const cached = await getOfflineDb().sessionBundles.toArray();
        if (cached.length > 0 && sessions.length === 0) {
          const list = cached.map((b) => ({
            id: b.session.id,
            name: b.session.name,
            session_date: b.session.session_date,
            status: b.session.status,
          }));
          setSessions(list);
          if (!selectedSessionId && list[0]) {
            setSelectedSessionId(list[0].id);
          }
        }
      } catch {
        // ignore
      }
    };
    loadCachedSessions();
  }, [sessions.length, selectedSessionId]);

  const loadSessionBundle = React.useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    setLoadingBundle(true);
    const db = getOfflineDb();

    try {
      let loaded: OfflineSessionBundle | undefined;
      if (navigator.onLine) {
        try {
          loaded = await preloadSessionForOffline(sessionId, { db });
        } catch {
          loaded = await db.sessionBundles.get(sessionId);
        }
      } else {
        loaded = await db.sessionBundles.get(sessionId);
      }

      if (!loaded) {
        setBundle(null);
        return;
      }

      setBundle(loaded);
      setSelectedTestId((prev) =>
        loaded!.tests.some((t) => t.id === prev)
          ? prev
          : (loaded!.tests[0]?.id ?? ""),
      );
      setSelectedCategoryId((prev) =>
        loaded!.categories.some((c) => c.id === prev)
          ? prev
          : (loaded!.categories[0]?.id ?? ""),
      );
      setSelectedPlayerId((prev) =>
        loaded!.session_players.some((sp) => sp.player_id === prev)
          ? prev
          : (loaded!.session_players[0]?.player_id ?? ""),
      );

      // Hydrater les brouillons à partir du serveur + opérations locales non synchronisées
      const pendingOps = await db.outbox
        .where("session_id")
        .equals(sessionId)
        .and((op) => op.state !== "synced")
        .toArray();

      const pendingMap = new Map<string, OutboxOperation>(
        pendingOps.map((o) => [`${o.player_id}:${o.test_id}`, o]),
      );

      const nextDrafts: Record<string, DraftState> = {};
      for (const ev of loaded.evaluations) {
        const key = `${ev.player_id}:${ev.test_id}`;
        const input = attemptsToTestInput(
          ev.status,
          (ev.attempts ?? []).map((a) => ({
            ...a,
            value: a.value === null ? null : Number(a.value),
          })),
        );
        nextDrafts[key] = {
          status: ev.status,
          components: input.components,
          comment: ev.comment ?? "",
          knownServerVersion: ev.version,
          dirty: false,
          syncBadge: "synced",
        };
      }

      for (const [key, op] of pendingMap.entries()) {
        nextDrafts[key] = {
          status: op.status,
          components: op.components,
          comment: op.comment ?? "",
          knownServerVersion: op.base_version,
          dirty: false,
          syncBadge: op.state === "conflict" ? "conflict" : "local",
        };
      }

      setDrafts(nextDrafts);
    } finally {
      setLoadingBundle(false);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedSessionId) return;
    const timer = window.setTimeout(() => {
      loadSessionBundle(selectedSessionId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedSessionId, loadSessionBundle]);

  // Filtrage des ateliers et catégories autorisés pour l'encadreur connecté
  const allowedTests = React.useMemo(() => {
    if (!bundle) return [];
    if (isAdmin) return bundle.tests;
    const myAssign = bundle.assignments.filter((a) => a.user_id === currentUserId);
    if (myAssign.some((a) => a.test_id === null)) return bundle.tests;
    const ids = new Set(myAssign.map((a) => a.test_id));
    return bundle.tests.filter((t) => ids.has(t.id));
  }, [bundle, isAdmin, currentUserId]);

  const allowedCategories = React.useMemo(() => {
    if (!bundle) return [];
    if (isAdmin) return bundle.categories;
    const myAssign = bundle.assignments.filter((a) => a.user_id === currentUserId);
    if (myAssign.some((a) => a.category_id === null)) return bundle.categories;
    const ids = new Set(myAssign.map((a) => a.category_id));
    return bundle.categories.filter((c) => ids.has(c.id));
  }, [bundle, isAdmin, currentUserId]);

  const currentTest =
    allowedTests.find((t) => t.id === selectedTestId) ?? allowedTests[0] ?? null;

  const filteredPlayers = React.useMemo(() => {
    if (!bundle) return [];
    return bundle.session_players
      .filter((sp) => !selectedCategoryId || sp.category_id === selectedCategoryId)
      .sort((a, b) =>
        a.player.last_name.localeCompare(b.player.last_name, "fr"),
      );
  }, [bundle, selectedCategoryId]);

  const canWriteSession =
    isAdmin || bundle?.session.status === "in_progress";

  const getResolvedRubricFor = React.useCallback(
    (sp: SessionPlayerEntry, testId: string) => {
      if (!bundle) return null;
      const test = bundle.tests.find((t) => t.id === testId);
      if (!test) return null;
      const row = resolveRubricRow(
        bundle.rubrics as unknown as RubricRow[],
        test.id,
        sp.category_id,
        sp.player.sex,
        bundle.sex_field_enabled,
      );
      return toResolved(row, test.code, Number(test.max_points));
    },
    [bundle],
  );

  const getDraftFor = React.useCallback(
    (sp: SessionPlayerEntry, testId: string): DraftState => {
      const key = `${sp.player_id}:${testId}`;
      const resolved = getResolvedRubricFor(sp, testId);
      const existing = drafts[key];
      const comps = resolved
        ? buildInitialComponents(
            resolved.config.components,
            existing?.components ?? [],
          )
        : (existing?.components ?? []);

      return {
        status: existing?.status ?? "pending",
        components: comps,
        comment: existing?.comment ?? "",
        knownServerVersion: existing?.knownServerVersion ?? 0,
        dirty: existing?.dirty ?? false,
        syncBadge: existing?.syncBadge ?? "none",
      };
    },
    [drafts, getResolvedRubricFor],
  );

  const persistEvaluation = async (
    sp: SessionPlayerEntry,
    testId: string,
    nextDraft: DraftState,
  ) => {
    if (!bundle) return;
    if (!canWriteSession) {
      toast.error(
        "Cette session n'est pas ouverte à la saisie encadreur (statut requis : En cours).",
      );
      return;
    }

    const resolved = getResolvedRubricFor(sp, testId);
    const suggestedStatus = suggestEvaluationStatus(resolved, {
      status: nextDraft.status,
      components: nextDraft.components,
    });

    const check = scoreTest(resolved, {
      status: suggestedStatus,
      components: nextDraft.components,
    });

    if (check.status === "invalid") {
      toast.error(check.issues[0]?.message ?? "Valeur saisie hors limites.");
      return;
    }

    const key = `${sp.player_id}:${testId}`;
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...nextDraft,
        status: suggestedStatus,
        dirty: false,
        syncBadge: "local",
      },
    }));

    await enqueueEvaluationOp({
      session_id: bundle.session.id,
      player_id: sp.player_id,
      test_id: testId,
      known_server_version: nextDraft.knownServerVersion,
      status: suggestedStatus,
      components: nextDraft.components,
      comment: nextDraft.comment.trim() || null,
      reason:
        bundle.session.status === "finalized"
          ? "Correction administrateur depuis l'interface terrain"
          : null,
    });

    window.dispatchEvent(new Event("fafc-outbox-updated"));

    if (navigator.onLine) {
      const syncRes = await flushOutbox({ sessionId: bundle.session.id });
      window.dispatchEvent(new Event("fafc-outbox-updated"));
      if (syncRes.applied > 0) {
        // Recharger la version serveur depuis le bundle mis à jour en IndexedDB
        const updatedBundle = await getOfflineDb().sessionBundles.get(
          bundle.session.id,
        );
        const updatedEval = updatedBundle?.evaluations.find(
          (e) => e.player_id === sp.player_id && e.test_id === testId,
        );
        setDrafts((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            knownServerVersion:
              updatedEval?.version ?? prev[key].knownServerVersion + 1,
            syncBadge: "synced",
          },
        }));
      } else if (syncRes.conflicts > 0) {
        setDrafts((prev) => ({
          ...prev,
          [key]: { ...prev[key], syncBadge: "conflict" },
        }));
        toast.warning(
          "Conflit détecté avec une autre saisie : ouvrez Synchronisation pour arbitrer.",
        );
      }
    }
  };

  const updateAttemptValue = (
    sp: SessionPlayerEntry,
    testId: string,
    compKey: string,
    attemptIdx: number,
    patch: { value?: number | null; penalties?: number; is_valid?: boolean },
    autoSave = false,
  ) => {
    const current = getDraftFor(sp, testId);
    const nextComponents = current.components.map((c) => {
      if (c.key !== compKey) return c;
      const nextAttempts = c.attempts.map((a, idx) =>
        idx === attemptIdx ? { ...a, ...patch } : a,
      );
      return { ...c, attempts: nextAttempts };
    });

    const nextDraft: DraftState = {
      ...current,
      status:
        current.status === "absent" || current.status === "exempt"
          ? "in_progress"
          : current.status,
      components: nextComponents,
      dirty: true,
    };

    const key = `${sp.player_id}:${testId}`;
    setDrafts((prev) => ({ ...prev, [key]: nextDraft }));

    if (autoSave) {
      persistEvaluation(sp, testId, nextDraft);
    }
  };

  const currentProtocol = React.useMemo(() => {
    if (!bundle || !currentTest || !selectedCategoryId) return null;
    return (
      bundle.age_rules.find(
        (r) =>
          r.test_id === currentTest.id && r.category_id === selectedCategoryId,
      ) ?? null
    );
  }, [bundle, currentTest, selectedCategoryId]);

  // Joueur sélectionné pour le mode individuel
  const currentIndividualIndex = filteredPlayers.findIndex(
    (p) => p.player_id === selectedPlayerId,
  );
  const currentIndividualPlayer =
    filteredPlayers[currentIndividualIndex >= 0 ? currentIndividualIndex : 0] ??
    null;

  return (
    <div className="space-y-5">
      {/* Barre supérieure de sélection terrain */}
      <div className="pitch-pattern rounded-3xl p-5 sm:p-6 text-white shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-300">
              Interface Bord du Terrain • En ligne & Hors ligne
            </p>
            <h1 className="text-xl sm:text-2xl font-black">
              Saisie des performances
            </h1>
          </div>

          <div className="inline-flex rounded-2xl bg-white/15 p-1">
            <button
              type="button"
              onClick={() => setMode("workshop")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                mode === "workshop"
                  ? "bg-white text-violet-950 shadow-xs"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Mode Atelier</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("individual")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                mode === "individual"
                  ? "bg-white text-violet-950 shadow-xs"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <User className="h-4 w-4" />
              <span>Mode Individuel</span>
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-sky-200 mb-1">
              1. Session
            </label>
            <Select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-white text-slate-900 font-semibold"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDateFr(s.session_date)} — {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-sky-200 mb-1">
              2. Atelier
            </label>
            <Select
              value={currentTest?.id ?? ""}
              onChange={(e) => setSelectedTestId(e.target.value)}
              className="bg-white text-slate-900 font-semibold"
            >
              {allowedTests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name} (/{t.max_points} pts)
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-sky-200 mb-1">
              3. Catégorie
            </label>
            <Select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="bg-white text-slate-900 font-semibold"
            >
              <option value="">Toutes mes catégories</option>
              {allowedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {loadingBundle ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Chargement des ateliers, joueurs et barèmes...
        </Card>
      ) : !bundle ? (
        <EmptyState
          icon={CloudDownload}
          title="Session non préchargée sur cet appareil"
          description="Connectez-vous une première fois au réseau et ouvrez cette session pour la précharger dans le stockage hors ligne."
        />
      ) : !canWriteSession ? (
        <AlertBanner
          variant="warning"
          title="Session en lecture seule pour les encadreurs"
        >
          Le statut actuel de la session est «{" "}
          { bundle.session.status === "draft"
            ? "Brouillon — demandez à l'administrateur de passer la session En cours"
            : bundle.session.status }
          ».
        </AlertBanner>
      ) : null}

      {/* Consignes et protocole de l'atelier */}
      {bundle && currentTest ? (
        <Card className="p-4 bg-sky-50/70 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5 text-xs text-slate-800 dark:text-slate-200">
              <Info className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {currentTest.code} — {currentTest.name} ({currentTest.max_points} pts max)
                  {currentProtocol?.protocol_text
                    ? ` • Protocole : ${currentProtocol.protocol_text}`
                    : ""}
                </p>
                {currentTest.instructions ? (
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                    {currentTest.instructions}
                  </p>
                ) : null}
              </div>
            </div>
            <span className="text-[11px] text-slate-500 shrink-0">
              Préchargé : {formatDateFr(bundle.preloaded_at, true)}
            </span>
          </div>
        </Card>
      ) : null}

      {/* ==================== MODE ATELIER ==================== */}
      {bundle && currentTest && mode === "workshop" ? (
        filteredPlayers.length === 0 ? (
          <EmptyState
            title="Aucun joueur dans cette catégorie pour cette session"
            description="L'administrateur peut inscrire les joueurs depuis la page de gestion de la session."
          />
        ) : (
          <div className="space-y-3">
            {filteredPlayers.map((sp) => {
              const draft = getDraftFor(sp, currentTest.id);
              const resolved = getResolvedRubricFor(sp, currentTest.id);
              const liveResult = scoreTest(resolved, {
                status: draft.status,
                components: draft.components,
              });
              const isExpanded = expandedRow === sp.player_id;

              return (
                <Card key={sp.player_id} className="p-4 sm:p-5 space-y-4">
                  {/* En-tête ligne joueur */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 min-w-12 items-center justify-center rounded-xl bg-violet-100 px-2.5 font-mono text-xs font-black text-violet-900 dark:bg-violet-950 dark:text-sky-300">
                        {sp.bib_number ? `#${sp.bib_number}` : sp.player.player_number}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-black text-slate-900 dark:text-white">
                            {sp.player.last_name.toUpperCase()}{" "}
                            {sp.player.first_name}
                          </p>
                          <DemoTag isDemo={sp.player.is_demo} />
                        </div>
                        <p className="text-xs text-slate-500">
                          {sp.player.player_number} •{" "}
                          {EVALUATION_STATUS_LABELS[draft.status] ?? draft.status}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Statut synchronisation honnête */}
                      {draft.syncBadge === "synced" && !draft.dirty ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" />
                          Synchronisé
                        </Badge>
                      ) : draft.syncBadge === "local" ? (
                        <Badge variant="warning">
                          <Clock className="h-3 w-3" />
                          Local (en attente)
                        </Badge>
                      ) : draft.syncBadge === "conflict" ? (
                        <Badge variant="danger">
                          <AlertTriangle className="h-3 w-3" />
                          Conflit
                        </Badge>
                      ) : null}

                      {/* Score calculé */}
                      <div className="rounded-xl bg-slate-100 px-3 py-1.5 font-mono text-sm font-black text-violet-900 dark:bg-slate-800 dark:text-sky-300">
                        {liveResult.points !== null
                          ? `${liveResult.points.toFixed(1)} / ${currentTest.max_points}`
                          : liveResult.status === "unconfigured"
                            ? "Seuils à définir"
                            : `— / ${currentTest.max_points}`}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : sp.player_id)
                        }
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                      >
                        {isExpanded ? "Masquer obs." : "Obs. / Statut"}
                      </button>
                    </div>
                  </div>

                  {/* Saisie directe rapide des critères */}
                  {resolved ? (
                    <PlayerTestControls
                      sp={sp}
                      testId={currentTest.id}
                      resolvedComponents={resolved.config.components}
                      draft={draft}
                      liveResult={liveResult}
                      disabled={!canWriteSession}
                      onUpdateAttempt={updateAttemptValue}
                      onSave={() => persistEvaluation(sp, currentTest.id, draft)}
                    />
                  ) : (
                    <p className="text-xs text-orange-700">
                      Aucun barème actif trouvé pour cet atelier.
                    </p>
                  )}

                  {/* Zone commentaire & Absent/Dispensé */}
                  {isExpanded ? (
                    <div className="grid sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="sm:col-span-2">
                        <Textarea
                          rows={2}
                          placeholder="Observation factuelle de terrain..."
                          value={draft.comment}
                          disabled={!canWriteSession}
                          onChange={(e) => {
                            const key = `${sp.player_id}:${currentTest.id}`;
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: {
                                ...draft,
                                comment: e.target.value,
                                dirty: true,
                              },
                            }));
                          }}
                        />
                      </div>
                      <div className="flex flex-col justify-between gap-2">
                        <Select
                          value={draft.status}
                          disabled={!canWriteSession}
                          onChange={(e) => {
                            const next: DraftState = {
                              ...draft,
                              status: e.target.value as EvaluationStatus,
                              dirty: true,
                            };
                            persistEvaluation(sp, currentTest.id, next);
                          }}
                        >
                          <option value="pending">En attente</option>
                          <option value="in_progress">En cours</option>
                          <option value="completed">Terminé</option>
                          <option value="absent">Absent</option>
                          <option value="exempt">Dispensé / Blessé</option>
                        </Select>
                        <Button
                          size="sm"
                          disabled={!canWriteSession}
                          onClick={() =>
                            persistEvaluation(sp, currentTest.id, draft)
                          }
                        >
                          <Save className="h-3.5 w-3.5" />
                          <span>Enregistrer</span>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {/* ==================== MODE INDIVIDUEL ==================== */}
      {bundle && currentTest && mode === "individual" && currentIndividualPlayer ? (
        <Card className="p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Select
                value={currentIndividualPlayer.player_id}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="font-bold min-w-64"
              >
                {filteredPlayers.map((p, idx) => (
                  <option key={p.player_id} value={p.player_id}>
                    {idx + 1}/{filteredPlayers.length} — {p.player.player_number}{" "}
                    {p.player.last_name.toUpperCase()} {p.player.first_name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="lg"
                disabled={currentIndividualIndex <= 0}
                onClick={() => {
                  const prev = filteredPlayers[currentIndividualIndex - 1];
                  if (prev) setSelectedPlayerId(prev.player_id);
                }}
              >
                <ChevronLeft className="h-5 w-5" />
                <span>Précédent</span>
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={currentIndividualIndex >= filteredPlayers.length - 1}
                onClick={() => {
                  const next = filteredPlayers[currentIndividualIndex + 1];
                  if (next) setSelectedPlayerId(next.player_id);
                }}
              >
                <span>Joueur suivant</span>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {(() => {
            const draft = getDraftFor(currentIndividualPlayer, currentTest.id);
            const resolved = getResolvedRubricFor(
              currentIndividualPlayer,
              currentTest.id,
            );
            const liveResult = scoreTest(resolved, {
              status: draft.status,
              components: draft.components,
            });

            return (
              <div className="space-y-5">
                {resolved ? (
                  <PlayerTestControls
                    sp={currentIndividualPlayer}
                    testId={currentTest.id}
                    resolvedComponents={resolved.config.components}
                    draft={draft}
                    liveResult={liveResult}
                    disabled={!canWriteSession}
                    onUpdateAttempt={updateAttemptValue}
                    onSave={() =>
                      persistEvaluation(
                        currentIndividualPlayer,
                        currentTest.id,
                        draft,
                      )
                    }
                  />
                ) : null}

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-600 mb-1.5">
                    Observation de l&apos;encadreur sur cet atelier
                  </label>
                  <Textarea
                    rows={3}
                    value={draft.comment}
                    disabled={!canWriteSession}
                    onChange={(e) => {
                      const key = `${currentIndividualPlayer.player_id}:${currentTest.id}`;
                      setDrafts((prev) => ({
                        ...prev,
                        [key]: {
                          ...draft,
                          comment: e.target.value,
                          dirty: true,
                        },
                      }));
                    }}
                    placeholder="Points techniques ou comportementaux observés..."
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      disabled={!canWriteSession}
                      onClick={() =>
                        persistEvaluation(currentIndividualPlayer, currentTest.id, {
                          ...draft,
                          status: "absent",
                        })
                      }
                    >
                      Marquer Absent
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!canWriteSession}
                      onClick={() =>
                        persistEvaluation(currentIndividualPlayer, currentTest.id, {
                          ...draft,
                          status: "exempt",
                        })
                      }
                    >
                      Dispensé
                    </Button>
                  </div>

                  <Button
                    size="field"
                    variant="success"
                    disabled={!canWriteSession}
                    onClick={async () => {
                      await persistEvaluation(
                        currentIndividualPlayer,
                        currentTest.id,
                        draft,
                      );
                      toast.success("Résultat enregistré.");
                    }}
                  >
                    <Save className="h-5 w-5" />
                    <span>Enregistrer la performance</span>
                  </Button>
                </div>
              </div>
            );
          })()}
        </Card>
      ) : null}
    </div>
  );
}

function PlayerTestControls({
  sp,
  testId,
  resolvedComponents,
  draft,
  liveResult,
  disabled,
  onUpdateAttempt,
  onSave,
}: {
  sp: SessionPlayerEntry;
  testId: string;
  resolvedComponents: (MeasuredComponent | QualitativeComponent)[];
  draft: DraftState;
  liveResult: ReturnType<typeof scoreTest>;
  disabled: boolean;
  onUpdateAttempt: (
    sp: SessionPlayerEntry,
    testId: string,
    compKey: string,
    attemptIdx: number,
    patch: { value?: number | null; penalties?: number; is_valid?: boolean },
    autoSave?: boolean,
  ) => void;
  onSave: () => void;
}) {
  if (draft.status === "absent" || draft.status === "exempt") {
    return (
      <div className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        Joueur marqué comme{" "}
        <strong>{draft.status === "absent" ? "Absent" : "Dispensé"}</strong> sur
        cet atelier.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {resolvedComponents.map((comp) => {
        const compInput = draft.components.find((c) => c.key === comp.key);
        const compRes = liveResult.components.find((c) => c.key === comp.key);

        if (comp.kind === "qualitative") {
          const selectedVal = compInput?.attempts[0]?.value ?? null;
          return (
            <div
              key={comp.key}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                  {comp.label} (/{comp.max_points} pts)
                </p>
                {compRes?.points !== null && compRes?.points !== undefined ? (
                  <span className="text-xs font-bold text-violet-800 dark:text-sky-300">
                    {compRes.points} / {comp.max_points} pt
                  </span>
                ) : null}
              </div>

              {/* Grille visuelle qualitative avec sens explicite de chaque niveau */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {comp.levels.map((lvl) => {
                  const active =
                    selectedVal !== null &&
                    Math.abs(selectedVal - lvl.value) < 1e-6;
                  return (
                    <button
                      key={lvl.value}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onUpdateAttempt(
                          sp,
                          testId,
                          comp.key,
                          0,
                          { value: lvl.value },
                          true,
                        )
                      }
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all min-h-16 cursor-pointer ${
                        active
                          ? "border-violet-700 bg-violet-800 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-800 hover:border-violet-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between text-xs font-black">
                        <span>{lvl.label}</span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 font-mono ${
                            active
                              ? "bg-sky-300 text-slate-950"
                              : "bg-slate-100 text-violet-800 dark:bg-slate-800 dark:text-sky-300"
                          }`}
                        >
                          {lvl.value} pt
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-[11px] leading-snug ${
                          active
                            ? "text-white/90"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {lvl.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        // Critère numérique mesuré
        return (
          <div
            key={comp.key}
            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5 dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                {comp.label} ({comp.unit} •{" "}
                {comp.aggregation === "best"
                  ? "meilleur essai"
                  : comp.aggregation === "average"
                    ? "moyenne"
                    : comp.aggregation === "sum"
                      ? "total"
                      : "dernier"}
                {comp.out_of ? ` sur ${comp.out_of}` : ""})
              </p>
              <div className="text-xs font-semibold">
                {compRes?.retained_value !== null &&
                compRes?.retained_value !== undefined ? (
                  <span className="text-violet-800 dark:text-sky-300">
                    Retenu : {compRes.retained_value} {comp.unit}
                    {compRes.points !== null
                      ? ` → ${compRes.points}/${comp.max_points} pts`
                      : " (barème non défini)"}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2.5">
              {Array.from({ length: comp.attempts }, (_, idx) => {
                const att = compInput?.attempts[idx] ?? {
                  value: null,
                  penalties: 0,
                  is_valid: true,
                };
                return (
                  <div key={idx} className="flex items-center gap-1.5">
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Essai {idx + 1} ({comp.unit})
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={comp.min_value ?? 0}
                        max={comp.max_value ?? undefined}
                        disabled={disabled || att.is_valid === false}
                        value={att.value ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = raw === "" ? null : Number(raw);
                          onUpdateAttempt(sp, testId, comp.key, idx, {
                            value: num,
                          });
                        }}
                        onBlur={onSave}
                        className="w-28 h-12 text-base font-mono font-bold"
                        placeholder={`0 ${comp.unit}`}
                      />
                    </div>
                    {comp.penalty ? (
                      <div>
                        <span className="block text-[11px] font-semibold text-orange-600 mb-1">
                          Pénalités
                        </span>
                        <Input
                          type="number"
                          min={0}
                          max={20}
                          disabled={disabled}
                          value={att.penalties ?? 0}
                          onChange={(e) =>
                            onUpdateAttempt(sp, testId, comp.key, idx, {
                              penalties: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          onBlur={onSave}
                          className="w-20 h-12 font-mono"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}

              { draft.dirty ? (
                <Button size="lg" variant="primary" onClick={onSave}>
                  <Save className="h-4 w-4" />
                  <span>Valider</span>
                </Button>
              ) : null}
            </div>

            {compRes?.issues && compRes.issues.length > 0 ? (
              <div className="text-xs text-orange-700 font-medium">
                {compRes.issues.map((iss, i) => (
                  <div key={i}>• {iss.message}</div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
