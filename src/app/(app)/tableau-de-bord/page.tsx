import Link from "next/link";
import {
  Users,
  CalendarRange,
  CheckCircle2,
  Clock,
  FileText,
  TrendingUp,
  Timer,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { requirePageAuth } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertBanner, DemoTag } from "@/components/ui/states";
import {
  CategoryDistributionChart,
  DashboardSyncCard,
  SessionDomainAverageChart,
} from "@/components/dashboard/dashboard-charts";
import { formatDateFr, SESSION_STATUS_LABELS } from "@/lib/utils";
import { round } from "@/lib/scoring/engine";

export default async function TableauDeBordPage({
  searchParams,
}: {
  searchParams: Promise<{ acces?: string }>;
}) {
  const { supabase, profile } = await requirePageAuth();
  const sp = await searchParams;
  const isAdmin = profile.role === "admin";

  const [
    playersRes,
    categoriesRes,
    sessionsRes,
    reportsRes,
    rubricsRes,
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, category_id, status, is_demo")
      .neq("status", "archived"),
    supabase
      .from("assessment_categories")
      .select("id, code, label")
      .order("sort_order"),
    supabase
      .from("assessment_sessions")
      .select("*")
      .order("session_date", { ascending: false }),
    isAdmin
      ? supabase
          .from("assessment_reports")
          .select(
            "id, file_name, generated_at, version, status, player:players(last_name, first_name, is_demo), session:assessment_sessions(name)",
          )
          .neq("status", "archived")
          .order("generated_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("rubric_versions")
      .select("id, config")
      .eq("status", "active"),
  ]);

  const players = playersRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const recentReports = reportsRes.data ?? [];

  const reportsCountRes = isAdmin
    ? await supabase
        .from("assessment_reports")
        .select("id", { count: "exact", head: true })
        .neq("status", "archived")
    : { count: 0 };

  // Session active prioritaire : "in_progress", sinon prochaine session brouillon/à valider
  const activeSession =
    sessions.find((s) => s.status === "in_progress") ??
    sessions.find((s) => s.status === "to_validate") ??
    sessions[0] ??
    null;

  let activeSessionPlayersCount = 0;
  let evaluatedPlayersCount = 0;
  let pendingPlayersCount = 0;
  let expectedEvaluations = 0;
  let completedEvaluations = 0;
  let globalAverage: number | null = null;
  let domainAverages = [
    { domain: "Athlétique", pct: 0 },
    { domain: "Technique", pct: 0 },
    { domain: "Physique", pct: 0 },
    { domain: "Intelligence", pct: 0 },
    { domain: "Esprit d'équipe", pct: 0 },
  ];

  if (activeSession) {
    const [spListRes, stListRes, evalsRes, scoresRes] = await Promise.all([
      supabase
        .from("session_players")
        .select("player_id, status")
        .eq("session_id", activeSession.id)
        .neq("status", "withdrawn"),
      supabase
        .from("session_tests")
        .select("test_id")
        .eq("session_id", activeSession.id),
      supabase
        .from("test_evaluations")
        .select("player_id, test_id, status, points")
        .eq("session_id", activeSession.id),
      supabase
        .from("assessment_scores")
        .select("total, athletic, technical, physical, game_intelligence, team_spirit")
        .eq("session_id", activeSession.id),
    ]);

    const spList = spListRes.data ?? [];
    const stList = stListRes.data ?? [];
    const evals = evalsRes.data ?? [];
    const scores = scoresRes.data ?? [];

    activeSessionPlayersCount = spList.length;
    expectedEvaluations = spList.length * stList.length;
    completedEvaluations = evals.filter(
      (e) =>
        e.status === "completed" ||
        e.status === "absent" ||
        e.status === "exempt",
    ).length;

    const evaluatedPlayerSet = new Set(
      evals
        .filter((e) => e.status === "completed")
        .map((e) => e.player_id),
    );
    evaluatedPlayersCount = evaluatedPlayerSet.size;
    pendingPlayersCount = Math.max(0, activeSessionPlayersCount - evaluatedPlayersCount);

    const validTotals = scores
      .map((s) => (s.total !== null ? Number(s.total) : null))
      .filter((v): v is number => v !== null);
    if (validTotals.length > 0) {
      globalAverage = round(
        validTotals.reduce((a, b) => a + b, 0) / validTotals.length,
        1,
      );
    }

    const avgPct = (
      vals: (number | string | null)[],
      max: number,
    ): number => {
      const nums = vals
        .map((v) => (v !== null && v !== undefined ? Number(v) : null))
        .filter((v): v is number => v !== null);
      if (!nums.length) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return Math.round((mean / max) * 100);
    };

    domainAverages = [
      { domain: "Athlétique", pct: avgPct(scores.map((s) => s.athletic), 40) },
      { domain: "Technique", pct: avgPct(scores.map((s) => s.technical), 30) },
      { domain: "Physique", pct: avgPct(scores.map((s) => s.physical), 10) },
      {
        domain: "Intelligence",
        pct: avgPct(scores.map((s) => s.game_intelligence), 15),
      },
      {
        domain: "Esprit d'équipe",
        pct: avgPct(scores.map((s) => s.team_spirit), 5),
      },
    ];
  }

  // Répartition des joueurs par catégorie
  const categoryChartData = categories.map((cat) => ({
    category: cat.label,
    count: players.filter((p) => p.category_id === cat.id).length,
  }));

  // Vérification des barèmes encore non configurés (mode = "none")
  const unconfiguredCount = (rubricsRes.data ?? []).filter((r) => {
    const comps = (r.config as { components?: { kind?: string; scoring?: { mode?: string } }[] })
      ?.components ?? [];
    return comps.some((c) => c.kind === "measured" && c.scoring?.mode === "none");
  }).length;

  const progressPct =
    expectedEvaluations > 0
      ? Math.round((completedEvaluations / expectedEvaluations) * 100)
      : 0;

  const sessionsInProgress = sessions.filter(
    (s) => s.status === "in_progress",
  ).length;

  return (
    <div className="space-y-6">
      {sp.acces === "refuse" ? (
        <AlertBanner variant="warning" title="Accès réservé aux administrateurs">
          Vous avez été redirigé car la section demandée est réservée à la direction de
          l&apos;académie.
        </AlertBanner>
      ) : null}

      {/* Bandeau héro institutionnel */}
      <div className="pitch-pattern rounded-3xl p-6 sm:p-8 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-300">
              Tableau de pilotage sportif •{" "}
              {isAdmin ? "Vue Direction & Administration" : "Vue Encadreur Terrain"}
            </p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
              Bienvenue, {profile.full_name || "Coach"}
            </h1>
            {activeSession ? (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/90">
                <span className="font-semibold">{activeSession.name}</span>
                <span>•</span>
                <span>{formatDateFr(activeSession.session_date)}</span>
                {activeSession.location ? (
                  <span className="inline-flex items-center gap-1 text-sky-200">
                    <MapPin className="h-3.5 w-3.5" />
                    {activeSession.location}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/80">
                Aucune session affectée pour le moment.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/terrain"
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-300 px-5 py-3 text-sm font-black text-slate-950 shadow-sm hover:bg-sky-200"
            >
              <Timer className="h-4 w-4" />
              <span>Lancer la saisie terrain</span>
            </Link>
            {isAdmin ? (
              <Link
                href="/sessions"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20"
              >
                <CalendarRange className="h-4 w-4" />
                <span>Gérer les sessions</span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* Alerte pédagogique si des seuils chronométrés restent à définir */}
      {isAdmin && unconfiguredCount > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {unconfiguredCount} barème(s) chronométré(s) ou de distance attendent vos
                seuils de référence
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                Conformément à la méthodologie du club, aucun seuil universel n&apos;est
                inventé par défaut : configurez vos paliers par catégorie avant la
                validation finale.
              </p>
            </div>
          </div>
          <Link
            href="/baremes"
            className="shrink-0 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-orange-700"
          >
            Configurer les barèmes →
          </Link>
        </div>
      ) : null}

      {/* Cartes statistiques alimentées en temps réel par PostgreSQL */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Joueurs enregistrés"
          value={String(players.length)}
          sub="Fiches actives en base"
          icon={Users}
          tone="violet"
        />
        <StatCard
          label="Joueurs évalués (session)"
          value={`${evaluatedPlayersCount} / ${activeSessionPlayersCount}`}
          sub={`${pendingPlayersCount} joueur(s) en attente`}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="Sessions (dont en cours)"
          value={`${sessions.length} (${sessionsInProgress})`}
          sub="Historique & actives"
          icon={CalendarRange}
          tone="sky"
        />
        <StatCard
          label={isAdmin ? "Rapports PDF / Moyenne" : "Moyenne globale session"}
          value={
            isAdmin
              ? `${reportsCountRes.count ?? 0} PDF`
              : globalAverage !== null
                ? `${globalAverage} / 100`
                : "—"
          }
          sub={
            globalAverage !== null
              ? `Moyenne globale : ${globalAverage} / 100`
              : "En attente de scores complets"
          }
          icon={isAdmin ? FileText : TrendingUp}
          tone="orange"
        />
      </div>

      {/* Progression de la session active + État des synchronisations */}
      <div className="grid lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Progression de la session active</CardTitle>
              {activeSession ? (
                <Badge
                  variant={
                    activeSession.status === "in_progress"
                      ? "success"
                      : activeSession.status === "finalized"
                        ? "violet"
                        : "warning"
                  }
                >
                  {SESSION_STATUS_LABELS[activeSession.status] ?? activeSession.status}
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              {activeSession
                ? `${completedEvaluations} évaluation(s) terminée(s) sur ${expectedEvaluations} attendues (${progressPct} %)`
                : "Créez ou ouvrez une session pour suivre l'avancement en direct."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-700 to-sky-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-orange-600" />
                {pendingPlayersCount} joueur(s) sans atelier validé
              </span>
              {activeSession ? (
                <Link
                  href={`/sessions/${activeSession.id}`}
                  className="font-bold text-violet-800 hover:underline dark:text-sky-300"
                >
                  Ouvrir le détail de la session →
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-5">
          <DashboardSyncCard />
        </div>
      </div>

      {/* Graphiques Recharts */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Répartition des joueurs par catégorie</CardTitle>
            <CardDescription>
              Effectif enregistré par tranche d&apos;âge académie
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryDistributionChart data={categoryChartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition des résultats par domaine</CardTitle>
            <CardDescription>
              Moyenne normalisée sur 100 de la session active
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionDomainAverageChart data={domainAverages} />
          </CardContent>
        </Card>
      </div>

      {/* Sessions récentes & Derniers rapports PDF */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Sessions récentes</CardTitle>
              <CardDescription>Calendrier d&apos;évaluation du club</CardDescription>
            </div>
            <Link
              href="/sessions"
              className="text-xs font-bold text-violet-800 hover:underline dark:text-sky-300"
            >
              Tout voir →
            </Link>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune session enregistrée.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.slice(0, 5).map((s) => (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50 px-2 rounded-xl transition-colors dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                          {s.name}
                        </p>
                        <DemoTag isDemo={s.is_demo} />
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatDateFr(s.session_date)}
                        {s.location ? ` • ${s.location}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        s.status === "in_progress"
                          ? "success"
                          : s.status === "finalized"
                            ? "violet"
                            : "neutral"
                      }
                    >
                      {SESSION_STATUS_LABELS[s.status] ?? s.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Derniers rapports PDF générés</CardTitle>
                <CardDescription>Stockage privé sécurisé</CardDescription>
              </div>
              <Link
                href="/rapports"
                className="text-xs font-bold text-violet-800 hover:underline dark:text-sky-300"
              >
                Module Rapports →
              </Link>
            </CardHeader>
            <CardContent>
              {recentReports.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aucun rapport PDF généré pour le moment.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentReports.map((r: Record<string, unknown>) => {
                    const p = (Array.isArray(r.player) ? r.player[0] : r.player) as {
                      last_name?: string;
                      first_name?: string;
                      is_demo?: boolean;
                    } | null;
                    return (
                      <div
                        key={String(r.id)}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold">
                              {p
                                ? `${p.last_name} ${p.first_name}`
                                : String(r.file_name)}
                            </p>
                            <DemoTag isDemo={p?.is_demo} />
                          </div>
                          <p className="text-xs text-slate-500">
                            v{String(r.version)} • {formatDateFr(String(r.generated_at), true)}
                          </p>
                        </div>
                        <a
                          href={`/api/reports/${String(r.id)}/download`}
                          className="rounded-xl bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-100"
                        >
                          Télécharger
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "violet" | "emerald" | "sky" | "orange";
}) {
  const palette = {
    violet:
      "bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300",
    emerald:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
    sky: "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300",
    orange:
      "bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300",
  }[tone];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{sub}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
