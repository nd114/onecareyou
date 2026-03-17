import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, Filter, FolderOpen, Sparkles, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/layout/Header';
import { UploadDocumentDialog } from '@/components/documents/UploadDocumentDialog';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { useHealthDocuments, DOCUMENT_CATEGORIES, DocumentCategory } from '@/hooks/useHealthDocuments';
import { useAuth } from '@/contexts/AuthContext';

const HealthVault = () => {
  const { profile } = useAuth();
  const { documents, isLoading } = useHealthDocuments();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | 'all'>('all');

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
            <UploadDocumentDialog />
          </div>

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
                  <DocumentCard document={doc} />
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
