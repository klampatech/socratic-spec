import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  Interrogator, 
  createInterrogator, 
  DONE_SIGNAL,
  CoverageResult 
} from '../src/interrogator';
import { SpecDraft, createSpecDraft } from '../src/specSynthesizer';

describe('FEAT-001/edge-001: Interrogator returns DONE on first round (trivial spec)', () => {
  
  /**
   * Edge Case: Interrogator returns DONE on first round (trivial spec)
   * 
   * This edge case tests that when given a trivial/empty feature context,
   * the Interrogator immediately signals DONE without asking any questions.
   * 
   * From acceptance criteria: "Given an empty feature context, When the orchestrator runs, 
   * Then DONE is returned immediately with empty spec draft"
   */

  describe('AC: Trivial spec returns DONE immediately', () => {
    
    it('should return DONE when requiredCategories is empty array', () => {
      // Create interrogator with no required categories (trivial spec)
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      // Create an empty spec draft
      const draft = createSpecDraft('TRIVIAL-001');
      
      // Evaluate coverage - should return DONE immediately
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
      expect(result.missingCategories).toEqual([]);
      expect(result.followUpQuestion).toBeUndefined();
    });
    
    it('should return DONE on first round with empty spec draft', () => {
      // Create interrogator for trivial feature
      const interrogator = createInterrogator({
        requiredCategories: [],
        maxCycles: 10,
        similarityThreshold: 0.7
      });
      
      // Empty spec draft - nothing has been explored yet
      const draft = createSpecDraft('TRIVIAL-002');
      
      // First evaluation should immediately return DONE
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.isComplete).toBe(true);
    });
    
    it('should return DONE with empty spec draft (no entries)', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      // Draft with no entries
      const draft: SpecDraft = {
        entries: [],
        featureId: 'EMPTY-DRAFT',
        lastUpdated: Date.now()
      };
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.signal).toBe(DONE_SIGNAL);
      expect(result.draft).toBeDefined();
      expect(result.draft!.entries).toEqual([]);
    });
    
    it('should not generate a follow-up question for trivial spec', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TRIVIAL-003');
      const result = interrogator.evaluateCoverage(draft);
      
      // Should NOT have a follow-up question
      expect(result.followUpQuestion).toBeUndefined();
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
    it('should indicate no missing categories for trivial spec', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TRIVIAL-004');
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.missingCategories).toEqual([]);
    });
    
  });
  
  describe('Contrast: Non-trivial spec should NOT return DONE immediately', () => {
    
    it('should return FOLLOW_UP when categories are not empty', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('NON-TRIVIAL-001');
      const result = interrogator.evaluateCoverage(draft);
      
      // Should NOT return DONE - needs to explore categories
      expect(result.signal).not.toBe(DONE_SIGNAL);
      expect(result.followUpQuestion).toBeDefined();
    });
    
    it('should ask follow-up question when categories are missing', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('NON-TRIVIAL-002');
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.signal).toBe('FOLLOW_UP');
      expect(result.followUpQuestion).toContain('happy path');
      expect(result.missingCategories).toContain('happy_path');
    });
    
  });
  
  describe('isFullyExplored() for trivial specs', () => {
    
    it('should return true when requiredCategories is empty', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      expect(interrogator.isFullyExplored()).toBe(true);
    });
    
    it('should return false when requiredCategories has items', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      expect(interrogator.isFullyExplored()).toBe(false);
    });
    
  });
  
  describe('evaluateCoverageWithHistory on first round', () => {
    
    it('should return DONE on first round with empty history', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('FIRST-ROUND-001');
      const emptyHistory: QuestionHistory = [];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, emptyHistory);
      
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
    it('should return DONE on first round with single question history', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('FIRST-ROUND-002');
      const history: QuestionHistory = [
        { question: 'What is the feature?', timestamp: Date.now() }
      ];
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
  });

});

// Import for type checking
import { QuestionHistory } from '../src/interrogator';
