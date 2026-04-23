import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  Interrogator, 
  createInterrogator, 
  AmbiguityError, 
  QuestionHistory,
  CoverageResult,
  DONE_SIGNAL 
} from '../src/interrogator';
import { createSpecDraft } from '../src/specSynthesizer';

/**
 * FEAT-003/edge-003: Max unknown categories exhausted
 * 
 * This edge case tests the scenario where the Interrogator has explored all
 * required categories but not yet detected a circular pattern or reached max cycles.
 * 
 * The key distinction from AC-007 (complete exploration):
 * - AC-007 tests: Given all feature categories have been explored → DONE
 * - edge-003 tests: Max unknown categories exhausted (all required categories covered)
 * 
 * Edge case specifics:
 * - When all requiredCategories have been covered via keyword detection
 * - When the Interrogator should signal DONE even with long question history
 * - When maxCycles threshold has NOT been exceeded but categories ARE exhausted
 * - Should NOT trigger circular pattern detection if questions are diverse
 * - Should properly identify when no categories are missing
 */

describe('FEAT-003/edge-003: Max unknown categories exhausted', () => {
  
  describe('Core Behavior: Categories exhausted but not max cycles', () => {
    
    it('edge-003: Should return DONE when all required categories are covered', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7
      });
      
      // Create draft with entries covering all three categories
      const draft = createSpecDraft('TEST-003');
      draft.entries = [
        {
          given: 'User is logged in',
          when: 'When user submits valid login credentials',
          then: 'User is authenticated successfully',
          sourceAnswer: 'Given a user is logged in, when they submit valid credentials, then authentication succeeds',
          timestamp: Date.now()
        },
        {
          given: 'Invalid credentials provided',
          when: 'When authentication fails',
          then: 'Error message is displayed and access denied',
          sourceAnswer: 'Error handling: when invalid credentials provided, system shows error and denies access',
          timestamp: Date.now()
        },
        {
          given: 'Boundary values reached',
          when: 'When input exceeds maximum length',
          then: 'Input is truncated and error logged',
          sourceAnswer: 'Edge case: boundary conditions like empty, null, max values trigger truncation',
          timestamp: Date.now()
        }
      ];
      
      const history: QuestionHistory = [
        { question: 'What is the happy path?', timestamp: Date.now() },
        { question: 'How are errors handled?', timestamp: Date.now() + 1 },
        { question: 'What edge cases exist?', timestamp: Date.now() + 2 }
      ];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      // All categories covered → DONE
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
      expect(result.missingCategories).toEqual([]);
    });
    
    it('edge-003: Should signal DONE even with long question history when categories exhausted', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7,
        maxCycles: 5
      });
      
      const draft = createSpecDraft('TEST-003');
      // Cover both categories
      draft.entries = [
        {
          given: 'Valid input provided',
          when: 'When system processes valid input',
          then: 'Operation completes successfully',
          sourceAnswer: 'Happy path: valid input results in successful operation',
          timestamp: Date.now()
        },
        {
          given: 'Invalid input provided',
          when: 'When system encounters invalid input',
          then: 'Error is raised and operation fails gracefully',
          sourceAnswer: 'Error handling: invalid input triggers error handling',
          timestamp: Date.now()
        }
      ];
      
      // Long history but within maxCycles
      const history: QuestionHistory = [
        { question: 'What is the happy path?', timestamp: Date.now() },
        { question: 'How are errors handled?', timestamp: Date.now() + 1 },
        { question: 'Tell me more about success criteria', timestamp: Date.now() + 2 },
        { question: 'Any other error conditions?', timestamp: Date.now() + 3 },
        // Length is 4, still within maxCycles (5)
      ];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      // Should return DONE because categories are exhausted
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
    });
    
    it('edge-003: Should not throw AmbiguityError when history is long but diverse', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7,
        maxCycles: 10
      });
      
      const draft = createSpecDraft('TEST-003');
      // Cover all categories
      draft.entries = [
        {
          given: 'Authenticated user',
          when: 'When user performs action',
          then: 'Action completes',
          sourceAnswer: 'User performs action successfully',
          timestamp: Date.now()
        },
        {
          given: 'Unauthorized access attempt',
          when: 'When user lacks permission',
          then: 'Access denied with error',
          sourceAnswer: 'System denies unauthorized access',
          timestamp: Date.now()
        },
        {
          given: 'Maximum input size',
          when: 'When input exceeds limit',
          then: 'Input is rejected',
          sourceAnswer: 'Edge case: max input size triggers rejection',
          timestamp: Date.now()
        }
      ];
      
      // Diverse questions - should NOT be detected as circular
      const history: QuestionHistory = [
        { question: 'What is the primary success scenario?', timestamp: Date.now() },
        { question: 'How should authentication failures be handled?', timestamp: Date.now() + 1 },
        { question: 'What about boundary conditions for input size?', timestamp: Date.now() + 2 },
        { question: 'Are there any timeout scenarios?', timestamp: Date.now() + 3 },
        { question: 'What about concurrent access patterns?', timestamp: Date.now() + 4 },
        { question: 'How does the system handle retries?', timestamp: Date.now() + 5 }
      ];
      
      // Should NOT throw - diverse questions are not circular
      expect(() => interrogator.evaluateCoverageWithHistory(draft, history)).not.toThrow(AmbiguityError);
    });
    
  });
  
  describe('Edge case: Empty required categories', () => {
    
    it('edge-003: Should return DONE when requiredCategories is empty', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      const history: QuestionHistory = [
        { question: 'Some question', timestamp: Date.now() }
      ];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
      expect(result.missingCategories).toEqual([]);
    });
    
    it('edge-003: Should return DONE with empty draft when no categories required', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      // Empty entries
      draft.entries = [];
      
      const history: QuestionHistory = [
        { question: 'First question', timestamp: Date.now() },
        { question: 'Second question', timestamp: Date.now() + 1 }
      ];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
      expect(result.draft?.entries).toEqual([]);
    });
    
  });
  
  describe('Contrast with incomplete exploration', () => {
    
    it('edge-003: Should return FOLLOW_UP when categories are NOT exhausted', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      // Only covering happy_path - missing error_handling and edge_case
      draft.entries = [
        {
          given: 'Valid user',
          when: 'When user logs in',
          then: 'Login succeeds',
          sourceAnswer: 'Happy path: valid user can log in',
          timestamp: Date.now()
        }
      ];
      
      const history: QuestionHistory = [
        { question: 'What is the happy path?', timestamp: Date.now() }
      ];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      // Should NOT return DONE - categories not exhausted
      expect(result.signal).toBe('FOLLOW_UP');
      expect(result.isComplete).toBe(false);
      expect(result.missingCategories).toContain('error_handling');
      expect(result.missingCategories).toContain('edge_case');
    });
    
    it('edge-003: Should identify specific missing categories', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      // Only covering happy_path
      draft.entries = [
        {
          given: 'User with valid credentials',
          when: 'When user authenticates',
          then: 'Access granted',
          sourceAnswer: 'Given valid credentials, when user authenticates, then access is granted',
          timestamp: Date.now()
        }
      ];
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.missingCategories).toContain('error_handling');
      expect(result.missingCategories).not.toContain('happy_path');
    });
    
  });
  
  describe('Keyword detection edge cases', () => {
    
    it('edge-003: Should detect categories via category name in text', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      // Entries that explicitly mention category names
      draft.entries = [
        {
          given: '',
          when: 'When describing happy_path',
          then: 'Mention it explicitly',
          sourceAnswer: 'happy_path is covered',
          timestamp: Date.now()
        },
        {
          given: '',
          when: 'When discussing error_handling',
          then: 'Mention it explicitly',
          sourceAnswer: 'error_handling is important',
          timestamp: Date.now()
        },
        {
          given: '',
          when: 'When considering edge_case',
          then: 'Mention it explicitly',
          sourceAnswer: 'edge_case scenarios matter',
          timestamp: Date.now()
        }
      ];
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.missingCategories).toEqual([]);
    });
    
    it('edge-003: Should handle entries with no given clause', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      draft.entries = [
        {
          given: '',
          when: 'When action succeeds',
          then: 'Success message displayed',
          sourceAnswer: 'Success path: action succeeds, success message',
          timestamp: Date.now()
        },
        {
          given: '',
          when: 'When action fails',
          then: 'Error message displayed',
          sourceAnswer: 'Error handling: action fails, error message',
          timestamp: Date.now()
        }
      ];
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
  });
  
  describe('Max cycles boundary', () => {
    
    it('edge-003: Should throw AmbiguityError when maxCycles exceeded', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7,
        maxCycles: 3
      });
      
      const draft = createSpecDraft('TEST-003');
      // Still have missing categories
      draft.entries = [
        {
          given: 'Valid input',
          when: 'When processed',
          then: 'Success',
          sourceAnswer: 'Valid input processing',
          timestamp: Date.now()
        }
      ];
      
      // History exceeds maxCycles
      const history: QuestionHistory = [
        { question: 'Q1', timestamp: Date.now() },
        { question: 'Q2', timestamp: Date.now() + 1 },
        { question: 'Q3', timestamp: Date.now() + 2 },
        { question: 'Q4', timestamp: Date.now() + 3 },  // > maxCycles
      ];
      
      expect(() => interrogator.evaluateCoverageWithHistory(draft, history))
        .toThrow(AmbiguityError);
    });
    
    it('edge-003: Should NOT throw when history equals maxCycles (not exceeds)', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7,
        maxCycles: 3
      });
      
      const draft = createSpecDraft('TEST-003');
      draft.entries = [
        {
          given: 'Valid',
          when: 'When valid',
          then: 'Success',
          sourceAnswer: 'Happy path with valid input',
          timestamp: Date.now()
        }
      ];
      
      // History length = maxCycles, not exceeding
      const history: QuestionHistory = [
        { question: 'Q1', timestamp: Date.now() },
        { question: 'Q2', timestamp: Date.now() + 1 },
        { question: 'Q3', timestamp: Date.now() + 2 },  // length = 3, maxCycles = 3
      ];
      
      // Should NOT throw - exactly at maxCycles is allowed
      expect(() => interrogator.evaluateCoverageWithHistory(draft, history)).not.toThrow();
    });
    
    it('edge-003: Should return DONE at maxCycles boundary when categories exhausted', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7,
        maxCycles: 2
      });
      
      const draft = createSpecDraft('TEST-003');
      // All categories covered
      draft.entries = [
        {
          given: 'Valid',
          when: 'When valid',
          then: 'Success',
          sourceAnswer: 'Happy path success',
          timestamp: Date.now()
        },
        {
          given: 'Invalid',
          when: 'When invalid',
          then: 'Fail',
          sourceAnswer: 'Error handling for invalid',
          timestamp: Date.now()
        }
      ];
      
      // History exactly at maxCycles
      const history: QuestionHistory = [
        { question: 'Happy path question', timestamp: Date.now() },
        { question: 'Error handling question', timestamp: Date.now() + 1 }
      ];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
    });
    
  });
  
  describe('Coverage result structure', () => {
    
    it('edge-003: Should return proper CoverageResult with DONE signal', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      draft.entries = [
        {
          given: 'Valid',
          when: 'When valid',
          then: 'Success',
          sourceAnswer: 'Happy path coverage',
          timestamp: Date.now()
        }
      ];
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result).toBeDefined();
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
      expect(result.draft).toBeDefined();
      expect(result.missingCategories).toEqual([]);
      expect(result.followUpQuestion).toBeUndefined();
    });
    
    it('edge-003: Should include draft in DONE result', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-003');
      draft.entries = [
        {
          given: 'Some',
          when: 'When some',
          then: 'Then some',
          sourceAnswer: 'Some content',
          timestamp: Date.now()
        }
      ];
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.draft).toBe(draft);
    });
    
  });
  
});
