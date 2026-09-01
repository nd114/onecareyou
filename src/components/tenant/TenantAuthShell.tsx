import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Building2, LucideIcon, ShieldCheck } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import type { PublicInstitution } from '@/hooks/useInstitutionBranding';

interface TenantAuthShellProps {
  institution: PublicInstitution | null;
  /** Small line under the institution name in the branded panel. */
  eyebrow?: ReactNode;
  headline: string;
  highlights: string[];
  /** Icon used for highlights and the mobile mark when there is no logo. */
  icon?: LucideIcon;
  seoTitle: string;
  seoDescription: string;
  children: ReactNode;
}

/**
 * The branded front door shared by a hospital's patient and staff pages.
 *
 * Tenant branding here is name, logo AND brand colours — this is the hospital's
 * own address, not the signed-in app (see docs/enterprise-hospital-tenancy-plan.md §3).
 * One shell means sign-up and sign-in look identical, so nobody has to leave the
 * hospital's page to reach an unbranded OneCare form.
 */
export function TenantAuthShell({
  institution,
  eyebrow,
  headline,
  highlights,
  icon: Icon = ShieldCheck,
  seoTitle,
  seoDescription,
  children,
}: TenantAuthShellProps) {
  const primary = institution?.primary_color || undefined;
  const accent = institution?.accent_color || undefined;
  const title = institution ? `${institution.name} by OneCare` : 'OneCare';

  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead title={seoTitle} description={seoDescription} noIndex />

      {/* Global theme control (light / dark / system) */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="grid lg:grid-cols-2 min-h-screen">
        {/* Branded panel */}
        <div
          className="relative hidden lg:flex flex-col justify-between p-12 text-primary-foreground"
          style={{
            background: primary
              ? `linear-gradient(160deg, ${primary}, ${accent || primary})`
              : undefined,
          }}
        >
          {!primary && <div className="absolute inset-0 gradient-primary" aria-hidden />}
          <div className="relative">
            <div className="flex items-center gap-3">
              {institution?.logo_url ? (
                <img
                  src={institution.logo_url}
                  alt={`${institution.name} logo`}
                  className="h-12 w-12 rounded-xl bg-background/90 object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/20">
                  <Building2 className="h-6 w-6" />
                </div>
              )}
              <div>
                <p className="font-display text-2xl font-bold leading-tight">{title}</p>
                {eyebrow && <p className="text-sm opacity-80">{eyebrow}</p>}
              </div>
            </div>

            <h1 className="font-display text-4xl font-bold mt-12 max-w-md leading-tight">
              {headline}
            </h1>
            <ul className="mt-8 space-y-3 max-w-md">
              {highlights.map((h) => (
                <li key={h} className="flex items-start gap-3 text-sm opacity-90">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs opacity-75">
            Powered by OneCare · Encrypted at rest and in transit
          </p>
        </div>

        {/* Card column */}
        <div className="flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <div className="lg:hidden flex items-center gap-3 mb-6">
              {institution?.logo_url ? (
                <img
                  src={institution.logo_url}
                  alt={`${institution.name} logo`}
                  className="h-10 w-10 rounded-lg border object-contain p-1"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary">
                  <Icon className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <span className="font-display text-xl font-bold">{title}</span>
            </div>

            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default TenantAuthShell;
