"use client";

import * as React from "react";
import Link from "next/link";
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { countUnsyncedOperations } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/sync";

export function SyncStatusPill() {
  const [online, setOnline] = React.useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [counts, setCounts] = React.useState({
    pending: 0,
    conflicts: 0,
    errors: 0,
  });
  const [syncing, setSyncing] = React.useState(false);

  const refreshCounts = React.useCallback(async () => {
    try {
      const c = await countUnsyncedOperations();
      setCounts(c);
    } catch {
      // IndexedDB indisponible (navigation privée très ancienne)
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    countUnsyncedOperations()
      .then((c) => {
        if (!cancelled) setCounts(c);
      })
      .catch(() => undefined);

    const handleOnline = () => {
      setOnline(true);
      refreshCounts();
    };
    const handleOffline = () => setOnline(false);
    const handleCustom = () => refreshCounts();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("fafc-outbox-updated", handleCustom);
    const interval = window.setInterval(refreshCounts, 6000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("fafc-outbox-updated", handleCustom);
      window.clearInterval(interval);
    };
  }, [refreshCounts]);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!online) {
      toast.warning("Appareil hors ligne : vos saisies sont protégées localement.");
      return;
    }
    setSyncing(true);
    try {
      const res = await flushOutbox();
      await refreshCounts();
      if (res.applied > 0) {
        toast.success(`${res.applied} saisie(s) synchronisée(s) et confirmée(s) par le serveur.`);
      } else if (res.conflicts > 0) {
        toast.warning(`${res.conflicts} conflit(s) à arbitrer dans Synchronisation.`);
      } else if (res.errors > 0) {
        toast.error(`${res.errors} opération(s) en erreur.`);
      } else {
        toast.info("Toutes les données locales sont déjà synchronisées.");
      }
    } finally {
      setSyncing(false);
    }
  };

  const totalPending = counts.pending + counts.errors;

  if (!online) {
    return (
      <Link
        href="/synchronisation"
        className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-950 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200"
      >
        <WifiOff className="h-3.5 w-3.5 text-orange-600" />
        <span>Hors ligne</span>
        {totalPending > 0 ? (
          <span className="rounded-full bg-orange-600 px-1.5 py-0.5 text-[10px] text-white">
            {totalPending} en attente
          </span>
        ) : null}
      </Link>
    );
  }

  if (counts.conflicts > 0) {
    return (
      <Link
        href="/synchronisation"
        className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
        <span>{counts.conflicts} conflit(s)</span>
      </Link>
    );
  }

  if (totalPending > 0) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 pl-3 pr-1.5 py-1 text-xs font-semibold text-amber-950">
        <Wifi className="h-3.5 w-3.5 text-amber-600" />
        <Link href="/synchronisation">{totalPending} à synchroniser</Link>
        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncing}
          title="Synchroniser maintenant"
          className="rounded-full bg-violet-800 p-1 text-white hover:bg-violet-900"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/synchronisation"
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
    >
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      <span className="hidden sm:inline">Synchronisé</span>
    </Link>
  );
}
