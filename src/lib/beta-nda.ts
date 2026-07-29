/**
 * OneCare Beta Programme NDA — single source of truth for the app.
 * Mirrors docs/beta-nda.md. Bump NDA_VERSION whenever the text changes.
 */

export const NDA_VERSION = '1.0';
export const NDA_TITLE = 'OneCare Beta Programme — Mutual Non-Disclosure Agreement';

export interface NdaSection {
  heading: string;
  paragraphs: string[];
}

export const NDA_SECTIONS: NdaSection[] = [
  {
    heading: 'Parties',
    paragraphs: [
      'This Mutual Non-Disclosure Agreement (the "Agreement") is entered into between OneCare ("OneCare", "we", "us") and the individual identified by the electronic signature recorded at the end of this Agreement (the "Beta Tester", "you"). It takes effect on the date of electronic signature.',
    ],
  },
  {
    heading: '1. Purpose',
    paragraphs: [
      'OneCare operates a connected health platform for patients and clinicians. OneCare wishes to give the Beta Tester pre-release access to the platform in order to obtain evaluation, clinical feedback and workflow validation (the "Purpose"). In doing so, each party may disclose Confidential Information to the other.',
    ],
  },
  {
    heading: '2. Confidential Information',
    paragraphs: [
      '"Confidential Information" means any non-public information disclosed by one party to the other in connection with the Purpose, in any form, including but not limited to:',
      '(a) the pre-release OneCare software, features, screens, roadmaps, pricing models and any part of the platform not publicly launched;',
      '(b) source code, architecture, data models, security controls, audit design and integration plans;',
      '(c) commercial information including funding status, partner names, unit economics and go-to-market plans;',
      '(d) feedback, defect reports, benchmark results and evaluation outcomes relating to the pre-release platform;',
      '(e) any information that a reasonable person would understand to be confidential given its nature or the circumstances of disclosure.',
    ],
  },
  {
    heading: '3. Exclusions',
    paragraphs: [
      'Confidential Information does not include information that: (i) is or becomes public through no breach of this Agreement; (ii) was lawfully known to the receiving party without a duty of confidentiality before disclosure; (iii) is lawfully received from a third party without restriction; or (iv) is independently developed without use of or reference to the disclosing party\u2019s Confidential Information.',
    ],
  },
  {
    heading: '4. Obligations',
    paragraphs: [
      'The receiving party shall: (a) use Confidential Information solely for the Purpose; (b) not disclose it to any third party without prior written consent, except to employees or contractors with a genuine need to know who are bound by equivalent confidentiality obligations; (c) protect it with at least reasonable care; (d) not publish screenshots, recordings, demonstrations, reviews or social media posts of the pre-release platform without OneCare\u2019s prior written consent; and (e) promptly notify the disclosing party of any suspected or actual unauthorised disclosure.',
    ],
  },
  {
    heading: '5. Patient data and clinical safety',
    paragraphs: [
      'The beta platform is provided for evaluation. The Beta Tester agrees: (a) not to enter identifiable patient data into the beta environment unless a separate written data-processing agreement (and, where applicable, a Business Associate Agreement) has been executed with OneCare; (b) to use synthetic, de-identified or their own test data during evaluation; (c) that the beta platform is not a medical device and must not be relied upon for diagnosis, treatment decisions, emergency care or as a system of record; and (d) to continue using existing clinical systems as the authoritative record throughout the beta period.',
    ],
  },
  {
    heading: '6. Feedback',
    paragraphs: [
      'Any feedback, suggestions, defect reports or improvement ideas the Beta Tester provides may be used by OneCare without restriction, attribution or compensation, under a perpetual, worldwide, royalty-free licence. OneCare will not publicly attribute feedback or use the Beta Tester\u2019s name, practice name or likeness in marketing without separate written consent.',
    ],
  },
  {
    heading: '7. No licence, no warranty',
    paragraphs: [
      'No licence to any intellectual property is granted except the limited right to access the beta platform for the Purpose. The beta platform is provided "as is", without warranties of any kind, express or implied, including fitness for a particular purpose, availability, accuracy or non-infringement. Beta data may be reset or deleted at any time.',
    ],
  },
  {
    heading: '8. Term and return',
    paragraphs: [
      'This Agreement takes effect on signature and continues for three (3) years. Obligations relating to trade secrets continue for as long as the information remains a trade secret. On request, the receiving party will delete or return Confidential Information in its possession, subject to routine backup retention and legal record-keeping obligations.',
    ],
  },
  {
    heading: '9. Beta programme benefits',
    paragraphs: [
      'Participation entitles the Beta Tester to early access to pre-release features and, if the Beta Tester adopts OneCare into their practice during or immediately after the beta period, a discount on their first six (6) months of subscription. Benefits are discretionary, non-transferable and do not oblige either party to enter into a commercial agreement.',
    ],
  },
  {
    heading: '10. No obligation, no employment',
    paragraphs: [
      'Nothing in this Agreement obliges either party to proceed with any transaction, purchase or partnership, nor creates an employment, agency, partnership or joint-venture relationship. Participation is unpaid unless separately agreed in writing.',
    ],
  },
  {
    heading: '11. Remedies',
    paragraphs: [
      'The parties acknowledge that a breach may cause irreparable harm for which damages are an inadequate remedy, and that the disclosing party is entitled to seek injunctive relief in addition to any other remedy available at law.',
    ],
  },
  {
    heading: '12. General',
    paragraphs: [
      'This Agreement is the entire agreement between the parties regarding its subject matter and supersedes prior discussions. It may only be amended in writing. If any provision is held unenforceable, the remainder continues in force. Neither party may assign it without the other\u2019s written consent, except to a successor in interest.',
    ],
  },
  {
    heading: '13. Electronic signature',
    paragraphs: [
      'The Beta Tester signs this Agreement electronically by typing their full legal name, affirming their intent to be bound, and submitting the booking form. OneCare records the signed name, the version of this Agreement, the date and time of signature (UTC) and the originating IP address. The parties agree that this electronic record constitutes a valid and binding signature and is admissible evidence of agreement.',
    ],
  },
];
