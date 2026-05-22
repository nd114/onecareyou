import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Plus, 
  Heart, 
  Pill, 
  Activity, 
  Calendar,
  Settings,
  ChevronRight,
  Lock,
  Crown,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useFamilyMembers, FamilyMember } from '@/hooks/useFamilyMembers';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { AddFamilyMemberDialog } from '@/components/family/AddFamilyMemberDialog';

const FamilyDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { familyMembers, isLoading, canAddMore, maxMembers } = useFamilyMembers();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const subscriptionTier = (profile?.subscription_tier || 'free') as string;
  const hasFamilyAccess = subscriptionTier === 'family' || subscriptionTier === 'premium';
  const calculateAge = (dob: string | null): string => {
    if (!dob) return 'Age not set';
    const age = differenceInYears(new Date(), new Date(dob));
    return `${age} years old`;
  };

  const getRelationshipLabel = (rel: string | null): string => {
    if (!rel) return 'Family Member';
    return rel.charAt(0).toUpperCase() + rel.slice(1);
  };

  if (!hasFamilyAccess) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
      <SectionTabs section="team\" variant="patient" />
        <main className="container py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto text-center"
          >
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Lock className="h-10 w-10 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold mb-4">
              Family Dashboard
            </h1>
            <p className="text-muted-foreground mb-8">
              Manage health profiles for up to {maxMembers} family members, track their medications, 
              vitals, and schedules all in one place.
            </p>
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Crown className="h-6 w-6 text-primary" />
                  <span className="font-semibold text-lg">Upgrade to Family Plan</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Get access to the Family Dashboard and manage up to {maxMembers} family member profiles.
                </p>
                <Button 
                  className="w-full gradient-primary border-0"
                  onClick={() => navigate('/pricing')}
                >
                  View Pricing Plans
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-4 sm:py-8 px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8"
        >
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">
              Family Dashboard
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage health profiles for your family members
            </p>
          </div>
          <Button 
            className="gradient-primary border-0 w-full sm:w-auto"
            onClick={() => setIsAddDialogOpen(true)}
            disabled={!canAddMore}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Family Member
          </Button>
        </motion.div>

        {/* Member Count */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Badge variant="secondary" className="text-sm">
            <Users className="h-3 w-3 mr-1" />
            {familyMembers.length} / {maxMembers} family members
          </Badge>
        </motion.div>

        {/* Family Members Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : familyMembers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="text-center py-12">
              <CardContent>
                <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No family members yet</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Add your family members to manage their health information, 
                  track medications, and monitor their vitals.
                </p>
                <Button 
                  className="gradient-primary border-0"
                  onClick={() => setIsAddDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Family Member
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {familyMembers.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (index + 1) }}
              >
                <Card className="hover:shadow-lg transition-shadow cursor-pointer group"
                      onClick={() => navigate(`/family/${member.id}`)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                          style={{ backgroundColor: member.avatar_color }}
                        >
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{member.name}</CardTitle>
                          <CardDescription>
                            {getRelationshipLabel(member.relationship)}
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        {calculateAge(member.date_of_birth)}
                        {member.gender && ` • ${member.gender}`}
                      </div>
                      
                      {/* Quick Stats */}
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                          <Pill className="h-4 w-4 text-primary mb-1" />
                          <span className="text-xs text-muted-foreground">Meds</span>
                        </div>
                        <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                          <Activity className="h-4 w-4 text-primary mb-1" />
                          <span className="text-xs text-muted-foreground">Vitals</span>
                        </div>
                        <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                          <Calendar className="h-4 w-4 text-primary mb-1" />
                          <span className="text-xs text-muted-foreground">Schedule</span>
                        </div>
                      </div>
                      
                      {/* Health Conditions */}
                      {member.health_conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-2">
                          {member.health_conditions.slice(0, 3).map((condition, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {condition}
                            </Badge>
                          ))}
                          {member.health_conditions.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{member.health_conditions.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                Family Health Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                {[
                  { 
                    icon: Pill, 
                    title: 'Track Medications', 
                    desc: 'Manage medications for each family member separately' 
                  },
                  { 
                    icon: Activity, 
                    title: 'Monitor Vitals', 
                    desc: 'Keep track of blood pressure, glucose, and more' 
                  },
                  { 
                    icon: Calendar, 
                    title: 'Schedule Doses', 
                    desc: 'Set reminders and track adherence for everyone' 
                  },
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <AddFamilyMemberDialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen} 
      />
    </div>
  );
};

export default FamilyDashboard;
