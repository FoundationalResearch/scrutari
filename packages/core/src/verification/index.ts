// Types
export {
  type Claim,
  type NumberClaim,
  type ClaimStatus,
  type SourceReference,
  type VerificationReport,
  type VerificationSummary,
  type ExtractorResult,
  type LinkerResult,
  type ReporterOptions,
} from './types.js';

// Extractor
export {
  extractClaims,
  parseExtractionResponse,
  type ExtractorOptions,
} from './extractor.js';

// Linker
export {
  linkClaims,
  extractKeywords,
  extractNumbers,
  numbersMatch,
  isNumberClaim,
  type LinkerOptions,
} from './linker.js';

// Reporter
export {
  generateReport,
  computeSummary,
  annotateText,
  renderReportMarkdown,
  renderReportJSON,
  type ReporterInput,
} from './reporter.js';
