// hard-dq-filters.mjs — deterministic, zero-token hard-disqualifier checks.
//
// modes/_brief.md documents several rules as MECHANICAL, not judgment calls —
// its own words: "Check this before anything else" (Location Scoring) and
// "Hard DQ Criteria — instant FAIL". Today every one of those still costs a
// full LLM turn per posting (shortlist triage reads title+location and
// re-derives the same verdict; the daily digest reads the whole JD and does
// it again). This module moves the UNAMBIGUOUS cases of those same rules into
// plain pattern matching, so the agent is only ever asked to judge the
// genuinely ambiguous remainder.
//
// SAFETY CONTRACT — every exported classifier:
//   - returns { skip: false } ("no confident signal") far more often than
//     { skip: true, reason }, and NEVER fabricates a PASS. A miss here costs
//     nothing beyond the token spend this module exists to cut — the posting
//     just proceeds to the LLM exactly as it would have before this module
//     existed. A wrong { skip: true } silently hides a real opportunity
//     forever, which is the one failure mode worth being conservative about.
//   - only fires on phrasing patterns already named as examples in
//     modes/_brief.md itself, or on real phrasings this project's own agent
//     runs have been observed to reject (see each list's comment) — this is
//     encoding already-established judgment as code, not inventing new
//     judgment.
//   - an exemption signal anywhere in the same text (the candidate's home
//     country, a generic global/remote-anywhere phrase) ALWAYS blocks a skip,
//     even if that makes the text read as self-contradictory — ambiguous or
//     mixed signals defer to the LLM rather than guess.

const GLOBAL_REMOTE_SIGNALS = [
  'remote', 'anywhere', 'worldwide', 'global', 'international',
  'any country', 'any location', 'work from anywhere', 'location independent',
  'eor', 'south asia', 'apac',
];

// modes/_brief.md's own documented restriction examples ("must be located in
// the US/Canada", "EU/EEA only", "UK-based"), plus "within {Country}" — the
// real phrasing this project's shortlist agent has repeatedly hit (DocPlanner
// "within Poland" / "within Spain", logged 2026-11-21).
//
// Full names are matched case-insensitively. "US" and "UK" are kept separate
// and matched CASE-SENSITIVELY (uppercase only): lowercase "us" collides
// constantly with the English pronoun ("join us", "about us"), and allowing
// it case-insensitively would false-positive on ordinary JD prose far more
// often than it would ever catch a real restriction.
const COUNTRY_NAMES = [
  'united states', 'usa', 'u\\.s\\.a?\\.?', 'canada', 'united kingdom', 'u\\.k\\.',
  'germany', 'france', 'poland', 'spain', 'netherlands', 'australia', 'ireland',
  'sweden', 'italy', 'portugal', 'belgium', 'switzerland', 'austria', 'denmark',
  'norway', 'finland', 'eea', 'european union',
];
const COUNTRY_ALTERNATION = COUNTRY_NAMES.join('|');
// The short, case-ambiguous codes, kept out of COUNTRY_ALTERNATION so they can
// be matched without the /i flag elsewhere.
const SHORT_CODES = ['US', 'UK', 'EU'];
const SHORT_CODE_ALTERNATION = SHORT_CODES.join('|');

// A country/region group that also accepts one slash-joined partner of either
// kind ("US/Canada", "EU/EEA"), built twice per template: once matching full
// names case-insensitively, once matching the short codes case-sensitively.
function restrictionPattern(template) {
  const fullGroup = `(?:${COUNTRY_ALTERNATION})(?:\\s*/\\s*(?:${COUNTRY_ALTERNATION}|${SHORT_CODE_ALTERNATION}))?`;
  const shortGroup = `(?:${SHORT_CODE_ALTERNATION})(?:\\s*/\\s*(?:${COUNTRY_ALTERNATION}|${SHORT_CODE_ALTERNATION}))?`;
  return [
    new RegExp(template.replace(/\{C\}/g, fullGroup), 'i'),
    new RegExp(template.replace(/\{C\}/g, shortGroup)),
  ];
}

