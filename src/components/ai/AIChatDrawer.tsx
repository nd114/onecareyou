import { useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Bot, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIChatPanel, ClearConversationButton } from './AIChatPanel';
import { ConversationHistoryRail, LoadedHistory } from './ConversationHistoryRail';

interface AIChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The assistant as a side sheet — for when you are somewhere else in the
 * platform and want to ask something without leaving the page. Past
 * conversations live in a rail on the left, so switching threads is one click.
 */
export function AIChatDrawer({ open, onOpenChange }: AIChatDrawerProps) {
  const [showHistory, setShowHistory] = useState(false);
  const loadRef = useRef<((history: LoadedHistory, conversationId?: string) => void) | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-row p-0 gap-0">
        {showHistory && (
          <ConversationHistoryRail
            className="absolute inset-0 z-20 w-full sm:static sm:z-auto sm:w-60 sm:shrink-0 bg-background sm:bg-muted/30"
            onClose={() => setShowHistory(false)}
            onLoad={(history, conversationId) => {
              loadRef.current?.(history, conversationId);
              setShowHistory(false);
            }}
          />
        )}

        <AIChatPanel
          className="flex-1 min-w-0"
          onAfterNavigate={() => onOpenChange(false)}
          renderHeader={({ hasMessages, clearChat, loadConversation }) => {
            loadRef.current = loadConversation;
            return (
              <SheetHeader className="px-4 pt-4 pb-2 pr-12 border-b">
                <div className="flex items-center gap-1.5">
                  <SheetTitle className="flex items-center gap-2 flex-1 min-w-0">
                    <Bot className="h-5 w-5 text-primary shrink-0" />
                    <span className="truncate">OneCare Assistant</span>
                  </SheetTitle>
                  <Button
                    variant={showHistory ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-8 w-8"
                    title="Past conversations"
                    onClick={() => setShowHistory((value) => !value)}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  {hasMessages && <ClearConversationButton onClear={clearChat} />}
                </div>
                <p className="text-xs text-muted-foreground">
                  Ask about health concepts or platform features
                </p>
              </SheetHeader>
            );
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
