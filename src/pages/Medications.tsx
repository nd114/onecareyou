import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Plus, Pill, Edit, Trash2, Search, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/Header';
import { useMedications } from '@/hooks/useMedications';
import { MEDICATION_TYPE_COLORS, MedicationType } from '@/types/health';
import { useState } from 'react';
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

const Medications = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { medications, isLoading, deleteMedication } = useMedications();

  const filteredMedications = medications.filter(med => 
    med.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const medicationLimit = 3; // Free tier limit
  const currentCount = medications.length;
  const isAtLimit = currentCount >= medicationLimit;

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
      
      <main className="container py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">
              My Medicine Cabinet
            </h1>
            <p className="text-muted-foreground">
              Manage your medications, vitamins, and supplements
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="py-2 px-4">
              {currentCount}/{medicationLimit} medications
            </Badge>
            <Button asChild className="gradient-primary border-0">
              <Link to="/medications/add">
                <Plus className="h-4 w-4 mr-2" />
                Add Medication
              </Link>
            </Button>
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
                <div>
                  <h3 className="text-lg font-semibold mb-1">You've reached your free limit</h3>
                  <p className="opacity-90">
                    Upgrade to Premium to add unlimited medications and unlock advanced features.
                  </p>
                </div>
                <Button variant="secondary" asChild>
                  <Link to="/subscription">Upgrade Now</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search medications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </motion.div>

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
                <Card className={`h-full hover-lift ${!medication.is_active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Pill className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{medication.name}</CardTitle>
                          {!medication.is_active && (
                            <CardDescription className="text-xs">
                              Inactive
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <Badge className={MEDICATION_TYPE_COLORS[medication.type as MedicationType] || 'bg-muted'}>
                        {medication.type}
                      </Badge>
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

        {!isLoading && filteredMedications.length === 0 && (
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
      </main>
    </div>
  );
};

export default Medications;
