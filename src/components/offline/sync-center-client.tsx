"use client";

import * as React from "react";
import {
  CloudDownload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  getOfflineDb,
  type OfflineSessionBundle,
  type OutboxOperation,
} from "@/lib/offline/db";
import {
  flushOutbox,
  preloadSessionForOffline,
  resolveConflictOperation,
} from "@/lib/offline/sync";
import { formatDateFr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function SyncCenterClient({
  availableSessions,
}: {
  availableSessions: { id: string; name: string; session_date: string }[];
}) {
  const [bundles, setBundles] = React.useState<OfflineSessionBundle[]>([]);
  const [ops, setOps] = React.useState<OutboxOperation[]>([]);
  const [syncing, setSyncing] = React.useState(false);
  const [preloadingId, setPreloadingId] = React.useState<string | null>(null);

  const reloadLocal = React.useCallback(async () => {
    try {
      const db = getOfflineDb();
      const [b, o] = await Promise.all([
        db.sessionBundles.toArray(),
        db.outbox.reverse().sortBy("updated_at"),
      ]);
      setBundles(b);
      setOps(o);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const db = getOfflineDb();
    Promise.all([
      db.sessionBundles.toArray(),
      db.outbox.reverse().sortBy("updated_at"),
    ])
      .then(([b, o]) => {
        if (!cancelled) {
          setBundles(b);
          setOps(o);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const summary = await flushOutbox();
      await reloadLocal();
      window.dispatchEvent(new Event("fafc-outbox-updated"));
      toast.success(
        `Synchronisation terminée : ${summary.applied} confirmée(s), ${summary.conflicts} conflit(s), ${summary.errors} erreur(s).`,
      );
    } finally {
      setSyncing(false);
    }
  };

  const handlePreload = async (sessionId: string) => {
    setPreloadingId(sessionId);
    try {
      await preloadSessionForOffline(sessionId);
      await reloadLocal();
      toast.success("Session préchargée pour la saisie hors ligne.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec préchargement.");
    } finally {
      setPreloadingId(null);
    }
  };

  const handleResolve = async (
    opId: string,
    choice: "keep_local" | "accept_server",
  ) => {
    await resolveConflictOperation(opId, choice);
    if (choice === "keep_local" && navigator.onLine) {
      await flushOutbox();
    }
    await reloadLocal();
    window.dispatchEvent(new Event("fafc-outbox-updated"));
    toast.success("Conflit résolu.");
  };

  const handleClearSyncedHistory = async () => {
    const db = getOfflineDb();
    await db.outbox.where("state").equals("synced").delete();
    await reloadLocal();
    toast.success("Historique local des opérations déjà synchronisées nettoyé.");
  };

  const bundleById = new Map(bundles.map((b) => [b.session_id, b]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Mode Hors Ligne & Synchronisation Terrain
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Stockage local persistant IndexedDB • Opérations idempotentes • Arbitrage
            explicite des conflits.
          </p>
        </div>

        <Button onClick={handleSyncNow} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          <span>{syncing ? "Synchronisation..." : "Synchroniser maintenant"}</span>
        </Button>
      </div>

      {/* Préchargement des sessions */}
      <Card>
        <CardHeader>
          <CardTitle>1. Précharger une session avant d&apos;aller au terrain</CardTitle>
          <CardDescription>
            Télécharge localement les joueurs, ateliers, protocoles, barèmes et
            affectations dans IndexedDB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableSessions.map((s) => {
            const cached = bundleById.get(s.id);
            return (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
              >
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">
                    {s.name} ({formatDateFr(s.session_date)})
                  </p>
                  {cached ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      Préchargée le {formatDateFr(cached.preloaded_at, true)} •{" "}
                      {cached.session_players.length} joueurs • {cached.tests.length}{" "}
                      ateliers
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Non préchargée sur cet appareil
                    </p>
                  )}
                </div>
                <Button
                  variant={cached ? "outline" : "secondary"}
                  size="sm"
                  disabled={preloadingId === s.id}
                  onClick={() => handlePreload(s.id)}
                >
                  <CloudDownload className="h-4 w-4" />
                  <span>
                    {preloadingId === s.id
                      ? "Chargement..."
                      : cached
                        ? "Actualiser le cache local"
                        : "Précharger pour hors ligne"}
                  </span>
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* File d'attente des opérations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>2. File d&apos;opérations locales ({ops.length})</CardTitle>
            <CardDescription>
              Une donnée n&apos;est affichée « Synchronisée » qu&apos;après accusé de réception
              et enregistrement effectif en base PostgreSQL.
            </CardDescription>
          </div>
          {ops.some((o) => o.state === "synced") ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSyncedHistory}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Purger le journal synchronisé</span>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {ops.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucune opération en attente sur cet appareil.
            </p>
          ) : (
            <div className="space-y-2.5">
              {ops.map((op) => (
                <div
                  key={op.op_id}
                  className="rounded-xl border border-slate-200 p-3.5 text-xs space-y-2 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-slate-500">
                      Op #{op.op_id.slice(0, 8)} • Màj{" "}
                      {formatDateFr(op.updated_at, true)}
                    </span>
                    {op.state === "synced" ? (
                      <Badge variant="success">
                        <CheckCircle2 className="h-3 w-3" />
                        Confirmé serveur
                      </Badge>
                    ) : op.state === "conflict" ? (
                      <Badge variant="danger">
                        <AlertTriangle className="h-3 w-3" />
                        Conflit de version
                      </Badge>
                    ) : op.state === "error" ? (
                      <Badge variant="danger">Erreur</Badge>
                    ) : (
                      <Badge variant="warning">En attente réseau</Badge>
                    )}
                  </div>

                  {op.error_message ? (
                    <p className="text-red-700 font-medium">{op.error_message}</p>
                  ) : null}

                  {op.state === "conflict" && op.conflict_server ? (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
                      <p className="font-bold text-red-900">
                        Version serveur actuelle (v{op.conflict_server.server_version}) :
                        score {op.conflict_server.points ?? "—"} pts • commentaire «{" "}
                        {op.conflict_server.comment ?? "—"} »
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleResolve(op.op_id, "keep_local")}
                        >
                          Conserver ma saisie locale
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleResolve(op.op_id, "accept_server")
                          }
                        >
                          Adopter la version serveur
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Limites documentées du mode hors ligne */}
      <Card className="p-4 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
          <Info className="h-4 w-4 text-violet-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-slate-900 dark:text-white">
               Périmètre et limites du mode hors ligne (PWA)
            </p>
            <p>
              • L&apos;encadreur doit s&apos;être connecté et avoir préchargé la session au
              moins une fois avec du réseau avant de se rendre sur un terrain sans
              couverture.
            </p>
            <p>
              • La saisie des évaluations, le calcul instantané des scores et
              l&apos;enregistrement des observations fonctionnent intégralement hors
              ligne et survivent à la fermeture du navigateur.
            </p>
            <p>
              • La génération officielle et l&apos;archivage des rapports PDF dans
              Supabase Storage nécessitent une connexion active au serveur.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
