import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Pill,
  Calendar,
  Heart,
  Users,
  Settings,
  CreditCard,
  Shield,
  HelpCircle,
  MessageSquare,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const categories = [
  {
    icon: Pill,
    title: "Medications",
    description: "Adding, editing, and managing medications",
    articles: 5,
    href: "#medications",
  },
  {
    icon: Calendar,
    title: "Scheduling",
    description: "Reminders, notifications, and schedules",
    articles: 4,
    href: "#scheduling",
  },
  {
    icon: Heart,
    title: "Health Tracking",
    description: "Vitals, lab reports, and health profile",
    articles: 6,
    href: "#health",
  },
  {
    icon: Users,
    title: "Care Circle",
    description: "Sharing with providers and caregivers",
    articles: 3,
    href: "#care-circle",
  },
  {
    icon: Settings,
    title: "Account & Settings",
    description: "Profile, preferences, and privacy",
    articles: 4,
    href: "#account",
  },
  {
    icon: CreditCard,
    title: "Billing & Plans",
    description: "Subscriptions, payments, and upgrades",
    articles: 5,
    href: "#billing",
  },
];

const popularQuestions = [
  {
    question: "How do I add a new medication?",
    answer:
      'To add a new medication, go to the Medications page and click the "Add Medication" button. You can search for your medication by name, then fill in the dosage, frequency, and time slots. The medication will be added to your schedule automatically.',
  },
  {
    question: "How does drug interaction checking work?",
    answer:
      "Marpe automatically checks for potential interactions between all your medications, vitamins, and supplements. When an interaction is detected, you'll see a warning with the severity level (high, moderate, or low) and recommendations. Premium users have access to our advanced interaction database.",
  },
  {
    question: "Can I share my medication list with my doctor?",
    answer:
      'Yes! With Care Circle (Premium feature), you can invite healthcare providers and caregivers to view your health data. Go to Care Circle, click "Add Provider," and share the unique invite code with them. You control exactly what information they can see.',
  },
  {
    question: "How do I track my vitals?",
    answer:
      "Navigate to the Vitals page to log and track various health metrics like blood pressure, heart rate, weight, and more. You can manually enter values or use our AI-powered lab report parser to extract values from uploaded documents (Premium feature).",
  },
  {
    question: "What happens if I miss a dose?",
    answer:
      'If you don\'t mark a dose as taken within the scheduled time window, it will be marked as "missed" in your schedule. You can see your adherence statistics on the Dashboard. This helps you and your healthcare providers understand your medication patterns.',
  },
  {
    question: "How do I cancel my subscription?",
    answer:
      "You can cancel your subscription anytime from Settings > Subscription. Your Premium features will remain active until the end of your billing period. Your data will be preserved, and you can reactivate your subscription at any time.",
  },
];

const HelpCenter = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredQuestions = popularQuestions.filter(
    (q) =>
      q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.answer.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-hero py-24">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6"
            >
              <BookOpen className="h-4 w-4" />
              <span className="text-sm font-medium">Help Center</span>
            </motion.div>

            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
              How Can We{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Help You?</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Find answers to common questions or get in touch with our support team.
            </p>

            {/* Search */}
            <div className="relative max-w-lg mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search for answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-lg"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-2xl font-bold mb-2">Browse by Category</h2>
            <p className="text-muted-foreground">Find help articles organized by topic.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category, index) => (
              <motion.div
                key={category.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="h-full hover-lift cursor-pointer group">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <category.icon className="h-6 w-6 text-primary" />
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <CardTitle className="text-lg">{category.title}</CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{category.articles} articles</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Questions */}
      <section className="py-16 bg-muted/30">
        <div className="container max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
              <HelpCircle className="h-4 w-4" />
              <span className="text-sm font-medium">FAQs</span>
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">Popular Questions</h2>
            <p className="text-muted-foreground">Quick answers to common questions.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            {filteredQuestions.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {filteredQuestions.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <Card className="text-center py-8">
                <CardContent>
                  <p className="text-muted-foreground mb-4">No results found for "{searchQuery}"</p>
                  <Button variant="outline" onClick={() => setSearchQuery("")}>
                    Clear Search
                  </Button>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
      </section>

      {/* Contact Support */}
      <section className="py-24 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center rounded-3xl gradient-primary p-12"
          >
            <MessageSquare className="h-12 w-12 text-primary-foreground mx-auto mb-4" />
            <h2 className="font-display text-3xl font-bold text-primary-foreground mb-4">Still Need Help?</h2>
            <p className="text-lg text-primary-foreground/90 mb-8">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="secondary" asChild>
                <Link to="/contact">Contact Support</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="bg-transparent border-white/30 text-white hover:bg-white/10"
              >
                <a href="mailto:support@marpe.care">Email Us</a>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HelpCenter;
