import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { stopComplianceError, withStopSentence } from "./stopCompliance";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export interface EditableCampaign {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  is_active: boolean | null;
}

/**
 * Edit dialog for an existing campaign.
 *
 * Extracted verbatim from CampaignsPage.tsx — markup, labels, placeholders,
 * the character/segment counter and the save-disabled rule are unchanged.
 *
 * The form state and the update mutation move with the dialog: both existed
 * only to serve it, and the page has no other reader. The page previously
 * seeded editForm at the call site that opened the dialog; that now happens
 * here, in an effect keyed on the incoming campaign, so opening the dialog
 * populates the fields exactly as before.
 */
export function CampaignEditDialog({
  campaign,
  orgId,
  onClose,
}: {
  campaign: EditableCampaign | null;
  orgId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editForm, setEditForm] = useState({ name: "", subject: "", body: "", is_active: false });

  useEffect(() => {
    if (campaign) {
      setEditForm({
        name: campaign.name || "",
        subject: campaign.subject || "",
        body: campaign.body || "",
        is_active: !!campaign.is_active,
      });
    }
  }, [campaign]);

  // Campaign bodies are always sent as SMS — automated_campaigns has no channel
  // column, and both senders (run-inactive-campaign, process-campaign-queue) are
  // SMS-only. So the opt-out requirement applies to every campaign body, with no
  // channel case to exempt.
  const bodyError = stopComplianceError(editForm.body);

  const updateCampaign = useMutation({
    mutationFn: async () => {
      if (!campaign) throw new Error("No campaign selected");
      if (!orgId) throw new Error("Organization not found");
      // Guarded here and not only on the button: a disabled button is a hint, and
      // this is the rule. Nothing in the send path adds an opt-out line, so a body
      // saved without one goes out to every recipient exactly as typed.
      const err = stopComplianceError(editForm.body);
      if (err) throw new Error(err);
      const { error } = await supabase
        .from("automated_campaigns")
        .update({
          name: editForm.name,
          subject: editForm.subject,
          body: editForm.body,
          is_active: editForm.is_active,
        })
        .eq("id", campaign.id)
        .eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campaign updated" });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!campaign} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Campaign</DialogTitle>
          <DialogDescription>Update settings and messaging for this campaign.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-campaign-name">Name</Label>
            <Input
              id="edit-campaign-name"
              value={editForm.name}
              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Campaign name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-campaign-subject">Email Subject</Label>
            <Input
              id="edit-campaign-subject"
              value={editForm.subject}
              onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Subject (email campaigns only)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-campaign-body">Message Body</Label>
            <Textarea
              id="edit-campaign-body"
              value={editForm.body}
              onChange={(e) => setEditForm(prev => ({ ...prev, body: e.target.value }))}
              rows={7}
              placeholder="Your message. Use {first_name} and {company_name} placeholders."
            />
            <p className="text-xs text-muted-foreground">
              {editForm.body.length} chars • {Math.ceil((editForm.body.length || 1) / 160)} SMS segment(s)
            </p>
            {bodyError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 space-y-2">
                <p className="text-xs text-destructive">{bodyError}</p>
                {editForm.body.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditForm(prev => ({ ...prev, body: withStopSentence(prev.body) }))}
                  >
                    Add it for me
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive campaigns won't send automatically.</p>
            </div>
            <Switch
              checked={editForm.is_active}
              onCheckedChange={(v) => setEditForm(prev => ({ ...prev, is_active: v }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => updateCampaign.mutate()} disabled={updateCampaign.isPending || !editForm.name.trim() || !!bodyError}>
            {updateCampaign.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
