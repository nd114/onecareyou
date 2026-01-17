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
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Header } from '@/components/layout/Header';
import { useState } from 'react';
import { toast } from 'sonner';
import { useProviderShares } from '@/hooks/useProviderShares';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const CareCircle = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { shares, isLoading, createShare, revokeShare } = useProviderShares();
  const [newShare, setNewShare] = useState({
    providerName: '',
    providerEmail: '',
    permissions: {
      vitals: true,
      meds: true,
      adherence: true,
      profile: false,
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
      permissions: { vitals: true, meds: true, adherence: true, profile: false },
    });
  };

  const handleRevokeAccess = (id: string) => {
    revokeShare.mutate(id);
  };

  const copyShareLink = (inviteCode: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/clinician/patient/${inviteCode}`);
    toast.success('Link copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">
              Care Circle
            </h1>
            <p className="text-muted-foreground">
              Securely share your health data with healthcare providers
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary border-0">
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
                      { key: 'meds', label: 'Medications', desc: 'Current medication list' },
                      { key: 'adherence', label: 'Adherence Data', desc: 'Schedule and compliance' },
                      { key: 'profile', label: 'Health Profile', desc: 'Allergies, conditions, etc.' },
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

        {/* Active Shares */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Active Access
              </CardTitle>
              <CardDescription>
                Healthcare providers who can view your health data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : shares.length === 0 ? (
                <div className="text-center py-12">
                  <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No providers yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Invite a healthcare provider to share your health data securely
                  </p>
                  <Button className="gradient-primary border-0" onClick={() => setIsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Invite Provider
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className="p-4 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-lg font-semibold text-primary">
                              {share.provider_name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold">{share.provider_name}</p>
                            {share.provider_email && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {share.provider_email}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {share.permissions.vitals && <Badge variant="secondary" className="text-xs">Vitals</Badge>}
                              {share.permissions.meds && <Badge variant="secondary" className="text-xs">Meds</Badge>}
                              {share.permissions.adherence && <Badge variant="secondary" className="text-xs">Adherence</Badge>}
                              {share.permissions.profile && <Badge variant="secondary" className="text-xs">Profile</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyShareLink(share.invite_code)}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Copy Link
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke Access</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will immediately remove {share.provider_name}'s access to your health data. They will no longer be able to view any of your information.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleRevokeAccess(share.id)}
                                >
                                  Revoke Access
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Added {new Date(share.created_at).toLocaleDateString()}
                        </span>
                        {share.last_accessed_at && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            Last viewed {new Date(share.last_accessed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <Card>
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { step: 1, title: 'Create Share Link', desc: 'Choose what data to share and generate a secure link' },
                  { step: 2, title: 'Send to Provider', desc: 'Share the link with your doctor or healthcare team' },
                  { step: 3, title: 'Provider Accesses Data', desc: 'They can view your health info through our secure portal' },
                ].map((item) => (
                  <div key={item.step} className="text-center">
                    <div className="h-12 w-12 rounded-full gradient-primary text-primary-foreground font-bold text-lg flex items-center justify-center mx-auto mb-3">
                      {item.step}
                    </div>
                    <h4 className="font-semibold mb-1">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default CareCircle;
