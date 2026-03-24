import { motion } from 'framer-motion';
import { SEOHead } from '@/components/seo/SEOHead';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Pill, 
  BookOpen, 
  Heart,
  Brain,
  Activity,
  Stethoscope,
  Baby,
  Users,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { useMedicationSearch } from '@/hooks/useMedicationInfo';
import { useMedications } from '@/hooks/useMedications';
import { useState } from 'react';

const healthTopics = [
  {
    icon: Heart,
    title: 'Heart Health',
    slug: 'heart-health',
    description: 'Blood pressure, cholesterol, and cardiovascular care',
    color: 'text-red-500 bg-red-500/10',
    searchTerms: ['Lisinopril', 'Metoprolol', 'Amlodipine', 'Atorvastatin'],
  },
  {
    icon: Brain,
    title: 'Mental Health',
    slug: 'mental-health',
    description: 'Anxiety, depression, and mental wellness',
    color: 'text-purple-500 bg-purple-500/10',
    searchTerms: ['Sertraline', 'Escitalopram', 'Fluoxetine', 'Alprazolam'],
  },
  {
    icon: Activity,
    title: 'Diabetes Management',
    slug: 'diabetes',
    description: 'Blood sugar control and diabetes care',
    color: 'text-blue-500 bg-blue-500/10',
    searchTerms: ['Metformin', 'Glipizide', 'Insulin', 'Januvia'],
  },
  {
    icon: Stethoscope,
    title: 'Pain Management',
    slug: 'pain-management',
    description: 'Understanding pain medications and alternatives',
    color: 'text-orange-500 bg-orange-500/10',
    searchTerms: ['Ibuprofen', 'Acetaminophen', 'Gabapentin', 'Tramadol'],
  },
  {
    icon: Baby,
    title: 'Pediatric Care',
    slug: 'pediatric',
    description: 'Children\'s health and medication safety',
    color: 'text-pink-500 bg-pink-500/10',
    searchTerms: ['Amoxicillin', 'Tylenol', 'Benadryl', 'Zyrtec'],
  },
  {
    icon: Users,
    title: 'Senior Health',
    slug: 'senior-health',
    description: 'Medication management for older adults',
    color: 'text-teal-500 bg-teal-500/10',
    searchTerms: ['Warfarin', 'Aricept', 'Furosemide', 'Omeprazole'],
  },
];

const KnowledgeBase = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const { medications } = useMedications();
  const { data: searchResults, isLoading: isSearching } = useMedicationSearch(searchQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/medication-info/${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSelectResult = (name: string) => {
    navigate(`/medication-info/${encodeURIComponent(name)}`);
  };

  return (
    <>
      <SEOHead
        title="Knowledge Base — Medication & Health Information"
        description="Browse OneCare's health knowledge base. Learn about medications, drug interactions, dosage information, and health topics."
        canonical="/knowledge"
      />
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-8 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-2xl gradient-primary mx-auto mb-4 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="font-display text-3xl font-bold mb-2">
              Medication Knowledge Base
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Learn about your medications, understand their purpose, and stay informed about potential interactions and side effects.
            </p>
          </div>

          {/* Search Section */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search for a medication (e.g., Metformin, Lisinopril, Aspirin)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 h-14 text-lg"
                />
                {isSearching && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </form>
              
              {/* Search Results Dropdown */}
              {searchResults && searchResults.length > 0 && (
                <div className="mt-2 border rounded-lg divide-y max-h-64 overflow-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.setId}
                      onClick={() => handleSelectResult(result.name.split(' ')[0])}
                      className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <p className="font-medium">{result.name}</p>
                      <p className="text-sm text-muted-foreground">{result.labeler}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Your Medications Quick Access */}
          {medications.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-8"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Pill className="h-5 w-5 text-primary" />
                Learn About Your Medications
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {medications.filter(m => m.is_active).slice(0, 10).map((med) => (
                  <Button
                    key={med.id}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-1 hover:border-primary"
                    onClick={() => navigate(`/medication-info/${encodeURIComponent(med.name)}`)}
                  >
                    <Pill className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium truncate w-full text-center">
                      {med.name}
                    </span>
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Health Topics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-lg font-semibold mb-4">Browse by Health Topic</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {healthTopics.map((topic, index) => (
                <motion.div
                  key={topic.title}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                >
                  <Card 
                    className="h-full hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => navigate(`/knowledge-base/${topic.slug}`)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${topic.color}`}>
                          <topic.icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                            {topic.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            {topic.description}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {topic.searchTerms.map((term) => (
                              <Badge 
                                key={term} 
                                variant="secondary" 
                                className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/medication-info/${encodeURIComponent(term)}`);
                                }}
                              >
                                {term}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Common Medications */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8"
          >
            <h2 className="text-lg font-semibold mb-4">Popular Medications</h2>
            <div className="flex flex-wrap gap-2">
              {[
                'Metformin', 'Lisinopril', 'Atorvastatin', 'Omeprazole', 
                'Amlodipine', 'Metoprolol', 'Losartan', 'Gabapentin',
                'Sertraline', 'Levothyroxine', 'Pantoprazole', 'Escitalopram'
              ].map((med) => (
                <Badge 
                  key={med}
                  variant="outline" 
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors py-2 px-3"
                  onClick={() => navigate(`/medication-info/${encodeURIComponent(med)}`)}
                >
                  {med}
                </Badge>
              ))}
            </div>
          </motion.div>

          {/* Disclaimer */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-8"
          >
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Information provided is sourced from NIH DailyMed and FDA databases. 
                  This is for educational purposes only and should not replace professional medical advice.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};

export default KnowledgeBase;
