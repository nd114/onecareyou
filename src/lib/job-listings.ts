import { 
  TrendingUp, 
  Megaphone, 
  Stethoscope, 
  Users 
} from 'lucide-react';

export interface JobListing {
  id: string;
  title: string;
  category: string;
  type: 'paid' | 'unpaid';
  commitment: string;
  location: string;
  description: string;
  fullDescription: string;
  responsibilities: string[];
  qualifications: string[];
  niceToHave?: string[];
  iconName: 'TrendingUp' | 'Megaphone' | 'Stethoscope' | 'Users';
}

export const jobListings: JobListing[] = [
  {
    id: 'sdr',
    title: 'Sales Development Representative',
    category: 'Sales',
    type: 'paid',
    commitment: 'Part-time / Contract',
    location: 'Remote',
    description: 'Drive clinic outreach, schedule demos, and help healthcare providers discover how Marpe can transform patient care coordination.',
    fullDescription: `We're looking for a driven Sales Development Representative to help healthcare providers discover how Marpe can transform their patient care coordination. You'll be the first point of contact for clinics and practices, scheduling demos and building relationships that lead to lasting partnerships.

This is a fantastic opportunity for someone who wants to make a real impact in healthcare technology while building valuable B2B sales experience.`,
    responsibilities: [
      'Conduct outbound outreach to clinics, practices, and healthcare organizations',
      'Research and identify potential healthcare provider prospects',
      'Schedule product demos and discovery calls with qualified leads',
      'Maintain accurate records of all sales activities in our CRM',
      'Collaborate with the team to refine messaging and outreach strategies',
      'Follow up with inbound leads and inquiries promptly',
      'Meet or exceed monthly quota for qualified meetings scheduled'
    ],
    qualifications: [
      '1+ years of sales, customer service, or outreach experience',
      'Excellent written and verbal communication skills',
      'Self-motivated with ability to work independently',
      'Comfortable with cold outreach (email, phone, LinkedIn)',
      'Organized and detail-oriented with strong follow-through',
      'Interest in healthcare, healthtech, or SaaS'
    ],
    niceToHave: [
      'Experience selling to healthcare providers or in healthcare industry',
      'Previous startup or early-stage company experience',
      'Familiarity with CRM tools (HubSpot, Salesforce, etc.)'
    ],
    iconName: 'TrendingUp'
  },
  {
    id: 'content',
    title: 'Healthcare Content Specialist',
    category: 'Marketing',
    type: 'paid',
    commitment: 'Contract',
    location: 'Remote',
    description: 'Create compelling patient education content, case studies, and thought leadership pieces for healthcare professionals.',
    fullDescription: `We're seeking a talented Healthcare Content Specialist to create compelling content that educates both patients and healthcare professionals about medication management and remote patient monitoring.

You'll help shape how we communicate the value of Marpe through patient education materials, case studies, blog posts, and thought leadership content that builds trust and credibility in the healthcare space.`,
    responsibilities: [
      'Write patient education content on medication adherence and health management',
      'Create case studies showcasing successful clinic partnerships',
      'Develop thought leadership articles for healthcare professionals',
      'Write blog posts, newsletters, and social media content',
      'Collaborate with clinical advisors to ensure medical accuracy',
      'Research healthcare trends and competitor content strategies',
      'Optimize content for SEO and healthcare-specific keywords'
    ],
    qualifications: [
      '2+ years of content writing or healthcare marketing experience',
      'Strong understanding of healthcare terminology and concepts',
      'Excellent research and fact-checking skills',
      'Portfolio demonstrating health/medical content writing',
      'Ability to translate complex medical concepts for general audiences',
      'Experience with SEO and content optimization'
    ],
    niceToHave: [
      'Background in healthcare, nursing, or public health',
      'Experience writing for B2B healthcare technology companies',
      'Knowledge of HIPAA and healthcare compliance in marketing'
    ],
    iconName: 'Megaphone'
  },
  {
    id: 'clinical-advisor',
    title: 'Clinical Advisory Board',
    category: 'Advisory',
    type: 'unpaid',
    commitment: 'Flexible',
    location: 'Remote',
    description: 'Physicians and nurses who want to shape the future of remote patient monitoring. Validate features, provide credibility, and help us build what healthcare really needs.',
    fullDescription: `We're building a Clinical Advisory Board of practicing physicians, nurses, and healthcare professionals who want to shape the future of remote patient monitoring and medication management.

As an advisor, you'll provide invaluable clinical perspective to ensure Marpe solves real problems in healthcare. This is an unpaid advisory role, but we offer equity options for ongoing contributors and the opportunity to influence a platform that will impact thousands of patients.`,
    responsibilities: [
      'Participate in monthly advisory calls (1-2 hours/month)',
      'Review and validate new features from a clinical perspective',
      'Provide feedback on clinical workflows and usability',
      'Share insights on healthcare industry trends and needs',
      'Help identify potential clinic partnerships',
      'Contribute to thought leadership content when interested',
      'Serve as a reference for enterprise sales conversations'
    ],
    qualifications: [
      'Active medical license (MD, DO, NP, RN, PA)',
      'Currently practicing in primary care, chronic disease management, or related specialty',
      'Passionate about improving patient outcomes through technology',
      'Experience with remote patient monitoring or digital health tools is a plus',
      'Strong opinions about what healthcare technology should do differently'
    ],
    iconName: 'Stethoscope'
  },
  {
    id: 'product-panel',
    title: 'Product Feedback Panel',
    category: 'Advisory',
    type: 'unpaid',
    commitment: 'Flexible',
    location: 'Remote',
    description: 'Clinicians who want early access to new features and the opportunity to influence product direction through regular feedback sessions.',
    fullDescription: `Join our Product Feedback Panel and get early access to new features before they're released. We're looking for clinicians, practice managers, and healthcare administrators who want to influence how Marpe evolves.

As a panel member, you'll participate in user testing sessions, provide feedback on new features, and help us prioritize what to build next. This is an unpaid role, but you'll get priority access to new features and direct input into our product roadmap.`,
    responsibilities: [
      'Participate in monthly user testing sessions (30-60 minutes)',
      'Try new features and provide structured feedback',
      'Complete quarterly surveys on product direction',
      'Share insights on your practice\'s technology needs',
      'Optionally join focus groups for major feature releases'
    ],
    qualifications: [
      'Work in a healthcare setting (clinic, hospital, practice)',
      'Regularly use healthcare technology or EHR systems',
      'Willing to commit 1-2 hours per month for feedback sessions',
      'Articulate and thoughtful about user experience',
      'Interest in improving healthcare technology'
    ],
    iconName: 'Users'
  }
];

export const getJobById = (id: string): JobListing | undefined => {
  return jobListings.find(job => job.id === id);
};

export const getIconComponent = (iconName: JobListing['iconName']) => {
  const icons = {
    TrendingUp,
    Megaphone,
    Stethoscope,
    Users
  };
  return icons[iconName];
};