const RESTRICTION_PATTERNS = [
  // "must be located in the US/Canada", "must reside in the UK", "must be based in Germany"
  ...restrictionPattern(`must\\s+be\\s+(?:located|based|residing|physically\\s+located)\\s+in\\s+(?:the\\s+)?{C}\\b`),
  // "EU/EEA only", "US only", "UK only", "Poland only"
  ...restrictionPattern(`\\b{C}\\s+only\\b`),
  // "UK-based", "US-based" candidates/applicants/talent/only — "based" alone
  // after a country name is too common in unrelated prose ("company is US-
  // based") to fire on its own, so this requires a candidate-referring word
  // right after it.
  ...restrictionPattern(`\\b{C}[\\s-]based\\s+(?:candidates?|applicants?|talent|only|employees?)\\b`),
  // "within Poland", "within Spain" — the exact phrasing observed in practice.
  ...restrictionPattern(`\\bwithin\\s+{C}\\b`),
  // "restricted to the UK", "only open to US candidates"
  ...restrictionPattern(`\\b(?:restricted\\s+to|only\\s+open\\s+to)\\s+(?:the\\s+)?{C}\\b`),
];

const ONSITE_PATTERNS = [
  /\bon-?site\b/i,
  /\bin-?office\b/i,
  /\bhybrid\b/i,
  /\brelocation\s+required\b/i,
  /\bmust\s+relocate\b/i,
  /\brelocate\s+to\b/i,
];

// Primary-function Web3/blockchain titles only (modes/_brief.md: "Primary job
// function is Web3/blockchain smart-contract development — not backend-
// adjacent crypto-company work, which is fine"). Deliberately narrow: a
// "Backend Engineer" or "Platform Engineer" at a crypto company does not
// match this, only a title whose core role noun IS the blockchain work.
const WEB3_PRIMARY_TITLE = /\b(blockchain|web3|solidity)\s+(engineer|developer)\b|\bsmart\s+contract\s+(engineer|developer)\b/i;

function containsExemption(text, exemptions) {
  const lower = text.toLowerCase();
  return exemptions.some((sig) => lower.includes(sig));
}

/**
 * @param {string} text - location field, posting metadata blob, or full JD text.
 * @param {{ homeCountry?: string }} [opts]
 * @returns {{ skip: boolean, reason?: string }}
 */
export function classifyLocationHardDQ(text, opts = {}) {
  const t = String(text ?? '');
  if (!t.trim()) return { skip: false };

  const exemptions = [...GLOBAL_REMOTE_SIGNALS];
  if (opts.homeCountry) exemptions.push(String(opts.homeCountry).toLowerCase());
  if (containsExemption(t, exemptions)) return { skip: false };

  for (const pattern of RESTRICTION_PATTERNS) {
    const m = t.match(pattern);
    if (m) {
      return {
        skip: true,
        reason: `named country/region restriction ("${m[0].trim()}") with no remote/global or ${opts.homeCountry || 'home-country'} exemption found`,
      };
    }
  }

  for (const pattern of ONSITE_PATTERNS) {
    const m = t.match(pattern);
    if (m) {
      return { skip: true, reason: `on-site/hybrid signal ("${m[0].trim()}") with no remote exemption found` };
    }
  }

  return { skip: false };
}

/**
 * @param {string} title
 * @returns {{ skip: boolean, reason?: string }}
 */
export function classifyWeb3PrimaryTitle(title) {
  const t = String(title ?? '');
  const m = t.match(WEB3_PRIMARY_TITLE);
  if (!m) return { skip: false };
  return { skip: true, reason: `primary job function is Web3/blockchain ("${m[0].trim()}" in title), not backend-adjacent crypto work` };
}

/**
 * Convenience: run every hard-DQ check available from title + location-ish
 * text alone (no JD body needed — usable at the shortlist/triage stage,
 * before any JD is ever fetched). Returns the FIRST hit, or { skip: false }.
 *
 * @param {{ title?: string, locationText?: string, homeCountry?: string }} input
 * @returns {{ skip: boolean, reason?: string }}
 */
export function classifyTitleLocationHardDQ({ title = '', locationText = '', homeCountry } = {}) {
  const web3 = classifyWeb3PrimaryTitle(title);
  if (web3.skip) return web3;
  return classifyLocationHardDQ(locationText, { homeCountry });
}

export const HARD_DQ_VERSION = '2026-11-26';
