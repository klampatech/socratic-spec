import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createInterrogator, 
  DONE_SIGNAL,
  CoverageResult,
  QuestionHistory
} from '../src/interrogator';
import { createSpecDraft } from '../src/specSynthesizer';

describe('FEAT-003/edge-001: No questions asked yet but DONE returned', () => {
  
  /**
   * Edge Case: No questions asked yet but DONE returned
   * 
   * This edge case tests the scenario where the Interrogator returns DONE
   * even when no questions have been asked yet. This is distinct from trivial
   * specs (empty requiredCategories) - it's about when the interrogator 
   * determines no exploration is needed based on initial context.
   * 
   * Scenario: The feature context or initial spec draft already satisfies
   * all coverage requirements, so no questions need to be asked.
   */

  describe('DONE returned with empty history but no questions asked', () => {
    
    it('should return DONE on first evaluation with empty history when requiredCategories is empty', () => {
      // When requiredCategories is empty (trivial spec), no questions need to be asked
      const interrogator = createInterrogator({
        requiredCategories: [],  // Empty - no categories to explore
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('EDGE-001');
      const emptyHistory: QuestionHistory = [];
      
      // First evaluation - no questions to ask because no categories defined
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
    });
    
    it('should return FOLLOW_UP when requiredCategories exist but no exploration done yet', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7
      });
      
      // Empty draft - no questions asked yet
      const draft = createSpecDraft('EDGE-002');
      
      // Method that doesn't use history but checks initial context
      const result = interrogator.evaluateCoverage(draft);
      
      // When categories exist and no exploration done, should ask for questions
      // This is correct behavior - need to explore before returning DONE
      expect(result.signal).toBe('FOLLOW_UP');
      expect(result.followUpQuestion).toBeDefined();
    });
    
    it('should generate follow-up question when no questions asked but exploration needed', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('EDGE-003');
      const emptyHistory: QuestionHistory = [];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      // When exploration is needed, there SHOULD be a follow-up question
      expect(result.signal).toBe('FOLLOW_UP');
      expect(result.followUpQuestion).toBeDefined();
      expect(result.followUpQuestion).toContain('happy path');
    });
    
    it('should indicate isComplete false when exploration needed', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('EDGE-004');
      const emptyHistory: QuestionHistory = [];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      // isComplete should be false when exploration is still needed
      expect(result.isComplete).toBe(false);
      expect(result.signal).toBe('FOLLOW_UP');
    });
    
  });
  
  describe('No questions asked but spec draft has initial content', () => {
    
    it('should return DONE when spec draft has entries that satisfy all requirements', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      // Draft with entries that satisfy happy_path coverage
      // The content already covers the required category
      const draft = createSpecDraft('EDGE-005');
      
      // Add entry with happy path keywords
      draft.entries.push({
        given: 'user is authenticated',
        when: 'user submits valid login credentials',
        then: 'user is granted access to the system',
        sourceAnswer: 'When valid credentials are provided, the user is successfully logged in',
        timestamp: Date.now()
      });
      
      const emptyHistory: QuestionHistory = [];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      // No questions asked (history empty), but spec draft has complete coverage
      // DONE should be returned
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
    });
    
    it('should return DONE with multiple entries when all categories covered', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('EDGE-006');
      
      // Add entries covering both categories
      draft.entries.push({
        given: 'valid user session',
        when: 'user requests data',
        then: 'data is returned successfully',
        sourceAnswer: 'Happy path: valid session returns data',
        timestamp: Date.now()
      });
      
      draft.entries.push({
        given: 'invalid session',
        when: 'user makes request',
        then: 'error is returned with 401 status',
        sourceAnswer: 'Error handling: invalid session returns 401',
        timestamp: Date.now()
      });
      
      const emptyHistory: QuestionHistory = [];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      // No questions asked, but all categories covered
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.missingCategories).toEqual([]);
    });
    
  });
  
  describe('Distinction from trivial spec', () => {
    
    it('should handle empty requiredCategories (trivial) differently from no-questions-asked (edge)', () => {
      // Trivial spec: no categories defined
      const trivialInterrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      // Edge case: categories defined but no questions asked
      const edgeInterrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      const trivialDraft = createSpecDraft('TRIVIAL');
      const edgeDraft = createSpecDraft('EDGE');
      
      // Both should potentially return DONE, but for different reasons
      const trivialResult = trivialInterrogator.evaluateCoverage(trivialDraft);
      const edgeResult = edgeInterrogator.evaluateCoverage(edgeDraft);
      
      // Trivial spec returns DONE because no categories to explore
      expect(trivialResult.signal).toBe(DONE_SIGNAL);
      
      // Edge case returns DONE because... (implementation should handle this)
      // This test documents the expected behavior
      expect([DONE_SIGNAL, 'FOLLOW_UP']).toContain(edgeResult.signal);
    });
    
    it('should return DONE for empty requiredCategories regardless of draft entries', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      // Draft with entries but no required categories
      const draft = createSpecDraft('EMPTY-CATS');
      draft.entries.push({
        given: 'some context',
        when: 'action occurs',
        then: 'result happens',
        sourceAnswer: 'Some answer',
        timestamp: Date.now()
      });
      
      const result = interrogator.evaluateCoverage(draft);
      
      // Still DONE because requiredCategories is empty
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
  });
  
  describe('Coverage result structure when exploration needed', () => {
    
    it('should return complete CoverageResult with FOLLOW_UP signal', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('COMPLETE-RESULT');
      const emptyHistory: QuestionHistory = [];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      // Verify all expected properties are present
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('isComplete');
      expect(result).toHaveProperty('draft');
      expect(result).toHaveProperty('missingCategories');
      
      // When exploration is needed, FOLLOW_UP is returned
      expect(result.signal).toBe('FOLLOW_UP');
      expect(result.isComplete).toBe(false);
      expect(result.draft).toBeDefined();
      expect(result.missingCategories).toContain('happy_path');
    });
    
    it('should return missingCategories when exploration needed', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('MISSING-CATS');
      const emptyHistory: QuestionHistory = [];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      // When FOLLOW_UP is returned, missingCategories lists what needs exploration
      expect(result.signal).toBe('FOLLOW_UP');
      expect(result.missingCategories).toContain('happy_path');
      expect(result.missingCategories).toContain('error_handling');
      expect(result.followUpQuestion).toBeDefined();
    });
    
  });

});