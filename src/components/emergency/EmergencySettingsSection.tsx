import { useState, useEffect } from 'react';
import { Phone, MapPin, Heart, Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergencyNumbers, COUNTRY_LIST } from '@/hooks/useEmergencyNumbers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function EmergencySettingsSection() {
  const { user, profile, refreshProfile } = useAuth();
  const { getEmergencyNumber } = useEmergencyNumbers();
  
  const [countryCode, setCountryCode] = useState((profile as any)?.country_code || '');
  const [emergencyContactName, setEmergencyContactName] = useState((profile as any)?.emergency_contact_name || '');
  const [emergencyNumber, setEmergencyNumber] = useState((profile as any)?.emergency_number || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setCountryCode((profile as any)?.country_code || '');
      setEmergencyContactName((profile as any)?.emergency_contact_name || '');
      setEmergencyNumber((profile as any)?.emergency_number || '');
    }
  }, [profile]);

  const selectedCountry = getEmergencyNumber(countryCode);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          country_code: countryCode || null,
          emergency_contact_name: emergencyContactName || null,
          emergency_number: emergencyNumber || null,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success('Emergency settings saved');
      refreshProfile?.();
    } catch (error) {
      console.error('Failed to save emergency settings:', error);
      toast.error('Failed to save emergency settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-destructive" />
          Emergency Information
        </CardTitle>
        <CardDescription>
          Set your country for local emergency numbers and add a personal emergency contact
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Country Selection */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Your Location
          </div>
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger>
              <SelectValue placeholder="Select your country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRY_LIST.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedCountry && (
            <div className="p-3 rounded-lg bg-muted/50 space-y-1">
              <p className="text-sm font-medium">Local Emergency Numbers</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">General: </span>
                  <strong>{selectedCountry.emergency_number}</strong>
                </div>
                {selectedCountry.ambulance_number && (
                  <div>
                    <span className="text-muted-foreground">Ambulance: </span>
                    <strong>{selectedCountry.ambulance_number}</strong>
                  </div>
                )}
                {selectedCountry.police_number && (
                  <div>
                    <span className="text-muted-foreground">Police: </span>
                    <strong>{selectedCountry.police_number}</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Personal Emergency Contact */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Heart className="h-4 w-4 text-muted-foreground" />
            Personal Emergency Contact
          </div>
          <p className="text-sm text-muted-foreground">
            Someone to call in case of a medical emergency
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergency-name">Contact Name</Label>
              <Input
                id="emergency-name"
                placeholder="e.g., John Smith (Spouse)"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergency-phone">Phone Number</Label>
              <Input
                id="emergency-phone"
                type="tel"
                placeholder="+1 555-123-4567"
                value={emergencyNumber}
                onChange={(e) => setEmergencyNumber(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="gradient-primary border-0"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Emergency Settings
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
