import { BRAND } from '@/lib/brand-constants';

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    url: BRAND.urls.published,
    logo: `${BRAND.urls.published}/favicon.png`,
    description: `${BRAND.name} eliminates information asymmetry between patients and providers. Track vitals, manage medications, and share health updates with your care team.`,
    contactPoint: {
      '@type': 'ContactPoint',
      email: BRAND.emails.support,
      contactType: 'customer support',
    },
  };
}

export function webApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: BRAND.name,
    url: BRAND.urls.published,
    applicationCategory: 'HealthApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free plan with medication tracking and vitals monitoring',
    },
    description: 'Health tracking platform for patients and healthcare providers. Manage medications, track vitals, and coordinate care.',
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${BRAND.urls.published}${item.path}`,
    })),
  };
}

export function faqSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function productSchema(name: string, description: string, price: string, priceCurrency = 'USD') {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    brand: { '@type': 'Brand', name: BRAND.name },
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency,
      availability: 'https://schema.org/InStock',
    },
  };
}

export function jobPostingSchema(job: {
  id: string;
  title: string;
  description: string;
  category: string;
  type: 'paid' | 'unpaid';
  commitment: string;
  location: string;
}) {
  const employmentType = /full/i.test(job.commitment)
    ? 'FULL_TIME'
    : /contract/i.test(job.commitment)
    ? 'CONTRACTOR'
    : /part/i.test(job.commitment)
    ? 'PART_TIME'
    : 'OTHER';

  const isRemote = /remote/i.test(job.location);
  const datePosted = new Date().toISOString().split('T')[0];
  const validThrough = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    identifier: {
      '@type': 'PropertyValue',
      name: BRAND.name,
      value: job.id,
    },
    datePosted,
    validThrough,
    employmentType,
    hiringOrganization: {
      '@type': 'Organization',
      name: BRAND.name,
      sameAs: BRAND.urls.published,
      logo: `${BRAND.urls.published}/favicon.png`,
    },
    industry: 'Healthcare Technology',
    occupationalCategory: job.category,
    jobLocationType: isRemote ? 'TELECOMMUTE' : undefined,
    applicantLocationRequirements: isRemote
      ? { '@type': 'Country', name: 'Worldwide' }
      : undefined,
    jobLocation: isRemote
      ? undefined
      : {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: job.location,
          },
        },
    directApply: true,
    url: `${BRAND.urls.published}/careers/${job.id}`,
  };
}

