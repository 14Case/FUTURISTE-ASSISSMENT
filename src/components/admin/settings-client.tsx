"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2, Beaker } from "lucide-react";
import { toast } from "sonner";
import type {
  AssessmentCategory,
  ClubSettings,
  Season,
} from "@/lib/types/database";
import { DEFAULT_PARENT_MESSAGE } from "@/lib/scoring/default-catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function SettingsClient({
  settings,
  seasons,
  categories,
  demoPlayersCount,
}: {
  settings: ClubSettings | null;
  seasons: Season[];
  categories: AssessmentCategory[];
  demoPlayersCount: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const [clubForm, setClubForm] = React.useState({
    club_name: settings?.club_name ?? "FUTURISTE ACADÉMIE FC",
    tagline:
      settings?.tagline ?? "Former, développer et révéler les talents.",
    primary_color: settings?.primary_color ?? "#5B21B6",
    secondary_color: settings?.secondary_color ?? "#7DD3FC",
    current_season_id: settings?.current_season_id ?? seasons[0]?.id ?? "",
    sex_field_enabled: settings?.sex_field_enabled ?? true,
    analysis_enabled: settings?.analysis_enabled ?? true,
    parent_message_template:
      settings?.parent_message_template || DEFAULT_PARENT_MESSAGE,
    report_footer:
      settings?.report_footer ??
      "Document confidentiel destiné au responsable légal du joueur.",
    report_signatory:
      settings?.report_signatory ??
      "Direction Technique — FUTURISTE ACADÉMIE FC",
    auto_sync: settings?.sync_settings?.auto_sync ?? true,
    retry_interval_seconds:
      settings?.sync_settings?.retry_interval_seconds ?? 30,
    unit_time: settings?.units?.time ?? "s",
    unit_distance: settings?.units?.distance ?? "m",
  });

  const [newSeason, setNewSeason] = React.useState({
    label: "",
    start_date: "",
    end_date: "",
  });

  const [newCategory, setNewCategory] = React.useState({
    code: "",
    label: "",
    min_age: 6,
    max_age: 9,
  });

  const saveClubSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          club_name: clubForm.club_name,
          tagline: clubForm.tagline,
          primary_color: clubForm.primary_color,
          secondary_color: clubForm.secondary_color,
          current_season_id: clubForm.current_season_id || null,
          sex_field_enabled: clubForm.sex_field_enabled,
          analysis_enabled: clubForm.analysis_enabled,
          parent_message_template: clubForm.parent_message_template,
          report_footer: clubForm.report_footer,
          report_signatory: clubForm.report_signatory,
          sync_settings: {
            auto_sync: clubForm.auto_sync,
            retry_interval_seconds: Number(clubForm.retry_interval_seconds) || 30,
          },
          units: {
            time: clubForm.unit_time,
            distance: clubForm.unit_distance,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Enregistrement impossible.");
        return;
      }
      toast.success("Paramètres du club enregistrés.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const addSeason = async () => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "season", data: newSeason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Format saison invalide (ex: 2027–2028).");
      return;
    }
    toast.success("Nouvelle saison ajoutée.");
    setNewSeason({ label: "", start_date: "", end_date: "" });
    router.refresh();
  };

  const addCategory = async () => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "category",
        data: {
          ...newCategory,
          sort_order: categories.length + 1,
          is_active: true,
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Catégorie invalide.");
      return;
    }
    toast.success("Catégorie ajoutée.");
    setNewCategory({ code: "", label: "", min_age: 6, max_age: 9 });
    router.refresh();
  };

  const handleLoadDemo = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Création DEMO impossible.");
        return;
      }
      toast.success(
        `${body.created} fiches joueurs clairement marquées DEMO ont été créées.`,
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handlePurgeDemo = async () => {
    const ok = window.confirm(
      "Supprimer définitivement toutes les données marquées DEMO (joueurs, évaluations et rapports DEMO) ?",
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/demo", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Purge DEMO impossible.");
        return;
      }
      toast.success(
        `Données DEMO supprimées (${body.purged_players} fiche(s) purgée(s)).`,
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          Paramètres Généraux de l&apos;Application
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Identité du club, saisons, catégories, modèles de messages parents, unités et
          synchronisation.
        </p>
      </div>

      <form onSubmit={saveClubSettings} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identité FUTURISTE ACADÉMIE FC & Rapports PDF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Nom officiel du club</Label>
                <Input
                  value={clubForm.club_name}
                  onChange={(e) =>
                    setClubForm((f) => ({ ...f, club_name: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Devise / Slogan</Label>
                <Input
                  value={clubForm.tagline}
                  onChange={(e) =>
                    setClubForm((f) => ({ ...f, tagline: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <Label>Saison active</Label>
                <Select
                  value={clubForm.current_season_id}
                  onChange={(e) =>
                    setClubForm((f) => ({
                      ...f,
                      current_season_id: e.target.value,
                    }))
                  }
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Couleur principale (Hex)</Label>
                <Input
                  value={clubForm.primary_color}
                  onChange={(e) =>
                    setClubForm((f) => ({
                      ...f,
                      primary_color: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Couleur secondaire (Hex)</Label>
                <Input
                  value={clubForm.secondary_color}
                  onChange={(e) =>
                    setClubForm((f) => ({
                      ...f,
                      secondary_color: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Signataire par défaut des rapports PDF</Label>
                <Input
                  value={clubForm.report_signatory}
                  onChange={(e) =>
                    setClubForm((f) => ({
                      ...f,
                      report_signatory: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Mention pied de page PDF</Label>
                <Input
                  value={clubForm.report_footer}
                  onChange={(e) =>
                    setClubForm((f) => ({
                      ...f,
                      report_footer: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>
                Message type de transmission aux parents (variables :{" "}
                <code>{"{saison}"}</code>, <code>{"{joueur}"}</code>)
              </Label>
              <Textarea
                rows={6}
                value={clubForm.parent_message_template}
                onChange={(e) =>
                  setClubForm((f) => ({
                    ...f,
                    parent_message_template: e.target.value,
                  }))
                }
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={clubForm.sex_field_enabled}
                  onChange={(e) =>
                    setClubForm((f) => ({
                      ...f,
                      sex_field_enabled: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded text-violet-800"
                />
                <span>
                  Activer le champ Sexe sur les fiches joueurs et la différenciation
                  optionnelle des barèmes
                </span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={clubForm.analysis_enabled}
                  onChange={(e) =>
                    setClubForm((f) => ({
                      ...f,
                      analysis_enabled: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded text-violet-800"
                />
                <span>
                  Activer par défaut le moteur d&apos;analyse et recommandations sur les
                  rapports
                </span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                <span>Enregistrer la configuration</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Catégories et Saisons */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Catégories d&apos;âge configurables</CardTitle>
            <CardDescription>
              Tranches initiales U6–U9, U10–U13, U14–U16 et futures catégories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm dark:border-slate-800"
              >
                <div>
                  <span className="font-bold">{c.label}</span>{" "}
                  <span className="text-xs text-slate-500">
                    ({c.min_age} à {c.max_age} ans • code {c.code})
                  </span>
                </div>
                <Badge variant={c.is_active ? "violet" : "neutral"}>
                  {c.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}

            <div className="grid grid-cols-4 gap-2 pt-2">
              <Input
                placeholder="Code (U17-U19)"
                value={newCategory.code}
                onChange={(e) =>
                  setNewCategory((c) => ({ ...c, code: e.target.value }))
                }
              />
              <Input
                placeholder="Libellé"
                value={newCategory.label}
                onChange={(e) =>
                  setNewCategory((c) => ({ ...c, label: e.target.value }))
                }
              />
              <Input
                type="number"
                placeholder="Min"
                value={newCategory.min_age}
                onChange={(e) =>
                  setNewCategory((c) => ({
                    ...c,
                    min_age: Number(e.target.value),
                  }))
                }
              />
              <div className="flex gap-1.5">
                <Input
                  type="number"
                  placeholder="Max"
                  value={newCategory.max_age}
                  onChange={(e) =>
                    setNewCategory((c) => ({
                      ...c,
                      max_age: Number(e.target.value),
                    }))
                  }
                />
                <Button size="sm" onClick={addCategory}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saisons sportives</CardTitle>
            <CardDescription>Gestion multi-saisons de l&apos;académie</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {seasons.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold dark:border-slate-800"
              >
                <span>Saison {s.label}</span>
                {s.id === clubForm.current_season_id ? (
                  <Badge variant="success">Saison active</Badge>
                ) : null}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Input
                placeholder="Ex: 2027–2028"
                value={newSeason.label}
                onChange={(e) =>
                  setNewSeason((s) => ({ ...s, label: e.target.value }))
                }
              />
              <Button variant="secondary" onClick={addSeason}>
                <Plus className="h-4 w-4" />
                <span>Ajouter</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gestion contrôlée des données DEMO */}
      <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-950 dark:text-amber-200">
            <Beaker className="h-5 w-5 text-amber-700" />
            <span>Données de démonstration (DEMO) — Isolées et supprimables</span>
          </CardTitle>
          <CardDescription>
            Aucune donnée fictive n&apos;est chargée en production par défaut. Vous pouvez
            créer 3 joueurs identifiés par le badge <strong>DEMO</strong> pour tester le
            rendu des rapports, puis tout purger avant le jour J.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">
            Fiches DEMO actuellement en base : {demoPlayersCount}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={saving} onClick={handleLoadDemo}>
              Générer 3 joueurs DEMO de test
            </Button>
            {demoPlayersCount > 0 ? (
              <Button variant="danger" disabled={saving} onClick={handlePurgeDemo}>
                <Trash2 className="h-4 w-4" />
                <span>Supprimer toutes les données DEMO</span>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
