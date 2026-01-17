import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Activity, 
  Heart, 
  Droplets, 
  Thermometer, 
  Scale,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { mockVitals } from '@/lib/mock-data';
import { VITAL_CONFIG, VitalType } from '@/types/health';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { toast } from 'sonner';

const vitalCards = [
  { type: 'blood_pressure' as VitalType, icon: Heart, color: 'text-rose' },
  { type: 'glucose' as VitalType, icon: Droplets, color: 'text-ocean' },
  { type: 'weight' as VitalType, icon: Scale, color: 'text-indigo' },
  { type: 'heart_rate' as VitalType, icon: Activity, color: 'text-primary' },
];

const vitalCategories = [
  { id: 'daily', label: 'Daily Vitals', types: ['weight', 'blood_pressure', 'heart_rate', 'temperature'] },
  { id: 'sugar', label: 'Sugar', types: ['glucose', 'hba1c'] },
  { id: 'kidneys', label: 'Kidneys', types: ['urea', 'creatinine', 'gfr'] },
  { id: 'heart', label: 'Heart', types: ['cholesterol_total', 'ldl', 'hdl'] },
  { id: 'liver', label: 'Liver', types: ['alt', 'ast'] },
  { id: 'blood', label: 'Blood', types: ['hemoglobin', 'wbc'] },
  { id: 'minerals', label: 'Minerals', types: ['potassium', 'sodium'] },
];

const getVitalStatus = (type: VitalType, value: number): 'normal' | 'high' | 'low' => {
  const config = VITAL_CONFIG[type];
  if (value < config.normalMin) return 'low';
  if (value > config.normalMax) return 'high';
  return 'normal';
};

const statusColors = {
  normal: 'bg-status-success/10 text-status-success border-status-success/20',
  high: 'bg-severity-high/10 text-severity-high border-severity-high/20',
  low: 'bg-ocean/10 text-ocean border-ocean/20',
};

const statusIcons = {
  normal: Minus,
  high: TrendingUp,
  low: TrendingDown,
};

const Vitals = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('daily');

  const getLatestVital = (type: VitalType) => {
    return mockVitals.find(v => v.type === type);
  };

  const handleAddVital = () => {
    toast.success('Vital recorded successfully!');
    setIsAddDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header isAuthenticated userName="John" />
      
      <main className="container py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">
              Health Metrics
            </h1>
            <p className="text-muted-foreground">
              Track your vitals and lab results over time
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary border-0">
                <Plus className="h-4 w-4 mr-2" />
                Record Vital
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record New Vital</DialogTitle>
                <DialogDescription>
                  Enter your health measurement
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                  <TabsList className="grid grid-cols-4 h-auto">
                    {vitalCategories.slice(0, 4).map((cat) => (
                      <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                        {cat.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {vitalCategories.map((category) => (
                    <TabsContent key={category.id} value={category.id} className="space-y-4 pt-4">
                      {category.types.map((type) => {
                        const config = VITAL_CONFIG[type as VitalType];
                        return (
                          <div key={type} className="space-y-2">
                            <Label htmlFor={type}>{config.label} ({config.unit})</Label>
                            <Input
                              id={type}
                              type="number"
                              placeholder={`e.g., ${config.normalMin}-${config.normalMax}`}
                            />
                          </div>
                        );
                      })}
                    </TabsContent>
                  ))}
                </Tabs>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1 gradient-primary border-0" onClick={handleAddVital}>
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {vitalCards.map((card, index) => {
            const vital = getLatestVital(card.type);
            const config = VITAL_CONFIG[card.type];
            const status = vital ? getVitalStatus(card.type, vital.valueNumeric) : 'normal';
            const StatusIcon = statusIcons[status];
            
            return (
              <motion.div
                key={card.type}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + index * 0.05 }}
              >
                <Card className="hover-lift">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center`}>
                        <card.icon className={`h-5 w-5 ${card.color}`} />
                      </div>
                      <Badge variant="outline" className={statusColors[status]}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">{config.label}</p>
                    <p className="text-2xl font-bold">
                      {vital?.value || '—'} 
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        {config.unit}
                      </span>
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Vitals by Category */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>All Health Metrics</CardTitle>
              <CardDescription>
                View and track all your vitals and lab results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="daily">
                <TabsList className="flex flex-wrap h-auto gap-1 mb-6">
                  {vitalCategories.map((cat) => (
                    <TabsTrigger key={cat.id} value={cat.id}>
                      {cat.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {vitalCategories.map((category) => (
                  <TabsContent key={category.id} value={category.id}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {category.types.map((type) => {
                        const config = VITAL_CONFIG[type as VitalType];
                        const vital = getLatestVital(type as VitalType);
                        const status = vital ? getVitalStatus(type as VitalType, vital.valueNumeric) : 'normal';
                        
                        return (
                          <Card key={type} className="border-border/50">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{config.label}</p>
                                  <p className="text-2xl font-bold mt-1">
                                    {vital?.value || '—'}
                                    <span className="text-sm font-normal text-muted-foreground ml-1">
                                      {config.unit}
                                    </span>
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Normal: {config.normalMin}-{config.normalMax}
                                  </p>
                                </div>
                                {vital && (
                                  <Badge variant="outline" className={statusColors[status]}>
                                    {status}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        {/* Educational Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Why Track Your Vitals?</h3>
                  <p className="text-sm text-muted-foreground">
                    Regular monitoring helps you and your healthcare provider identify trends, 
                    catch potential issues early, and make informed decisions about your health. 
                    Track consistently for the best insights.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default Vitals;
