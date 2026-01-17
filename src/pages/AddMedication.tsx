import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pill, Search } from 'lucide-react';
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
import { useState } from 'react';
import { toast } from 'sonner';

const medicationTypes: { value: MedicationType; label: string }[] = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'otc', label: 'Over-the-Counter' },
  { value: 'vitamin', label: 'Vitamin' },
  { value: 'supplement', label: 'Supplement' },
  { value: 'herbal', label: 'Herbal' },
];

const AddMedication = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    genericName: '',
    brandName: '',
    type: '' as MedicationType | '',
    dosage: '',
    frequency: '',
    timeOfDay: ['09:00'],
    notes: '',
  });

  const selectedFrequency = MEDICATION_FREQUENCIES.find(f => f.value === formData.frequency);
  const timeSlotsCount = selectedFrequency?.timesPerDay || 1;

  const handleFrequencyChange = (value: string) => {
    const freq = MEDICATION_FREQUENCIES.find(f => f.value === value);
    setFormData({
      ...formData,
      frequency: value,
      timeOfDay: freq?.defaultTimes || ['09:00'],
    });
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...formData.timeOfDay];
    newTimes[index] = value;
    setFormData({ ...formData, timeOfDay: newTimes });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Medication added successfully!');
    navigate('/medications');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header isAuthenticated userName="John" />
      
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
                  <CardTitle>Add New Medication</CardTitle>
                  <CardDescription>
                    Enter the details of your medication, vitamin, or supplement
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Medication Name with Search */}
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
                  <p className="text-xs text-muted-foreground">
                    Start typing to search the medication database
                  </p>
                </div>

                {/* Generic & Brand Names */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="genericName">Generic Name</Label>
                    <Input
                      id="genericName"
                      placeholder="e.g., Metformin"
                      value={formData.genericName}
                      onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="brandName">Brand Name</Label>
                    <Input
                      id="brandName"
                      placeholder="e.g., Glucophage"
                      value={formData.brandName}
                      onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
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
                          value={formData.timeOfDay[index] || '09:00'}
                          onChange={(e) => handleTimeChange(index, e.target.value)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Special instructions (e.g., take with food, avoid alcohol)"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" asChild>
                    <Link to="/medications">Cancel</Link>
                  </Button>
                  <Button type="submit" className="flex-1 gradient-primary border-0">
                    Add Medication
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
