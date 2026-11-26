"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Mail, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { loginSchema } from "@/lib/validation/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AlertBanner } from "@/components/ui/states";

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("suivant") || "/tableau-de-bord";
  const accountError = searchParams.get("erreur");

  const [needsBootstrap, setNeedsBootstrap] = React.useState(false);
  const [dbError, setDbError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  React.useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((r) => r.json())
      .then((data) => {
        if (data?.needs_bootstrap) setNeedsBootstrap(true);
        if (data?.db_error) setDbError(data.db_error);
      })
      .catch(() => undefined);
  }, []);

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) {
        toast.error("Identifiants incorrects ou accès refusé.");
        return;
      }

      toast.success("Connexion réussie.");
      router.push(nextPath.startsWith("/") ? nextPath : "/tableau-de-bord");
      router.refresh();
    } catch {
      toast.error("Impossible de joindre le service d'authentification.");
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      {accountError === "compte_inactif" ? (
        <AlertBanner variant="error" title="Compte désactivé">
          Votre compte encadreur est actuellement inactif. Contactez la direction de
          l&apos;académie.
        </AlertBanner>
      ) : null}

      {dbError ? (
        <AlertBanner variant="warning" title="Migrations SQL requises">
          {dbError}
        </AlertBanner>
      ) : null}

      {needsBootstrap ? (
        <AlertBanner variant="info" title="Première mise en service">
          Aucun compte administrateur n&apos;est encore enregistré.{" "}
          <Link href="/initialisation" className="font-bold underline">
            Créer le premier compte Administrateur →
          </Link>
        </AlertBanner>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Connexion Staff & Encadreurs
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Accès sécurisé réservé aux administrateurs et encadreurs habilités de
            FUTURISTE ACADÉMIE FC.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">Adresse email professionnelle</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="coach@futuriste-academie.cm"
                className="pl-10"
                {...register("email")}
              />
            </div>
            {errors.email ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="pl-10"
                {...register("password")}
              />
            </div>
            {errors.password ? (
              <p className="mt-1 text-xs font-medium text-red-600">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            size="field"
            disabled={isSubmitting}
            className="w-full mt-2"
          >
            <span>{isSubmitting ? "Vérification..." : "Accéder à la plateforme"}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800">
          <ShieldCheck className="h-4 w-4 text-violet-700 shrink-0" />
          <span>
            Protection des mineurs : données chiffrées et isolées par politiques Row Level
            Security.
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ConnexionPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50 dark:bg-slate-950">
      <div className="lg:col-span-5 pitch-pattern text-white p-8 sm:p-12 flex flex-col justify-between">
        <div className="flex items-center gap-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-pdf.png" alt="FUTURISTE ACADÉMIE FC" className="h-16 w-16 rounded-full bg-white p-0.5 shadow-md" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-300">
              Centre de Formation
            </p>
            <h1 className="text-xl font-black tracking-wide">
              FUTURISTE ACADÉMIE FC
            </h1>
          </div>
        </div>

        <div className="my-10 space-y-4">
          <span className="inline-block rounded-full bg-white/10 border border-sky-300/40 px-3 py-1 text-xs font-bold text-sky-200">
            Saison 2026–2027 • Douala, Cameroun
          </span>
          <h2 className="text-3xl sm:text-4xl font-black leading-tight">
            Évaluer, analyser et révéler le potentiel de chaque jeune joueur.
          </h2>
          <p className="text-sm sm:text-base text-white/85 leading-relaxed">
            Saisie mobile au bord du terrain (en ligne et hors ligne), barèmes
            configurables par catégorie, profils radar et rapports PDF individuels
            destinés aux parents.
          </p>
        </div>

        <p className="text-xs text-sky-200/80">
          FUTURISTE ASSESSMENT • Former, développer et révéler les talents.
        </p>
      </div>

      <div className="lg:col-span-7 flex items-center justify-center p-6 sm:p-12 pitch-grid">
        <React.Suspense fallback={<div className="text-sm">Chargement...</div>}>
          <LoginFormInner />
        </React.Suspense>
      </div>
    </div>
  );
}
