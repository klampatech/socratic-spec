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

/**
 * FEAT-002/edge-002: Detects rephrasing - when a new answer contains no new information.
 * 
 * Compares the new answer against all previous Given/When/Then entries to detect
 * when the answer is semantically equivalent but rephrased.
 */
export function detectRephrasing(draft: SpecDraft, newAnswer: string): RephrasingResult {
  const parsed = parseGivenWhenThen(newAnswer);
  const newGiven = parsed.given.toLowerCase();
  const newWhen = parsed.when.toLowerCase();
  const newThen = parsed.then.toLowerCase();
  
  // No previous entries to compare
  if (draft.entries.length === 0) {
    return { isRephrasing: false };
  }
  
  // Check against all previous entries
  for (const entry of draft.entries) {
    const existingGiven = entry.given.toLowerCase();
    const existingWhen = entry.when.toLowerCase();
    const existingThen = entry.then.toLowerCase();
    
    // Calculate semantic similarity using multiple approaches
    const overallSimilarity = calculateRephrasingSimilarity(
      newGiven, newWhen, newThen,
      existingGiven, existingWhen, existingThen
    );
    
    // If the overall semantic content is substantially the same, it's rephrasing
    // Use a threshold of 0.5 for rephrasing detection
    if (overallSimilarity >= 0.5) {
      return {
        isRephrasing: true,
        similarityScore: overallSimilarity,
        conflictingEntry: entry,
        reason: `Answer is semantically equivalent to existing entry (similarity: ${overallSimilarity.toFixed(2)})`
      };
    }
  }
  
  return { isRephrasing: false };
}

/**
 * Calculates semantic similarity between two Given/When/Then triples.
 * Uses word overlap and considers structural correspondence.
 */
function calculateSemanticSimilarity(
  given1: string, when1: string, then1: string,
  given2: string, when2: string, then2: string
): number {
  // Convert to arrays of key words for comparison
  const words1 = extractKeyWords(`${given1} ${when1} ${then1}`);
  const words2 = extractKeyWords(`${given2} ${when2} ${then2}`);
  
  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Calculate Jaccard similarity on key words
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  const wordOverlap = intersection.size / union.size;
  
  // Also check for structural similarity (same GWT pattern)
  const structuralSim = calculateStructuralSimilarity(given1, when1, then1, given2, when2, then2);
  
  // Combine word overlap with structural similarity
  return wordOverlap * 0.6 + structuralSim * 0.4;
}

/**
 * Calculates similarity specifically for rephrasing detection.
 * Uses weighted Jaccard and n-gram similarity for semantic equivalence detection.
 */
function calculateRephrasingSimilarity(
  given1: string, when1: string, then1: string,
  given2: string, when2: string, then2: string
): number {
  // Normalize empty values to empty string for comparison
  const g1 = given1 === '(none)' ? '' : given1;
  const g2 = given2 === '(none)' ? '' : given2;
  
  // Calculate Jaccard similarity for each clause
  const givenSim = calculateJaccardSimilarity(g1, g2);
  const whenSim = calculateJaccardSimilarity(when1, when2);
  const thenSim = calculateJaccardSimilarity(then1, then2);
  
  // Handle empty GIVEN cases - when both have no GIVEN, don't penalize
  let givenWeight = 0.15;
  let whenWeight = 0.45;
  let thenWeight = 0.40;
  let effectiveGivenSim = givenSim;
  
  if (!g1 && !g2) {
    // Both empty - ignore given similarity and redistribute weight
    whenWeight = 0.55;
    thenWeight = 0.45;
    effectiveGivenSim = 1.0; // Treat as match
  } else if (!g1 || !g2) {
    // One has given, one doesn't - reduce weight
    givenWeight = 0.1;
    whenWeight = 0.5;
    thenWeight = 0.4;
    effectiveGivenSim = 0.5; // Penalize
  }
  
  // Calculate weighted average of Jaccard similarities
  const jaccardResult = effectiveGivenSim * givenWeight + whenSim * whenWeight + thenSim * thenWeight;
  
  // Also calculate character n-gram similarity as a fallback for semantic equivalence
  // This helps catch rephrases that use different words but same concepts
  const whenNgramSim = calculateNgramSimilarity(when1, when2);
  const thenNgramSim = calculateNgramSimilarity(then1, then2);
  const overallNgramSim = (whenNgramSim + thenNgramSim) / 2;
  
  // Combine both approaches - take the higher of the two
  // N-gram helps catch structural similarity even when vocabulary differs
  // Cap at 1.0 to ensure valid similarity range
  return Math.min(Math.max(jaccardResult, overallNgramSim * 0.85), 1.0);
}

