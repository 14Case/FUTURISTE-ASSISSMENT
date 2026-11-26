"use client";

import * as React from "react";
import {
  Copy,
  Download,
  Mail,
  MessageCircle,
  Share2,
  CheckCircle2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { DEFAULT_PARENT_MESSAGE } from "@/lib/scoring/default-catalog";

interface ShareReportModalProps {
  open: boolean;
  onClose: () => void;
  reportId: string;
  fileName: string;
  playerFullName: string;
  seasonLabel: string;
  messageTemplate?: string;
  guardianWhatsapp?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
}

export function ShareReportModal({
  open,
  onClose,
  reportId,
  fileName,
  playerFullName,
  seasonLabel,
  messageTemplate,
  guardianWhatsapp,
  guardianPhone,
  guardianEmail,
}: ShareReportModalProps) {
  const initialMessage = React.useMemo(() => {
    const base = messageTemplate?.trim() || DEFAULT_PARENT_MESSAGE;
    return base
      .replace(/\{saison\}/gi, seasonLabel)
      .replace(/\{joueur\}/gi, playerFullName);
  }, [messageTemplate, seasonLabel, playerFullName]);

  const [customMessage, setCustomMessage] = React.useState<string | null>(null);
  const [sharingNative, setSharingNative] = React.useState(false);

  const message = customMessage ?? initialMessage;

  const handleClose = () => {
    setCustomMessage(null);
    onClose();
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    toast.success("Message copié dans le presse-papiers.");
  };

  const openWhatsApp = () => {
    const rawNum = (guardianWhatsapp || guardianPhone || "").replace(/[^0-9]/g, "");
    const encoded = encodeURIComponent(message);
    const url = rawNum
      ? `https://wa.me/${rawNum}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openEmail = () => {
    const subject = encodeURIComponent(
      `Rapport individuel d'évaluation — ${playerFullName} (FUTURISTE ACADÉMIE FC)`,
    );
    const body = encodeURIComponent(message);
    const mailto = `mailto:${guardianEmail ?? ""}?subject=${subject}&body=${body}`;
    window.location.href = mailto;
  };

  const handleNativeShare = async () => {
    if (!("share" in navigator)) {
      toast.info("Le menu de partage natif n'est pas disponible sur ce navigateur.");
      return;
    }
    setSharingNative(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/download`);
      if (!res.ok) {
        toast.error("Impossible de récupérer le fichier PDF.");
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: fileName,
          text: message,
          files: [file],
        });
      } else {
        await navigator.share({
          title: `Rapport ${playerFullName}`,
          text: message,
        });
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        toast.error("Le partage natif a été interrompu.");
      }
    } finally {
      setSharingNative(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Transmettre le rapport de ${playerFullName}`}
      description="Téléchargez le PDF et préparez votre message d'accompagnement pour le responsable légal."
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl bg-sky-50 p-3.5 text-xs text-sky-950 border border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800">
          <Info className="h-4 w-4 shrink-0 text-sky-700 mt-0.5" />
          <p>
            <strong>Transmission maîtrisée (V1) :</strong> aucun envoi automatique
            n&apos;est effectué en arrière-plan. Sur téléphone/tablette, utilisez{" "}
            <em>Partage natif</em> pour joindre directement le PDF vers WhatsApp ou Mail,
            ou téléchargez le PDF puis joignez-le à la conversation ouverte.
          </p>
        </div>

        <div>
          <Label>Message d&apos;accompagnement personnalisable</Label>
          <Textarea
            rows={7}
            value={message}
            onChange={(e) => setCustomMessage(e.target.value)}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-2.5">
          <a
            href={`/api/reports/${reportId}/download`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-900"
          >
            <Download className="h-4 w-4" />
            <span>1. Télécharger le PDF</span>
          </a>

          <Button variant="outline" onClick={copyMessage}>
            <Copy className="h-4 w-4" />
            <span>Copier le message</span>
          </Button>

          <Button variant="success" onClick={openWhatsApp}>
            <MessageCircle className="h-4 w-4" />
            <span>Préparer WhatsApp</span>
          </Button>

          <Button variant="secondary" onClick={openEmail}>
            <Mail className="h-4 w-4" />
            <span>Préparer Email</span>
          </Button>
        </div>

        <Button
          variant="outline"
          className="w-full"
          disabled={sharingNative}
          onClick={handleNativeShare}
        >
          <Share2 className="h-4 w-4 text-violet-700" />
          <span>
            {sharingNative
              ? "Préparation du fichier..."
              : "Partage natif téléphone / tablette (avec PDF joint si supporté)"}
          </span>
        </Button>

        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Fermer</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
