import { ShieldCheck } from "lucide-react";
import { requirePageAdmin } from "@/lib/auth/guards";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatDateFr } from "@/lib/utils";
import type { AuditLog } from "@/lib/types/database";

export default async function AuditPage() {
  const { supabase } = await requirePageAdmin();

  const [logsRes, profilesRes] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const logs = (logsRes.data ?? []) as AuditLog[];
  const actorMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, p.full_name || p.email || p.id]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          Journal d&apos;Audit Immuable
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Traçabilité automatique (triggers PostgreSQL en ajout seul) des créations,
          modifications, validations et corrections après finalisation.
        </p>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Aucune entrée d'audit"
          description="Les opérations d'écriture en base apparaîtront automatiquement ici."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3">Date & Heure</th>
                  <th className="px-4 py-3">Acteur</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Table / Entité</th>
                  <th className="px-4 py-3">Motif déclaré</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                      {formatDateFr(log.created_at, true)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold">
                      {log.actor_id
                        ? (actorMap.get(log.actor_id) ?? log.actor_id.slice(0, 8))
                        : "Système / Migration"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={
                          log.action === "delete"
                            ? "danger"
                            : log.action === "update"
                              ? "warning"
                              : "success"
                        }
                      >
                        {log.action.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      {log.entity_type}{" "}
                      {log.entity_id ? `(${log.entity_id.slice(0, 12)})` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                      {log.reason ? (
                        <span className="font-semibold text-orange-700">
                          {log.reason}
                        </span>
                      ) : (
                        "—"
                      )}
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
