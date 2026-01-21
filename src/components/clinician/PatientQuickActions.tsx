import { useState } from 'react';
import { 
  Send, 
  Bell, 
  FileText, 
  MessageSquare,
  MoreHorizontal,
  Settings,
  ClipboardList,
  UserCog
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateGuidanceDialog } from './CreateGuidanceDialog';
import { CreateAlertRuleDialog } from './CreateAlertRuleDialog';

interface Patient {
  id: string;
  user_id: string;
  patient_name: string;
  patient_email: string | null;
}

interface PatientQuickActionsProps {
  patient: Patient;
  onViewNotes?: () => void;
  onViewAlerts?: () => void;
}

export function PatientQuickActions({ patient, onViewNotes, onViewAlerts }: PatientQuickActionsProps) {
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [alertRuleOpen, setAlertRuleOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* Primary Actions */}
      <CreateGuidanceDialog
        trigger={
          <Button size="sm" variant="outline" className="h-8 gap-1.5">
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Send Guidance</span>
          </Button>
        }
        patients={[patient]}
        selectedPatientId={patient.id}
      />

      <CreateAlertRuleDialog
        trigger={
          <Button size="sm" variant="outline" className="h-8 gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Set Alert</span>
          </Button>
        }
        patients={[patient]}
        selectedPatientId={patient.id}
      />

      {/* More Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {onViewNotes && (
            <DropdownMenuItem onClick={onViewNotes}>
              <FileText className="h-4 w-4 mr-2" />
              View Notes
            </DropdownMenuItem>
          )}
          
          {onViewAlerts && (
            <DropdownMenuItem onClick={onViewAlerts}>
              <Bell className="h-4 w-4 mr-2" />
              Alert History
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem disabled>
            <MessageSquare className="h-4 w-4 mr-2" />
            Send Message
            <span className="ml-auto text-xs text-muted-foreground">Soon</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem disabled>
            <ClipboardList className="h-4 w-4 mr-2" />
            Care Plan
            <span className="ml-auto text-xs text-muted-foreground">Soon</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem disabled>
            <UserCog className="h-4 w-4 mr-2" />
            Manage Sharing
            <span className="ml-auto text-xs text-muted-foreground">Soon</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
