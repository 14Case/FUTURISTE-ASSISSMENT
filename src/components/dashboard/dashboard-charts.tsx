"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { CloudUpload } from "lucide-react";
import { countUnsyncedOperations, getOfflineDb } from "@/lib/offline/db";

export function CategoryDistributionChart({
  data,
}: {
  data: { category: string; count: number }[];
}) {
  const hasAny = data.some((d) => d.count > 0);
  if (!hasAny) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-slate-950">
        Aucun joueur enregistré pour le moment.
      </div>
    );
  }

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="category" tick={{ fontSize: 12, fontWeight: 600 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [`${v} joueur(s)`, "Effectif"]} />
          <Bar dataKey="count" fill="#5B21B6" radius={[8, 8, 0, 0]} barSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SessionDomainAverageChart({
  data,
}: {
  data: { domain: string; pct: number }[];
}) {
  const hasAny = data.some((d) => d.pct > 0);
  if (!hasAny) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-slate-950">
        Les moyennes par domaine s&apos;afficheront dès les premières évaluations saisies.
      </div>
    );
  }

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="#cbd5e1" />
          <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fontWeight: 600 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Radar
            name="Moyenne session (%)"
            dataKey="pct"
            stroke="#5B21B6"
            strokeWidth={2}
            fill="#7DD3FC"
            fillOpacity={0.5}
          />
          <Tooltip formatter={(v) => [`${v} %`, "Moyenne"]} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardSyncCard() {
  const [state, setState] = React.useState<{
    online: boolean;
    pending: number;
    conflicts: number;
    errors: number;
    preloadedSessions: number;
  }>({
    online: true,
    pending: 0,
    conflicts: 0,
    errors: 0,
    preloadedSessions: 0,
  });

  React.useEffect(() => {
    const load = async () => {
      try {
        const db = getOfflineDb();
        const [counts, bundles] = await Promise.all([
          countUnsyncedOperations(db),
          db.sessionBundles.count(),
        ]);
        setState({
          online: navigator.onLine,
          ...counts,
          preloadedSessions: bundles,
        });
      } catch {
        setState((s) => ({ ...s, online: navigator.onLine }));
      }
    };
    load();
    window.addEventListener("online", load);
    window.addEventListener("offline", load);
    return () => {
      window.removeEventListener("online", load);
      window.removeEventListener("offline", load);
    };
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300">
            <CloudUpload className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              État des synchronisations PWA
            </p>
            <p className="text-xs text-slate-500">
              {state.online ? "Connecté au serveur" : "Mode hors ligne actif"} •{" "}
              {state.preloadedSessions} session(s) préchargée(s) sur cet appareil
            </p>
          </div>
        </div>
        <Link
          href="/synchronisation"
          className="text-xs font-bold text-violet-800 hover:underline dark:text-sky-300"
        >
          Gérer →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5 text-center text-xs">
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950">
          <p className="text-lg font-black text-slate-900 dark:text-white">
            {state.pending}
          </p>
          <p className="text-slate-500">En attente</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950">
          <p className="text-lg font-black text-orange-600">{state.conflicts}</p>
          <p className="text-slate-500">Conflits</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950">
          <p className="text-lg font-black text-red-600">{state.errors}</p>
          <p className="text-slate-500">Erreurs</p>
        </div>
      </div>
    </div>
  );
}
