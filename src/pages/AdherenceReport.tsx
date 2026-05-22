import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowLeft, 
  Calendar,
  Pill,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Download,
  Settings
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useAdherenceReport } from '@/hooks/useAdherenceReport';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS = {
  taken: 'hsl(var(--primary))',
  skipped: 'hsl(var(--muted-foreground))',
  missed: 'hsl(var(--destructive))',
};

const AdherenceReport = () => {
  const [dateRange, setDateRange] = useState<number>(7);
  const { report, isLoading, isReportEnabled } = useAdherenceReport(dateRange);

  if (!isReportEnabled) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
      <SectionTabs section="health\" variant="patient" />
        <main className="container py-8 max-w-4xl">
          <Button variant="ghost" asChild className="mb-6">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          
          <Card>
            <CardContent className="p-12 text-center">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-xl font-semibold mb-2">Adherence Report Disabled</h2>
              <p className="text-muted-foreground mb-6">
                You've disabled the weekly adherence report in your settings.
              </p>
              <Button asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4 mr-2" />
                  Go to Settings
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const pieData = report ? [
    { name: 'Taken', value: report.takenDoses, color: COLORS.taken },
    { name: 'Skipped', value: report.skippedDoses, color: COLORS.skipped },
    { name: 'Missed', value: report.missedDoses, color: COLORS.missed },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Button variant="ghost" asChild className="mb-4">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">
                Medication Adherence Report
              </h1>
              <p className="text-muted-foreground">
                Track your medication compliance over time
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select 
                value={dateRange.toString()} 
                onValueChange={(v) => setDateRange(parseInt(v))}
              >
                <SelectTrigger className="w-[140px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : report ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <Card className="stat-card-1 text-primary-foreground border-0">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm opacity-90">Adherence Rate</span>
                    {report.weekOverWeekChange !== 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {report.weekOverWeekChange > 0 ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {report.weekOverWeekChange > 0 ? '+' : ''}{report.weekOverWeekChange}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-3xl font-bold">{report.overallAdherence}%</p>
                </CardContent>
              </Card>

              <Card className="bg-status-success/10 border-status-success/20">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-status-success" />
                    <span className="text-sm text-muted-foreground">Taken</span>
                  </div>
                  <p className="text-3xl font-bold text-status-success">{report.takenDoses}</p>
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Skipped</span>
                  </div>
                  <p className="text-3xl font-bold">{report.skippedDoses}</p>
                </CardContent>
              </Card>

              <Card className="bg-destructive/10 border-destructive/20">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-muted-foreground">Missed</span>
                  </div>
                  <p className="text-3xl font-bold text-destructive">{report.missedDoses}</p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daily Trend Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-2"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Daily Adherence Trend
                    </CardTitle>
                    <CardDescription>Your daily medication adherence over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={report.dailyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis 
                            dataKey="dateLabel" 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          />
                          <YAxis 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                            domain={[0, 100]}
                            tickFormatter={(value) => `${value}%`}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              background: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                            formatter={(value: number) => [`${value}%`, 'Adherence']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="adherenceRate" 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Pie Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Dose Breakdown</CardTitle>
                    <CardDescription>Overall distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48">
                      {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          No data available
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center gap-4 mt-4">
                      {pieData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <div 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-sm text-muted-foreground">{entry.name}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Daily Breakdown Bar Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Daily Breakdown
                  </CardTitle>
                  <CardDescription>Taken vs skipped doses by day</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="dateLabel"
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        />
                        <YAxis 
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            background: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="taken" name="Taken" fill={COLORS.taken} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="skipped" name="Skipped" fill={COLORS.skipped} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="missed" name="Missed" fill={COLORS.missed} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Medication-level Adherence */}
            {report.medicationData.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-primary" />
                      By Medication
                    </CardTitle>
                    <CardDescription>Adherence breakdown for each medication</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {report.medicationData.map((med) => (
                        <div key={med.medicationId} className="space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                            <span className="font-medium text-sm sm:text-base truncate">{med.medicationName}</span>
                            <Badge 
                              variant={med.adherenceRate >= 80 ? 'default' : med.adherenceRate >= 50 ? 'secondary' : 'destructive'}
                              className="self-start sm:self-center"
                            >
                              {med.adherenceRate}%
                            </Badge>
                          </div>
                          <Progress 
                            value={med.adherenceRate} 
                            className="h-2"
                          />
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
                            <span>{med.taken} taken</span>
                            <span>{med.skipped} skipped</span>
                            <span>{med.missed} missed</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-xl font-semibold mb-2">No Data Available</h2>
              <p className="text-muted-foreground mb-6">
                Start tracking your medications to see your adherence report.
              </p>
              <Button asChild className="gradient-primary border-0">
                <Link to="/medications/add">Add Medication</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default AdherenceReport;
