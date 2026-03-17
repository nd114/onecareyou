import { useState } from 'react';
import { format } from 'date-fns';
import { FileText, Download, Sparkles, Calendar, Loader2, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DOCUMENT_CATEGORIES } from '@/hooks/useHealthDocuments';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

interface SharedDocumentsTabProps {
  patientUserId: string;
  shareId: string;
}

export function SharedDocumentsTab({ patientUserId, shareId }: SharedDocumentsTabProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch shared documents via document_shares join
  const { data: sharedDocs = [], isLoading } = useQuery({
    queryKey: ['clinician-shared-documents', patientUserId, shareId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_shares')
        .select(`
          id,
          document_id,
          shared_at,
          health_documents!inner (
            id,
            title,
            file_name,
            file_path,
            category,
            document_date,
            ai_summary,
            ai_tags,
            mime_type,
            file_size,
            notes
          )
        `)
        .eq('provider_share_id', shareId)
        .eq('is_active', true)
        .order('shared_at', { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!patientUserId && !!shareId,
  });

  const handleDownload = async (docShareId: string) => {
    setDownloadingId(docShareId);
    try {
      const { data, error } = await supabase.functions.invoke('get-shared-document-url', {
        body: { documentShareId: docShareId },
      });
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      toast.error('Failed to download: ' + (err.message || 'Unknown error'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Shared Documents
        </CardTitle>
        <CardDescription>
          Documents the patient has chosen to share with you
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sharedDocs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No documents shared by this patient yet</p>
            <p className="text-xs mt-1">Patients can share specific documents from their Health Vault</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sharedDocs.map((share: any) => {
              const doc = share.health_documents;
              const categoryInfo = DOCUMENT_CATEGORIES.find(c => c.value === doc.category) || DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];
              const isDownloading = downloadingId === share.id;

              return (
                <div key={share.id} className="p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-medium text-sm truncate">{doc.title || doc.file_name}</h4>
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
                            <span className="text-xs text-muted-foreground">
                              Shared {format(new Date(share.shared_at), 'MMM d')}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0 h-8"
                          onClick={() => handleDownload(share.id)}
                          disabled={isDownloading}
                        >
                          {isDownloading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              View
                            </>
                          )}
                        </Button>
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

                      {doc.notes && (
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{doc.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
