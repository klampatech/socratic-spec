import { SpecDraft, GivenWhenThen, RoundResult } from './types';
import { log, error } from './logger';

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
