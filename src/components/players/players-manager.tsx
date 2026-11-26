"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Upload,
  Download,
  Archive,
  Trash2,
  Edit3,
  Eye,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import type { AssessmentCategory, PlayerWithRelations } from "@/lib/types/database";
import {
  calculateAgeAtDate,
  DOMINANT_FOOT_LABELS,
  formatDateFr,
  PLAYER_STATUS_LABELS,
  POSITIONS_CATALOG,
  suggestCategoryForAge,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { DemoTag, EmptyState } from "@/components/ui/states";

interface GuardianDraft {
  id?: string;
  last_name: string;
  first_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  relationship: string;
  is_primary: boolean;
}

export function PlayersManager({
  initialPlayers,
  categories,
  isAdmin,
  sexFieldEnabled,
}: {
  initialPlayers: PlayerWithRelations[];
  categories: AssessmentCategory[];
  isAdmin: boolean;
  sexFieldEnabled: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("active");
  const [sortBy, setSortBy] = React.useState<"name" | "number" | "birth">("name");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingPlayer, setEditingPlayer] =
    React.useState<PlayerWithRelations | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [confirmAction, setConfirmAction] = React.useState<{
    kind: "archive" | "delete";
    player: PlayerWithRelations;
  } | null>(null);

  // État formulaire joueur
  const [form, setForm] = React.useState({
    player_number: "",
    last_name: "",
    first_name: "",
    birth_date: "",
    sex: "" as "" | "M" | "F",
    category_id: "",
    preferred_position: "",
    dominant_foot: "" as "" | "right" | "left" | "both",
    previous_club: "",
    academy_entry_year: String(new Date().getFullYear()),
    notes: "",
    status: "active" as "active" | "inactive" | "archived",
    consent_obtained: false,
    consent_date: "",
    consent_note: "",
    external_ref: "",
  });

  const [guardians, setGuardians] = React.useState<GuardianDraft[]>([]);

  const openCreate = () => {
    setEditingPlayer(null);
    setForm({
      player_number: "",
      last_name: "",
      first_name: "",
      birth_date: "",
      sex: "",
      category_id: "",
      preferred_position: "",
      dominant_foot: "",
      previous_club: "",
      academy_entry_year: String(new Date().getFullYear()),
      notes: "",
      status: "active",
      consent_obtained: false,
      consent_date: "",
      consent_note: "",
      external_ref: "",
    });
    setGuardians([
      {
        last_name: "",
        first_name: "",
        phone: "",
        whatsapp: "",
        email: "",
        relationship: "Parent",
        is_primary: true,
      },
    ]);
    setModalOpen(true);
  };

  const openEdit = (p: PlayerWithRelations) => {
    setEditingPlayer(p);
    setForm({
      player_number: p.player_number,
      last_name: p.last_name,
      first_name: p.first_name,
      birth_date: p.birth_date,
      sex: p.sex ?? "",
      category_id: p.category_id ?? "",
      preferred_position: p.preferred_position ?? "",
      dominant_foot: p.dominant_foot ?? "",
      previous_club: p.previous_club ?? "",
      academy_entry_year: p.academy_entry_year ? String(p.academy_entry_year) : "",
      notes: p.notes ?? "",
      status: p.status,
      consent_obtained: p.consent_obtained,
      consent_date: p.consent_date ?? "",
      consent_note: p.consent_note ?? "",
      external_ref: p.external_ref ?? "",
    });
    setGuardians(
      (p.guardians ?? []).map((g) => ({
        id: g.guardian.id,
        last_name: g.guardian.last_name,
        first_name: g.guardian.first_name ?? "",
        phone: g.guardian.phone,
        whatsapp: g.guardian.whatsapp ?? "",
        email: g.guardian.email ?? "",
        relationship: g.relationship ?? "",
        is_primary: g.is_primary,
      })),
    );
    setModalOpen(true);
  };

  const handleBirthDateChange = (iso: string) => {
    const suggested = suggestCategoryForAge(
      categories,
      iso,
      new Date().toISOString().slice(0, 10),
    );
    setForm((prev) => ({
      ...prev,
      birth_date: iso,
      category_id: prev.category_id || (suggested?.id ?? ""),
    }));
  };

  const submitPlayer = async (allowDuplicate = false) => {
    setSaving(true);
    try {
      const validGuardians = guardians
        .filter((g) => g.last_name.trim() || g.phone.trim())
        .map((g, i) => ({
          ...(g.id ? { id: g.id } : {}),
          last_name: g.last_name.trim(),
          first_name: g.first_name.trim() || null,
          phone: g.phone.trim(),
          whatsapp: g.whatsapp.trim() || null,
          email: g.email.trim() || null,
          relationship: g.relationship.trim() || null,
          is_primary: i === 0 ? true : g.is_primary,
        }));

      const payload = {
        player_number: form.player_number.trim() || undefined,
        last_name: form.last_name.trim(),
        first_name: form.first_name.trim(),
        birth_date: form.birth_date,
        sex: form.sex || null,
        category_id: form.category_id || null,
        preferred_position: form.preferred_position || null,
        dominant_foot: form.dominant_foot || null,
        previous_club: form.previous_club || null,
        academy_entry_year: form.academy_entry_year
          ? Number(form.academy_entry_year)
          : null,
        notes: form.notes || null,
        status: form.status,
        consent_obtained: form.consent_obtained,
        consent_date: form.consent_date || null,
        consent_note: form.consent_note || null,
        external_ref: form.external_ref || null,
        guardians: validGuardians,
        allow_duplicate: allowDuplicate,
      };

      const url = editingPlayer
        ? `/api/players/${editingPlayer.id}`
        : "/api/players";
      const method = editingPlayer ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409 && body?.duplicate && !editingPlayer) {
        const force = window.confirm(
          `${body.error}\n\nVoulez-vous malgré tout créer un second dossier homonyme ?`,
        );
        if (force) {
          await submitPlayer(true);
          return;
        }
        return;
      }

      if (!res.ok) {
        toast.error(body?.error ?? "Enregistrement impossible.");
        return;
      }

      toast.success(
        editingPlayer ? "Fiche joueur mise à jour." : "Joueur enregistré avec succès.",
      );
      setModalOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSensitive = async () => {
    if (!confirmAction) return;
    const { kind, player } = confirmAction;
    setSaving(true);
    try {
      const res =
        kind === "archive"
          ? await fetch(`/api/players/${player.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "archived" }),
            })
          : await fetch(`/api/players/${player.id}`, { method: "DELETE" });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Opération refusée.");
        return;
      }
      toast.success(
        kind === "archive" ? "Joueur archivé." : "Fiche joueur supprimée.",
      );
      setConfirmAction(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialPlayers
      .filter((p) => {
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (categoryFilter && p.category_id !== categoryFilter) return false;
        if (!q) return true;
        const hay = `${p.player_number} ${p.last_name} ${p.first_name} ${p.preferred_position ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === "number")
          return a.player_number.localeCompare(b.player_number, "fr");
        if (sortBy === "birth") return a.birth_date.localeCompare(b.birth_date);
        return `${a.last_name} ${a.first_name}`.localeCompare(
          `${b.last_name} ${b.first_name}`,
          "fr",
        );
      });
  }, [initialPlayers, search, categoryFilter, statusFilter, sortBy]);

  return (
    <div className="space-y-5">
      {/* En-tête actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Effectif & Fiches Joueurs
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {filtered.length} joueur(s) affiché(s) • Gestion des profils, responsables
            légaux et historiques d&apos;évaluation.
          </p>
        </div>

        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/joueurs/importer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <Upload className="h-4 w-4 text-violet-700" />
              <span>Importer CSV / Excel</span>
            </Link>
            <a
              href="/api/exports/joueurs"
              download
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <Download className="h-4 w-4 text-sky-700" />
              <span>Exporter CSV</span>
            </a>
            <Button onClick={openCreate}>
              <UserPlus className="h-4 w-4" />
              <span>Nouveau joueur</span>
            </Button>
          </div>
        ) : null}
      </div>

      {/* Barre de recherche et filtres */}
      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom, numéro, poste..."
              className="pl-9"
            />
          </div>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrer par catégorie"
          >
            <option value="">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.min_age}–{c.max_age} ans)
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrer par statut"
          >
            <option value="active">Joueurs actifs</option>
            <option value="inactive">Inactifs</option>
            <option value="archived">Archivés</option>
            <option value="all">Tous les statuts</option>
          </Select>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name" | "number" | "birth")}
            aria-label="Trier par"
          >
            <option value="name">Tri : Ordre alphabétique</option>
            <option value="number">Tri : Numéro joueur</option>
            <option value="birth">Tri : Date de naissance</option>
          </Select>
        </div>
      </Card>

      {/* Liste / Table responsive */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun joueur trouvé"
          description={
            isAdmin
              ? "Ajoutez manuellement un joueur ou importez la liste des inscrits via CSV / Excel."
              : "Aucun joueur ne correspond à vos critères dans les sessions qui vous sont affectées."
          }
          action={
            isAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                <span>Enregistrer un premier joueur</span>
              </Button>
            ) : null
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3.5 font-bold">Numéro</th>
                  <th className="px-4 py-3.5 font-bold">Joueur</th>
                  <th className="px-4 py-3.5 font-bold">Catégorie</th>
                  <th className="px-4 py-3.5 font-bold hidden md:table-cell">
                    Naissance (Âge act.)
                  </th>
                  <th className="px-4 py-3.5 font-bold hidden lg:table-cell">
                    Poste & Pied
                  </th>
                  {isAdmin ? (
                    <th className="px-4 py-3.5 font-bold hidden xl:table-cell">
                      Responsable légal
                    </th>
                  ) : null}
                  <th className="px-4 py-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((p) => {
                  const cat = Array.isArray(p.category)
                    ? p.category[0]
                    : p.category;
                  const primaryG =
                    p.guardians?.find((g) => g.is_primary)?.guardian ??
                    p.guardians?.[0]?.guardian;
                  const ageNow = calculateAgeAtDate(p.birth_date, todayIso);

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-violet-800 dark:text-sky-300">
                        {p.player_number}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/joueurs/${p.id}`}
                            className="font-bold text-slate-900 hover:text-violet-800 dark:text-white"
                          >
                            {p.last_name.toUpperCase()} {p.first_name}
                          </Link>
                          <DemoTag isDemo={p.is_demo} />
                          {p.status !== "active" ? (
                            <Badge variant="neutral">
                              {PLAYER_STATUS_LABELS[p.status]}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {cat ? (
                          <Badge variant="violet">{cat.label}</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Non classé</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell text-slate-600 dark:text-slate-300">
                        {formatDateFr(p.birth_date)}
                        {ageNow !== null ? (
                          <span className="text-xs text-slate-400">
                            {" "}
                            ({ageNow} ans)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell text-xs text-slate-600 dark:text-slate-300">
                        <div>{p.preferred_position || "—"}</div>
                        {p.dominant_foot ? (
                          <div className="text-slate-400">
                            Pied {DOMINANT_FOOT_LABELS[p.dominant_foot]}
                          </div>
                        ) : null}
                      </td>
                      {isAdmin ? (
                        <td className="px-4 py-3.5 hidden xl:table-cell text-xs">
                          {primaryG ? (
                            <div>
                              <div className="font-semibold">
                                {primaryG.last_name} {primaryG.first_name ?? ""}
                              </div>
                              <div className="text-slate-500">{primaryG.phone}</div>
                            </div>
                          ) : (
                            <span className="text-orange-600 font-medium">
                              Non renseigné
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            href={`/joueurs/${p.id}`}
                            title="Consulter le profil et l'historique"
                            className="rounded-lg p-2 text-slate-600 hover:bg-violet-50 hover:text-violet-800 dark:text-slate-300"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {isAdmin ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                title="Modifier la fiche"
                                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              {p.status !== "archived" ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmAction({ kind: "archive", player: p })
                                  }
                                  title="Archiver"
                                  className="rounded-lg p-2 text-slate-600 hover:bg-orange-50 hover:text-orange-700"
                                >
                                  <Archive className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmAction({ kind: "delete", player: p })
                                  }
                                  title="Supprimer (si sans historique)"
                                  className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal création / édition joueur */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingPlayer
            ? `Modifier ${editingPlayer.last_name} ${editingPlayer.first_name}`
            : "Enregistrer un nouveau joueur"
        }
        description="Les champs marqués * sont obligatoires. Le numéro FA-XXXX est attribué automatiquement s'il est laissé vide."
        maxWidthClass="max-w-3xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPlayer(false);
          }}
          className="space-y-5"
        >
          <div className="grid sm:grid-cols-3 gap-3.5">
            <div>
              <Label>Nom *</Label>
              <Input
                required
                value={form.last_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, last_name: e.target.value }))
                }
                placeholder="Ex: NKOULOU"
              />
            </div>
            <div>
              <Label>Prénom *</Label>
              <Input
                required
                value={form.first_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, first_name: e.target.value }))
                }
                placeholder="Ex: Junior"
              />
            </div>
            <div>
              <Label>Numéro joueur (auto si vide)</Label>
              <Input
                value={form.player_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, player_number: e.target.value }))
                }
                placeholder="Auto (ex: FA-0001)"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3.5">
            <div>
              <Label>Date de naissance *</Label>
              <Input
                type="date"
                required
                value={form.birth_date}
                onChange={(e) => handleBirthDateChange(e.target.value)}
              />
            </div>
            <div>
              <Label>Catégorie actuelle</Label>
              <Select
                value={form.category_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category_id: e.target.value }))
                }
              >
                <option value="">Sélectionner...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.min_age}–{c.max_age} ans)
                  </option>
                ))}
              </Select>
            </div>
            {sexFieldEnabled ? (
              <div>
                <Label>Sexe (facultatif)</Label>
                <Select
                  value={form.sex}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sex: e.target.value as "" | "M" | "F",
                    }))
                  }
                >
                  <option value="">Non précisé</option>
                  <option value="M">Masculin (M)</option>
                  <option value="F">Féminin (F)</option>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="grid sm:grid-cols-3 gap-3.5">
            <div>
              <Label>Poste préféré</Label>
              <Select
                value={form.preferred_position}
                onChange={(e) =>
                  setForm((f) => ({ ...f, preferred_position: e.target.value }))
                }
              >
                <option value="">Non renseigné</option>
                {POSITIONS_CATALOG.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Pied dominant</Label>
              <Select
                value={form.dominant_foot}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    dominant_foot: e.target.value as "" | "right" | "left" | "both",
                  }))
                }
              >
                <option value="">Non renseigné</option>
                <option value="right">Droit</option>
                <option value="left">Gauche</option>
                <option value="both">Ambidextre</option>
              </Select>
            </div>
            <div>
              <Label>Année d&apos;entrée académie</Label>
              <Input
                type="number"
                min={2005}
                max={2100}
                value={form.academy_entry_year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, academy_entry_year: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3.5">
            <div>
              <Label>Ancien club (facultatif)</Label>
              <Input
                value={form.previous_club}
                onChange={(e) =>
                  setForm((f) => ({ ...f, previous_club: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Référence externe (intégration future)</Label>
              <Input
                value={form.external_ref}
                onChange={(e) =>
                  setForm((f) => ({ ...f, external_ref: e.target.value }))
                }
                placeholder="Identifiant FUTURISTE FC MANAGEMENT"
              />
            </div>
          </div>

          <div>
            <Label>Observations médicales / sportives générales</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Responsables légaux */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Responsable(s) légal(aux)
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setGuardians((prev) => [
                    ...prev,
                    {
                      last_name: "",
                      first_name: "",
                      phone: "",
                      whatsapp: "",
                      email: "",
                      relationship: "",
                      is_primary: prev.length === 0,
                    },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter un responsable</span>
              </Button>
            </div>

            {guardians.map((g, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between text-xs font-bold text-violet-800">
                  <span>
                    Responsable #{idx + 1} {idx === 0 ? "(Contact principal)" : ""}
                  </span>
                  {guardians.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setGuardians((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-red-600 hover:underline"
                    >
                      Retirer
                    </button>
                  ) : null}
                </div>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  <Input
                    placeholder="Nom *"
                    value={g.last_name}
                    onChange={(e) =>
                      setGuardians((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, last_name: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Prénom"
                    value={g.first_name}
                    onChange={(e) =>
                      setGuardians((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, first_name: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Lien (Père, Mère, Tuteur...)"
                    value={g.relationship}
                    onChange={(e) =>
                      setGuardians((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? { ...item, relationship: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  <Input
                    placeholder="Téléphone * (+237...)"
                    value={g.phone}
                    onChange={(e) =>
                      setGuardians((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, phone: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="WhatsApp (facultatif)"
                    value={g.whatsapp}
                    onChange={(e) =>
                      setGuardians((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, whatsapp: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    type="email"
                    placeholder="Email (facultatif)"
                    value={g.email}
                    onChange={(e) =>
                      setGuardians((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, email: e.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <label className="flex items-start gap-2.5 pt-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent_obtained}
                onChange={(e) =>
                  setForm((f) => ({ ...f, consent_obtained: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-800"
              />
              <span>
                Le responsable légal a été informé du traitement des données
                sportives de l&apos;enfant et a donné son consentement pour
                l&apos;évaluation et l&apos;édition du rapport individuel.
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Enregistrement..."
                : editingPlayer
                  ? "Enregistrer les modifications"
                  : "Créer le joueur"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation actions sensibles */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmSensitive}
        loading={saving}
        variant={confirmAction?.kind === "delete" ? "danger" : "warning"}
        title={
          confirmAction?.kind === "delete"
            ? "Supprimer définitivement la fiche joueur ?"
            : "Archiver ce joueur ?"
        }
        description={
          confirmAction?.kind === "delete"
            ? "Cette suppression n'est autorisée que si le joueur ne possède aucun historique de session."
            : "Le joueur ne figurera plus dans les listes actives mais l'intégralité de son historique d'évaluations sera conservée."
        }
        confirmLabel={
          confirmAction?.kind === "delete" ? "Supprimer" : "Archiver le joueur"
        }
      />
    </div>
  );
}
