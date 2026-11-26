"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  CalendarRange,
  MapPin,
  Copy,
  ArrowRight,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AssessmentCategory,
  AssessmentSession,
  AssessmentTest,
  Season,
} from "@/lib/types/database";
import { formatDateFr, SESSION_STATUS_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import { DemoTag, EmptyState } from "@/components/ui/states";

interface EnrichedSession extends AssessmentSession {
  season?: Season | null;
  categories?: { category: AssessmentCategory }[];
  tests?: { sort_order: number; test: AssessmentTest }[];
}

export function SessionsListClient({
  sessions,
  seasons,
  categories,
  tests,
  isAdmin,
}: {
  sessions: EnrichedSession[];
  seasons: Season[];
  categories: AssessmentCategory[];
  tests: AssessmentTest[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    name: "",
    description: "",
    session_date: new Date().toISOString().slice(0, 10),
    start_time: "09:30",
    location: "École Publique de Japoma, Douala, Cameroun",
    season_id: seasons[0]?.id ?? "",
    category_ids: categories.map((c) => c.id),
    test_ids: tests.filter((t) => t.is_active).map((t) => t.id),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Création impossible.");
        return;
      }
      toast.success("Session d'évaluation créée.");
      setModalOpen(false);
      router.push(`/sessions/${body.session.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Duplication impossible.");
      return;
    }
    toast.success("Session dupliquée en brouillon.");
    router.push(`/sessions/${body.session.id}`);
    router.refresh();
  };

  const toggleId = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Sessions d&apos;évaluation
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Organisation des tests d&apos;aptitude, affectation des encadreurs et suivi
            de validation.
          </p>
        </div>

        {isAdmin ? (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Nouvelle session</span>
          </Button>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Aucune session disponible"
          description={
            isAdmin
              ? "Créez votre première session d'évaluation pour commencer."
              : "Aucune session ne vous est affectée pour le moment."
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {sessions.map((s) => {
            const cats = (s.categories ?? [])
              .map((c) => c.category)
              .filter(Boolean);
            const activeTestsCount = (s.tests ?? []).length;

            return (
              <Card
                key={s.id}
                className="p-5 flex flex-col justify-between hover:border-violet-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          s.status === "in_progress"
                            ? "success"
                            : s.status === "finalized"
                              ? "violet"
                              : s.status === "to_validate"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {SESSION_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                      {s.season ? (
                        <Badge variant="sky">Saison {s.season.label}</Badge>
                      ) : null}
                      <DemoTag isDemo={s.is_demo} />
                    </div>

                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleDuplicate(s.id)}
                        title="Dupliquer cette session"
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  <div>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="text-lg font-black text-slate-900 hover:text-violet-800 dark:text-white"
                    >
                      {s.name}
                    </Link>
                    {s.description ? (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {s.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-violet-700" />
                      <span>
                        {formatDateFr(s.session_date)}
                        {s.start_time ? ` à ${s.start_time.slice(0, 5)}` : ""}
                      </span>
                    </div>
                    {s.location ? (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-sky-600" />
                        <span>{s.location}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {cats.map((c) => (
                      <Badge key={c.id} variant="neutral">
                        {c.label}
                      </Badge>
                    ))}
                    <Badge variant="neutral">{activeTestsCount} ateliers</Badge>
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <Link
                    href={`/terrain?session_id=${s.id}`}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Saisie terrain →
                  </Link>
                  <Link
                    href={`/sessions/${s.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800 hover:underline dark:text-sky-300"
                  >
                    <span>Gérer & Suivre</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Créer une session d'évaluation"
        description="Paramétrez la date, le lieu, la saison, les catégories participantes et les ateliers activés."
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Nom de la session *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Test d'aptitude FUTURISTE ACADÉMIE FC – Session Printemps"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                required
                value={form.session_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, session_date: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Heure de début</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_time: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Saison *</Label>
              <Select
                required
                value={form.season_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, season_id: e.target.value }))
                }
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Lieu</Label>
            <Input
              value={form.location}
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div>
            <Label>Catégories participantes *</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const checked = form.category_ids.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        category_ids: toggleId(f.category_ids, cat.id),
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                      checked
                        ? "border-violet-700 bg-violet-800 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Ateliers activés ({form.test_ids.length} sélectionnés) *</Label>
            <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3">
              {tests.map((t) => {
                const checked = form.test_ids.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          test_ids: toggleId(f.test_ids, t.id),
                        }))
                      }
                      className="h-4 w-4 rounded text-violet-800"
                    />
                    <span>
                      <strong>{t.code}</strong> — {t.name} ({t.max_points} pts)
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Création..." : "Créer la session"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
