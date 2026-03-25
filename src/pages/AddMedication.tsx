import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pill, Loader2, Camera, Crown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Header } from '@/components/layout/Header';
import { MEDICATION_FREQUENCIES, MedicationType } from '@/types/health';
import { useState, useEffect } from 'react';
import { useMedications } from '@/hooks/useMedications';
import { MedicationSearchInput } from '@/components/medications/MedicationSearchInput';
import { MedicationSuggestion } from '@/hooks/useMedicationDatabase';
import { MedicationScanner } from '@/components/medications/MedicationScanner';
import { useSubscription } from '@/hooks/useSubscription';
import { toast } from 'sonner';
import { FREE_MEDICATION_LIMIT } from '@/lib/pricing-constants';
import { FamilyMemberSelector } from '@/components/family/FamilyMemberSelector';

const medicationTypes: { value: MedicationType; label: string }[] = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'otc', label: 'Over-the-Counter' },
  { value: 'vitamin', label: 'Vitamin' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'herbal', label: 'Herbal' },
];

const AddMedication = () => {
  const navigate = useNavigate();
  const { addMedication, medications } = useMedications();
  const { isPremium, checkSubscription, checkingStatus } = useSubscription();
  const [formData, setFormData] = useState({
    name: '',
    type: '' as MedicationType | '',
    dosage: '',
    frequency: '',
    times_of_day: ['09:00'],
    instructions: '',
    prescriber: '',
    pharmacy: '',
  });

  // Check subscription on mount
  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const activeMedicationCount = medications.filter(med => med.is_active).length;
  const isAtLimit = !isPremium && activeMedicationCount >= FREE_MEDICATION_LIMIT;

  const selectedFrequency = MEDICATION_FREQUENCIES.find(f => f.value === formData.frequency);
  const timeSlotsCount = selectedFrequency?.timesPerDay || 1;

  const handleFrequencyChange = (value: string) => {
    const freq = MEDICATION_FREQUENCIES.find(f => f.value === value);
    setFormData({
      ...formData,
      frequency: value,
      times_of_day: freq?.defaultTimes || ['09:00'],
    });
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...formData.times_of_day];
    newTimes[index] = value;
    setFormData({ ...formData, times_of_day: newTimes });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enforce free tier limit
    if (isAtLimit) {
      toast.error('You\'ve reached your free medication limit. Upgrade to Premium for unlimited medications.');
      return;
    }
    
    await addMedication.mutateAsync({
      name: formData.name,
      type: formData.type || 'prescription',
      dosage: formData.dosage,
      frequency: formData.frequency,
      times_of_day: formData.times_of_day,
      instructions: formData.instructions || null,
      prescriber: formData.prescriber || null,
      pharmacy: formData.pharmacy || null,
    });

    navigate('/medications');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-8 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button variant="ghost" asChild className="mb-6">
            <Link to="/medications">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Medications
            </Link>
          </Button>

          {/* Upgrade Banner when at limit */}
          {isAtLimit && (
            <Card className="mb-6 gradient-primary text-primary-foreground border-0">
              <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Crown className="h-8 w-8" />
                  <div>
                    <h3 className="text-lg font-semibold">Medication Limit Reached</h3>
                    <p className="opacity-90">
                      Free plan allows {FREE_MEDICATION_LIMIT} medications. Upgrade to Premium for unlimited.
                    </p>
                  </div>
                </div>
                <Button variant="secondary" asChild>
                  <Link to="/pricing">Upgrade to Premium</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className={isAtLimit ? 'opacity-50 pointer-events-none' : ''}>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center">
                  <Pill className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle>Add New Medication</CardTitle>
                  <CardDescription>
                    {isAtLimit 
                      ? `Upgrade to add more than ${FREE_MEDICATION_LIMIT} medications`
                      : 'Enter the details of your medication, vitamin, or supplement'
                    }
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Quick Add Options - Photo ID and Barcode Scanner */}
                <Card className="border-dashed border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Camera className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Quick Add</p>
                        <p className="text-xs text-muted-foreground">Identify medication by photo or barcode</p>
                      </div>
                    </div>
                    <MedicationScanner 
                      onMedicationIdentified={(info) => {
                        setFormData(prev => ({
                          ...prev,
                          name: info.name,
                          dosage: info.strength || prev.dosage,
                        }));
                      }}
                    />
                  </CardContent>
                </Card>
                
                <div className="relative">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                    or search manually
                  </span>
                </div>

                {/* Medication Name with Search */}
                <div className="space-y-2">
                  <Label htmlFor="name">Medication Name *</Label>
                  <MedicationSearchInput
                    value={formData.name}
                    onChange={(name) => setFormData({ ...formData, name })}
                    onSelectSuggestion={(med: MedicationSuggestion) => {
                      // Auto-fill dosage if common dosages available
                      if (med.commonDosages.length > 0) {
                        setFormData(prev => ({
                          ...prev,
                          name: med.name,
                          dosage: prev.dosage || med.commonDosages[0],
                        }));
                      }
                    }}
                    placeholder="Search medications, vitamins, supplements..."
                  />
                </div>

                {/* Type */}
                <div className="space-y-2">
                  <Label>Medication Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value as MedicationType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {medicationTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dosage */}
                <div className="space-y-2">
                  <Label htmlFor="dosage">Dosage *</Label>
                  <Input
                    id="dosage"
                    placeholder="e.g., 500mg, 1 tablet"
                    value={formData.dosage}
                    onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                    required
                  />
                </div>

                {/* Frequency */}
                <div className="space-y-2">
                  <Label>Frequency *</Label>
                  <Select
                    value={formData.frequency}
                    onValueChange={handleFrequencyChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDICATION_FREQUENCIES.map((freq) => (
                        <SelectItem key={freq.value} value={freq.value}>
                          {freq.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Time Slots */}
                {timeSlotsCount > 0 && formData.frequency && (
                  <div className="space-y-2">
                    <Label>Time Slots</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Array.from({ length: timeSlotsCount }).map((_, index) => (
                        <Input
                          key={index}
                          type="time"
                          value={formData.times_of_day[index] || '09:00'}
                          onChange={(e) => handleTimeChange(index, e.target.value)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Prescriber & Pharmacy */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prescriber">Prescriber</Label>
                    <Input
                      id="prescriber"
                      placeholder="e.g., Dr. Smith"
                      value={formData.prescriber}
                      onChange={(e) => setFormData({ ...formData, prescriber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pharmacy">Pharmacy</Label>
                    <Input
                      id="pharmacy"
                      placeholder="e.g., CVS Pharmacy"
                      value={formData.pharmacy}
                      onChange={(e) => setFormData({ ...formData, pharmacy: e.target.value })}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="instructions">Instructions</Label>
                  <Textarea
                    id="instructions"
                    placeholder="Special instructions (e.g., take with food, avoid alcohol)"
                    value={formData.instructions}
                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" asChild>
                    <Link to="/medications">Cancel</Link>
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 gradient-primary border-0"
                    disabled={addMedication.isPending}
                  >
                    {addMedication.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add Medication'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default AddMedication;
