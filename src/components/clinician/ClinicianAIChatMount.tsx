import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { ClinicianAIDrawer } from './ClinicianAIDrawer';

// Public/marketing clinician routes must never show the assistant.
const EXCLUDED = [
  '/clinician/sign-up',
  '/clinician/pricing',
  '/clinician/why-onecare',
  '/clinician/subscription-success',
];

export function ClinicianAIChatMount() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { isClinician } = useClinicianProfile();
  const [open, setOpen] = useState(false);

  if (!user || !isClinician) return null;
  if (!pathname.startsWith('/clinician')) return null;
  if (EXCLUDED.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

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
              title="Open the Clinical Assistant"
              aria-label="Open clinical assistant"
            >
              <Stethoscope className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <ClinicianAIDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
