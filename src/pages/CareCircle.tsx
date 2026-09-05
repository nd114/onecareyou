import { motion } from 'framer-motion';
import { 
  Users, 
  Plus, 
  Copy, 
  Trash2, 
  Eye, 
  Shield, 
  Clock,
  Mail,
  MessageCircle,
  FolderDown,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Panel, PanelBody, PanelEmpty, PanelHeader, PanelRow, PanelRows } from '@/components/ui/panel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useState } from 'react';
import { toast } from 'sonner';
import { grantsPermission } from '@/lib/fhir/access-policy';
import { useProviderShares, useShareEvents } from '@/hooks/useProviderShares';
import { useCareRecordSnapshot } from '@/hooks/useCareRecordSnapshot';
import { InstitutionCareTeamCard } from '@/components/patient/InstitutionCareTeamCard';
import { useInstitutionCareTeam } from '@/hooks/useInstitutionCareTeam';
import { HospitalShareCard } from '@/components/patient/HospitalShareCard';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDay } from '@/lib/format-date';

const CareCircle = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // The revoke confirmation is held here rather than nested inside each row's
  // menu: a dialog rendered inside a dropdown is dismissed along with the
  // dropdown, so the confirmation never gets a chance to be read.
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);
  const { shares, isLoading, createShare, revokeShare, reshare } = useProviderShares();
  const { data: shareEvents = [] } = useShareEvents();
  const { generate: generateCareRecord } = useCareRecordSnapshot();
  // The hospital care-team card renders nothing until a hospital has
  // actually put someone on the record, so the sentence below must not
  // promise a list that is not there.
  const { byPractice: institutionCareTeam } = useInstitutionCareTeam();
  const hasInstitutionCareTeam = institutionCareTeam.length > 0;

  const activeShares = shares.filter((s) => s.is_active);
  const pastShares = shares.filter((s) => !s.is_active);


  const [newShare, setNewShare] = useState({
    providerName: '',
    providerEmail: '',
    // The canonical vocabulary, shared with institution shares since
    // 20260908100000_one_share_vocabulary.sql. Older shares carrying 'meds'
    // and 'profile' are still honoured — `grantsPermission` resolves them.
    permissions: {
      vitals: true,
      medications: true,
      adherence: true,
      profile: false,
      // Off by default: documents stay shared one at a time unless the patient
      // deliberately opens the whole vault.
      documents: false,
    },
  });

  const handleCreateShare = () => {
    if (!newShare.providerName.trim()) {
      toast.error('Please enter a provider name');
      return;
    }
    
    createShare.mutate({
      providerName: newShare.providerName,
      providerEmail: newShare.providerEmail || undefined,
      permissions: newShare.permissions,
    });
    
    setIsDialogOpen(false);
    setNewShare({
      providerName: '',
      providerEmail: '',
      permissions: { vitals: true, medications: true, adherence: true, profile: false, documents: false },
    });
  };

  const handleRevokeAccess = async (id: string) => {
    const share = shares.find((s) => s.id === id);
    // Close the relationship with a complete, immutable record before access ends.
    if (share?.clinician_user_id) {
      try {
        await generateCareRecord.mutateAsync({
          clinicianUserId: share.clinician_user_id,
          clinicianLabel: share.display_name,
          reason: 'connection_ended',
          silent: true,
        });
      } catch {
        /* snapshotting must never block ending access */
      }
    }
    revokeShare.mutate(id);
  };

  const copyShareLink = (inviteCode: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/clinician/patient/${inviteCode}`);
    toast.success('Link copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <SectionTabs section="team" variant="patient" />
      
      <main className="container px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8"
        >
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
              Care Circle
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Securely share your health data with healthcare providers
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary border-0 w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Invite Provider
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a Healthcare Provider</DialogTitle>
                <DialogDescription>
                  Create a secure share link for your doctor, pharmacist, or caregiver
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="providerName">Provider Name *</Label>
                  <Input
                    id="providerName"
                    placeholder="e.g., Dr. Sarah Chen"
                    value={newShare.providerName}
                    onChange={(e) => setNewShare({ ...newShare, providerName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="providerEmail">Provider Email (optional)</Label>
                  <Input
                    id="providerEmail"
                    type="email"
                    placeholder="doctor@hospital.com"
                    value={newShare.providerEmail}
                    onChange={(e) => setNewShare({ ...newShare, providerEmail: e.target.value })}
                  />
                </div>
                
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Permissions</Label>
                  <div className="space-y-3">
                    {[
                      { key: 'vitals', label: 'Health Vitals', desc: 'Blood pressure, glucose, etc.' },
                      { key: 'medications', label: 'Medications', desc: 'Current medication list' },
                      { key: 'adherence', label: 'Adherence Data', desc: 'Schedule and compliance' },
                      {
                        key: 'profile',
                        label: 'Health Profile',
                        // Understated before: this opens the whole profile row, so it
                        // includes the details beside the clinical lists.
                        desc: 'Conditions and allergies, plus your date of birth, blood type and contact details.',
                      },
                      {
                        key: 'documents',
                        label: 'My whole Health Vault',
                        // Off by default. With it off, this doctor sees only the
                        // documents you hand them one at a time — which is why
                        // the description says what "on" actually means rather
                        // than describing a feature.
                        desc: 'Every document in your Vault, including anything you add later. Leave this off to share documents one at a time instead.',
                      },
                    ].map((perm) => (
                      <div key={perm.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{perm.label}</p>
                          <p className="text-xs text-muted-foreground">{perm.desc}</p>
                        </div>
                        <Switch
                          checked={newShare.permissions[perm.key as keyof typeof newShare.permissions]}
                          onCheckedChange={(checked) => 
                            setNewShare({
                              ...newShare,
                              permissions: { ...newShare.permissions, [perm.key]: checked },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1 gradient-primary border-0" 
                    onClick={handleCreateShare}
                    disabled={createShare.isPending}
                  >
                    {createShare.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Generate Link'
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Privacy Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Your Data, Your Control</h3>
                <p className="text-sm text-muted-foreground">
                  You decide exactly what information to share. Providers can only view 
                  the data you permit, and you can revoke access at any time. All data 
                  is encrypted and transmitted securely.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Hospital / institution sharing — who the patient shares with comes
            first; the access list below is the audit view, not the headline. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8"
        >
          <HospitalShareCard />
        </motion.div>

        {/* Who the hospital put on the record. Renders nothing until a hospital
            has actually assigned someone. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mb-8"
        >
          <InstitutionCareTeamCard />
        </motion.div>

        {/* Active Shares */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Panel>
            <PanelHeader
              eyebrow="Doctors you invited"
              description={
                hasInstitutionCareTeam
                  ? 'Clinicians you shared with directly. Staff added by a hospital are listed separately above.'
                  : 'Clinicians you shared with directly.'
              }
            />

            {isLoading ? (
              <PanelEmpty className="py-12">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              </PanelEmpty>
            ) : activeShares.length === 0 ? (
              <PanelEmpty className="py-12">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted">
                  <Users className="h-7 w-7 text-muted-foreground" />
                </span>
                <p className="font-display text-lg leading-snug text-foreground">Nobody sees this yet</p>
                <p className="mx-auto mt-2 max-w-sm">
                  Invite a doctor and choose exactly what they can see. You can end it whenever you want.
                </p>
                <Button className="mt-6 border-0 gradient-primary" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Invite a doctor
                </Button>
              </PanelEmpty>
            ) : (
              <PanelRows>
                {activeShares.map((share) => (
                  <PanelRow
                    key={share.id}
                    className="items-start"
                    glyph={
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                        {share.display_name.charAt(0).toUpperCase()}
                      </span>
                    }
                    label={share.display_name}
                    detail={share.display_subtitle || share.provider_email || undefined}
                    trailing={
                      <span className="flex items-center gap-2">
                        {/* One visible action. The rest were five buttons in a
                            row, which does not fit a phone and buried the
                            destructive one among them. */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs sm:px-3"
                          onClick={() => copyShareLink(share.invite_code)}
                        >
                          <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
                          <span className="hidden sm:inline">Copy link</span>
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`More actions for ${share.display_name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onSelect={() => {
                                const link = `${window.location.origin}/clinician/patient/${share.invite_code}`;
                                const subject = `Secure access to my OneCare health record`;
                                const body = `Hi ${share.display_name},\n\nI'm sharing my health record with you on OneCare. Use the secure link below to view it:\n\n${link}\n\nThanks.`;
                                const to = share.provider_email ? encodeURIComponent(share.provider_email) : '';
                                window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                              }}
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Send by email
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                const link = `${window.location.origin}/clinician/patient/${share.invite_code}`;
                                const text = `Hi ${share.display_name}, I've shared my health data with you on OneCare. View it here: ${link}`;
                                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                              }}
                            >
                              <MessageCircle className="mr-2 h-4 w-4" />
                              Send by WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                (generateCareRecord.isPending &&
                                  generateCareRecord.variables?.shareId === share.id) ||
                                !share.clinician_user_id
                              }
                              onSelect={() =>
                                generateCareRecord.mutate({
                                  shareId: share.id,
                                  clinicianUserId: share.clinician_user_id,
                                  clinicianLabel: share.display_name,
                                })
                              }
                            >
                              <FolderDown className="mr-2 h-4 w-4" />
                              Save record to Vault
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() =>
                                setConfirmRevoke({ id: share.id, name: share.display_name })
                              }
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              End sharing
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    }
                  >
                    {share.provider_email && share.display_subtitle && (
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{share.provider_email}</span>
                      </span>
                    )}

                    <span className="mt-2 flex flex-wrap gap-1">
                      {!share.is_claimed && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs">Invite pending</Badge>
                      )}
                      {grantsPermission(share.permissions, 'vitals') && <Badge variant="secondary" className="text-[10px] sm:text-xs">Vitals</Badge>}
                      {grantsPermission(share.permissions, 'medications') && <Badge variant="secondary" className="text-[10px] sm:text-xs">Meds</Badge>}
                      {grantsPermission(share.permissions, 'adherence') && <Badge variant="secondary" className="text-[10px] sm:text-xs">Adherence</Badge>}
                      {grantsPermission(share.permissions, 'profile') && <Badge variant="secondary" className="text-[10px] sm:text-xs">Profile</Badge>}
                      {share.permissions.documents && (
                        <Badge variant="secondary" className="text-[10px] sm:text-xs">Whole Vault</Badge>
                      )}
                    </span>

                    <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        Added {formatDay(share.created_at)}
                      </span>
                      {share.last_accessed_at && (
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3 shrink-0" />
                          Last viewed {formatDay(share.last_accessed_at)}
                        </span>
                      )}
                    </span>
                  </PanelRow>
                ))}
              </PanelRows>
            )}
          </Panel>
        </motion.div>

        {pastShares.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-8"
          >
            <Panel>
              <PanelHeader
                eyebrow="Past connections"
                description="Kept for your records. These providers see no new data, but the history you built together is preserved."
              />
              <PanelRows>
                {pastShares.map((share) => (
                  <PanelRow
                    key={share.id}
                    glyph={
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-base font-semibold text-muted-foreground">
                        {share.display_name.charAt(0).toUpperCase()}
                      </span>
                    }
                    label={share.display_name}
                    detail={`Ended ${
                      share.revoked_at ? formatDay(share.revoked_at) : '—'
                    }${share.revoke_reason ? ` · ${share.revoke_reason}` : ''}`}
                    trailing={
                      <span className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs sm:px-3"
                          onClick={() => reshare.mutate({ shareId: share.id })}
                        >
                          <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />
                          <span className="hidden sm:inline">Resume</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs sm:px-3"
                          disabled={
                            (generateCareRecord.isPending &&
                              generateCareRecord.variables?.shareId === share.id) ||
                            !share.clinician_user_id
                          }
                          onClick={() =>
                            generateCareRecord.mutate({
                              shareId: share.id,
                              clinicianUserId: share.clinician_user_id,
                              clinicianLabel: share.display_name,
                            })
                          }
                        >
                          <FolderDown className="h-3.5 w-3.5 sm:mr-1.5" />
                          <span className="hidden sm:inline">Save record</span>
                        </Button>
                      </span>
                    }
                  />
                ))}
              </PanelRows>
            </Panel>
          </motion.div>
        )}

        {/* The full history now lives in Settings, where "who has ever had my
            record" belongs — this page is about who can see you now. A pointer
            rather than a second copy, so the two cannot disagree. */}
        {shareEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8"
          >
            <Panel>
              <PanelBody className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <span className="flex min-w-0 items-center gap-3">
                  <Shield className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Every change to who can see your record is kept permanently.
                  </span>
                </span>
                <Button variant="outline" size="sm" asChild className="w-full shrink-0 sm:w-auto">
                  <Link to="/settings#sharing-history">View history</Link>
                </Button>
              </PanelBody>
            </Panel>
          </motion.div>
        )}


        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <Panel>
            <PanelHeader eyebrow="How sharing works" />
            <PanelBody className="py-6">
              {/* Numbered because it genuinely is a sequence — the order is
                  what the reader needs, not decoration. */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {[
                  { step: 1, title: 'You choose what to share', desc: 'Vitals, medications, adherence, profile — each one on or off.' },
                  { step: 2, title: 'You send them a link', desc: 'By email, WhatsApp, or however you already talk to them.' },
                  { step: 3, title: 'They see only that', desc: 'And the moment you end it, the database stops returning it to them.' },
                ].map((item) => (
                  <div key={item.step}>
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--emerald-light))] font-display text-base text-primary">
                      {item.step}
                    </span>
                    <h4 className="mb-1 mt-3 font-display text-base leading-snug">{item.title}</h4>
                    <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </PanelBody>
          </Panel>
        </motion.div>
      </main>

      {/* One dialog for the page. Rendering it inside each row's menu meant it
          was dismissed together with the menu. */}
      <AlertDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => !open && setConfirmRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End sharing with {confirmRevoke?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They stop seeing any new health data straight away. Everything already exchanged —
              messages, guidance and shared documents — stays on your record in the Health Vault, so
              you always have proof of what was advised and when. You can resume sharing later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRevoke) handleRevokeAccess(confirmRevoke.id);
                setConfirmRevoke(null);
              }}
            >
              End sharing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CareCircle;
