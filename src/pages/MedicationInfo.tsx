import { motion } from 'framer-motion';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Pill, 
  AlertTriangle, 
  Info, 
  BookOpen,
  Stethoscope,
  Baby,
  Users,
  ShieldAlert,
  Beaker,
  ExternalLink,
  Loader2,
  Search,
  Building2,
  MapPin
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/layout/Header';
import { useMedicationInfo } from '@/hooks/useMedicationInfo';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDrugText, formatDosageText } from '@/lib/format-drug-text';
import { Separator } from '@/components/ui/separator';

const MedicationInfo = () => {
  const { drugName } = useParams<{ drugName: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState(drugName || '');
  const { data: drugInfo, isLoading, error } = useMedicationInfo(drugName || null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/medication-info/${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      
      <main className="container py-8 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button variant="ghost" asChild className="mb-6">
            <Link to="/knowledge-base">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Knowledge Base
            </Link>
          </Button>

          {/* Search Bar */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for a medication..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button type="submit" className="gradient-primary border-0">
                  Search
                </Button>
              </form>
            </CardContent>
          </Card>

          {isLoading && (
            <Card>
              <CardContent className="p-12 text-center">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-muted-foreground">Loading medication information...</p>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="border-destructive/30">
              <CardContent className="p-8 text-center">
                <AlertTriangle className="h-10 w-10 mx-auto mb-4 text-destructive" />
                <h2 className="text-xl font-semibold mb-2">Error Loading Information</h2>
                <p className="text-muted-foreground mb-4">
                  We couldn't load information for this medication. Please try again or search for a different medication.
                </p>
                <Button variant="outline" onClick={() => navigate('/knowledge-base')}>
                  Return to Knowledge Base
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && !drugInfo && drugName && (
            <Card>
              <CardContent className="p-8 text-center">
                <Pill className="h-10 w-10 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h2 className="text-xl font-semibold mb-2">Medication Not Found</h2>
                <p className="text-muted-foreground mb-4">
                  We couldn't find information for "{drugName}". Try searching with a different name or spelling.
                </p>
              </CardContent>
            </Card>
          )}

          {drugInfo && (
            <div className="space-y-6">
              {/* Manufacturer Disclaimer */}
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <Building2 className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> This medication may be manufactured by multiple companies under different brand names. 
                  The information shown is from one FDA-registered label and may not match your specific product. 
                  Always refer to the label on your medication packaging.
                </AlertDescription>
              </Alert>

              {/* Header Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 rounded-xl gradient-primary flex items-center justify-center shrink-0">
                      <Pill className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-2xl">{drugInfo.name}</CardTitle>
                      {drugInfo.genericName && drugInfo.genericName !== drugInfo.name && (
                        <CardDescription className="text-base mt-1">
                          Generic Name: <span className="font-medium text-foreground">{drugInfo.genericName}</span>
                        </CardDescription>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {drugInfo.dosageForm && (
                          <Badge variant="secondary">{drugInfo.dosageForm}</Badge>
                        )}
                        {drugInfo.route?.map((r) => (
                          <Badge key={r} variant="outline">{r}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {drugInfo.manufacturerName && (
                  <CardContent className="pt-0">
                    <Separator className="mb-4" />
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Label Source</p>
                        <p>{drugInfo.manufacturerName}</p>
                        <p className="text-xs mt-1 italic">
                          This is one of potentially many manufacturers of this medication.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Active Ingredients */}
              {drugInfo.activeIngredients && drugInfo.activeIngredients.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Beaker className="h-5 w-5 text-primary" />
                      Active Ingredients
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {drugInfo.activeIngredients.map((ingredient) => (
                        <Badge key={ingredient} variant="outline">
                          {ingredient}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Main Information Accordion */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Drug Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full" defaultValue={['indications']}>
                    {drugInfo.indications && (
                      <AccordionItem value="indications">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-primary" />
                            What is this medication for?
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-line text-muted-foreground leading-relaxed">
                              {formatDrugText(drugInfo.indications)}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {drugInfo.dosageAndAdministration && (
                      <AccordionItem value="dosage">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-primary" />
                            How to take this medication
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-line text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-lg">
                              {formatDosageText(drugInfo.dosageAndAdministration)}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {drugInfo.warnings && (
                      <AccordionItem value="warnings">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-4 w-4" />
                            Warnings & Precautions
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-line text-muted-foreground leading-relaxed bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                              {formatDrugText(drugInfo.warnings)}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {drugInfo.adverseReactions && (
                      <AccordionItem value="sideEffects">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-primary" />
                            Possible Side Effects
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-line text-muted-foreground leading-relaxed">
                              {formatDrugText(drugInfo.adverseReactions)}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {drugInfo.contraindications && (
                      <AccordionItem value="contraindications">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-4 w-4" />
                            Contraindications (Do Not Use If)
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-line text-muted-foreground leading-relaxed bg-destructive/5 p-4 rounded-lg border border-destructive/20">
                              {formatDrugText(drugInfo.contraindications)}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {drugInfo.drugInteractions && (
                      <AccordionItem value="interactions">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <Pill className="h-4 w-4 text-primary" />
                            Drug Interactions
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-line text-muted-foreground leading-relaxed">
                              {formatDrugText(drugInfo.drugInteractions)}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {drugInfo.pregnancyInfo && (
                      <AccordionItem value="pregnancy">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <Baby className="h-4 w-4 text-primary" />
                            Pregnancy & Nursing
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-line text-muted-foreground leading-relaxed">
                              {formatDrugText(drugInfo.pregnancyInfo)}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {(drugInfo.pediatricUse || drugInfo.geriatricUse) && (
                      <AccordionItem value="special">
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            Special Populations
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                          {drugInfo.pediatricUse && (
                            <div className="bg-muted/30 p-4 rounded-lg">
                              <p className="font-medium mb-2 flex items-center gap-2">
                                <Baby className="h-4 w-4" />
                                Pediatric Use (Children)
                              </p>
                              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                                {formatDrugText(drugInfo.pediatricUse)}
                              </p>
                            </div>
                          )}
                          {drugInfo.geriatricUse && (
                            <div className="bg-muted/30 p-4 rounded-lg">
                              <p className="font-medium mb-2 flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Geriatric Use (Older Adults)
                              </p>
                              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                                {formatDrugText(drugInfo.geriatricUse)}
                              </p>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    )}
                  </Accordion>
                </CardContent>
              </Card>

              {/* External Links */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="outline" asChild className="flex-1">
                      <a 
                        href={`https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(drugInfo.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on DailyMed
                      </a>
                    </Button>
                    <Button variant="outline" asChild className="flex-1">
                      <a 
                        href={`https://www.drugs.com/search.php?searchterm=${encodeURIComponent(drugInfo.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on Drugs.com
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Disclaimer */}
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    This information is for educational purposes only and is not a substitute for professional medical advice. 
                    Always consult your healthcare provider before making decisions about your medications.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default MedicationInfo;
