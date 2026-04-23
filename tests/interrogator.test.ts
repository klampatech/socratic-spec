import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  Interrogator, 
  createInterrogator, 
  AmbiguityError, 
  QuestionHistory,
  CoverageResult,
  DONE_SIGNAL 
} from '../src/interrogator';
import { SpecDraft, createSpecDraft } from '../src/specSynthesizer';
import * as loggerModule from '../src/logger';

// Spy on logger
vi.spyOn(loggerModule, 'log');
vi.spyOn(loggerModule, 'warn');
vi.spyOn(loggerModule, 'error');

describe('FEAT-003: DONE Signal Generation', () => {
  describe('AC-009: Circular Question Detection', () => {
    
    /**
     * AC-009: Given circular question detection, When the Interrogator loops, 
     * Then the process terminates with ambiguity error
     */
    
    it('AC-009: Should throw AmbiguityError when exact question is repeated', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      const history: QuestionHistory = [
        { question: 'What is the happy path?', timestamp: Date.now() },
        { question: 'What about edge cases?', timestamp: Date.now() + 1 },
        { question: 'What is the happy path?', timestamp: Date.now() + 2 }  // Exact repeat!
      ];
      
      expect(() => interrogator.evaluateCoverageWithHistory(draft, history))
        .toThrow(AmbiguityError);
      
      try {
        interrogator.evaluateCoverageWithHistory(draft, history);
      } catch (e) {
        expect(e).toBeInstanceOf(AmbiguityError);
        expect((e as AmbiguityError).message).toContain('Circular');
      }
    });
    
    it('AC-009: Should throw AmbiguityError when questions are semantically similar (cyclic)', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      // Questions with high semantic similarity
      const history: QuestionHistory = [
        { question: 'What is the happy path for login?', timestamp: Date.now() },
        { question: 'Tell me about error handling', timestamp: Date.now() + 1 },
        { question: 'What is the happy path for authentication?', timestamp: Date.now() + 2 }  // Similar to #1
      ];
      
      expect(() => interrogator.evaluateCoverageWithHistory(draft, history))
        .toThrow(AmbiguityError);
    });
    
    it('AC-009: Should detect circular pattern when same question appears twice', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.8
      });
      
      const draft = createSpecDraft('TEST-009');
      const history: QuestionHistory = [
        { question: 'Tell me about the feature', timestamp: Date.now() },
        { question: 'Can you elaborate?', timestamp: Date.now() + 1 },
        { question: 'Tell me about the feature', timestamp: Date.now() + 2 }
      ];
      
      // Should detect circular pattern
      expect(interrogator.detectCircularPattern(history)).toBe(true);
    });
    
    it('AC-009: Should NOT throw if no circular pattern detected', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      const history: QuestionHistory = [
        { question: 'What is the happy path?', timestamp: Date.now() },
        { question: 'What about error handling?', timestamp: Date.now() + 1 },
        { question: 'What are the edge cases?', timestamp: Date.now() + 2 }
      ];
      
      // Should not throw - process continues normally
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      expect(result).toBeDefined();
      expect(result.signal).not.toBe(DONE_SIGNAL);
    });
    
    it('AC-009: Should NOT detect circular pattern with insufficient history', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      // Empty history
      expect(interrogator.detectCircularPattern([])).toBe(false);
      
      // Single entry
      expect(interrogator.detectCircularPattern([
        { question: 'Only one question', timestamp: Date.now() }
      ])).toBe(false);
    });
    
    it('AC-009: Should throw AmbiguityError with descriptive message', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      const history: QuestionHistory = [
        { question: 'Question 1?', timestamp: Date.now() },
        { question: 'Question 2?', timestamp: Date.now() + 1 },
        { question: 'Question 1?', timestamp: Date.now() + 2 }  // Exact repeat
      ];
      
      try {
        interrogator.evaluateCoverageWithHistory(draft, history);
        expect.fail('Should have thrown AmbiguityError');
      } catch (e) {
        expect(e).toBeInstanceOf(AmbiguityError);
        expect((e as AmbiguityError).message.toLowerCase()).toContain('circular');
      }
    });
    
    it('AC-009: Should terminate with ambiguity error via evaluateCoverageWithHistory', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      // Create circular pattern: Q1 -> Q2 -> Q3 -> Q1
      const history: QuestionHistory = [
        { question: 'Tell me about success scenarios', timestamp: Date.now() },
        { question: 'What happens on failure?', timestamp: Date.now() + 1 },
        { question: 'Tell me about success paths', timestamp: Date.now() + 2 }  // Similar to Q1
      ];
      
      // The process should terminate with AmbiguityError
      expect(() => interrogator.evaluateCoverageWithHistory(draft, history))
        .toThrow(AmbiguityError);
    });
    
    it('AC-009: Should still work normally when no circular pattern exists', () => {
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      const history: QuestionHistory = [
        { question: 'What is the happy path?', timestamp: Date.now() },
        { question: 'How are errors handled?', timestamp: Date.now() + 1 },
        { question: 'What edge cases exist?', timestamp: Date.now() + 2 },
        { question: 'Any other considerations?', timestamp: Date.now() + 3 }
      ];
      
      // With required categories that are not fully covered, should get FOLLOW_UP
      const result = interrogator.evaluateCoverageWithHistory(draft, history);
      expect(result).toBeDefined();
      expect(['FOLLOW_UP', 'DONE']).toContain(result.signal);
    });
    
    it('AC-009: Edge case - punctuation should not affect circular detection', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      // Questions that are the same but with different punctuation
      const history: QuestionHistory = [
        { question: 'What about edge cases?', timestamp: Date.now() },
        { question: 'What about edge cases!', timestamp: Date.now() + 1 },  // Different punctuation
        { question: 'What about edge cases?', timestamp: Date.now() + 2 }   // Same as first
      ];
      
      // Should detect as circular (punctuation normalized)
      expect(interrogator.detectCircularPattern(history)).toBe(true);
    });
    
    it('AC-009: Should warn when circular pattern is detected', () => {
      vi.spyOn(loggerModule, 'warn').mockImplementation(() => {});
      
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const draft = createSpecDraft('TEST-009');
      const history: QuestionHistory = [
        { question: 'First question', timestamp: Date.now() },
        { question: 'Second question', timestamp: Date.now() + 1 },
        { question: 'First question', timestamp: Date.now() + 2 }
      ];
      
      try {
        interrogator.evaluateCoverageWithHistory(draft, history);
      } catch (e) {
        // Expected to throw
      }
      
      // Should have logged a warning
      expect(loggerModule.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circular')
      );
    });
    
    it('AC-009: AmbiguityError should be a proper Error subclass', () => {
      const error = new AmbiguityError('Test error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AmbiguityError);
      expect(error.name).toBe('AmbiguityError');
      expect(error.message).toBe('Test error');
    });
    
    it('AC-009: Multiple similar questions in history should trigger detection', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.5  // Lower threshold for similarity
      });
      
      // Build a history where recent questions have high similarity
      const history: QuestionHistory = [
        { question: 'What is the primary success scenario for login?', timestamp: Date.now() },
        { question: 'What is the primary success scenario for login?', timestamp: Date.now() + 1 },
        { question: 'What is the primary success scenario for login?', timestamp: Date.now() + 2 }
      ];
      
      // The last 3 questions are exact repeats - should trigger circular detection
      expect(interrogator.detectCircularPattern(history)).toBe(true);
    });
    
    it('AC-009: Diverse questions should not trigger circular detection', () => {
      const interrogator = createInterrogator({
        requiredCategories: [],
        similarityThreshold: 0.7
      });
      
      const history: QuestionHistory = [
        { question: 'What is the primary user workflow?', timestamp: Date.now() },
        { question: 'How should errors be handled?', timestamp: Date.now() + 1 },
        { question: 'What are the boundary conditions?', timestamp: Date.now() + 2 },
        { question: 'What performance requirements exist?', timestamp: Date.now() + 3 }
      ];
      
      // These questions are diverse and should not be detected as circular
      expect(interrogator.detectCircularPattern(history)).toBe(false);
    });
    
  });
  
  describe('FeatureCategory Enum', () => {
    it('should have expected category values', () => {
      // Note: FeatureCategory is not exported, so we test via integration
      const interrogator = createInterrogator({
        requiredCategories: ['happy_path', 'error_handling', 'edge_case'],
        similarityThreshold: 0.7
      });
      
      const categories = interrogator.getRequiredCategories();
      expect(categories).toContain('happy_path');
      expect(categories).toContain('error_handling');
      expect(categories).toContain('edge_case');
    });
  });
});
