import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Inbox, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Loader2,
  ChevronRight,
  User,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { usePatientGuidance } from '@/hooks/usePatientGuidance';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface GuidanceItem {
  id: string;
  title: string;
  instruction: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  due_date: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  clinician_name?: string;
}

const PatientGuidance = () => {
  const { user } = useAuth();
  const { guidance, isLoading, acknowledgeGuidance, completeGuidance } = usePatientGuidance();
  
  const [selectedGuidance, setSelectedGuidance] = useState<GuidanceItem | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  const pendingGuidance = guidance.filter(g => g.status === 'pending');
  const acknowledgedGuidance = guidance.filter(g => g.status === 'acknowledged');
  const completedGuidance = guidance.filter(g => g.status === 'completed');

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'default';
      case 'normal': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'medication': return '💊';
      case 'lifestyle': return '🏃';
      case 'diet': return '🥗';
      case 'followup': return '📅';
      case 'test': return '🔬';
      default: return '📋';
    }
  };

  const handleAcknowledge = async (id: string) => {
    await acknowledgeGuidance.mutateAsync(id);
  };

  const handleComplete = async () => {
    if (!selectedGuidance) return;
    await completeGuidance.mutateAsync({ 
      id: selectedGuidance.id, 
      notes: completionNotes 
    });
    setSelectedGuidance(null);
    setCompletionNotes('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
        <main className="container py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  const renderGuidanceCard = (item: GuidanceItem, showActions: boolean = true) => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-lg border hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{getCategoryIcon(item.category)}</span>
            <h3 className="font-semibold">{item.title}</h3>
            <Badge variant={getPriorityColor(item.priority)} className="text-xs">
              {item.priority}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {item.instruction}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(item.created_at), 'MMM d, yyyy')}
            </span>
            {item.due_date && (
              <span className="flex items-center gap-1 text-orange-600">
                <Clock className="h-3 w-3" />
                Due: {format(new Date(item.due_date), 'MMM d')}
              </span>
            )}
            {item.clinician_name && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Dr. {item.clinician_name}
              </span>
            )}
          </div>
        </div>
        {showActions && (
          <div className="flex flex-col gap-2">
            {item.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAcknowledge(item.id)}
                disabled={acknowledgeGuidance.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Acknowledge
              </Button>
            )}
            {(item.status === 'pending' || item.status === 'acknowledged') && (
              <Button
                size="sm"
                onClick={() => setSelectedGuidance(item)}
              >
                Mark Complete
              </Button>
            )}
          </div>
        )}
      </div>
      {item.acknowledged_at && item.status !== 'completed' && (
        <p className="text-xs text-muted-foreground mt-2">
          Acknowledged on {format(new Date(item.acknowledged_at), 'MMM d, yyyy h:mm a')}
        </p>
      )}
      {item.completed_at && (
        <p className="text-xs text-green-600 mt-2">
          Completed on {format(new Date(item.completed_at), 'MMM d, yyyy h:mm a')}
        </p>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
            Healthcare Instructions
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            View and manage guidance from your healthcare providers
          </p>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-4 mb-6"
        >
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{pendingGuidance.length}</div>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{acknowledgedGuidance.length}</div>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{completedGuidance.length}</div>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Tabs defaultValue="pending" className="space-y-4">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending
                {pendingGuidance.length > 0 && (
                  <Badge variant="destructive" className="ml-1 text-xs">
                    {pendingGuidance.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="in-progress" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                In Progress
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Completed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Instructions</CardTitle>
                  <CardDescription>
                    New guidance from your healthcare providers that needs your attention
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingGuidance.length === 0 ? (
                    <div className="text-center py-8">
                      <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">All caught up!</h3>
                      <p className="text-sm text-muted-foreground">
                        No pending instructions from your healthcare providers.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingGuidance.map(item => renderGuidanceCard(item))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="in-progress">
              <Card>
                <CardHeader>
                  <CardTitle>In Progress</CardTitle>
                  <CardDescription>
                    Instructions you've acknowledged and are working on
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {acknowledgedGuidance.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No in-progress items</h3>
                      <p className="text-sm text-muted-foreground">
                        Acknowledge pending instructions to track them here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {acknowledgedGuidance.map(item => renderGuidanceCard(item))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="completed">
              <Card>
                <CardHeader>
                  <CardTitle>Completed</CardTitle>
                  <CardDescription>
                    Instructions you've finished
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {completedGuidance.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No completed items yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Completed instructions will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {completedGuidance.map(item => renderGuidanceCard(item, false))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>

      {/* Completion Dialog */}
      <Dialog open={!!selectedGuidance} onOpenChange={() => setSelectedGuidance(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Instruction</DialogTitle>
            <DialogDescription>
              Mark "{selectedGuidance?.title}" as complete. You can optionally add notes about what you did.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Instruction:</p>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                {selectedGuidance?.instruction}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Completion Notes (optional):</p>
              <Textarea
                placeholder="Add any notes about how you completed this instruction..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedGuidance(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleComplete}
              disabled={completeGuidance.isPending}
            >
              {completeGuidance.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientGuidance;
