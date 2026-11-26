import {
  getOfflineDb,
  type FuturisteOfflineDB,
  type OfflineSessionBundle,
  type OutboxOperation,
} from "./db";

export interface SyncServerItemResult {
  op_id: string;
  status: "applied" | "conflict" | "rejected";
  evaluation_id?: string;
  server_version?: number;
  points?: number | null;
  score_status?: string;
  error?: string;
  server?: {
    status: OutboxOperation["status"];
    points: number | null;
    comment: string | null;
    updated_at: string;
  };
}

export interface SyncSummary {
  attempted: number;
  applied: number;
  conflicts: number;
  errors: number;
}

let activeSyncPromise: Promise<SyncSummary> | null = null;

/**
 * Synchronise les opérations en attente vers `/api/sync/evaluations`.
 *
 * Garanties (Section 12) :
 * - Idempotence via `op_id` UUID persisté côté serveur dans `sync_operations`.
 * - Une opération n'est marquée `synced` QUE lorsque le serveur renvoie explicitement
 *   `status === "applied"` avec le numéro de `server_version` confirmé.
 * - Détection de conflit : si un autre encadreur a modifié la même fiche entre-temps,
 *   l'opération passe à l'état `conflict` avec l'instantané serveur pour arbitrage.
 */
export async function flushOutbox(
  options: {
    db?: FuturisteOfflineDB;
    fetchImpl?: typeof fetch;
    sessionId?: string;
  } = {},
): Promise<SyncSummary> {
  if (activeSyncPromise && !options.db) {
    return activeSyncPromise;
  }

  const run = async (): Promise<SyncSummary> => {
    const db = options.db ?? getOfflineDb();
    const fetchFn = options.fetchImpl ?? fetch;

    const candidates = (
      await db.outbox
        .filter(
          (op) =>
            (op.state === "pending" || op.state === "error") &&
            (!options.sessionId || op.session_id === options.sessionId),
        )
        .sortBy("updated_at")
    ).slice(0, 100);

    if (candidates.length === 0) {
      return { attempted: 0, applied: 0, conflicts: 0, errors: 0 };
    }

    await db.outbox.bulkPut(
      candidates.map((c) => ({ ...c, state: "syncing" as const })),
    );

    let response: Response;
    try {
      response = await fetchFn("/api/sync/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operations: candidates.map((c) => ({
            op_id: c.op_id,
            session_id: c.session_id,
            player_id: c.player_id,
            test_id: c.test_id,
            base_version: c.base_version,
            supersedes: c.supersedes,
            status: c.status,
            components: c.components,
            comment: c.comment,
            reason: c.reason ?? null,
          })),
        }),
      });
    } catch (networkErr) {
      const msg =
        networkErr instanceof Error
          ? networkErr.message
          : "Connexion réseau indisponible.";
      await db.outbox.bulkPut(
        candidates.map((c) => ({
          ...c,
          state: "pending" as const,
          error_message: msg,
        })),
      );
      return { attempted: candidates.length, applied: 0, conflicts: 0, errors: 0 };
    }

    if (!response.ok) {
      let errText = `Erreur serveur (${response.status}).`;
      try {
        const body = await response.json();
        if (body?.error) errText = body.error;
      } catch {
        // ignore
      }
      await db.outbox.bulkPut(
        candidates.map((c) => ({
          ...c,
          state: response.status >= 500 ? ("pending" as const) : ("error" as const),
          error_message: errText,
        })),
      );
      return {
        attempted: candidates.length,
        applied: 0,
        conflicts: 0,
        errors: candidates.length,
      };
    }

    const payload = (await response.json()) as { results: SyncServerItemResult[] };
    const byOp = new Map(payload.results.map((r) => [r.op_id, r]));
    const now = new Date().toISOString();

    let applied = 0;
    let conflicts = 0;
    let errors = 0;

    for (const c of candidates) {
      const res = byOp.get(c.op_id);
      if (!res) {
        errors += 1;
        await db.outbox.update(c.op_id, {
          state: "error",
          error_message: "Aucune confirmation reçue du serveur pour cette opération.",
        });
        continue;
      }

      if (res.status === "applied" && typeof res.server_version === "number") {
        applied += 1;
        await db.outbox.update(c.op_id, {
          state: "synced",
          synced_at: now,
          error_message: null,
          conflict_server: null,
        });

        // Mettre à jour la version connue dans le bundle local préchargé
        const bundle = await db.sessionBundles.get(c.session_id);
        if (bundle) {
          const idx = bundle.evaluations.findIndex(
            (e) => e.player_id === c.player_id && e.test_id === c.test_id,
          );
          if (idx >= 0) {
            bundle.evaluations[idx] = {
              ...bundle.evaluations[idx],
              version: res.server_version,
              status: c.status,
              points: res.points ?? bundle.evaluations[idx].points,
              comment: c.comment,
              last_op_id: c.op_id,
              updated_at: now,
            };
          } else if (res.evaluation_id) {
            bundle.evaluations.push({
              id: res.evaluation_id,
              session_id: c.session_id,
              player_id: c.player_id,
              test_id: c.test_id,
              rubric_version_id: null,
              status: c.status,
              points: res.points ?? null,
              score_status: "complete",
              component_scores: [],
              comment: c.comment,
              evaluated_by: null,
              evaluated_at: now,
              validated_by: null,
              validated_at: null,
              version: res.server_version,
              last_op_id: c.op_id,
              created_at: now,
              updated_at: now,
            });
          }
          await db.sessionBundles.put(bundle);
        }
      } else if (res.status === "conflict" && res.server) {
        conflicts += 1;
        await db.outbox.update(c.op_id, {
          state: "conflict",
          error_message:
            "Conflit détecté : un autre encadreur ou responsable a modifié ce résultat sur le serveur.",
          conflict_server: {
            server_version: res.server_version ?? c.base_version + 1,
            status: res.server.status,
            points: res.server.points,
            comment: res.server.comment,
            updated_at: res.server.updated_at,
          },
        });
      } else {
        errors += 1;
        await db.outbox.update(c.op_id, {
          state: "error",
          error_message: res.error ?? "Opération refusée par le serveur.",
        });
      }
    }

    return { attempted: candidates.length, applied, conflicts, errors };
  };

  if (options.db) {
    return run();
  }
  activeSyncPromise = run().finally(() => {
    activeSyncPromise = null;
  });
  return activeSyncPromise;
}

