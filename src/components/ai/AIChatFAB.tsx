import { useState } from 'react';
import { Bot, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIChatDrawer } from './AIChatDrawer';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={() => setOpen(true)}
              className={cn(
                "h-14 w-14 rounded-full shadow-lg gradient-primary border-0",
                "hover:scale-105 transition-transform"
              )}
              size="icon"
              title="Ask AI"
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
