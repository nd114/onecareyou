import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Search, 
  SortAsc, 
  SortDesc, 
  Filter,
  Pill,
  Heart,
  Brain,
  Activity,
  Stethoscope,
  Baby,
  Users,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { useMedicationSearch } from '@/hooks/useMedicationInfo';

// Health topic configurations
const healthTopics: Record<string, {
  title: string;
  description: string;
  icon: typeof Heart;
  color: string;
  bgColor: string;
  medications: string[];
  relatedConditions: string[];
}> = {
  'heart-health': {
    title: 'Heart Health',
    description: 'Blood pressure, cholesterol, and cardiovascular care medications',
    icon: Heart,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    medications: [
      'Lisinopril', 'Metoprolol', 'Amlodipine', 'Atorvastatin', 
      'Losartan', 'Carvedilol', 'Diltiazem', 'Valsartan',
      'Simvastatin', 'Pravastatin', 'Rosuvastatin', 'Warfarin',
      'Clopidogrel', 'Aspirin', 'Digoxin', 'Furosemide'
    ],
    relatedConditions: ['Hypertension', 'High Cholesterol', 'Heart Failure', 'Arrhythmia', 'Coronary Artery Disease'],
  },
  'mental-health': {
    title: 'Mental Health',
    description: 'Anxiety, depression, and mental wellness medications',
    icon: Brain,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    medications: [
      'Sertraline', 'Escitalopram', 'Fluoxetine', 'Alprazolam',
      'Venlafaxine', 'Duloxetine', 'Bupropion', 'Trazodone',
      'Buspirone', 'Lorazepam', 'Clonazepam', 'Citalopram',
      'Paroxetine', 'Mirtazapine', 'Aripiprazole', 'Quetiapine'
    ],
    relatedConditions: ['Depression', 'Anxiety', 'PTSD', 'Bipolar Disorder', 'Insomnia'],
  },
  'diabetes': {
    title: 'Diabetes Management',
    description: 'Blood sugar control and diabetes care medications',
    icon: Activity,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    medications: [
      'Metformin', 'Glipizide', 'Insulin', 'Januvia',
      'Jardiance', 'Ozempic', 'Trulicity', 'Farxiga',
      'Glimepiride', 'Pioglitazone', 'Invokana', 'Victoza',
      'Lantus', 'Humalog', 'Novolog', 'Levemir'
    ],
    relatedConditions: ['Type 1 Diabetes', 'Type 2 Diabetes', 'Prediabetes', 'Insulin Resistance'],
  },
  'pain-management': {
    title: 'Pain Management',
    description: 'Understanding pain medications and alternatives',
    icon: Stethoscope,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    medications: [
      'Ibuprofen', 'Acetaminophen', 'Gabapentin', 'Tramadol',
      'Naproxen', 'Meloxicam', 'Celecoxib', 'Pregabalin',
      'Duloxetine', 'Cyclobenzaprine', 'Baclofen', 'Diclofenac',
      'Lidocaine', 'Capsaicin', 'Topiramate', 'Amitriptyline'
    ],
    relatedConditions: ['Chronic Pain', 'Arthritis', 'Neuropathy', 'Fibromyalgia', 'Migraine'],
  },
  'pediatric': {
    title: 'Pediatric Care',
    description: "Children's health and medication safety",
    icon: Baby,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    medications: [
      'Amoxicillin', 'Tylenol', 'Benadryl', 'Zyrtec',
      'Ibuprofen', 'Azithromycin', 'Cetirizine', 'Loratadine',
      'Albuterol', 'Montelukast', 'Fluticasone', 'Prednisolone',
      'Augmentin', 'Cefdinir', 'Omeprazole', 'Polyethylene Glycol'
    ],
    relatedConditions: ['Ear Infections', 'Allergies', 'Asthma', 'ADHD', 'Common Cold'],
  },
  'senior-health': {
    title: 'Senior Health',
    description: 'Medication management for older adults',
    icon: Users,
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    medications: [
      'Warfarin', 'Aricept', 'Furosemide', 'Omeprazole',
      'Metoprolol', 'Lisinopril', 'Levothyroxine', 'Amlodipine',
      'Gabapentin', 'Pantoprazole', 'Memantine', 'Tamsulosin',
      'Finasteride', 'Calcium', 'Vitamin D', 'B12'
    ],
    relatedConditions: ['Dementia', 'Osteoporosis', 'Heart Disease', 'Arthritis', 'Vision/Hearing Loss'],
  },
};

type SortOption = 'name-asc' | 'name-desc';

const KnowledgeBaseTopic = () => {
  const { topicSlug } = useParams<{ topicSlug: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');

  const topic = topicSlug ? healthTopics[topicSlug] : null;

  // Filter and sort medications
  const filteredMedications = useMemo(() => {
    if (!topic) return [];
    
    let meds = [...topic.medications];
    
    // Filter by search
    if (searchQuery) {
      meds = meds.filter(med => 
        med.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Sort
    meds.sort((a, b) => {
      if (sortBy === 'name-asc') return a.localeCompare(b);
      if (sortBy === 'name-desc') return b.localeCompare(a);
      return 0;
    });
    
    return meds;
  }, [topic, searchQuery, sortBy]);

  if (!topic) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Header />
      <SectionTabs section="learn" variant="patient" />
        <main className="container py-8 max-w-5xl">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-2">Topic Not Found</h1>
            <p className="text-muted-foreground mb-4">
              The health topic you're looking for doesn't exist.
            </p>
            <Button asChild>
              <Link to="/knowledge-base">Back to Knowledge Base</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const TopicIcon = topic.icon;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-8 max-w-5xl">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => navigate('/knowledge-base')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Knowledge Base
        </Button>

        {/* Topic Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Card className="overflow-hidden">
            <div className={`${topic.bgColor} p-6`}>
              <div className="flex items-center gap-4">
                <div className={`h-16 w-16 rounded-2xl bg-background flex items-center justify-center ${topic.color}`}>
                  <TopicIcon className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold">
                    {topic.title}
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    {topic.description}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Related Conditions */}
            <CardContent className="p-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">Related Conditions:</p>
              <div className="flex flex-wrap gap-2">
                {topic.relatedConditions.map((condition) => (
                  <Badge key={condition} variant="outline">
                    {condition}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Filters and Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search medications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                {/* Sort */}
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <div className="flex items-center gap-2">
                      {sortBy === 'name-asc' ? (
                        <SortAsc className="h-4 w-4" />
                      ) : (
                        <SortDesc className="h-4 w-4" />
                      )}
                      <SelectValue placeholder="Sort by" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Medications Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Medications ({filteredMedications.length})
            </h2>
          </div>

          {filteredMedications.length === 0 ? (
            <Card className="p-8 text-center">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No medications found matching "{searchQuery}"
              </p>
              <Button
                variant="link"
                onClick={() => setSearchQuery('')}
                className="mt-2"
              >
                Clear search
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredMedications.map((med, index) => (
                <motion.div
                  key={med}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 * Math.min(index, 10) }}
                >
                  <Card
                    className="hover:shadow-md transition-all cursor-pointer group hover:border-primary"
                    onClick={() => navigate(`/medication-info/${encodeURIComponent(med)}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg ${topic.bgColor} flex items-center justify-center`}>
                            <Pill className={`h-5 w-5 ${topic.color}`} />
                          </div>
                          <div>
                            <h3 className="font-medium group-hover:text-primary transition-colors">
                              {med}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              Tap to learn more
                            </p>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Information provided is for educational purposes only. 
                Always consult your healthcare provider before starting, stopping, or changing any medication.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default KnowledgeBaseTopic;
