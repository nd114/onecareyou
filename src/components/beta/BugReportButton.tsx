import { useState } from "react";
import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const BugReportButton = () => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const getBrowserInfo = () => ({
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    platform: navigator.platform,
  });

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast({ title: "Please describe the issue", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("beta_bug_reports" as any).insert({
        page_url: window.location.pathname,
        category,
        description: description.trim(),
        browser_info: getBrowserInfo(),
      } as any);

      if (error) throw error;

      // Sync to Notion in the background (non-blocking)
      supabase.functions.invoke("sync-bug-to-notion", {
        body: {
          bugReport: {
            id: data?.id,
            page_url: window.location.pathname,
            category,
            description: description.trim(),
            browser_info: getBrowserInfo(),
            user_id: (await supabase.auth.getUser()).data.user?.email || "Anonymous",
          },
        },
      }).catch((err) => console.warn("Notion sync failed (non-critical):", err));

      toast({ title: "Report submitted", description: "Thank you for your feedback!" });
      setDescription("");
      setCategory("bug");
      setOpen(false);
    } catch (err) {
      toast({ title: "Failed to submit", description: "Please try again or email hello@onecare.you", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        aria-label="Report a bug"
      >
        <Bug className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              Report an Issue
            </SheetTitle>
            <SheetDescription>
              Help us improve OneCare. Your current page and browser info will be captured automatically.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">🐛 Bug</SelectItem>
                  <SelectItem value="design">🎨 Design / UX</SelectItem>
                  <SelectItem value="suggestion">💡 Suggestion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="What happened? What did you expect?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />
            </div>

            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <p><strong>Page:</strong> {window.location.pathname}</p>
              <p><strong>Browser:</strong> {navigator.userAgent.split(' ').slice(-2).join(' ')}</p>
              <p><strong>Viewport:</strong> {window.innerWidth}×{window.innerHeight}</p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
