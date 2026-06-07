// Phase 4.1 — Persistent action rail for patient detail.
// Sticky right-column shortcuts for the most frequent clinician actions.
import { useState } from "react";
import { Send, Bell, MessageSquare, FileSignature, Network, ClipboardList, Activity, Share2, StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateGuidanceDialog } from "@/components/clinician/CreateGuidanceDialog";
import { CreateAlertRuleDialog } from "@/components/clinician/CreateAlertRuleDialog";
import { CreateTaskDialog } from "@/components/clinician/CreateTaskDialog";
import { ReferralDialog } from "@/components/clinician/ReferralDialog";

interface Props {
  patientId: string;
  patientUserId: string;
  patientName: string;
  onTabChange?: (tab: string) => void;
}

export function PatientActionRail({ patientId, patientUserId, patientName, onTabChange }: Props) {
  const stub = { id: patientId, user_id: patientUserId, patient_name: patientName };
  const [taskOpen, setTaskOpen] = useState(false);

  return (
    <Card className="sticky top-20">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pb-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => onTabChange?.("encounters")}
        >
          <FileSignature className="h-4 w-4 mr-2" /> Start encounter
        </Button>
        <CreateGuidanceDialog
          patients={[stub]}
          selectedPatientId={patientUserId}
          trigger={
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Send className="h-4 w-4 mr-2" /> Send guidance
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => onTabChange?.("messages")}
        >
          <MessageSquare className="h-4 w-4 mr-2" /> Message
        </Button>
        <CreateAlertRuleDialog
          patients={[stub]}
          selectedPatientId={patientUserId}
          trigger={
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Bell className="h-4 w-4 mr-2" /> Set alert
            </Button>
          }
        />
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setTaskOpen(true)}>
          <ClipboardList className="h-4 w-4 mr-2" /> Add task
        </Button>
        <CreateTaskDialog open={taskOpen} onOpenChange={setTaskOpen} patientUserId={patientUserId} />
        <ReferralDialog
          patientUserId={patientUserId}
          trigger={
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Share2 className="h-4 w-4 mr-2" /> Refer
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => onTabChange?.("internal")}
        >
          <StickyNote className="h-4 w-4 mr-2" /> Internal note
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => onTabChange?.("network")}
        >
          <Network className="h-4 w-4 mr-2" /> Network records
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => onTabChange?.("activity")}
        >
          <Activity className="h-4 w-4 mr-2" /> Activity log
        </Button>
      </CardContent>
    </Card>
  );
}