/**
 * Résolution explicite d'un conflit par l'utilisateur :
 * - "keep_local" : force l'application de la saisie locale au-dessus de la `server_version` actuelle.
 * - "accept_server" : abandonne l'opération locale et conserve l'état serveur.
 */
export async function resolveConflictOperation(
  opId: string,
  choice: "keep_local" | "accept_server",
  db: FuturisteOfflineDB = getOfflineDb(),
): Promise<void> {
  const op = await db.outbox.get(opId);
  if (!op || op.state !== "conflict") return;

  if (choice === "accept_server") {
    await db.outbox.delete(opId);
    return;
  }

  const nextOp: OutboxOperation = {
    ...op,
    op_id: crypto.randomUUID(),
    base_version: op.conflict_server?.server_version ?? op.base_version,
    supersedes: [...new Set([...op.supersedes, op.op_id])],
    state: "pending",
    error_message: null,
    conflict_server: null,
    updated_at: new Date().toISOString(),
  };
  await db.transaction("rw", db.outbox, async () => {
    await db.outbox.delete(opId);
    await db.outbox.put(nextOp);
  });
}

/**
 * Précharge l'intégralité d'une session (joueurs, ateliers, barèmes, affectations,
 * évaluations existantes) dans IndexedDB pour utilisation au bord du terrain sans réseau.
 */
export async function preloadSessionForOffline(
  sessionId: string,
  options: { db?: FuturisteOfflineDB; fetchImpl?: typeof fetch } = {},
): Promise<OfflineSessionBundle> {
  const db = options.db ?? getOfflineDb();
  const fetchFn = options.fetchImpl ?? fetch;

  const res = await fetchFn(`/api/sessions/${sessionId}/bundle`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? "Impossible de précharger la session.");
  }
  const data = (await res.json()) as OfflineSessionBundle;
  const bundle: OfflineSessionBundle = {
    ...data,
    session_id: sessionId,
    preloaded_at: new Date().toISOString(),
  };
  await db.sessionBundles.put(bundle);
  return bundle;
}
