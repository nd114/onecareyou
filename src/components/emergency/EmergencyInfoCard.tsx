import { Phone, AlertTriangle, Heart, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergencyNumbers } from '@/hooks/useEmergencyNumbers';
import { Skeleton } from '@/components/ui/skeleton';

interface EmergencyInfoCardProps {
  compact?: boolean;
}

export function EmergencyInfoCard({ compact = false }: EmergencyInfoCardProps) {
  const { profile } = useAuth();
  const { getEmergencyNumber, getAmbulanceNumber, isLoading } = useEmergencyNumbers();
  
  const countryCode = (profile as any)?.country_code || (profile as any)?.location || 'US';
  const emergencyData = getEmergencyNumber(countryCode);
  const ambulanceNumber = getAmbulanceNumber(countryCode);
  const personalContact = (profile as any)?.emergency_contact_name;
  const personalNumber = (profile as any)?.emergency_number;

  if (isLoading) {
    return (
      <Card className={compact ? "border-destructive/20" : ""}>
        <CardContent className={compact ? "p-4" : "p-6"}>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Phone className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-sm">Emergency</p>
                <p className="text-xs text-muted-foreground">
                  {emergencyData?.country_name || 'Call for help'}
                </p>
              </div>
            </div>
            <Button 
              variant="destructive" 
              size="sm" 
              className="h-9"
              asChild
            >
              <a href={`tel:${ambulanceNumber}`}>
                <Phone className="h-4 w-4 mr-1" />
                {ambulanceNumber}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Emergency Contacts
        </CardTitle>
        <CardDescription>Quick access to emergency services</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Emergency Services */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {emergencyData?.country_name || 'Emergency Services'}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Ambulance */}
            <Button 
              variant="destructive" 
              className="w-full justify-start gap-2"
              asChild
            >
              <a href={`tel:${emergencyData?.ambulance_number || ambulanceNumber}`}>
                <Phone className="h-4 w-4" />
                <span className="flex flex-col items-start">
                  <span className="text-xs opacity-80">Ambulance</span>
                  <span className="font-bold">{emergencyData?.ambulance_number || ambulanceNumber}</span>
                </span>
              </a>
            </Button>

            {/* Police */}
            {emergencyData?.police_number && (
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2 border-destructive/30 hover:bg-destructive/10"
                asChild
              >
                <a href={`tel:${emergencyData.police_number}`}>
                  <Phone className="h-4 w-4 text-destructive" />
                  <span className="flex flex-col items-start">
                    <span className="text-xs text-muted-foreground">Police</span>
                    <span className="font-bold">{emergencyData.police_number}</span>
                  </span>
                </a>
              </Button>
            )}

            {/* Fire */}
            {emergencyData?.fire_number && (
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2 border-destructive/30 hover:bg-destructive/10"
                asChild
              >
                <a href={`tel:${emergencyData.fire_number}`}>
                  <Phone className="h-4 w-4 text-destructive" />
                  <span className="flex flex-col items-start">
                    <span className="text-xs text-muted-foreground">Fire</span>
                    <span className="font-bold">{emergencyData.fire_number}</span>
                  </span>
                </a>
              </Button>
            )}
          </div>

          {/* General emergency number if different */}
          {emergencyData?.emergency_number && 
           emergencyData.emergency_number !== emergencyData.ambulance_number && (
            <p className="text-xs text-muted-foreground">
              General emergency: <strong>{emergencyData.emergency_number}</strong>
            </p>
          )}

          {emergencyData?.notes && (
            <p className="text-xs text-muted-foreground italic">
              {emergencyData.notes}
            </p>
          )}
        </div>

        {/* Personal Emergency Contact */}
        {personalContact && personalNumber && (
          <>
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Heart className="h-4 w-4" />
                Personal Emergency Contact
              </div>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3"
                asChild
              >
                <a href={`tel:${personalNumber}`}>
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {personalContact.charAt(0)}
                    </span>
                  </div>
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{personalContact}</span>
                    <span className="text-xs text-muted-foreground">{personalNumber}</span>
                  </span>
                </a>
              </Button>
            </div>
          </>
        )}

        {!personalContact && !personalNumber && (
          <p className="text-xs text-muted-foreground text-center pt-2 border-t">
            Add a personal emergency contact in Settings
          </p>
        )}
      </CardContent>
    </Card>
  );
}
