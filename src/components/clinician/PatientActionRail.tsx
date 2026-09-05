import { useState } from "react";
import { ClipboardList, FileSignature, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateTaskDialog } from "@/components/clinician/CreateTaskDialog";
import { ReferralDialog } from "@/components/clinician/ReferralDialog";

interface Props {
  patientUserId: string;
  onTabChange?: (tab: string) => void;
}

/**
 * The things you do to a patient's record that are not already a tab.
 *
 * This rail used to carry nine buttons. Two of them — send guidance, set an
 * alert — were the same two buttons sitting in the page header a few
 * centimetres above, and four more only switched to a tab that was already on
 * screen. A shortcut to something you can see is not a shortcut; it is a
 * second name for the same control, and it made the page look like it had
 * twenty-four things to do rather than fifteen places to look and a handful
 * of actions.
 *
 * What is left starts something: an encounter, a task, a referral. Guidance
 * and alerts stay in the header, which is where they are on every width —
 * this rail only appears from lg up.
 */
export function PatientActionRail({ patientUserId, onTabChange }: Props) {
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
      </CardContent>
    </Card>
  );
}
