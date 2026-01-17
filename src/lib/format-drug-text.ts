/**
 * Utility functions to format drug label text for better readability
 */

// Common patterns in FDA drug labels that need formatting
const bulletPatterns = [
  /•\s*/g,
  /\s*-\s+(?=[A-Z])/g, // dash followed by capital letter
];

const sectionPatterns = [
  /(?:^|\s)(Directions|Warnings|Uses|Ask a doctor|Do not use|Stop use|Keep out of reach|Other information|Inactive ingredients|Active ingredients?|Purpose|Questions\?|Storage)(?:\s*:|\s+)/gi,
  /(?:^|\s)(\d+\.?\s*[A-Z][A-Za-z\s]+)(?:\s*:|\s+)/g, // Numbered sections like "1 INDICATIONS"
];

/**
 * Formats raw FDA drug label text into more readable paragraphs with proper line breaks
 */
export function formatDrugText(text: string | undefined): string {
  if (!text) return '';
  
  let formatted = text;
  
  // Replace bullet points with proper line breaks
  formatted = formatted.replace(/•\s*/g, '\n• ');
  
  // Add line breaks before major section headers
  formatted = formatted.replace(
    /\s+(Directions|Warnings|Uses|Ask a doctor|Do not use|Stop use|Keep out of reach|Other information|Inactive ingredients|Active ingredients?|Purpose|Questions\?|Storage|When using this product|If pregnant|Sore throat warning|Stomach bleeding warning|Heart attack and stroke warning|Allergy alert)(?:\s*:|\s+)/gi,
    '\n\n**$1**\n'
  );
  
  // Format numbered sections (e.g., "6.1 Clinical Studies Experience")
  formatted = formatted.replace(
    /(\d+(?:\.\d+)?)\s+([A-Z][A-Za-z\s&]+)(?=\s)/g,
    '\n\n**$1 $2**\n'
  );
  
  // Add line breaks for list items starting with lowercase after periods
  formatted = formatted.replace(/\.\s*([a-z])/g, '.\n• $1');
  
  // Clean up excessive whitespace
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  formatted = formatted.trim();
  
  return formatted;
}

/**
 * Formats dosage chart text which often contains tabular data
 */
export function formatDosageText(text: string | undefined): string {
  if (!text) return '';
  
  let formatted = formatDrugText(text);
  
  // Format weight/age dosing charts
  formatted = formatted.replace(
    /(\d+-\d+)\s+(lbs?|kg|pounds?|kilograms?)/gi,
    '\n• $1 $2:'
  );
  
  // Format age ranges
  formatted = formatted.replace(
    /(\d+-\d+)\s+(years?|yrs?|months?|mos?)/gi,
    ' ($1 $2)'
  );
  
  return formatted;
}

/**
 * Extracts key warning highlights from warning text
 */
export function extractWarningHighlights(text: string | undefined): string[] {
  if (!text) return [];
  
  const highlights: string[] = [];
  
  // Look for critical warning patterns
  const criticalPatterns = [
    /do not use/gi,
    /stop use and ask/gi,
    /seek medical help/gi,
    /call.*(?:doctor|911|emergency)/gi,
    /allergic reaction/gi,
    /overdose/gi,
  ];
  
  for (const pattern of criticalPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      highlights.push(...matches.map(m => m.toLowerCase()));
    }
  }
  
  return [...new Set(highlights)]; // Remove duplicates
}

/**
 * Parses a table-like string from FDA labels into structured data
 */
export function parseTableText(text: string): { headers: string[]; rows: string[][] } | null {
  // Look for common table patterns
  const tableMatch = text.match(/(?:Weight|Age|Dose|Tablets?)\s*(?:\(.*?\))?\s*/gi);
  
  if (!tableMatch || tableMatch.length < 2) return null;
  
  // This is a simplified parser - real implementation would be more robust
  return null;
}
