import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, FolderOpen, Loader2, Crown, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Header } from '@/components/layout/Header';
import { SectionTabs } from '@/components/layout/SectionTabs';
import { UploadDocumentDialog } from '@/components/documents/UploadDocumentDialog';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { useHealthDocuments, DOCUMENT_CATEGORIES, DocumentCategory } from '@/hooks/useHealthDocuments';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { FREE_DOCUMENT_LIMIT } from '@/lib/pricing-constants';

const HealthVault = () => {
  const { profile } = useAuth();
  const { documents, isLoading } = useHealthDocuments();
  const { checkSubscription, isPremium } = useSubscription();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | 'all'>('all');
  const [checkedSub, setCheckedSub] = useState(false);

  useEffect(() => {
    checkSubscription().then(() => setCheckedSub(true));
  }, [checkSubscription]);

  const isOverFreeLimit = !isPremium && documents.length >= FREE_DOCUMENT_LIMIT;

  const filteredDocuments = useMemo(() => {
    let filtered = documents;
    if (activeCategory !== 'all') {
      filtered = filtered.filter((d) => d.category === activeCategory || d.ai_category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.title?.toLowerCase().includes(q) ||
          d.file_name.toLowerCase().includes(q) ||
          d.ai_summary?.toLowerCase().includes(q) ||
          d.notes?.toLowerCase().includes(q) ||
          d.ai_tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [documents, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: documents.length };
    documents.forEach((d) => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });
    return counts;
  }, [documents]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SectionTabs section=\"health\" variant=\"patient\" />
      <main className="container py-8 px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FolderOpen className="h-6 w-6 text-primary" />
                Health Vault
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Store and organize all your health documents in one place
              </p>
            </div>
            {!isOverFreeLimit && <UploadDocumentDialog />}
          </div>

          {/* Premium Upsell Banner for free users at limit */}
          {isOverFreeLimit && (
            <Card className="mb-6 border-primary/30 bg-primary/5">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">You've reached {FREE_DOCUMENT_LIMIT} documents</p>
                  <p className="text-xs text-muted-foreground">Upgrade to Premium for unlimited document storage and AI summaries.</p>
                </div>
                <Button size="sm" asChild className="flex-shrink-0">
                  <Link to="/pricing">
                    <Crown className="h-4 w-4 mr-1" />
                    Upgrade
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Free tier info for users not at limit */}
          {!isPremium && !isOverFreeLimit && documents.length > 0 && (
            <div className="mb-4 text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {documents.length} of {FREE_DOCUMENT_LIMIT} free documents used.{' '}
              <Link to="/pricing" className="text-primary hover:underline">Upgrade for unlimited</Link>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents, summaries, and tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filters */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <Badge
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setActiveCategory('all')}
            >
              All ({categoryCounts.all || 0})
            </Badge>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <Badge
                key={cat.value}
                variant={activeCategory === cat.value ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setActiveCategory(cat.value)}
              >
                {cat.label} ({categoryCounts[cat.value] || 0})
              </Badge>
            ))}
          </div>

          {/* Documents List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">
                {documents.length === 0
                  ? 'No documents yet'
                  : 'No documents match your search'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {documents.length === 0
                  ? 'Upload prescriptions, lab results, discharge summaries, and other health documents to keep them organized and accessible.'
                  : 'Try adjusting your search terms or category filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocuments.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <DocumentCard document={doc} isPremium={isPremium} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default HealthVault;
