import { useState } from 'react';
import { format } from 'date-fns';
import { FileText, Download, Trash2, Sparkles, ExternalLink, Calendar, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { HealthDocument, DOCUMENT_CATEGORIES, useHealthDocuments } from '@/hooks/useHealthDocuments';

interface DocumentCardProps {
  document: HealthDocument;
}

export function DocumentCard({ document: doc }: DocumentCardProps) {
  const { deleteDocument, getDownloadUrl } = useHealthDocuments();
  const [downloading, setDownloading] = useState(false);

  const categoryInfo = DOCUMENT_CATEGORIES.find((c) => c.value === doc.category) || DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await getDownloadUrl(doc.file_path);
      if (url) window.open(url, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-medium text-sm truncate">{doc.title || doc.file_name}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className={`text-xs ${categoryInfo.color}`}>
                    {categoryInfo.label}
                  </Badge>
                  {doc.document_date && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(doc.document_date), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} disabled={downloading}>
                  <Download className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete document?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{doc.title || doc.file_name}" and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteDocument.mutate(doc)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* AI Summary */}
            {doc.ai_summary && (
              <div className="mt-2 p-2 rounded-md bg-muted/50 border border-border/50">
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium text-primary">AI Summary</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {doc.ai_summary}
                </p>
              </div>
            )}

            {/* AI Tags */}
            {doc.ai_tags && doc.ai_tags.length > 0 && (
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                <Tag className="h-3 w-3 text-muted-foreground" />
                {doc.ai_tags.slice(0, 5).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] h-5">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {doc.notes && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{doc.notes}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
