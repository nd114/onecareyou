import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  Heart, 
  DollarSign, 
  Users, 
  Mail, 
  HelpCircle, 
  Shield, 
  FileText, 
  UserPlus, 
  LogIn,
  Stethoscope,
  Building2,
  ExternalLink
} from "lucide-react";
import { BRAND } from "@/lib/brand-constants";

interface SitemapLink {
  title: string;
  path: string;
  description?: string;
}

interface SitemapSection {
  title: string;
  icon: React.ReactNode;
  links: SitemapLink[];
}

const sitemapData: SitemapSection[] = [
  {
    title: "Main Pages",
    icon: <Home className="h-5 w-5" />,
    links: [
      { title: "Home", path: "/", description: "Welcome to Marpe" },
      { title: "Features", path: "/features", description: "Explore all features" },
      { title: "Pricing", path: "/pricing", description: "Plans and pricing" },
      { title: "About", path: "/about", description: "Learn about us" },
      { title: "Contact", path: "/contact", description: "Get in touch" },
    ],
  },
  {
    title: "For Clinicians",
    icon: <Stethoscope className="h-5 w-5" />,
    links: [
      { title: "Clinician Pricing", path: "/clinician/pricing", description: "Healthcare provider plans" },
      { title: "Why Marpe", path: "/clinician/why-marpe", description: "Benefits for clinicians" },
      { title: "Clinician Sign Up", path: "/clinician/sign-up", description: "Create a clinician account" },
    ],
  },
  {
    title: "Support",
    icon: <HelpCircle className="h-5 w-5" />,
    links: [
      { title: "Help Center", path: "/help", description: "FAQs and guides" },
    ],
  },
  {
    title: "Account",
    icon: <UserPlus className="h-5 w-5" />,
    links: [
      { title: "Sign In", path: "/sign-in", description: "Access your account" },
      { title: "Sign Up", path: "/sign-up", description: "Create a new account" },
    ],
  },
  {
    title: "Legal",
    icon: <Shield className="h-5 w-5" />,
    links: [
      { title: "Privacy Policy", path: "/privacy", description: "How we protect your data" },
      { title: "Terms of Service", path: "/terms", description: "Usage terms and conditions" },
      { title: "Medical Disclaimer", path: "/disclaimer", description: "Important health information" },
      { title: "Data Processing", path: "/data-processing", description: "GDPR and data handling" },
    ],
  },
];

export default function Sitemap() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="gradient-hero py-16 md:py-24">
          <div className="container text-center">
            <Badge variant="secondary" className="mb-4">
              <FileText className="h-3 w-3 mr-1" />
              Site Navigation
            </Badge>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
              Sitemap
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Find your way around {BRAND.name}. All public pages organized for easy navigation.
            </p>
          </div>
        </section>

        {/* Sitemap Grid */}
        <section className="container py-12 md:py-16">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sitemapData.map((section) => (
              <Card key={section.title} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="p-2 rounded-lg bg-primary/10 text-primary">
                      {section.icon}
                    </span>
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {section.links.map((link) => (
                      <li key={link.path}>
                        <Link
                          to={link.path}
                          className="group flex items-start gap-2 text-sm hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-4 w-4 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          <div>
                            <span className="font-medium">{link.title}</span>
                            {link.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {link.description}
                              </p>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
        </div>
      </section>
      </main>

      <Footer />
    </div>
  );
}
