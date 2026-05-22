import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Plus, Pill, Edit, Trash2, Search, Loader2, AlertTriangle, BookOpen, Ban, Eye, EyeOff, Crown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useMedications } from '@/hooks/useMedications';
import { MEDICATION_TYPE_COLORS, MedicationType } from '@/types/health';
import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { Skeleton } from '@/components/ui/skeleton';
import { MedicationInteractionChecker } from '@/components/medications/MedicationInteractionChecker';
import { DrugInteractionChecker } from '@/components/medications/DrugInteractionChecker';
import { MedicationPhotoGallery } from '@/components/medications/MedicationPhotoGallery';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSubscription } from '@/hooks/useSubscription';
import { FREE_MEDICATION_LIMIT } from '@/lib/pricing-constants';

const Medications = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'interactions'>('list');
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  const { medications, isLoading, deleteMedication } = useMedications();
  const { isPremium, subscriptionReady, checkSubscription } = useSubscription();

  // Check subscription on mount
  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const activeMedications = medications.filter(med => med.is_active);
  const discontinuedMedications = medications.filter(med => !med.is_active);

  const filteredMedications = (showDiscontinued ? medications : activeMedications).filter(med =>
    med.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const medicationLimit = isPremium ? Infinity : FREE_MEDICATION_LIMIT;
  const currentCount = activeMedications.length;
  // Only consider "at limit" after subscription has loaded, so free users don't
  // see a brief upgrade banner flash while we wait for the tier check.
  const isAtLimit = subscriptionReady && !isPremium && currentCount >= FREE_MEDICATION_LIMIT;

  const handleDelete = async (id: string) => {
    await deleteMedication.mutateAsync(id);
  };

  const formatFrequency = (frequency: string) => {
    return frequency.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatTimesOfDay = (times: unknown) => {
    if (!times) return 'Not set';
    if (Array.isArray(times)) {
      return times.join(', ');
    }
    return String(times);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <SectionTabs section="health\" variant="patient" />
      
      <main className="container px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
                My Medicine Cabinet
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage your medications, vitamins, and supplements
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {subscriptionReady && !isPremium && (
                <Badge variant="outline" className="py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm">
                  {currentCount}/{medicationLimit} medications
                </Badge>
              )}
              {subscriptionReady && isPremium && (
                <Badge className="gradient-primary border-0 py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm">
                  <Crown className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              )}
              <Button asChild className="gradient-primary border-0 flex-1 sm:flex-none" size="sm">
                <Link to="/medications/add">
                  <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Add Medication</span>
                  <span className="xs:hidden">Add</span>
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Upgrade Banner */}
        {isAtLimit && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <Card className="gradient-primary text-primary-foreground border-0">
              <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Crown className="h-8 w-8 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold mb-1">You've reached your free limit</h3>
                    <p className="opacity-90">
                      Upgrade to Premium to add unlimited medications and unlock advanced features.
                    </p>
                  </div>
                </div>
                <Button variant="secondary" asChild className="flex-shrink-0">
                  <Link to="/pricing">Upgrade Now</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Tabs for List/Interactions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'interactions')}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="list" className="flex-1 sm:flex-none">
                  <Pill className="h-4 w-4 mr-2" />
                  My Medications
                </TabsTrigger>
                <TabsTrigger value="interactions" className="flex-1 sm:flex-none">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Interactions
                </TabsTrigger>
              </TabsList>
              
              {activeTab === 'list' && (
                <>
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search medications..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {discontinuedMedications.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="show-discontinued"
                        checked={showDiscontinued}
                        onCheckedChange={setShowDiscontinued}
                      />
                      <Label htmlFor="show-discontinued" className="text-sm text-muted-foreground cursor-pointer">
                        Show discontinued ({discontinuedMedications.length})
                      </Label>
                    </div>
                  )}
                </>
              )}
            </div>

            <TabsContent value="list" className="m-0">

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded-xl" />
                      <div>
                        <Skeleton className="h-5 w-32 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Medications Grid */}
        {!isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {filteredMedications.map((medication, index) => (
              <motion.div
                key={medication.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + index * 0.05 }}
              >
                <Card className={`h-full hover-lift ${!medication.is_active ? 'opacity-60 bg-muted/50' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <MedicationPhotoGallery 
                          medicationId={medication.id} 
                          medicationName={medication.name}
                          compact
                        />
                        <div>
                          <CardTitle className="text-lg">{medication.name}</CardTitle>
                          {!medication.is_active && (
                            <CardDescription className="text-xs text-amber-600 dark:text-amber-400">
                              Discontinued {medication.discontinued_at ? new Date(medication.discontinued_at).toLocaleDateString() : ''}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={MEDICATION_TYPE_COLORS[medication.type as MedicationType] || 'bg-muted'}>
                          {medication.type}
                        </Badge>
                        {!medication.is_active && (
                          <Badge variant="outline" className="text-amber-600 border-amber-600/50 dark:text-amber-400 dark:border-amber-400/50">
                            Discontinued
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Dosage</span>
                        <span className="font-medium">{medication.dosage}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Frequency</span>
                        <span className="font-medium">{formatFrequency(medication.frequency)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Times</span>
                        <span className="font-medium">{formatTimesOfDay(medication.times_of_day)}</span>
                      </div>
                      {medication.instructions && (
                        <div className="pt-2 border-t">
                          <p className="text-sm text-muted-foreground">
                            {medication.instructions}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      <Button variant="ghost" size="sm" asChild title="Learn about this medication">
                        <Link to={`/medication-info/${encodeURIComponent(medication.name)}`}>
                          <BookOpen className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <Link to={`/medications/${medication.id}/edit`}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-destructive hover:text-destructive"
                            disabled={deleteMedication.isPending}
                          >
                            {deleteMedication.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Medication</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {medication.name}? This will also remove all scheduled doses. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDelete(medication.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {!isLoading && activeTab === 'list' && filteredMedications.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <Pill className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No medications found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery ? 'Try a different search term' : 'Start by adding your first medication'}
            </p>
            {!searchQuery && (
              <Button asChild className="gradient-primary border-0">
                <Link to="/medications/add">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Medication
                </Link>
              </Button>
            )}
          </motion.div>
        )}
            </TabsContent>

            <TabsContent value="interactions" className="m-0 space-y-6">
              {/* NIH RxNorm API-based checker */}
              <DrugInteractionChecker medications={medications} />
              
              {/* Local fallback database for offline/quick reference */}
              <div className="pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Quick Reference (Offline Database)</p>
                <MedicationInteractionChecker medications={medications} />
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
};

export default Medications;
