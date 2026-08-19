import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Bot } from 'lucide-react';
import { AIChatPanel, ClearConversationButton } from './AIChatPanel';

interface AIChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The assistant as a side sheet — for when you are somewhere else in the
 * platform and want to ask something without leaving the page. On the AI page
 * itself the same conversation is rendered inline instead.
 */
export function AIChatDrawer({ open, onOpenChange }: AIChatDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <AIChatPanel
          className="flex-1"
          onAfterNavigate={() => onOpenChange(false)}
          renderHeader={({ hasMessages, clearChat }) => (
            <SheetHeader className="px-4 pt-4 pb-2 pr-12 border-b">
              <div className="flex items-center gap-2">
                <SheetTitle className="flex items-center gap-2 flex-1 min-w-0">
                  <Bot className="h-5 w-5 text-primary shrink-0" />
                  <span className="truncate">OneCare Assistant</span>
                </SheetTitle>
                {hasMessages && <ClearConversationButton onClear={clearChat} />}
              </div>
              <p className="text-xs text-muted-foreground">
                Ask about health concepts or platform features
              </p>
            </SheetHeader>
          )}
        />
      </SheetContent>
    </Sheet>
  );
}
