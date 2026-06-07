// Phase 2.1 — Clinical templates manager.
import { useState } from "react";
import { Plus, Trash2, FileText, Loader2 } from "lucide-react";
import { ClinicianHeader } from "@/components/clinician/ClinicianHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClinicalTemplates, type TemplateKind } from "@/hooks/useClinicalTemplates";
import { SEOHead } from "@/components/seo/SEOHead";

const KINDS: { value: TemplateKind; label: string; description: string }[] = [
  { value: "visit", label: "Visit notes", description: "SOAP scaffolds for encounters" },
  { value: "assessment", label: "Assessments", description: "Intake & screening checklists" },
  { value: "guidance", label: "Guidance", description: "Reusable patient-facing instructions" },
  { value: "plan", label: "Care plans", description: "Standing orders & monitoring plans" },
];

export default function ClinicianTemplates() {
  const [kind, setKind] = useState<TemplateKind>("visit");
  const { templates, isLoading, create, remove } = useClinicalTemplates(kind);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    specialty: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });

  const handleCreate = async () => {
    if (!draft.name.trim()) return;
    await create.mutateAsync({
      name: draft.name,
      kind,
      description: draft.description || null,
      specialty: draft.specialty || null,
      body: {
        subjective: draft.subjective,
        objective: draft.objective,
        assessment: draft.assessment,
        plan: draft.plan,
      },
    });
    setOpen(false);
    setDraft({ name: "", description: "", specialty: "", subjective: "", objective: "", assessment: "", plan: "" });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <SEOHead title="Clinical Templates — OneCare" description="Reusable SOAP, assessment and guidance templates for your practice." noIndex />
      <ClinicianHeader />
      <main className="container py-6 sm:py-10 px-4 sm:px-6 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">Clinical Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Build reusable scaffolds for visits, assessments, guidance, and plans across your practice.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary border-0">
                <Plus className="h-4 w-4 mr-2" />
                New template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New {KINDS.find((k) => k.value === kind)?.label.toLowerCase()} template</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="CHF follow-up" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Specialty (optional)</Label>
                    <Input value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} placeholder="Cardiology" />
                  </div>
                  <div>
                    <Label>Short description</Label>
                    <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Monthly RPM review" />
                  </div>
                </div>
                {kind === "visit" || kind === "assessment" ? (
                  <>
                    <div>
                      <Label>Subjective</Label>
                      <Textarea rows={3} value={draft.subjective} onChange={(e) => setDraft({ ...draft, subjective: e.target.value })} />
                    </div>
                    <div>
                      <Label>Objective</Label>
                      <Textarea rows={3} value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })} />
                    </div>
                    <div>
                      <Label>Assessment</Label>
                      <Textarea rows={3} value={draft.assessment} onChange={(e) => setDraft({ ...draft, assessment: e.target.value })} />
                    </div>
                    <div>
                      <Label>Plan</Label>
                      <Textarea rows={3} value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })} />
                    </div>
                  </>
                ) : (
                  <div>
                    <Label>Body</Label>
                    <Textarea rows={6} value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })} placeholder="Template content" />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!draft.name.trim() || create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={kind} onValueChange={(v) => setKind(v as TemplateKind)}>
          <TabsList className="flex flex-wrap h-auto">
            {KINDS.map((k) => (
              <TabsTrigger key={k.value} value={k.value}>{k.label}</TabsTrigger>
            ))}
          </TabsList>
          {KINDS.map((k) => (
            <TabsContent key={k.value} value={k.value} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{k.label}</CardTitle>
                  <CardDescription>{k.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
                  ) : templates.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No templates yet. Create your first one to speed up clinical work.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {templates.map((t) => (
                        <li key={t.id} className="py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{t.name}</p>
                              {t.specialty && <Badge variant="outline" className="text-xs">{t.specialty}</Badge>}
                              {t.is_system && <Badge variant="secondary" className="text-xs">System</Badge>}
                            </div>
                            {t.description && (
                              <p className="text-sm text-muted-foreground mt-0.5 truncate">{t.description}</p>
                            )}
                          </div>
                          {!t.is_system && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => remove.mutate(t.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
