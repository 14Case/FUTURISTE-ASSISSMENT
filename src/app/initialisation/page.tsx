"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { bootstrapAdminSchema } from "@/lib/validation/schemas";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AlertBanner } from "@/components/ui/states";

type BootstrapFormValues = z.infer<typeof bootstrapAdminSchema>;

export default function InitialisationPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState<{
    loading: boolean;
    needs_bootstrap: boolean;
    secret_required: boolean;
    service_role_configured: boolean;
    db_error?: string;
  }>({
    loading: true,
    needs_bootstrap: false,
    secret_required: false,
    service_role_configured: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BootstrapFormValues>({
    resolver: zodResolver(bootstrapAdminSchema),
    defaultValues: { full_name: "", email: "", password: "", secret: "" },
  });

  React.useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((r) => r.json())
      .then((d) => setStatus({ loading: false, ...d }))
      .catch(() =>
        setStatus((prev) => ({ ...prev, loading: false })),
      );
  }, []);

  const onSubmit = async (values: BootstrapFormValues) => {
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body?.error ?? "Échec de l'initialisation.");
      return;
    }
    toast.success("Compte administrateur créé avec succès ! Vous pouvez vous connecter.");
    router.push("/connexion");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 pitch-grid">
      <div className="w-full max-w-lg space-y-6">
        <div className="pitch-pattern rounded-3xl p-6 text-white flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="FAFC" className="h-12 w-12" />
          <div>
            <p className="text-xs uppercase font-bold text-sky-300">
              Amorçage sécurisé
            </p>
            <h1 className="text-xl font-black">
              Premier compte Administrateur
            </h1>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {status.loading ? (
            <p className="text-sm text-slate-600">Vérification de l&apos;état du serveur...</p>
          ) : !status.service_role_configured ? (
            <AlertBanner variant="warning" title="Clé SUPABASE_SERVICE_ROLE_KEY absente">
              Ajoutez <code>SUPABASE_SERVICE_ROLE_KEY</code> dans <code>.env.local</code>{" "}
              (ou sur Vercel) pour permettre la création du premier administrateur, ou
              créez l&apos;utilisateur dans Supabase Auth puis passez son rôle à{" "}
              <code>admin</code> dans la table <code>public.profiles</code>.
            </AlertBanner>
          ) : status.db_error ? (
            <AlertBanner variant="error" title="Schéma SQL non détecté">
              {status.db_error}
            </AlertBanner>
          ) : !status.needs_bootstrap ? (
            <div className="space-y-4">
              <AlertBanner
                variant="success"
                title="Initialisation déjà effectuée et verrouillée"
              >
                Un administrateur existe déjà en base. Pour des raisons de sécurité, cet
                écran est désormais désactivé.
              </AlertBanner>
              <Link
                href="/connexion"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-3 text-sm font-bold text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Aller à la page de connexion</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl bg-violet-50 p-3 text-xs text-violet-950 border border-violet-200">
                <ShieldAlert className="h-4 w-4 text-violet-700 shrink-0 mt-0.5" />
                <span>
                  Ce formulaire ne fonctionne qu&apos;une seule fois : dès ce compte créé,
                  seuls les administrateurs authentifiés pourront ajouter des encadreurs.
                </span>
              </div>

              <div>
                <Label htmlFor="full_name">Nom et prénom du responsable</Label>
                <Input
                  id="full_name"
                  placeholder="Ex: Directeur Technique FAFC"
                  {...register("full_name")}
                />
                {errors.full_name ? (
                  <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="email">Email administrateur</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="direction@futuriste-academie.cm"
                  {...register("email")}
                />
                {errors.email ? (
                  <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="password">Mot de passe (10 caractères minimum)</Label>
                <Input id="password" type="password" {...register("password")} />
                {errors.password ? (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                ) : null}
              </div>

              {status.secret_required ? (
                <div>
                  <Label htmlFor="secret">Jeton BOOTSTRAP_ADMIN_SECRET</Label>
                  <Input id="secret" type="password" {...register("secret")} />
                </div>
              ) : null}

              <Button type="submit" size="field" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Création..." : "Créer le compte Administrateur"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
