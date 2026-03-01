import { useState } from 'react';
import { Mail, Send, Tag, Plus, X, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useClinicianPatientRecords, type ClinicianPatientRecord } from '@/hooks/useClinicianPatientRecords';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface InviteToOneCareProps {
  record: ClinicianPatientRecord;
}

export function InviteToOneCareButton({ record }: InviteToOneCareProps) {
  const { user } = useAuth();
  const { updateRecord } = useClinicianPatientRecords();
  const [isInviting, setIsInviting] = useState(false);
  const [email, setEmail] = useState(record.patient_email || '');
  const [open, setOpen] = useState(false);

  const canInvite = record.invitation_status === 'not_invited' || record.invitation_status === 'declined';

  const handleInvite = async () => {
    if (!user || !email) return;
    setIsInviting(true);

    try {
      // Update the record with email if it was missing
      if (email !== record.patient_email) {
        await updateRecord.mutateAsync({
          id: record.id,
          patient_email: email,
        } as any);
      }

      // Create a patient_invitation
      const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const { error } = await supabase
        .from('patient_invitations')
        .insert({
          clinician_user_id: user.id,
          patient_email: email,
          patient_name: record.patient_name,
          invite_code: inviteCode,
          status: 'pending',
        });

      if (error) throw error;

      // Update invitation status
      await updateRecord.mutateAsync({
        id: record.id,
        invitation_status: 'invited',
        patient_email: email,
      } as any);

      toast.success(`Invitation sent to ${email}`);
      setOpen(false);
    } catch (error) {
      console.error('Error inviting patient:', error);
      toast.error('Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  if (!canInvite) {
    return (
      <Badge variant={record.invitation_status === 'invited' ? 'secondary' : 'default'} className="text-xs">
        {record.invitation_status === 'invited' ? 'Invited' : 'Accepted'}
      </Badge>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs gap-1.5">
          <Send className="h-3 w-3" />
          Invite to OneCare
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite {record.patient_name}</DialogTitle>
          <DialogDescription>
            Send an invitation for this patient to join OneCare and manage their own health data.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Patient Email</label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@example.com"
                className="pl-10"
                type="email"
              />
            </div>
          </div>
          <Button onClick={handleInvite} disabled={isInviting || !email} className="w-full">
            {isInviting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send Invitation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TagManagerProps {
  record: ClinicianPatientRecord;
}

export function PatientTagManager({ record }: TagManagerProps) {
  const { updateRecord } = useClinicianPatientRecords();
  const [newTag, setNewTag] = useState('');
  const [open, setOpen] = useState(false);
  const tags = (record.tags || []) as string[];

  const addTag = async () => {
    if (!newTag.trim()) return;
    const updated = [...tags, newTag.trim()];
    await updateRecord.mutateAsync({ id: record.id, tags: updated } as any);
    setNewTag('');
  };

  const removeTag = async (tagToRemove: string) => {
    const updated = tags.filter(t => t !== tagToRemove);
    await updateRecord.mutateAsync({ id: record.id, tags: updated } as any);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7">
          <Tag className="h-3 w-3" />
          Tags {tags.length > 0 && `(${tags.length})`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage Tags</DialogTitle>
          <DialogDescription>
            Add tags to organise {record.patient_name}'s record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {tags.length === 0 && (
              <p className="text-xs text-muted-foreground">No tags yet</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add a tag..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
            />
            <Button size="sm" onClick={addTag} disabled={!newTag.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
