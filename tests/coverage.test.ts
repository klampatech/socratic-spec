import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  Interrogator, 
  CoverageResult, 
  QuestionHistory,
  DONE_SIGNAL,
  AmbiguityError
} from '../src/interrogator.js';
import { SpecDraft, GivenWhenThen } from '../src/types.js';
import { createSpecDraft } from '../src/specSynthesizer.js';

/**
 * Helper to create a spec draft with specific Given/When/Then content
 */
function createDraftWithContent(featureId: string, entries: Partial<GivenWhenThen>[]): SpecDraft {
  return {
    featureId,
    entries: entries.map(e => ({
      given: e.given || '',
      when: e.when || '',
      then: e.then || '',
      sourceAnswer: e.sourceAnswer || `${e.given} ${e.when} ${e.then}`,
      timestamp: Date.now()
    })),
    lastUpdated: Date.now()
  };
}

describe('FEAT-003: DONE signal generation when Interrogator determines all critical unknowns have been explored', () => {
  
  describe('AC-007: Given all feature categories have been explored, When the Interrogator evaluates coverage, Then DONE is returned with final spec draft', () => {
    
    it('should return DONE when all required feature categories have been explored', () => {
      // Given a spec draft with entries covering all critical categories
      const categories = ['authentication', 'data-validation', 'error-handling', 'user-interface'];
      const interrogator = new Interrogator({ 
        requiredCategories: categories,
        maxCycles: 10 
      });
      
      // Create spec draft with content covering all categories
      const draft = createDraftWithContent('FEAT-TEST', [
        { given: 'user authenticated', when: 'request login', then: 'token granted', sourceAnswer: 'authentication handled' },
        { given: 'data received', when: 'validation runs', then: 'format checked', sourceAnswer: 'data-validation implemented' },
        { given: 'error occurs', when: 'exception thrown', then: 'handled gracefully', sourceAnswer: 'error-handling done' },
        { given: 'user clicks button', when: 'ui renders', then: 'display updates', sourceAnswer: 'user-interface working' }
      ]);
      
      // When we evaluate coverage after all categories explored
      const result = interrogator.evaluateCoverage(draft);
      
      // Then DONE should be returned
      expect(result.isComplete).toBe(true);
      expect(result.draft).toBeDefined();
    });
    
    it('should include final spec draft when DONE is returned', () => {
      const categories = ['core-functionality'];
      const interrogator = new Interrogator({ 
        requiredCategories: categories,
        maxCycles: 5 
      });
      
      const draft = createDraftWithContent('FINAL-TEST', [
        { given: 'system active', when: 'request comes', then: 'response sent', sourceAnswer: 'core functionality works' }
      ]);
      
      const coverageResult = interrogator.evaluateCoverage(draft);
      
      expect(coverageResult.draft).toBeDefined();
      expect(coverageResult.draft.featureId).toBe('FINAL-TEST');
    });
    
    it('should detect DONE is present in coverage result signal', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['authentication'], // One category to cover
        maxCycles: 5 
      });
      
      const draft = createDraftWithContent('TEST', [
        { given: 'user exists', when: 'login attempted', then: 'access granted', sourceAnswer: 'authentication flow implemented' }
      ]);
      
      const result = interrogator.evaluateCoverage(draft);
      
      // DONE signal should be present in the output
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
    it('should return DONE immediately when required categories is empty', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: [],  // Empty = trivially complete
        maxCycles: 5 
      });
      
      const draft = createSpecDraft('TRIVIAL');
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.isComplete).toBe(true);
      expect(result.signal).toBe(DONE_SIGNAL);
    });
  });
  
  describe('AC-008: Given incomplete exploration, When the Interrogator evaluates, Then a follow-up question is returned', () => {
    
    it('should return follow-up question when categories remain unexplored', () => {
      const requiredCategories = ['auth', 'data', 'ui'];
      const interrogator = new Interrogator({ 
        requiredCategories,
        maxCycles: 10 
      });
      
      // Create draft with incomplete coverage (only one category explored)
      const draft = createDraftWithContent('INCOMPLETE', [
        { given: 'user logged in', when: 'request made', then: 'authorized', sourceAnswer: 'only auth covered' }
      ]);
      
      const result = interrogator.evaluateCoverage(draft);
      
      // Should NOT be complete
      expect(result.isComplete).toBe(false);
      // Should have a follow-up question
      expect(result.followUpQuestion).toBeDefined();
      expect(result.followUpQuestion!.length).toBeGreaterThan(0);
    });
    
    it('should ask specific question about missing category', () => {
      const requiredCategories = ['authentication', 'authorization'];
      const interrogator = new Interrogator({ 
        requiredCategories,
        maxCycles: 10 
      });
      
      const draft = createDraftWithContent('PARTIAL', [
        { given: 'user exists', when: 'login attempted', then: 'token issued', sourceAnswer: 'authentication: login flow' }
      ]);
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.isComplete).toBe(false);
      expect(result.followUpQuestion).toContain('authorization');
    });
    
    it('should track which categories have been explored via spec draft content', () => {
      const requiredCategories = ['auth', 'validation', 'error-handling'];
      const interrogator = new Interrogator({ 
        requiredCategories,
        maxCycles: 10 
      });
      
      // Create draft with entries mentioning categories
      const draft = createDraftWithContent('TEST', [
        { given: 'user is authenticated', when: 'request is made', then: 'validation occurs', sourceAnswer: 'About auth and validation' }
      ]);
      
      const result = interrogator.evaluateCoverage(draft);
      
      // Should still need follow-up since not all categories covered
      expect(result.isComplete).toBe(false);
      expect(result.missingCategories).toContain('error-handling');
    });
    
    it('should return follow-up when spec draft is empty', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['core'],
        maxCycles: 5 
      });
      
      const draft = createSpecDraft('EMPTY');
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.isComplete).toBe(false);
      expect(result.followUpQuestion).toBeDefined();
      expect(result.missingCategories).toContain('core');
    });
  });
  
  describe('AC-009: Given circular question detection, When the Interrogator loops, Then the process terminates with ambiguity error', () => {
    
    it('should detect exact circular question patterns', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 10 
      });
      
      // Simulate repeated exact questions
      const history: QuestionHistory = [
        { question: 'What about authentication?', timestamp: Date.now() - 200 },
        { question: 'What about authentication?', timestamp: Date.now() - 100 },
        { question: 'What about authentication?', timestamp: Date.now() }
      ];
      
      const hasCircular = interrogator.detectCircularPattern(history);
      
      expect(hasCircular).toBe(true);
    });
    
    it('should detect similar question patterns (A-B-A)', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 10 
      });
      
      // Simulate A-B-A pattern (circular)
      const history: QuestionHistory = [
        { question: 'Q1 about feature?', timestamp: Date.now() - 300 },
        { question: 'Q2 about feature?', timestamp: Date.now() - 200 },
        { question: 'Q1 about feature?', timestamp: Date.now() - 100 }
      ];
      
      const hasCircular = interrogator.detectCircularPattern(history);
      
      expect(hasCircular).toBe(true);
    });
    
    it('should throw AmbiguityError when circular pattern detected', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 3 
      });
      
      const history: QuestionHistory = [
        { question: 'A', timestamp: Date.now() - 300 },
        { question: 'B', timestamp: Date.now() - 200 },
        { question: 'A', timestamp: Date.now() - 100 }
      ];
      
      expect(() => {
        interrogator.evaluateCoverageWithHistory(createSpecDraft('TEST'), history);
      }).toThrow(AmbiguityError);
    });
    
    it('should terminate process with ambiguity error when looping detected', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 2 
      });
      
      // Exact repeated questions (triggers circular detection)
      const history: QuestionHistory = [
        { question: 'Same question', timestamp: Date.now() - 300 },
        { question: 'Same question', timestamp: Date.now() - 200 },
        { question: 'Same question', timestamp: Date.now() - 100 }
      ];
      
      const draft = createSpecDraft('LOOP');
      
      // Should throw ambiguity error
      expect(() => {
        interrogator.evaluateCoverageWithHistory(draft, history);
      }).toThrow(AmbiguityError);
    });
    
    it('should not flag non-repeating questions as circular', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 10 
      });
      
      const history: QuestionHistory = [
        { question: 'What is the input format?', timestamp: Date.now() - 300 },
        { question: 'How is output validated?', timestamp: Date.now() - 200 },
        { question: 'What are the error conditions?', timestamp: Date.now() - 100 }
      ];
      
      const hasCircular = interrogator.detectCircularPattern(history);
      
      expect(hasCircular).toBe(false);
    });
    
    it('should detect similarity-based circular patterns with configurable threshold', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 5,
        similarityThreshold: 0.8 // Higher threshold for exact duplicate detection
      });
      
      // Questions with exact repeat (similarity = 1.0)
      const history: QuestionHistory = [
        { question: 'What error handling is needed?', timestamp: Date.now() - 300 },
        { question: 'What error handling is needed?', timestamp: Date.now() - 200 },
        { question: 'What error handling is needed?', timestamp: Date.now() - 100 }
      ];
      
      const hasCircular = interrogator.detectCircularPattern(history);
      
      expect(hasCircular).toBe(true);
    });
  });
  
  describe('Edge Cases for FEAT-003', () => {
    
    it('should handle no questions asked yet but DONE returned (trivial spec)', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: [], // Empty = trivially complete
        maxCycles: 10 
      });
      
      const draft = createSpecDraft('TRIVIAL');
      // No entries in draft
      
      const result = interrogator.evaluateCoverage(draft);
      
      // With no required categories, DONE is valid even with no questions
      expect(result.isComplete).toBe(true);
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
    it('should handle max unknown categories exhausted', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['a', 'b', 'c'],
        maxCycles: 3 // Force exhaustion
      });
      
      // History with 3 entries = maxCycles, should still work (< not >)
      const history: QuestionHistory = [
        { question: 'Q1', timestamp: Date.now() - 300 },
        { question: 'Q2', timestamp: Date.now() - 200 },
        { question: 'Q3', timestamp: Date.now() - 100 }
      ];
      
      // When max cycles not exceeded, should evaluate normally
      const draft = createDraftWithContent('EXHAUSTED', [
        { given: 'a covered', when: 'checking', then: 'ok', sourceAnswer: 'category a done' }
      ]);
      
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      
      // Should handle gracefully - either DONE or question about remaining
      expect(result.signal).toBeDefined();
    });
    
    it('should maintain question history across rounds', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 5 
      });
      
      const history1: QuestionHistory = [
        { question: 'First question?', timestamp: Date.now() }
      ];
      
      const draft = createSpecDraft('MULTI');
      const result1 = interrogator.evaluateCoverageWithHistory(draft, history1);
      
      // Continue with extended history
      const history2: QuestionHistory = [
        ...history1,
        { question: 'Answer to first', timestamp: Date.now() + 100 },
        { question: 'Second question?', timestamp: Date.now() + 200 }
      ];
      
      const result2 = interrogator.evaluateCoverageWithHistory(draft, history2);
      
      expect(result2).toBeDefined();
    });
    
    it('should gracefully handle malformed spec draft entries', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['test'],
        maxCycles: 5 
      });
      
      // Draft with unparseable entries
      const draft: SpecDraft = {
        featureId: 'MALFORMED',
        entries: [
          {
            given: '',
            when: '(unparseable)',
            then: '(unparseable)',
            sourceAnswer: '',
            timestamp: Date.now()
          }
        ],
        lastUpdated: Date.now()
      };
      
      const result = interrogator.evaluateCoverage(draft);
      
      // Should still evaluate properly despite malformed entry
      expect(result).toBeDefined();
      expect(result.missingCategories).toContain('test');
    });
  });
  
  describe('Coverage Evaluation Integration', () => {
    
    it('should integrate with spec draft synthesis workflow', () => {
      const interrogator = new Interrogator({ 
        requiredCategories: ['happy_path', 'error_handling'],
        maxCycles: 10 
      });
      
      // Simulate synthesis workflow
      let draft = createSpecDraft('INTEGRATION');
      
      // First round - add auth entry
      draft = {
        ...draft,
        entries: [{
          given: 'user exists',
          when: 'login attempted',
          then: 'credentials validated',
          sourceAnswer: 'Auth flow: given user exists, when login attempted, then credentials validated',
          timestamp: Date.now()
        }]
      };
      
      // Check coverage after first entry
      let result = interrogator.evaluateCoverage(draft);
      expect(result.isComplete).toBe(false);
      
      // Second round - add error handling entry
      draft = {
        ...draft,
        entries: [
          ...draft.entries,
          {
            given: 'error occurs',
            when: 'exception thrown',
            then: 'handled gracefully',
            sourceAnswer: 'Error handling: given error occurs, when exception thrown, then handled gracefully',
            timestamp: Date.now()
          }
        ]
      };
      
      // Check coverage after second entry
      result = interrogator.evaluateCoverage(draft);
      
      // With both categories covered, should complete
      expect(result.signal).toBe(DONE_SIGNAL);
    });
    
    it('should determine follow-up question content based on missing categories', () => {
      const categories = ['happy_path', 'error_handling', 'edge_case'];
      const interrogator = new Interrogator({ 
        requiredCategories: categories,
        maxCycles: 10 
      });
      
      const draft = createSpecDraft('PARTIAL');
      
      const result = interrogator.evaluateCoverage(draft);
      
      expect(result.missingCategories.length).toBe(categories.length);
      expect(result.followUpQuestion).toBeDefined();
    });
  });
});
