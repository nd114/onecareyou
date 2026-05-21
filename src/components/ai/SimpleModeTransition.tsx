import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Brief gradient-green wash + "Simple Mode" wordmark shown when the user
 * lands on /assist. Auto-dismisses after ~1.1s so the chat is usable
 * immediately. Skipped if the user has already seen the transition this
 * session (sessionStorage key).
 */
const SESSION_KEY = 'onecare.simple-mode.transition-seen';

export function SimpleModeTransition() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    setShow(true);
    const t = setTimeout(() => setShow(false), 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center gradient-primary"
          aria-hidden
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="flex flex-col items-center gap-3 text-primary-foreground"
          >
            <Sparkles className="h-10 w-10" />
            <p className="text-2xl font-semibold tracking-tight">Simple Mode</p>
            <p className="text-sm opacity-80">One conversation, your whole care</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
