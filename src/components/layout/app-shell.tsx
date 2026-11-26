"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Users,
  CalendarRange,
  Timer,
  Sliders,
  Trophy,
  FileText,
  CloudUpload,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/lib/types/database";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { countUnsyncedOperations } from "@/lib/offline/db";
import { SyncStatusPill } from "@/components/offline/sync-status-pill";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  mobilePrimary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/tableau-de-bord",
    label: "Tableau de bord",
    icon: LayoutDashboard,
    mobilePrimary: true,
  },
  {
    href: "/terrain",
    label: "Saisie terrain",
    icon: Timer,
    mobilePrimary: true,
  },
  {
    href: "/sessions",
    label: "Sessions",
    icon: CalendarRange,
    mobilePrimary: true,
  },
  {
    href: "/joueurs",
    label: "Joueurs",
    icon: Users,
    mobilePrimary: true,
  },
  {
    href: "/classement",
    label: "Classement & Analyse",
    icon: Trophy,
  },
  {
    href: "/rapports",
    label: "Rapports PDF",
    icon: FileText,
    adminOnly: true,
  },
  {
    href: "/baremes",
    label: "Ateliers & Barèmes",
    icon: Sliders,
    adminOnly: true,
  },
  {
    href: "/exports",
    label: "Exports & Intégration",
    icon: Download,
    adminOnly: true,
  },
  {
    href: "/synchronisation",
    label: "Mode hors ligne & Sync",
    icon: CloudUpload,
  },
  {
    href: "/encadreurs",
    label: "Comptes & Encadreurs",
    icon: Users,
    adminOnly: true,
  },
  {
    href: "/audit",
    label: "Journal d'audit",
    icon: ShieldCheck,
    adminOnly: true,
  },
  {
    href: "/parametres",
    label: "Paramètres du club",
    icon: Settings,
    adminOnly: true,
  },
];

export function AppShell({
  profile,
  clubName,
  children,
}: {
  profile: Profile;
  clubName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const isAdmin = profile.role === "admin";
  const visibleItems = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const mobileBottomItems = visibleItems.filter((i) => i.mobilePrimary);

  const handleLogout = async () => {
    try {
      const unsynced = await countUnsyncedOperations();
      if (unsynced.pending + unsynced.conflicts + unsynced.errors > 0) {
        const proceed = window.confirm(
          "Attention : des saisies locales ne sont pas encore synchronisées avec le serveur. Voulez-vous vraiment vous déconnecter maintenant ?",
        );
        if (!proceed) return;
      }
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push("/connexion");
      router.refresh();
    } catch {
      toast.error("Impossible de fermer la session hors connexion.");
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-70 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 z-30">
        <div className="pitch-pattern px-5 py-5 text-white">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-pdf.png"
              alt="Logo officiel FUTURISTE ACADÉMIE FC"
              className="h-12 w-12 shrink-0 rounded-full bg-white p-0.5 shadow-md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-wide">
                {clubName}
              </p>
              <p className="text-[11px] font-semibold text-sky-300 tracking-wider uppercase">
                Futuriste Assessment
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-violet-800 text-white shadow-xs dark:bg-violet-700"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 shrink-0",
                    active ? "text-sky-300" : "text-slate-500 dark:text-slate-400",
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {profile.full_name || profile.email}
              </p>
              <Badge variant={isAdmin ? "violet" : "sky"} className="mt-0.5">
                {isAdmin ? "Administrateur" : "Encadreur"}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Basculer le thème clair/sombre"
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:border-slate-800 dark:text-slate-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Colonne principale */}
      <div className="flex flex-1 flex-col lg:pl-70 min-w-0">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
              className="lg:hidden rounded-xl border border-slate-200 p-2 text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2.5 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-pdf.png" alt="FAFC" className="h-9 w-9 rounded-full bg-white p-0.5 shadow-xs" />
              <span className="font-black text-sm tracking-tight text-violet-900 dark:text-sky-300">
                FAFC ÉVALUATION
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <SyncStatusPill />
            <Link
              href="/terrain"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-violet-800 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-violet-900"
            >
              <Timer className="h-3.5 w-3.5 text-sky-300" />
              <span>Mode Terrain</span>
            </Link>
          </div>
        </header>

        {/* Contenu */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 pb-24 lg:pb-10 pitch-grid">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Navigation mobile inférieure (accès 1 pouce au bord du terrain) */}
      <nav
        aria-label="Navigation mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 py-1.5 px-2 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95"
      >
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-bold min-w-16",
                active
                  ? "text-violet-800 bg-violet-50 dark:text-sky-300 dark:bg-violet-950/60"
                  : "text-slate-600 dark:text-slate-400",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>

      {/* Tiroir mobile complet */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="h-full w-76 max-w-[85vw] bg-white dark:bg-slate-900 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pitch-pattern p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo-pdf.png" alt="FAFC" className="h-10 w-10 rounded-full bg-white p-0.5" />
                <div>
                  <p className="text-sm font-black">{clubName}</p>
                  <p className="text-[11px] text-sky-300">
                    {isAdmin ? "Administrateur" : "Encadreur"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold",
                      active
                        ? "bg-violet-800 text-white"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-slate-200 p-4 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {theme === "dark" ? "Mode clair" : "Mode sombre"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
