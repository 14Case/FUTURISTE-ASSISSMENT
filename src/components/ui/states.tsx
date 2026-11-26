import * as React from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Badge } from "./badge";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-sm text-slate-600 dark:text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function AlertBanner({
  variant = "warning",
  title,
  children,
}: {
  variant?: "warning" | "error" | "info" | "success";
  title: string;
  children?: React.ReactNode;
}) {
  const styles = {
    warning:
      "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200",
    error:
      "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
    info: "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
    success:
      "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  }[variant];

  return (
    <div className={`rounded-2xl border p-4 text-sm ${styles}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">{title}</p>
          {children ? <div className="text-sm opacity-95">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function DemoTag({ isDemo }: { isDemo?: boolean | null }) {
  if (!isDemo) return null;
  return <Badge variant="demo">DEMO</Badge>;
}