/**
 * Calculates character n-gram similarity (2-grams).
 * Useful for detecting rephrases that use different words but similar structure.
 */
function calculateNgramSimilarity(text1: string, text2: string): number {
  if (!text1 && !text2) return 1;
  if (!text1 || !text2) return 0;
  
  // Normalize and create 2-grams
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const n1 = normalize(text1);
  const n2 = normalize(text2);
  
  const getNgrams = (s: string, n: number): Set<string> => {
    const grams = new Set<string>();
    for (let i = 0; i <= s.length - n; i++) {
      grams.add(s.substring(i, i + n));
    }
    return grams;
  };
  
  const grams1 = getNgrams(n1, 2);
  const grams2 = getNgrams(n2, 2);
  
  if (grams1.size === 0 && grams2.size === 0) return 1;
  if (grams1.size === 0 || grams2.size === 0) return 0;
  
  const intersection = new Set([...grams1].filter(x => grams2.has(x)));
  const union = new Set([...grams1, ...grams2]);
  
  return intersection.size / union.size;
}

/**
 * Calculates Jaccard similarity between two texts.
 */
function calculateJaccardSimilarity(text1: string, text2: string): number {
  if (!text1 && !text2) return 1;
  if (!text1 || !text2) return 0;
  
  // Tokenize on whitespace and common punctuation
  const words1 = new Set(text1.split(/[\s,.!?;:'"()\[\]{}]+/).filter(w => w.length > 0));
  const words2 = new Set(text2.split(/[\s,.!?;:'"()\[\]{}]+/).filter(w => w.length > 0));
  
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Calculates structural similarity between two Given/When/Then triples.
 * Checks if the overall structure (empty/present for each clause) matches.
 */
function calculateStructuralSimilarity(
  given1: string, when1: string, then1: string,
  given2: string, when2: string, then2: string
): number {
  // Check if both have empty or non-empty GIVEN
  const givenMatch = (!given1 && !given2) || (given1 && given2);
  const whenMatch = (!when1 && !when2) || (when1 && when2);
  const thenMatch = (!then1 && !then2) || (then1 && then2);
  
  // If structure is identical, give full score
  if (givenMatch && whenMatch && thenMatch) return 1;
  
  // If two clauses match
  if ([givenMatch, whenMatch, thenMatch].filter(Boolean).length >= 2) return 0.7;
  
  // If one clause matches
  return 0.3;
}

/**
 * Simple wrapper that returns true if an answer is a rephrasing.
 * Logs the rephrasing if detected.
 */
export function isRephrasing(draft: SpecDraft, newAnswer: string): boolean {
  const result = detectRephrasing(draft, newAnswer);
  
  if (result.isRephrasing) {
    warn(`Rephrasing detected in ${draft.featureId}: no new information provided`, {
      similarityScore: result.similarityScore,
      existingEntry: result.conflictingEntry,
      reason: result.reason
    });
    log(`Rephrasing detected: similar content exists in spec draft`, {
      existingWhen: result.conflictingEntry?.when,
      newWhen: parseGivenWhenThen(newAnswer).when
    });
  }
  
  return result.isRephrasing;
}
