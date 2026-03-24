import { Helmet } from 'react-helmet-async';
import { BRAND } from '@/lib/brand-constants';

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

export function SEOHead({
  title,
  description = `${BRAND.name} eliminates information asymmetry between patients and providers. Track vitals, manage medications, and share health updates with your care team.`,
  canonical,
  ogImage = `${BRAND.urls.published}/og-image.png`,
  ogType = 'website',
  noIndex = false,
  jsonLd,
}: SEOHeadProps) {
  const fullTitle = title
    ? `${title} | ${BRAND.name}`
    : `${BRAND.name} — ${BRAND.tagline}`;

  const canonicalUrl = canonical
    ? `${BRAND.urls.published}${canonical}`
    : undefined;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content={BRAND.name} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(Array.isArray(jsonLd) ? jsonLd : jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
