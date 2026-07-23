import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TermsContent } from "@/components/legal/termsContent";

interface TermsOfServiceDialogProps {
  children: React.ReactNode;
}

/**
 * Renders the canonical terms from termsContent.tsx — the same content served
 * at /terms. Do not inline terms text here; the dispute-evidence pipeline
 * depends on termsContent.tsx being the single source of truth.
 */
export function TermsOfServiceDialog({ children }: TermsOfServiceDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Terms of Service</DialogTitle>
        </DialogHeader>
        <TermsContent />
      </DialogContent>
    </Dialog>
  );
}
