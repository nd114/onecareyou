import { motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pill, Search, Loader2, Ban, BookOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Switch } from '@/components/ui/switch';
import { DiscontinueMedicationDialog } from '@/components/medications/DiscontinueMedicationDialog';

const medicationTypes: { value: MedicationType; label: string }[] = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'otc', label: 'Over-the-Counter' },
  { value: 'vitamin', label: 'Vitamin' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'herbal', label: 'Herbal' },
];

const EditMedication = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getMedicationById, updateMedication, discontinueMedication } = useMedications();
  const [isLoading, setIsLoading] = useState(true);
  const [showDiscontinueDialog, setShowDiscontinueDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: '' as MedicationType | '',
    dosage: '',
    frequency: '',
    times_of_day: ['09:00'] as string[],
    instructions: '',
    prescriber: '',
    pharmacy: '',
    is_active: true,
  });

  useEffect(() => {
    const loadMedication = async () => {
      if (!id) return;
      
      try {
        const medication = await getMedicationById(id);
        if (medication) {
          setFormData({
            name: medication.name,
            type: medication.type as MedicationType,
            dosage: medication.dosage,
            frequency: medication.frequency,
            times_of_day: (medication.times_of_day as string[]) || ['09:00'],
            instructions: medication.instructions || '',
            prescriber: medication.prescriber || '',
            pharmacy: medication.pharmacy || '',
            is_active: medication.is_active,
          });
        }
      } catch (error) {
        console.error('Error loading medication:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMedication();
  }, [id]);

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
    if (!id) return;

    await updateMedication.mutateAsync({
      id,
      name: formData.name,
      type: formData.type || 'prescription',
      dosage: formData.dosage,
      frequency: formData.frequency,
      times_of_day: formData.times_of_day,
      instructions: formData.instructions || null,
      prescriber: formData.prescriber || null,
      pharmacy: formData.pharmacy || null,
      is_active: formData.is_active,
    });

    navigate('/medications');
  };

  const handleDiscontinue = async (reason: string) => {
    if (!id) return;
    await discontinueMedication.mutateAsync({ id, reason });
    navigate('/medications');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
        <main className="container py-8 max-w-2xl flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center">
                  <Pill className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle>Edit Medication</CardTitle>
                  <CardDescription>
                    Update the details of your medication
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Medication Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Medication Name *</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder="Search for medication..."
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
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

                {/* Active Toggle */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_active">Active Medication</Label>
                    <p className="text-sm text-muted-foreground">
                      Inactive medications won't appear in your schedule
                    </p>
                  </div>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
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
                    disabled={updateMedication.isPending}
                  >
                    {updateMedication.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>

                {/* Discontinue & Learn More */}
                <div className="flex gap-3 pt-2">
                  <Button 
                    type="button" 
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/medication-info/${encodeURIComponent(formData.name)}`)}
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    Learn About This Medication
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    onClick={() => setShowDiscontinueDialog(true)}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Discontinue
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <DiscontinueMedicationDialog
          open={showDiscontinueDialog}
          onOpenChange={setShowDiscontinueDialog}
          medicationName={formData.name}
          onConfirm={handleDiscontinue}
          isPending={discontinueMedication.isPending}
        />
      </main>
    </div>
  );
};

export default EditMedication;
