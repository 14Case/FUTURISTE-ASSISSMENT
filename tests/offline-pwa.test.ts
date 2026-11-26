import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  countUnsyncedOperations,
  enqueueEvaluationOp,
  FuturisteOfflineDB,
} from "@/lib/offline/db";
import {
  flushOutbox,
  preloadSessionForOffline,
  resolveConflictOperation,
} from "@/lib/offline/sync";

describe("PWA Hors ligne — IndexedDB, déduplication, synchronisation et conflits", () => {
  it("précharge une session, fusionne les saisies multiples hors ligne sans doublon et refuse de marquer synchronisé sans confirmation serveur", async () => {
    const db = new FuturisteOfflineDB(`test_offline_${crypto.randomUUID()}`);

    // 1. Préchargement hors ligne
    const fakeBundleFetch = (async () =>
      new Response(
        JSON.stringify({
          session: {
            id: "sess-1",
            name: "Session Japoma",
            session_date: "2026-11-28",
            status: "in_progress",
          },
          categories: [],
          domains: [],
          tests: [],
          age_rules: [],
          rubrics: [],
          assignments: [],
          session_players: [],
          evaluations: [],
          sex_field_enabled: true,
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const bundle = await preloadSessionForOffline("sess-1", {
      db,
      fetchImpl: fakeBundleFetch,
    });
    expect(bundle.session_id).toBe("sess-1");

    // 2. Deux modifications successives hors ligne sur le même joueur/atelier -> 1 seule opération dans l'outbox avec chaîne supersedes
    const op1 = await enqueueEvaluationOp(
      {
        session_id: "sess-1",
        player_id: "pl-1",
        test_id: "t-1",
        known_server_version: 2,
        status: "in_progress",
        components: [{ key: "precision", attempts: [{ value: 6 }] }],
        comment: "Premier essai",
      },
      db,
    );

    const op2 = await enqueueEvaluationOp(
      {
        session_id: "sess-1",
        player_id: "pl-1",
        test_id: "t-1",
        known_server_version: 2,
        status: "completed",
        components: [{ key: "precision", attempts: [{ value: 9 }] }],
        comment: "Corrigé hors ligne",
      },
      db,
    );

    const allPending = await db.outbox.toArray();
    expect(allPending).toHaveLength(1);
    expect(allPending[0].op_id).toBe(op2.op_id);
    expect(allPending[0].base_version).toBe(2);
    expect(allPending[0].supersedes).toContain(op1.op_id);

    // 3. Coupure réseau lors du sync -> reste 'pending', jamais faussement 'synced'
    const offlineFetch = (async () => {
      throw new Error("Network unreachable");
    }) as unknown as typeof fetch;

    const failedSync = await flushOutbox({ db, fetchImpl: offlineFetch });
    expect(failedSync.applied).toBe(0);
    const countsAfterDrop = await countUnsyncedOperations(db);
    expect(countsAfterDrop.pending).toBe(1);

    // 4. Retour réseau mais conflit détecté par le serveur (version 3 sur le serveur)
    const conflictFetch = (async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          results: [
            {
              op_id: sent.operations[0].op_id,
              status: "conflict",
              server_version: 3,
              server: {
                status: "completed",
                points: 7,
                comment: "Saisi par un autre coach",
                updated_at: "2026-11-28T11:00:00Z",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const conflictSync = await flushOutbox({ db, fetchImpl: conflictFetch });
    expect(conflictSync.conflicts).toBe(1);
    expect((await countUnsyncedOperations(db)).conflicts).toBe(1);

    // 5. Arbitrage du conflit : conserver la saisie locale (base_version mis à 3) puis synchronisation confirmée
    await resolveConflictOperation(op2.op_id, "keep_local", db);

    const appliedFetch = (async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      expect(sent.operations[0].base_version).toBe(3);
      return new Response(
        JSON.stringify({
          results: [
            {
              op_id: sent.operations[0].op_id,
              status: "applied",
              evaluation_id: "ev-1",
              server_version: 4,
              points: 4.5,
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const okSync = await flushOutbox({ db, fetchImpl: appliedFetch });
    expect(okSync.applied).toBe(1);
    expect((await countUnsyncedOperations(db)).pending).toBe(0);
    expect((await countUnsyncedOperations(db)).conflicts).toBe(0);
  });
});
