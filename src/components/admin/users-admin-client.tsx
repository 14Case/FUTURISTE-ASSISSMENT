"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Shield, Power } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/lib/types/database";
import { formatDateFr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/dialog";

export function UsersAdminClient({
  users,
  currentUserId,
}: {
  users: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    full_name: "",
    email: "",
    phone: "",
    role: "coach" as "coach" | "admin",
    password: "",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Création du compte refusée.");
        return;
      }
      toast.success("Compte créé avec succès.");
      setModalOpen(false);
      setForm({
        full_name: "",
        email: "",
        phone: "",
        role: "coach",
        password: "",
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (u: Profile, patch: Partial<Profile>) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: u.full_name || u.email || "Encadreur",
        phone: u.phone,
        role: patch.role ?? u.role,
        is_active: patch.is_active ?? u.is_active,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Mise à jour refusée.");
      return;
    }
    toast.success("Droits mis à jour.");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Comptes Encadreurs & Rôles
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Gérez les accès ADMIN et COACH. Les restrictions sont appliquées côté
            serveur et dans les politiques Row Level Security PostgreSQL.
          </p>
        </div>

        <Button onClick={() => setModalOpen(true)}>
          <UserPlus className="h-4 w-4" />
          <span>Créer un compte encadreur</span>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3.5">Nom complet</th>
                <th className="px-4 py-3.5">Email & Téléphone</th>
                <th className="px-4 py-3.5">Rôle</th>
                <th className="px-4 py-3.5">Statut</th>
                <th className="px-4 py-3.5">Créé le</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3.5 font-bold">
                      {u.full_name || "—"}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-violet-700">
                          (Vous)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div>{u.email ?? "—"}</div>
                      {u.phone ? (
                        <div className="text-slate-400">{u.phone}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge
                        variant={u.role === "admin" ? "violet" : "sky"}
                      >
                        {u.role === "admin" ? "ADMIN" : "COACH"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={u.is_active ? "success" : "danger"}>
                        {u.is_active ? "Actif" : "Désactivé"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {formatDateFr(u.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {!isSelf ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggle(u, {
                                role: u.role === "admin" ? "coach" : "admin",
                              })
                            }
                            title="Basculer le rôle"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                          >
                            <Shield className="h-3.5 w-3.5 text-violet-700" />
                            <span>
                              Passer {u.role === "admin" ? "Coach" : "Admin"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleToggle(u, { is_active: !u.is_active })
                            }
                            title="Activer / Désactiver"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                          >
                            <Power className="h-3.5 w-3.5 text-orange-600" />
                            <span>
                              {u.is_active ? "Désactiver" : "Réactiver"}
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Créer un compte Encadreur ou Administrateur"
        description="Les parents ne disposent pas de compte dans la V1."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Nom et prénom *</Label>
            <Input
              required
              value={form.full_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, full_name: e.target.value }))
              }
              placeholder="Ex: Coach Marc Ebwelle"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Email de connexion *</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Rôle *</Label>
              <Select
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    role: e.target.value as "coach" | "admin",
                  }))
                }
              >
                <option value="coach">COACH / ENCADREUR (saisie terrain)</option>
                <option value="admin">ADMIN (direction & configuration)</option>
              </Select>
            </div>
            <div>
              <Label>Mot de passe initial (8 car. min) *</Label>
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Création..." : "Créer le compte"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
