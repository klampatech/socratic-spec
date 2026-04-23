import { SpecDraft, GivenWhenThen, RoundResult, ContradictionResult } from './types';
import { log, error, warn } from './logger';

/**
 * Creates a new empty spec draft for a given feature
 */
export function createSpecDraft(featureId: string): SpecDraft {
  return {
    entries: [],
    featureId,
    lastUpdated: Date.now()
  };
}

/**
 * Parses a natural language answer into Given/When/Then components
 */
function parseGivenWhenThen(answer: string): { given: string; when: string; then: string } {
  // Trim and normalize whitespace
  const normalized = answer.trim().replace(/\s+/g, ' ');
  
  // Handle empty or whitespace-only answers
  if (!normalized || normalized.length === 0) {
    return { given: '', when: '(unparseable)', then: '(unparseable)' };
  }

  let given = '';
  let when = '';
  let then = '';

  // Extract "Given" clause - use a pattern that captures until we hit when/then
  const givenMatch = normalized.match(/given\s+(?:that\s+)?([^,]+)/i);
  if (givenMatch) {
    given = givenMatch[1].trim();
  }

  // Extract "When" clause - capture until then or end
  const whenMatch = normalized.match(/when\s+(?:that\s+)?([^,]+)/i);
  if (whenMatch) {
    when = whenMatch[1].trim();
  }

  // If no explicit When found, look for other connectors
  if (!when) {
    // Try "upon" pattern
    const uponMatch = normalized.match(/upon\s+([^,]+)/i);
    if (uponMatch) {
      when = 'Upon ' + uponMatch[1].trim();
    }
    // Try "if" pattern
    const ifMatch = normalized.match(/if\s+([^,]+)/i);
    if (ifMatch && !when) {
      when = 'If ' + ifMatch[1].trim();
    }
  }

  // Extract "Then" clause - capture rest after then
  const thenMatch = normalized.match(/then\s+(?:that\s+)?(.+)/i);
  if (thenMatch) {
    then = thenMatch[1].trim();
  }

  // If still no structure found, try to infer from context
  if (!given && !when && !then) {
    // Check for action-result pattern
    const actionResultMatch = normalized.match(/(.+?)\s+(?:should|must|will)\s+(.+)/i);
    if (actionResultMatch) {
      when = actionResultMatch[1].trim();
      then = actionResultMatch[2].trim();
    } else {
      // Last resort: entire answer goes to when
      when = normalized;
    }
  }

  // Handle special characters only
  if (/^[\s!?.#]+$/.test(normalized)) {
    when = '(unparseable)';
    then = '(unparseable)';
    given = '';
  }

  return { given, when, then };
}

/**
 * AC-004: Synthesizes a Respondee answer into Given/When/Then format and updates the spec draft
 */
export function synthesizeAnswer(draft: SpecDraft, answer: string): SpecDraft {
  const timestamp = Date.now();
  
  // Check for malformed/empty answers
  const trimmedAnswer = answer.trim();
  if (!trimmedAnswer) {
    error(`Malformed answer detected (empty or whitespace only): "${answer}"`);
    log(`Round marked as incomplete due to malformed answer`);
    // Still create an entry but mark it as unparseable
    const entry: GivenWhenThen = {
      given: '',
      when: '(unparseable)',
      then: '(unparseable)',
      sourceAnswer: answer,
      timestamp
    };
    
    return {
      ...draft,
      entries: [...draft.entries, entry],
      lastUpdated: timestamp
    };
  }

  const parsed = parseGivenWhenThen(answer);
  
  const entry: GivenWhenThen = {
    given: parsed.given,
    when: parsed.when,
    then: parsed.then,
    sourceAnswer: answer,
    timestamp
  };

  // AC-005: Append without overwriting - create new array with all entries
  const updatedDraft: SpecDraft = {
    ...draft,
    entries: [...draft.entries, entry],
    lastUpdated: timestamp
  };

  log(`Synthesized answer into spec draft: ${draft.featureId}`, {
    given: entry.given || '(none)',
    when: entry.when,
    then: entry.then
  });

  return updatedDraft;
}

/**
 * AC-005: Appends a Given/When/Then entry to the spec draft without overwriting existing entries.
 * This is an alias for synthesizeAnswer to provide semantic clarity for append operations.
 */
export function appendToDraft(draft: SpecDraft, answer: string): SpecDraft {
  return synthesizeAnswer(draft, answer);
}

/**
 * Creates a round result from synthesis operation
 */
export function createRoundResult(
  draft: SpecDraft,
  success: boolean,
  errorMessage?: string
): RoundResult {
  return {
    specDraft: draft,
    success,
    error: errorMessage,
    incompleteReason: !success ? `Synthesis failed: ${errorMessage}` : undefined
  };
}

/**
 * Checks if an answer is malformed and should trigger error handling
 */
export function isMalformedAnswer(answer: string): boolean {
  const trimmed = answer.trim();
  
  if (!trimmed) return true;
  if (/^[\s!?.#]+$/.test(trimmed)) return true;
  
  return false;
}

/**
 * FEAT-002/edge-001: Detects contradiction between a new answer and existing entries
 * 
 * Compares the new answer against all previous Given/When/Then entries to detect
 * logical contradictions (e.g., negation patterns, conflicting outcomes).
 */
export function detectContradiction(draft: SpecDraft, newAnswer: string): ContradictionResult {
  const parsed = parseGivenWhenThen(newAnswer);
  const newGiven = parsed.given.toLowerCase();
  const newWhen = parsed.when.toLowerCase();
  const newThen = parsed.then.toLowerCase();
  
  // No previous entries to contradict
  if (draft.entries.length === 0) {
    return { hasContradiction: false };
  }
  
  // Check against all previous entries
  for (const entry of draft.entries) {
    const existingGiven = entry.given.toLowerCase();
    const existingWhen = entry.when.toLowerCase();
    const existingThen = entry.then.toLowerCase();
    
    // Calculate similarity scores for context matching
    const whenSimilarity = calculateSimilarity(newWhen, existingWhen);
    const givenSimilarity = calculateSimilarity(newGiven, existingGiven);
    const thenSimilarity = calculateSimilarity(newThen, existingThen);
    
    // Check for GIVEN clause contradiction FIRST (same WHEN context, given differs significantly)
    // This takes priority because if GIVEN conditions contradict, the whole scenario is different
    if (whenSimilarity > 0.2) {
      if (checkNegationPattern(existingGiven, newGiven)) {
        return {
          hasContradiction: true,
          conflictingEntry: entry,
          conflictType: 'given',
          reason: `Given clause negation: "${existingGiven}" contradicts "${newGiven}"`
        };
      }
      // Check for explicit positive vs negative given (user is admin vs user is not admin)
      if (checkPositiveNegativePair(existingGiven, newGiven)) {
        return {
          hasContradiction: true,
          conflictingEntry: entry,
          conflictType: 'given',
          reason: `Given clause conflict: "${existingGiven}" contradicts "${newGiven}"`
        };
      }
    }
    
    // Check for WHEN clause contradiction (same GIVEN and THEN context, when differs)
    if (givenSimilarity > 0.2 && thenSimilarity > 0.2) {
      if (checkNegationPattern(existingWhen, newWhen)) {
        return {
          hasContradiction: true,
          conflictingEntry: entry,
          conflictType: 'when',
          reason: `When clause contradiction: "${existingWhen}" contradicts "${newWhen}"`
        };
      }
    }
    
    // Check for THEN clause contradiction
    // Context match: WHEN or GIVEN should be similar
    const contextMatch = whenSimilarity > 0.2 || givenSimilarity > 0.15;
    if (contextMatch) {
      if (checkNegationPattern(existingThen, newThen)) {
        return {
          hasContradiction: true,
          conflictingEntry: entry,
          conflictType: 'then',
          reason: `Negation detected: "${existingThen}" contradicts "${newThen}"`
        };
      }
      // Also check for semantic opposites (open/closed, in/out, etc.)
      if (checkSemanticOpposite(existingThen, newThen)) {
        return {
          hasContradiction: true,
          conflictingEntry: entry,
          conflictType: 'then',
          reason: `Semantic opposite: "${existingThen}" contradicts "${newThen}"`
        };
      }
    }
    
    // Direct THEN clause check: same action, opposite result
    // This catches the case where WHEN is identical (e.g., "action X occurs" vs "action X occurs")
    if (whenSimilarity > 0.7) {
      if (checkNegationPattern(existingThen, newThen)) {
        return {
          hasContradiction: true,
          conflictingEntry: entry,
          conflictType: 'then',
          reason: `Negation detected: "${existingThen}" contradicts "${newThen}"`
        };
      }
      if (checkSemanticOpposite(existingThen, newThen)) {
        return {
          hasContradiction: true,
          conflictingEntry: entry,
          conflictType: 'then',
          reason: `Semantic opposite: "${existingThen}" contradicts "${newThen}"`
        };
      }
    }
  }
  
  return { hasContradiction: false };
}

/**
 * Calculates similarity score between two texts (0-1).
 * Uses Jaccard similarity on word sets.
 */
function calculateSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2 || text1 === '(unparseable)' || text2 === '(unparseable)') {
    return 0;
  }
  
  const words1 = new Set(text1.split(/[\s,.!?;:'"()\[\]{}]+/).filter(w => w.length > 1).map(w => w.toLowerCase()));
  const words2 = new Set(text2.split(/[\s,.!?;:'"()\[\]{}]+/).filter(w => w.length > 1).map(w => w.toLowerCase()));
  
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Checks if two contexts are similar enough to warrant comparison.
 * Uses word overlap to determine if the WHEN/GIVEN clauses refer to the same scenario.
 */
function checkContextualMatch(text1: string, text2: string): boolean {
  return calculateSimilarity(text1, text2) > 0.3;
}

/**
 * Extracts key words from a sentence for comparison.
 * Removes common stop words and keeps action-oriented words.
 */
function extractKeyWords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'that', 'this', 'these', 'those', 'it', 'they', 'them', 'when', 'then'
  ]);
  
  return text
    .split(/[\s,.!?;:'"()\[\]{}]+/)
    .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
    .map(word => word.toLowerCase());
}

/**
 * Detects negation patterns between two clauses.
 * Checks for common negation keywords and patterns.
 */
function checkNegationPattern(original: string, candidate: string): boolean {
  if (!original || !candidate) return false;
  
  const negationKeywords = ['not', "n't", 'never', 'no ', 'without', 'none', 'neither', 'remain', 'still', 'no ', 'no\b'];
  const originalNormalized = original.toLowerCase();
  const candidateNormalized = candidate.toLowerCase();
  
  // Check if one has negation and the other doesn't for the same outcome
  const originalHasNegation = negationKeywords.some(n => originalNormalized.includes(n));
  const candidateHasNegation = negationKeywords.some(n => candidateNormalized.includes(n));
  
  // One has negation, the other doesn't - likely a contradiction
  if (originalHasNegation !== candidateHasNegation) {
    const baseOriginal = removeNegation(originalNormalized);
    const baseCandidate = removeNegation(candidateNormalized);
    // Only if the base actions are similar (lower threshold for short phrases)
    const sim = similarityScore(baseOriginal, baseCandidate);
    if (sim > 0.3) {
      return true;
    }
  }
  
  // Both have negation or both don't - check for direct opposite patterns
  return checkDirectOpposite(originalNormalized, candidateNormalized);
}

/**
 * Checks for direct opposite patterns (e.g., "is X" vs "is not X")
 * Also handles semantic opposites like "out" vs "in", "open" vs "closed"
 */
function checkDirectOpposite(text1: string, text2: string): boolean {
  // Check for semantic opposites
  const opposites: [string, string][] = [
    ['out', 'in'],
    ['open', 'closed'],
    ['starts', 'stops'],
    ['begin', 'end'],
    ['creates', 'deletes'],
    ['grants', 'revokes'],
    ['adds', 'removes'],
    ['enables', 'disables'],
    ['shows', 'hides'],
    ['persists', 'expires'],
    ['saves', 'discards'],
    ['succeeds', 'fails'],
    ['completes', 'cancels']
  ];
  
  // Check if text1 and text2 are semantic opposites
  for (const [word1, word2] of opposites) {
    if ((text1.includes(word1) && text2.includes(word2)) ||
        (text1.includes(word2) && text2.includes(word1))) {
      // Check if the overall structure is similar (same actors/actions)
      const base1 = removeNegation(text1).replace(new RegExp(word1, 'g'), '').replace(new RegExp(word2, 'g'), '');
      const base2 = removeNegation(text2).replace(new RegExp(word1, 'g'), '').replace(new RegExp(word2, 'g'), '');
      if (similarityScore(base1, base2) > 0.3) {
        return true;
      }
    }
  }
  
  // Also check for explicit negation patterns
  const hasNeg1 = /not|n't|never|remain|still/.test(text1);
  const hasNeg2 = /not|n't|never|remain|still/.test(text2);
  
  if (hasNeg1 !== hasNeg2) {
    // Remove negation and compare bases
    const base1 = removeNegation(text1);
    const base2 = removeNegation(text2);
    return similarityScore(base1, base2) > 0.4;
  }
  
  return false;
}

/**
 * Checks for semantic opposites (e.g., "in" vs "out", "open" vs "closed")
 * This is a simplified version focused on action-result opposites.
 */
function checkSemanticOpposite(text1: string, text2: string): boolean {
  const opposites: [string, string][] = [
    ['out', 'in'],
    ['open', 'closed'],
    ['starts', 'stops'],
    ['begin', 'end'],
    ['creates', 'deletes'],
    ['grants', 'revokes'],
    ['adds', 'removes'],
    ['enables', 'disables'],
    ['shows', 'hides'],
    ['persists', 'expires'],
    ['saves', 'discards'],
    ['succeeds', 'fails'],
    ['completes', 'cancels'],
    ['signed out', 'signed in'],
    ['remains signed in', 'signed out'],
    ['stays open', 'closes'],
    ['alert admin', 'no alert'],
    ['is shown', 'is not shown'],
    ['happens', 'does not happen'],
    ['is created', 'is not created'],
    ['is sent', 'is not sent'],
    ['is logged', 'is not logged'],
    ['is saved', 'is not saved'],
    ['is updated', 'is not updated'],
    ['is deleted', 'is not deleted']
  ];
  
  const t1 = text1.toLowerCase();
  const t2 = text2.toLowerCase();
  
  for (const [word1, word2] of opposites) {
    if ((t1.includes(word1) && t2.includes(word2)) ||
        (t1.includes(word2) && t2.includes(word1))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Checks for positive/negative given clause pairs.
 * E.g., "user is admin" vs "user is not admin"
 */
function checkPositiveNegativePair(text1: string, text2: string): boolean {
  // Pattern: "X is Y" vs "X is not Y" or "X is not Y" vs "X is Y"
  const pattern1 = /^(.+?)\s+is\s+(not\s+)?(.+)$/;
  const pattern2 = /^(.+?)\s+is\s+(not\s+)?(.+)$/;
  
  const match1 = text1.match(pattern1);
  const match2 = text2.match(pattern2);
  
  if (match1 && match2) {
    const subject1 = match1[1].trim();
    const neg1 = match1[2] || '';
    const value1 = match1[3].trim();
    
    const subject2 = match2[1].trim();
    const neg2 = match2[2] || '';
    const value2 = match2[3].trim();
    
    // Same subject and value, but one is negated and other isn't
    if (subject1 === subject2 && value1 === value2 && neg1 !== neg2) {
      return true;
    }
    
    // Same subject, opposite negation
    if (subject1 === subject2 && ((neg1 && !neg2) || (!neg1 && neg2))) {
      return true;
    }
  }
  
  // Also check "is admin" vs "is not admin" type patterns
  if (text1.includes('is not') !== text2.includes('is not') ||
      text1.includes('is ') === text2.includes('is ')) {
    // If both have similar subject words
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2));
    const overlap = [...words1].filter(x => words2.has(x)).length;
    return overlap > 1 && (text1.includes('not') !== text2.includes('not'));
  }
  
  return false;
}

/**
 * Removes negation keywords from a string.
 */
function removeNegation(text: string): string {
  return text
    .replace(/\bnot\b/g, '')
    .replace(/n't/g, '')
    .replace(/\bnever\b/g, '')
    .replace(/\bno\s+/g, '')
    .replace(/\bwithout\b/g, '')
    .replace(/\bremain/g, '')
    .replace(/\bstill\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates similarity score between two strings (0-1).
 */
function similarityScore(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 1));
  
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Simple wrapper that returns true if a contradiction exists.
 * Logs the contradiction if found.
 */
export function hasContradiction(draft: SpecDraft, newAnswer: string): boolean {
  const result = detectContradiction(draft, newAnswer);
  
  if (result.hasContradiction) {
    warn(`Contradiction detected in ${draft.featureId}`, {
      conflictType: result.conflictType,
      existingEntry: result.conflictingEntry,
      reason: result.reason
    });
    log(`THEN clause conflict: "${result.conflictingEntry?.then}" vs new answer`, {
      given: result.conflictingEntry?.given,
      when: result.conflictingEntry?.when
    });
  }
  
  return result.hasContradiction;
}
