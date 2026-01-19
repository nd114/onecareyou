import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Activity, 
  Heart, 
  Droplets, 
  Thermometer, 
  Scale,
  Plus,
  BarChart3,
  FileText,
  Loader2,
  History,
  Download
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { VitalType, VITAL_CONFIG } from '@/types/health';
import { useVitals, VitalRecord } from '@/hooks/useVitals';
import { VitalTrendChart } from '@/components/vitals/VitalTrendChart';
import { VitalStatsCard } from '@/components/vitals/VitalStatsCard';
import { AddVitalDialog } from '@/components/vitals/AddVitalDialog';
import { EditVitalDialog } from '@/components/vitals/EditVitalDialog';
import { VitalHistoryLog } from '@/components/vitals/VitalHistoryLog';
import { ExportDialog } from '@/components/vitals/ExportDialog';
import { useUnitPreferences } from '@/hooks/useUnitPreferences';

const vitalCards = [
  { type: 'blood_pressure' as VitalType, icon: Heart, color: 'text-rose' },
  { type: 'glucose' as VitalType, icon: Droplets, color: 'text-ocean' },
  { type: 'weight' as VitalType, icon: Scale, color: 'text-indigo' },
  { type: 'heart_rate' as VitalType, icon: Activity, color: 'text-primary' },
];

const vitalCategories = [
  { id: 'daily', label: 'Daily Vitals', types: ['weight', 'blood_pressure', 'heart_rate', 'temperature'] as VitalType[] },
  { id: 'sugar', label: 'Sugar', types: ['glucose', 'hba1c'] as VitalType[] },
  { id: 'kidneys', label: 'Kidneys', types: ['urea', 'creatinine', 'gfr'] as VitalType[] },
  { id: 'heart', label: 'Heart', types: ['cholesterol_total', 'ldl', 'hdl'] as VitalType[] },
  { id: 'liver', label: 'Liver', types: ['alt', 'ast'] as VitalType[] },
  { id: 'blood', label: 'Blood', types: ['hemoglobin', 'wbc'] as VitalType[] },
  { id: 'minerals', label: 'Minerals', types: ['potassium', 'sodium'] as VitalType[] },
];

