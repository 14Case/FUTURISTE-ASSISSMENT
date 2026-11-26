"use client";

import * as React from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = "max-w-xl",
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto dark:border-slate-800 dark:bg-slate-900",
          maxWidthClass,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h2
              id="modal-title"
              className="text-lg font-bold text-slate-900 dark:text-white"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "primary";
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  variant = "danger",
  requireReason = false,
  reasonLabel = "Motif obligatoire (enregistré dans le journal d'audit)",
  loading = false,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState("");

  const handleClose = () => {
    setReason("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={title} maxWidthClass="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-orange-50 p-3.5 text-sm text-orange-950 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-900">
          <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600 mt-0.5" />
          <p>{description}</p>
        </div>
        {requireReason ? (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-1.5">
              {reasonLabel}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Précisez la raison de cette action..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        ) : null}
        <div className="flex justify-end gap-2.5 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            variant={variant}
            disabled={loading || (requireReason && reason.trim().length < 4)}
            onClick={() => {
              const r = requireReason ? reason.trim() : undefined;
              setReason("");
              onConfirm(r);
            }}
          >
            {loading ? "Traitement..." : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
