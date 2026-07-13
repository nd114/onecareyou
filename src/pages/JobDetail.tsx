import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Briefcase, 
  CheckCircle,
  Upload,
  Loader2
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getJobById, getIconComponent } from '@/lib/job-listings';
import { SEOHead } from '@/components/seo/SEOHead';
import { jobPostingSchema, breadcrumbSchema } from '@/components/seo/structuredData';


const JobDetail = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const job = jobId ? getJobById(jobId) : undefined;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    portfolioUrl: '',
    coverLetter: '',
    yearsExperience: '',
    howHeard: ''
  });

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col">
        <SEOHead title="Position Not Found" description="This job posting is no longer available." noIndex />

        <Header />
        <main className="flex-1 container px-4 py-16">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Position Not Found</h1>
            <p className="text-muted-foreground mb-8">The job you're looking for doesn't exist or has been removed.</p>
            <Button asChild>
              <Link to="/careers">View All Positions</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const IconComponent = getIconComponent(job.iconName);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a PDF or Word document.',
          variant: 'destructive'
        });
        return;
      }
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please upload a file smaller than 5MB.',
          variant: 'destructive'
        });
        return;
      }
      setResumeFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.email) {
      toast({
        title: 'Required fields missing',
        description: 'Please fill in your name and email.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let resumePath = null;

      // Upload resume if provided
      if (resumeFile) {
        const fileExt = resumeFile.name.split('.').pop();
        const fileName = `${Date.now()}-${formData.fullName.replace(/\s+/g, '-').toLowerCase()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(fileName, resumeFile);

        if (uploadError) {
          throw new Error('Failed to upload resume');
        }
        resumePath = fileName;
      }

      // Insert application into database
      const { error: insertError } = await supabase
        .from('job_applications')
        .insert({
          job_id: job.id,
          job_title: job.title,
          full_name: formData.fullName,
          email: formData.email,
          phone: formData.phone || null,
          linkedin_url: formData.linkedinUrl || null,
          portfolio_url: formData.portfolioUrl || null,
          resume_path: resumePath,
          cover_letter: formData.coverLetter || null,
          years_experience: formData.yearsExperience || null,
          how_heard: formData.howHeard || null
        });

      if (insertError) {
        throw insertError;
      }

      // Send notification email via edge function
      try {
        await supabase.functions.invoke('notify-job-application', {
          body: {
            jobTitle: job.title,
            applicantName: formData.fullName,
            applicantEmail: formData.email
          }
        });
      } catch (emailError) {
        // Don't fail the application if email fails
        console.error('Email notification failed:', emailError);
      }

      toast({
        title: 'Application submitted!',
        description: 'Thank you for your interest. We\'ll review your application and get back to you soon.'
      });

      navigate('/careers?applied=true');
    } catch (error) {
      console.error('Application error:', error);
      toast({
        title: 'Submission failed',
        description: 'There was an error submitting your application. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Header Section */}
        <section className="py-12 md:py-16 gradient-hero">
          <div className="container px-4">
            <Link 
              to="/careers" 
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to All Positions
            </Link>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col md:flex-row md:items-start gap-6"
            >
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <IconComponent className="h-8 w-8" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h1 className="text-3xl md:text-4xl font-bold">{job.title}</h1>
                  <Badge 
                    variant={job.type === 'paid' ? 'default' : 'outline'}
                    className={job.type === 'paid' ? 'bg-green-600 hover:bg-green-700' : ''}
                  >
                    {job.type === 'paid' ? 'Paid' : 'Unpaid Advisory'}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    {job.category}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {job.commitment}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 md:py-16">
          <div className="container px-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Job Details */}
              <div className="lg:col-span-2 space-y-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h2 className="text-xl font-semibold mb-4">About This Role</h2>
                  <p className="text-muted-foreground whitespace-pre-line">{job.fullDescription}</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="text-xl font-semibold mb-4">Responsibilities</h2>
                  <ul className="space-y-3">
                    {job.responsibilities.map((item, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h2 className="text-xl font-semibold mb-4">Qualifications</h2>
                  <ul className="space-y-3">
                    {job.qualifications.map((item, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>

                {job.niceToHave && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <h2 className="text-xl font-semibold mb-4">Nice to Have</h2>
                    <ul className="space-y-3">
                      {job.niceToHave.map((item, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <CheckCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </div>

              {/* Application Form */}
              <div className="lg:col-span-1">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="sticky top-24">
                    <CardHeader>
                      <CardTitle>Apply Now</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="fullName">Full Name *</Label>
                          <Input
                            id="fullName"
                            name="fullName"
                            value={formData.fullName}
                            onChange={handleInputChange}
                            placeholder="John Doe"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            placeholder="john@example.com"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone</Label>
                          <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={handleInputChange}
                            placeholder="+1 (555) 123-4567"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                          <Input
                            id="linkedinUrl"
                            name="linkedinUrl"
                            type="url"
                            value={formData.linkedinUrl}
                            onChange={handleInputChange}
                            placeholder="https://linkedin.com/in/yourprofile"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="portfolioUrl">Portfolio / Website</Label>
                          <Input
                            id="portfolioUrl"
                            name="portfolioUrl"
                            type="url"
                            value={formData.portfolioUrl}
                            onChange={handleInputChange}
                            placeholder="https://yourwebsite.com"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="resume">Resume (PDF or Word)</Label>
                          <div className="relative">
                            <Input
                              id="resume"
                              type="file"
                              accept=".pdf,.doc,.docx"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => document.getElementById('resume')?.click()}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {resumeFile ? resumeFile.name : 'Upload Resume'}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="yearsExperience">Years of Experience</Label>
                          <Select
                            value={formData.yearsExperience}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, yearsExperience: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select experience level" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0-1">0-1 years</SelectItem>
                              <SelectItem value="1-3">1-3 years</SelectItem>
                              <SelectItem value="3-5">3-5 years</SelectItem>
                              <SelectItem value="5-10">5-10 years</SelectItem>
                              <SelectItem value="10+">10+ years</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="howHeard">How did you hear about us?</Label>
                          <Select
                            value={formData.howHeard}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, howHeard: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select an option" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="linkedin">LinkedIn</SelectItem>
                              <SelectItem value="twitter">Twitter/X</SelectItem>
                              <SelectItem value="referral">Referral</SelectItem>
                              <SelectItem value="google">Google Search</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="coverLetter">Cover Letter / Message</Label>
                          <Textarea
                            id="coverLetter"
                            name="coverLetter"
                            value={formData.coverLetter}
                            onChange={handleInputChange}
                            placeholder="Tell us why you're interested in this role and what makes you a great fit..."
                            rows={4}
                          />
                        </div>

                        <Button 
                          type="submit" 
                          className="w-full" 
                          size="lg"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            'Submit Application'
                          )}
                        </Button>

                        <p className="text-xs text-muted-foreground text-center">
                          By submitting, you agree to our{' '}
                          <Link to="/privacy" className="underline hover:text-foreground">
                            Privacy Policy
                          </Link>
                        </p>
                      </form>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default JobDetail;
