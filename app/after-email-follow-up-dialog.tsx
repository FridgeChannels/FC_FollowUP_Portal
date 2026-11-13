"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatAfterEmailEtLabel,
  type AfterEmailFollowUpPrompt,
} from "@/lib/after-email-followup";

export function AfterEmailFollowUpDialog({
  prompt,
  onOpenChange,
  onChoose,
}: {
  prompt: AfterEmailFollowUpPrompt | null;
  onOpenChange: (open: boolean) => void;
  onChoose: (channel: "SMS" | "WhatsApp") => void;
}) {
  const open = !!prompt;
  const when = prompt ? formatAfterEmailEtLabel(prompt.emailScheduledAt) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" lang="en">
        <DialogHeader>
          <DialogTitle>Follow up on another channel?</DialogTitle>
          <DialogDescription>
            Your email is queued for {when} ET. Pick a channel — next you&apos;ll write the follow-up
            message (sends at least 15 minutes after the email).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <div className="flex w-full flex-wrap gap-2">
            {prompt?.channels.includes("SMS") ? (
              <Button type="button" className="flex-1" onClick={() => onChoose("SMS")}>
                SMS
              </Button>
            ) : null}
            {prompt?.channels.includes("WhatsApp") ? (
              <Button type="button" className="flex-1" onClick={() => onChoose("WhatsApp")}>
                WhatsApp
              </Button>
            ) : null}
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