const Vitals = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [editingVital, setEditingVital] = useState<VitalRecord | null>(null);
  const [view, setView] = useState<'overview' | 'analytics' | 'history'>('overview');
  const { vitals, loading, addVital, updateVital, deleteVital, getLatestVital, getVitalHistory, getVitalStats } = useVitals();
  const { convertVitalValue, getDisplayUnit, getNormalRange } = useUnitPreferences();

  const handleEditVital = (vital: VitalRecord) => {
    setEditingVital(vital);
    setIsEditDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-8"
        >
          <div className="flex flex-col gap-3 sm:gap-4">
            <div>
              <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold mb-0.5 sm:mb-2">
                Health Metrics
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-muted-foreground">
                Track your vitals and lab results over time
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                className="gradient-primary border-0 flex-1 h-10" 
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Record
              </Button>
              {vitals.length > 0 && (
                <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0" onClick={() => setIsExportDialogOpen(true)}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          
          {/* View Toggle - Full width on mobile */}
          <div className="flex rounded-lg border bg-card p-0.5 sm:p-1 mt-4 w-full">
            <Button
              variant={view === 'overview' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 h-8 sm:h-9 text-[11px] sm:text-sm px-2 sm:px-3"
              onClick={() => setView('overview')}
            >
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Overview
            </Button>
            <Button
              variant={view === 'analytics' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 h-8 sm:h-9 text-[11px] sm:text-sm px-2 sm:px-3"
              onClick={() => setView('analytics')}
            >
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Analytics
            </Button>
            <Button
              variant={view === 'history' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 h-8 sm:h-9 text-[11px] sm:text-sm px-2 sm:px-3"
              onClick={() => setView('history')}
            >
              <History className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              History
            </Button>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : view === 'overview' ? (
          <>
            {/* Summary Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 lg:grid-cols-4 mb-4 sm:mb-8"
            >
              {vitalCards.map((card, index) => {
                const latestVital = getLatestVital(card.type);
                const stats = getVitalStats(card.type);
                
                return (
                  <motion.div
                    key={card.type}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                  >
                    <VitalStatsCard
                      type={card.type}
                      latestVital={latestVital}
                      stats={stats}
                      icon={card.icon}
                      colorClass={card.color}
                    />
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
                <CardHeader className="pb-2 sm:pb-4">
                  <CardTitle className="text-base sm:text-lg">All Health Metrics</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    View and track all your vitals and lab results
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 sm:p-6">
                  <Tabs defaultValue="daily">
                    <TabsList className="flex flex-wrap h-auto gap-0.5 sm:gap-1 mb-4 sm:mb-6">
                      {vitalCategories.map((cat) => (
                        <TabsTrigger key={cat.id} value={cat.id} className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 py-1 sm:py-1.5">
                          {cat.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {vitalCategories.map((category) => (
                      <TabsContent key={category.id} value={category.id}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                          {category.types.map((type) => {
                            const config = VITAL_CONFIG[type];
                            const vital = getLatestVital(type);
                            const stats = getVitalStats(type);
                            const displayUnit = getDisplayUnit(type);
                            const normalRange = getNormalRange(type);
                            
                            const getStatus = (value: number): 'normal' | 'high' | 'low' => {
                              const converted = convertVitalValue(type, value);
                              if (converted.value < normalRange.min) return 'low';
                              if (converted.value > normalRange.max) return 'high';
                              return 'normal';
                            };
                            
                            const status = vital ? getStatus(vital.value) : 'normal';
                            
                            const statusColors = {
                              normal: 'bg-status-success/10 text-status-success border-status-success/20',
                              high: 'bg-severity-high/10 text-severity-high border-severity-high/20',
                              low: 'bg-ocean/10 text-ocean border-ocean/20',
                            };
                            
                            const formatValue = () => {
                              if (!vital) return '—';
                              if (type === 'blood_pressure' && vital.secondary_value) {
                                return `${vital.value}/${vital.secondary_value}`;
                              }
                              const converted = convertVitalValue(type, vital.value);
                              return Math.round(converted.value * 10) / 10;
                            };
                            
                            return (
                              <Card key={type} className="border-border/50">
                                <CardContent className="p-3 sm:p-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium text-xs sm:text-sm truncate">{config.label}</p>
                                      <p className="text-lg sm:text-xl md:text-2xl font-bold mt-0.5 sm:mt-1">
                                        {formatValue()}
                                        <span className="text-[10px] sm:text-xs md:text-sm font-normal text-muted-foreground ml-0.5 sm:ml-1">
                                          {displayUnit}
                                        </span>
                                      </p>
                                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                                        Normal: {Math.round(normalRange.min * 10) / 10}-{Math.round(normalRange.max * 10) / 10}
                                      </p>
                                      {stats && stats.count > 0 && (
                                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                                          {stats.count} readings
                                        </p>
                                      )}
                                    </div>
                                    {vital && (
                                      <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium border flex-shrink-0 ${statusColors[status]}`}>
                                        {status}
                                      </span>
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
          </>
        ) : view === 'analytics' ? (
          /* Analytics View */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4 sm:space-y-6"
          >
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4">
              {vitalCards.map((card) => {
                const stats = getVitalStats(card.type);
                const config = VITAL_CONFIG[card.type];
                const displayUnit = getDisplayUnit(card.type);
                
                const formatAvg = () => {
                  if (!stats) return null;
                  const converted = convertVitalValue(card.type, stats.average);
                  return Math.round(converted.value * 10) / 10;
                };
                
                return (
                  <Card key={card.type}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                        <card.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${card.color}`} />
                        <span className="text-xs sm:text-sm font-medium truncate">{config.label}</span>
                      </div>
                      {stats ? (
                        <div className="space-y-0.5 sm:space-y-1">
                          <p className="text-base sm:text-lg font-bold">{formatAvg()} <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">{displayUnit}</span></p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">{stats.count} readings • {stats.inRange} in range</p>
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-muted-foreground">No data</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Trend Charts */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
              {vitalCards.map((card) => (
                <VitalTrendChart
                  key={card.type}
                  type={card.type}
                  data={getVitalHistory(card.type, 30)}
                />
              ))}
            </div>

            {/* All Categories Analytics */}
            <Card>
              <CardHeader className="pb-2 sm:pb-4">
                <CardTitle className="text-base sm:text-lg">Lab Results Analytics</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Track trends in your blood work and lab tests</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                <Tabs defaultValue="sugar">
                  <TabsList className="flex flex-wrap h-auto gap-0.5 sm:gap-1 mb-4 sm:mb-6">
                    {vitalCategories.slice(1).map((cat) => (
                      <TabsTrigger key={cat.id} value={cat.id} className="text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 py-1 sm:py-1.5">
                        {cat.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {vitalCategories.slice(1).map((category) => (
                    <TabsContent key={category.id} value={category.id}>
                      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
                        {category.types.map((type) => (
                          <VitalTrendChart
                            key={type}
                            type={type}
                            data={getVitalHistory(type, 90)}
                          />
                        ))}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {/* History View */}
        {!loading && view === 'history' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Vital History Log</CardTitle>
                <CardDescription>
                  Complete record of all your health measurements with edit and delete options
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VitalHistoryLog
                  vitals={vitals}
                  onEdit={handleEditVital}
                  onDelete={deleteVital}
                />
              </CardContent>
            </Card>
          </motion.div>
        )}

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

      <AddVitalDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSave={addVital}
      />
      
      <EditVitalDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        vital={editingVital}
        onSave={updateVital}
      />

      <ExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        vitals={vitals}
      />
    </div>
  );
};

export default Vitals;
