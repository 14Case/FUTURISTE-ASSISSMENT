"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Sliders,
  AlertTriangle,
  Calculator,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AssessmentCategory,
  AssessmentDomain,
  AssessmentTest,
  RubricVersion,
  TestAgeRule,
} from "@/lib/types/database";
import type {
  MeasuredComponent,
  QualitativeComponent,
  RubricConfig,
  Threshold,
} from "@/lib/scoring/types";
import { pointsForValue, validateRubricConfig } from "@/lib/scoring/engine";
import { resolveRubricRow, type RubricRow } from "@/lib/scoring/resolve";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";

export function RubricsAdminClient({
  domains,
  tests,
  categories,
  ageRules,
  rubrics,
}: {
  domains: AssessmentDomain[];
  tests: AssessmentTest[];
  categories: AssessmentCategory[];
  ageRules: TestAgeRule[];
  rubrics: RubricVersion[];
}) {
  const router = useRouter();
  const [selectedTestId, setSelectedTestId] = React.useState(
    tests[0]?.id ?? "",
  );
  const [scopeCategoryId, setScopeCategoryId] = React.useState<string>("");
  const [scopeSex, setScopeSex] = React.useState<"" | "M" | "F">("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Simulation d'une valeur mesurée dans l'éditeur
  const [simValues, setSimValues] = React.useState<Record<string, string>>({});

  const selectedTest =
    tests.find((t) => t.id === selectedTestId) ?? tests[0] ?? null;

  const matchedRubric = React.useMemo(() => {
    if (!selectedTest) return null;
    // Cherche d'abord une version active exactement sur cette portée, sinon le barème résolu
    const exact = rubrics.find(
      (r) =>
        r.test_id === selectedTest.id &&
        r.status === "active" &&
        (r.category_id ?? "") === scopeCategoryId &&
        (r.sex ?? "") === scopeSex,
    );
    if (exact) return exact;
    return (
      resolveRubricRow(
        rubrics as unknown as RubricRow[],
        selectedTest.id,
        scopeCategoryId || null,
        scopeSex || null,
        true,
      ) as unknown as RubricVersion | null
    );
  }, [rubrics, selectedTest, scopeCategoryId, scopeSex]);

  const scopeKey = `${selectedTest?.id ?? ""}:${scopeCategoryId}:${scopeSex}`;
  const [draftsByScope, setDraftsByScope] = React.useState<
    Record<string, RubricConfig>
  >({});

  const configDraft: RubricConfig | null =
    draftsByScope[scopeKey] ??
    (matchedRubric ? matchedRubric.config : null);

  const setConfigDraft = (
    updater: (prev: RubricConfig | null) => RubricConfig | null,
  ) => {
    setDraftsByScope((prev) => {
      const current =
        prev[scopeKey] ??
        (matchedRubric ? structuredClone(matchedRubric.config) : null);
      const next = updater(current);
      if (!next) return prev;
      return { ...prev, [scopeKey]: next };
    });
  };

  // Protocole par catégorie pour l'atelier sélectionné
  const currentRule = React.useMemo(() => {
    if (!selectedTest || !scopeCategoryId) return null;
    return (
      ageRules.find(
        (r) => r.test_id === selectedTest.id && r.category_id === scopeCategoryId,
      ) ?? null
    );
  }, [ageRules, selectedTest, scopeCategoryId]);

  const ruleKey = `${selectedTest?.id ?? ""}:${scopeCategoryId}`;
  const [protocolOverrides, setProtocolOverrides] = React.useState<
    Record<string, string>
  >({});
  const protocolText =
    protocolOverrides[ruleKey] ?? currentRule?.protocol_text ?? "";
  const setProtocolText = (val: string) =>
    setProtocolOverrides((prev) => ({ ...prev, [ruleKey]: val }));

  const updateMeasured = (
    compIdx: number,
    updater: (c: MeasuredComponent) => MeasuredComponent,
  ) => {
    setConfigDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const target = next.components[compIdx];
      if (target && target.kind === "measured") {
        next.components[compIdx] = updater(target);
      }
      return next;
    });
  };

  const updateQualitative = (
    compIdx: number,
    updater: (c: QualitativeComponent) => QualitativeComponent,
  ) => {
    setConfigDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const target = next.components[compIdx];
      if (target && target.kind === "qualitative") {
        next.components[compIdx] = updater(target);
      }
      return next;
    });
  };

  const handleSaveProtocol = async () => {
    if (!selectedTest || !scopeCategoryId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_id: selectedTest.id,
          category_id: scopeCategoryId,
          protocol: currentRule?.protocol ?? {},
          protocol_text: protocolText.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Erreur protocole.");
        return;
      }
      toast.success("Protocole catégorie enregistré.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handlePublishRubricVersion = async (status: "active" | "draft") => {
    if (!selectedTest || !configDraft) return;

    const issues = validateRubricConfig(
      configDraft,
      Number(selectedTest.max_points),
    ).filter((i) => i.code === "invalid_config");

    if (issues.length > 0) {
      toast.error(issues[0].message);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/rubrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_id: selectedTest.id,
          category_id: scopeCategoryId || null,
          sex: scopeSex || null,
          status,
          effective_from: new Date().toISOString().slice(0, 10),
          config: configDraft,
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Publication refusée.");
        return;
      }
      toast.success(
        status === "active"
          ? `Nouvelle version v${body.rubric.version} activée avec succès.`
          : `Brouillon v${body.rubric.version} enregistré.`,
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const testVersions = rubrics.filter(
    (r) => r.test_id === selectedTest?.id,
  );
  const catMap = new Map(categories.map((c) => [c.id, c.label]));
  const domMap = new Map(domains.map((d) => [d.code, d.label]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          Configuration des Ateliers & Barèmes Versionnés
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Paramétrez les seuils, tentatives, pénalités et grilles qualitatives par
          catégorie sans modifier le code. Toute publication crée une nouvelle version
          afin de préserver l&apos;historique des sessions passées.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Liste des 12 ateliers */}
        <div className="lg:col-span-4 space-y-2">
          {tests.map((t) => {
            const active = t.id === selectedTest?.id;
            const hasUnconfigured = rubrics
              .filter((r) => r.test_id === t.id && r.status === "active")
              .some((r) =>
                r.config.components.some(
                  (c) => c.kind === "measured" && c.scoring.mode === "none",
                ),
              );

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTestId(t.id)}
                className={`w-full rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                  active
                    ? "border-violet-700 bg-violet-800 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-900 hover:border-violet-300 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-sm">
                    {t.code} — {t.name}
                  </span>
                  <span
                    className={`rounded-lg px-2 py-0.5 font-mono text-xs font-bold ${
                      active
                        ? "bg-sky-300 text-slate-950"
                        : "bg-slate-100 text-violet-800 dark:bg-slate-800 dark:text-sky-300"
                    }`}
                  >
                    /{t.max_points} pts
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className={active ? "text-white/80" : "text-slate-500"}>
                    {domMap.get(t.domain) ?? t.domain}
                  </span>
                  {hasUnconfigured ? (
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        active ? "text-amber-300" : "text-orange-600"
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Seuils à définir
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        active ? "text-emerald-300" : "text-emerald-700"
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Barémé
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Éditeur du barème de l'atelier sélectionné */}
        <div className="lg:col-span-8 space-y-5">
          {selectedTest && configDraft ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Sliders className="h-5 w-5 text-violet-700" />
                      <span>
                        {selectedTest.code} — {selectedTest.name} ({selectedTest.max_points} points)
                      </span>
                    </CardTitle>
                    {matchedRubric ? (
                      <Badge variant="violet">
                        Base actuelle : v{matchedRubric.version} (
                        {matchedRubric.category_id
                          ? (catMap.get(matchedRubric.category_id) ?? "Catégorie")
                          : "Toutes catégories"}
                        )
                      </Badge>
                    ) : null}
                  </div>
                  <CardDescription>{selectedTest.instructions}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                    <div>
                      <Label>Portée catégorie du barème</Label>
                      <Select
                        value={scopeCategoryId}
                        onChange={(e) => setScopeCategoryId(e.target.value)}
                      >
                        <option value="">
                          Toutes catégories (barème général par défaut)
                        </option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            Spécifique {c.label} ({c.min_age}–{c.max_age} ans)
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Portée sexe (facultatif)</Label>
                      <Select
                        value={scopeSex}
                        onChange={(e) =>
                          setScopeSex(e.target.value as "" | "M" | "F")
                        }
                      >
                        <option value="">Mixte / Tous</option>
                        <option value="M">Masculin (M)</option>
                        <option value="F">Féminin (F)</option>
                      </Select>
                    </div>
                  </div>

                  {scopeCategoryId ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 space-y-2 dark:border-sky-900 dark:bg-sky-950/30">
                      <Label>
                        Protocole terrain pour{" "}
                        {catMap.get(scopeCategoryId)} (distances, cônes, durée)
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={protocolText}
                          onChange={(e) => setProtocolText(e.target.value)}
                          placeholder="Ex: 20 m — 2 tentatives — meilleur temps"
                        />
                        <Button
                          variant="secondary"
                          onClick={handleSaveProtocol}
                          disabled={saving}
                        >
                          <Save className="h-4 w-4" />
                          <span>Sauver</span>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Critères du barème */}
              {configDraft.components.map((comp, compIdx) => {
                if (comp.kind === "measured") {
                  const simRaw = simValues[comp.key] ?? "";
                  const simNum = simRaw !== "" ? Number(simRaw) : null;
                  const simPoints =
                    simNum !== null && Number.isFinite(simNum)
                      ? pointsForValue(comp, simNum)
                      : null;

                  return (
                    <Card key={comp.key}>
                      <CardHeader>
                        <CardTitle className="text-base">
                          Critère mesuré : {comp.label} (/{comp.max_points} pts)
                        </CardTitle>
                        <CardDescription>
                          Unité : {comp.unit} • Sens :{" "}
                          {comp.direction === "lower_better"
                            ? "Plus faible = meilleur (temps)"
                            : "Plus élevé = meilleur (distance / réussites)"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <Label>Nombre de tentatives</Label>
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={comp.attempts}
                              onChange={(e) =>
                                updateMeasured(compIdx, (c) => ({
                                  ...c,
                                  attempts: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Mode de retenue</Label>
                            <Select
                              value={comp.aggregation}
                              onChange={(e) =>
                                updateMeasured(compIdx, (c) => ({
                                  ...c,
                                  aggregation: e.target
                                    .value as MeasuredComponent["aggregation"],
                                }))
                              }
                            >
                              <option value="best">Meilleure tentative</option>
                              <option value="average">Moyenne</option>
                              <option value="sum">Total cumulé</option>
                              <option value="last">Dernière tentative</option>
                            </Select>
                          </div>
                          <div>
                            <Label>Mode de barème</Label>
                            <Select
                              value={comp.scoring.mode}
                              onChange={(e) => {
                                const m = e.target.value as
                                  | "thresholds"
                                  | "linear"
                                  | "none";
                                updateMeasured(compIdx, (c) => {
                                  if (m === "thresholds") {
                                    return {
                                      ...c,
                                      scoring: {
                                        mode: "thresholds",
                                        thresholds: [
                                          {
                                            bound:
                                              c.direction === "lower_better"
                                                ? 4.0
                                                : 1.5,
                                            points: c.max_points,
                                          },
                                        ],
                                      },
                                    };
                                  }
                                  if (m === "linear") {
                                    return {
                                      ...c,
                                      scoring: {
                                        mode: "linear",
                                        best:
                                          c.direction === "lower_better"
                                            ? 3.0
                                            : (c.out_of ?? 10),
                                        worst:
                                          c.direction === "lower_better"
                                            ? 6.0
                                            : 0,
                                        round_to: 0.5,
                                      },
                                    };
                                  }
                                  return { ...c, scoring: { mode: "none" } };
                                });
                              }}
                            >
                              <option value="thresholds">
                                Seuils / Paliers de référence
                              </option>
                              <option value="linear">
                                Interpolation linéaire (Best ↔ Worst)
                              </option>
                              <option value="none">
                                Non configuré (saisie brute uniquement)
                              </option>
                            </Select>
                          </div>
                        </div>

                        {/* Éditeur de seuils */}
                        {comp.scoring.mode === "thresholds" ? (() => {
                          const thresholdsList = comp.scoring.thresholds;
                          return (
                          <div className="space-y-2.5 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold uppercase text-slate-600">
                                Paliers ({comp.direction === "lower_better" ? "Valeur ≤ seuil" : "Valeur ≥ seuil"} → Points)
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateMeasured(compIdx, (c) => {
                                    if (c.scoring.mode !== "thresholds") return c;
                                    const nextT: Threshold[] = [
                                      ...c.scoring.thresholds,
                                      { bound: 0, points: 1 },
                                    ];
                                    return {
                                      ...c,
                                      scoring: {
                                        mode: "thresholds",
                                        thresholds: nextT,
                                      },
                                    };
                                  })
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Ajouter un seuil</span>
                              </Button>
                            </div>

                            {thresholdsList.map((th, tIdx) => (
                              <div
                                key={tIdx}
                                className="flex items-center gap-2.5"
                              >
                                <span className="text-xs font-mono text-slate-500 w-16">
                                  {comp.direction === "lower_better" ? "≤" : "≥"}
                                </span>
                                <Input
                                  type="number"
                                  step="any"
                                  value={th.bound}
                                  onChange={(e) =>
                                    updateMeasured(compIdx, (c) => {
                                      if (c.scoring.mode !== "thresholds")
                                        return c;
                                      const thresholds =
                                        c.scoring.thresholds.map((item, i) =>
                                          i === tIdx
                                            ? {
                                                ...item,
                                                bound: Number(e.target.value),
                                              }
                                            : item,
                                        );
                                      return {
                                        ...c,
                                        scoring: {
                                          mode: "thresholds",
                                          thresholds,
                                        },
                                      };
                                    })
                                  }
                                />
                                <span className="text-xs text-slate-500">
                                  {comp.unit} →
                                </span>
                                <Input
                                  type="number"
                                  step="0.5"
                                  min={0}
                                  max={comp.max_points}
                                  value={th.points}
                                  onChange={(e) =>
                                    updateMeasured(compIdx, (c) => {
                                      if (c.scoring.mode !== "thresholds")
                                        return c;
                                      const thresholds =
                                        c.scoring.thresholds.map((item, i) =>
                                          i === tIdx
                                            ? {
                                                ...item,
                                                points: Number(e.target.value),
                                              }
                                            : item,
                                        );
                                      return {
                                        ...c,
                                        scoring: {
                                          mode: "thresholds",
                                          thresholds,
                                        },
                                      };
                                    })
                                  }
                                />
                                <span className="text-xs text-slate-500">pts</span>
                                {thresholdsList.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateMeasured(compIdx, (c) => {
                                        if (c.scoring.mode !== "thresholds")
                                          return c;
                                        return {
                                          ...c,
                                          scoring: {
                                            mode: "thresholds",
                                            thresholds:
                                              c.scoring.thresholds.filter(
                                                (_, i) => i !== tIdx,
                                              ),
                                          },
                                        };
                                      })
                                    }
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          );
                        })() : comp.scoring.mode === "linear" ? (
                          <div className="grid sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                            <div>
                              <Label>Performance max ({comp.max_points} pts)</Label>
                              <Input
                                type="number"
                                step="any"
                                value={comp.scoring.best}
                                onChange={(e) =>
                                  updateMeasured(compIdx, (c) =>
                                    c.scoring.mode === "linear"
                                      ? {
                                          ...c,
                                          scoring: {
                                            ...c.scoring,
                                            best: Number(e.target.value),
                                          },
                                        }
                                      : c,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <Label>Seuil plancher (0 pt)</Label>
                              <Input
                                type="number"
                                step="any"
                                value={comp.scoring.worst}
                                onChange={(e) =>
                                  updateMeasured(compIdx, (c) =>
                                    c.scoring.mode === "linear"
                                      ? {
                                          ...c,
                                          scoring: {
                                            ...c.scoring,
                                            worst: Number(e.target.value),
                                          },
                                        }
                                      : c,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <Label>Arrondi (pas)</Label>
                              <Input
                                type="number"
                                step="0.1"
                                value={comp.scoring.round_to}
                                onChange={(e) =>
                                  updateMeasured(compIdx, (c) =>
                                    c.scoring.mode === "linear"
                                      ? {
                                          ...c,
                                          scoring: {
                                            ...c.scoring,
                                            round_to: Number(e.target.value) || 0.5,
                                          },
                                        }
                                      : c,
                                  )
                                }
                              />
                            </div>
                          </div>
                        ) : null}

                        {/* Simulateur instantané */}
                        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 p-3 text-xs border border-violet-200 dark:bg-violet-950/30 dark:border-violet-800">
                          <Calculator className="h-4 w-4 text-violet-800" />
                          <span className="font-bold">Tester ce barème :</span>
                          <Input
                            type="number"
                            step="any"
                            placeholder={`Valeur (${comp.unit})`}
                            value={simRaw}
                            onChange={(e) =>
                              setSimValues((s) => ({
                                ...s,
                                [comp.key]: e.target.value,
                              }))
                            }
                            className="w-32 h-9 bg-white"
                          />
                          <span className="font-mono font-bold text-violet-900 dark:text-sky-300">
                            Résultat :{" "}
                            {simPoints !== null
                              ? `${simPoints} / ${comp.max_points} pts`
                              : "Barème non défini"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                // Critère qualitatif
                return (
                  <Card key={comp.key}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Grille qualitative : {comp.label} (/{comp.max_points} pts)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {comp.levels.map((lvl, lIdx) => (
                        <div
                          key={lIdx}
                          className="grid sm:grid-cols-12 gap-2 items-center"
                        >
                          <span className="sm:col-span-2 font-mono text-xs font-bold text-violet-800">
                            {lvl.value} pt —
                          </span>
                          <Input
                            className="sm:col-span-3"
                            value={lvl.label}
                            onChange={(e) =>
                              updateQualitative(compIdx, (c) => ({
                                ...c,
                                levels: c.levels.map((item, i) =>
                                  i === lIdx
                                    ? { ...item, label: e.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                          <Input
                            className="sm:col-span-7"
                            value={lvl.description}
                            onChange={(e) =>
                              updateQualitative(compIdx, (c) => ({
                                ...c,
                                levels: c.levels.map((item, i) =>
                                  i === lIdx
                                    ? { ...item, description: e.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Publication d'une nouvelle version */}
              <Card className="p-5 space-y-3">
                <div>
                  <Label>Note de version (traçabilité méthodologique)</Label>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Barème U10-U13 Saison 2026-2027 validé par la Direction Technique..."
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2.5">
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => handlePublishRubricVersion("draft")}
                  >
                    Enregistrer en brouillon
                  </Button>
                  <Button
                    variant="primary"
                    disabled={saving}
                    onClick={() => handlePublishRubricVersion("active")}
                  >
                    Publier et activer cette nouvelle version
                  </Button>
                </div>

                {/* Historique des versions de l'atelier */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold uppercase text-slate-500 mb-2">
                    Versions existantes pour {selectedTest.code} ({testVersions.length})
                  </p>
                  <div className="space-y-1.5 text-xs">
                    {testVersions.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950"
                      >
                        <span>
                          <strong>v{v.version}</strong> •{" "}
                          {v.category_id
                            ? (catMap.get(v.category_id) ?? "Catégorie")
                            : "Toutes catégories"}
                          {v.sex ? ` (${v.sex})` : ""} • {v.notes || "Sans note"}
                        </span>
                        <Badge
                          variant={
                            v.status === "active"
                              ? "success"
                              : v.status === "draft"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {v.status === "active"
                            ? "Active"
                            : v.status === "draft"
                              ? "Brouillon"
                              : "Archivée"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
