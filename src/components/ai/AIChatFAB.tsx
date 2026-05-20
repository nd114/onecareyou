import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIChatDrawer } from './AIChatDrawer';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Floating "Ask the assistant" button. Rendered as a relative-positioned
 * control inside <FabStack> so it lines up vertically with the bug button
 * without ever overlapping. Position-fixed is handled by the stack.
 */
export function AIChatFAB() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="pointer-events-auto"
          >
            <Button
              onClick={() => setOpen(true)}
              className="h-14 w-14 rounded-full shadow-lg gradient-primary border-0 hover:scale-105 transition-transform"
              size="icon"
              title="Ask the OneCare Assistant"
              aria-label="Open AI assistant"
            >
              <Bot className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AIChatDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
