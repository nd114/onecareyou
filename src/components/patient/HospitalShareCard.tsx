import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Building2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  useMyInstitutionShares,
  type InstitutionInfo,
} from '@/hooks/usePracticeShares';

export const HospitalShareCard = () => {
  const {
    activeShares,
    pastShares,
    isLoading,
    lookupInstitution,
    connect,
    isConnecting,
    disconnect,
    isDisconnecting,
  } = useMyInstitutionShares();

  const [code, setCode] = useState('');
  const [found, setFound] = useState<InstitutionInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const [shareAll, setShareAll] = useState(true);

  const handleLookup = async () => {
    if (!code.trim()) return;
    setLooking(true);
    try {
      const result = await lookupInstitution(code.trim());
      if (!result) {
        toast.error('No hospital found with that code');
        setFound(null);
      } else {
        setFound(result);
      }
    } catch {
      toast.error('Could not look up that code');
    } finally {
      setLooking(false);
    }
  };

  const handleConnect = async () => {
    if (!found) return;
    await connect({ practiceId: found.id, shareAll });
    setFound(null);
    setCode('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          Hospitals &amp; clinics
        </CardTitle>
        <CardDescription>
          Share your record with a hospital as an institution. The hospital assigns the doctor who
          looks after you — you stay in control and can disconnect at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {activeShares.length > 0 && (
              <div className="space-y-2">
                {activeShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {share.institution?.name ?? 'Hospital'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[share.institution?.city, share.institution?.country]
                          .filter(Boolean)
                          .join(', ') || 'Connected'}
                        {' · '}
                        {share.share_all ? 'Sharing everything' : 'Limited sharing'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isDisconnecting}
                      onClick={() => disconnect({ shareId: share.id })}
                    >
                      Disconnect
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <div className="space-y-2">
                <Label htmlFor="hospital-code">Hospital code</Label>
                <div className="flex gap-2">
                  <Input
                    id="hospital-code"
                    placeholder="e.g. oclmc"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  />
                  <Button variant="secondary" onClick={handleLookup} disabled={looking}>
                    {looking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">Find</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your hospital gives you this code when you register with them.
                </p>
              </div>

              {found && (
                <div className="space-y-3 rounded-lg bg-muted/50 p-3">
                  <div>
                    <p className="font-medium text-sm">{found.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[found.city, found.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Share my full record</p>
                      <p className="text-xs text-muted-foreground">
                        Turn off to share only vitals and medications.
                      </p>
                    </div>
                    <Switch checked={shareAll} onCheckedChange={setShareAll} />
                  </div>
                  <Button className="w-full" onClick={handleConnect} disabled={isConnecting}>
                    {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Share with {found.name}
                  </Button>
                </div>
              )}
            </div>

            {pastShares.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Past connections</p>
                {pastShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
                  >
                    <div>
                      <p className="text-sm">{share.institution?.name ?? 'Hospital'}</p>
                      <p className="text-xs text-muted-foreground">
                        Ended{' '}
                        {share.revoked_at
                          ? new Date(share.revoked_at).toLocaleDateString()
                          : 'previously'}{' '}
                        · records preserved
                      </p>
                    </div>
                    <Badge variant="secondary">Ended</Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
