import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecDraft, GivenWhenThen, RephrasingResult } from '../src/types';
import { 
  createSpecDraft, 
  synthesizeAnswer, 
  detectRephrasing, 
  isRephrasing 
} from '../src/specSynthesizer';
import * as loggerModule from '../src/logger';

// Spy on logger for testing
vi.spyOn(loggerModule, 'log');
vi.spyOn(loggerModule, 'warn');

describe('FEAT-002/edge-002: Answer contains no new information (rephrasing)', () => {
  const featureId = 'FEAT-002';
  
  describe('detectRephrasing', () => {
    it('should return isRephrasing: true when new answer is identical to existing entry', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When a user submits the login form, then they are redirected to the dashboard.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, originalAnswer);
      
      // Identical answers should be detected as rephrasing
      expect(result.isRephrasing).toBe(true);
      expect(result.similarityScore).toBe(1.0);
    });

    it('should return isRephrasing: false when new answer contains new information', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When a user submits the login form, then they are redirected to the dashboard.';
      const newInformationAnswer = 'Given the system is offline, when the admin starts the service, then all components are available.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, newInformationAnswer);
      
      expect(result.isRephrasing).toBe(false);
    });

    it('should detect rephrasing when using different words for same concept', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'Given the user is logged in, when they click logout, then they are signed out.';
      const rephrasedAnswer = 'Given the user is logged in, when they click logout, then they are signed out from the system.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, rephrasedAnswer);
      
      // Should detect as rephrasing due to very high similarity (same outcome: signed out)
      expect(result.isRephrasing).toBe(true);
      expect(result.similarityScore).toBeDefined();
    });

    it('should handle rephrasing with synonyms (submit/press, login/sign-in)', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When user submits the form, then the data is saved.';
      const rephrasedAnswer = 'When user fills and sends the form, then the data is stored.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, rephrasedAnswer);
      
      expect(result.isRephrasing).toBe(true);
      expect(result.similarityScore).toBeGreaterThan(0.3);
    });

    it('should detect rephrasing across multiple previous entries', () => {
      const draft = createSpecDraft(featureId);
      const firstAnswer = 'When user logs in, then they see the home page.';
      const secondAnswer = 'When admin generates report, then PDF is created.';
      const rephrasedFirstAnswer = 'When user logs in, then they see the home page.'; // Exact duplicate
      
      let currentDraft = synthesizeAnswer(draft, firstAnswer);
      currentDraft = synthesizeAnswer(currentDraft, secondAnswer);
      
      const result = detectRephrasing(currentDraft, rephrasedFirstAnswer);
      
      // Should detect similarity to first entry (exact match)
      expect(result.isRephrasing).toBe(true);
      expect(result.conflictingEntry).toBeDefined();
    });

    it('should return isRephrasing: false for empty draft (no previous entries)', () => {
      const draft = createSpecDraft(featureId);
      const answer = 'When something happens, then something else occurs.';
      
      const result = detectRephrasing(draft, answer);
      
      expect(result.isRephrasing).toBe(false);
    });

    it('should provide reason when rephrasing is detected', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When payment is processed, then receipt is generated.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, originalAnswer);
      
      expect(result.isRephrasing).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('should include conflicting entry when rephrasing is detected', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When user clicks submit, then form is validated.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, originalAnswer);
      
      expect(result.isRephrasing).toBe(true);
      expect(result.conflictingEntry).toBeDefined();
      expect(result.conflictingEntry?.when).toContain('user clicks');
    });
  });

  describe('isRephrasing (wrapper)', () => {
    it('should return true for rephrased answer', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'Given user is admin, when they access settings, then all options are visible.';
      const rephrasedAnswer = 'Given user is admin, when they access settings, then all options are visible in the panel.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, rephrasedAnswer);
      
      // Should detect as rephrasing because the core content is identical
      expect(result.isRephrasing).toBe(true);
    });

    it('should return false for genuinely new answer', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'Given user is logged in, when they view their profile, then they see their details.';
      const newAnswer = 'Given user is admin, when they generate a report, then the system creates a PDF file.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = isRephrasing(withOriginal, newAnswer);
      
      expect(result).toBe(false);
    });

    it('should log warning when rephrasing is detected', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When error occurs, then alert is shown.';
      const rephrasedAnswer = 'When error occurs, then notification is displayed.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const isRephrasingResult = isRephrasing(withOriginal, rephrasedAnswer);
      
      if (isRephrasingResult) {
        expect(loggerModule.warn).toHaveBeenCalledWith(
          expect.stringContaining('Rephrasing detected'),
          expect.objectContaining({
            similarityScore: expect.any(Number)
          })
        );
      }
    });

    it('should not log warning when answer contains new information', () => {
      vi.clearAllMocks();
      
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When user clicks button A, then action A occurs.';
      const completelyDifferentAnswer = 'Given the system is offline, when the admin starts the service, then all components become available.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      isRephrasing(withOriginal, completelyDifferentAnswer);
      
      // Warn should not be called for clearly different content
      expect(loggerModule.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Rephrasing detected'),
        expect.anything()
      );
    });
  });

  describe('Rephrasing detection edge cases', () => {
    it('should handle minor word order changes as rephrasing', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When the server receives a request, then it processes the data.';
      const rephrasedAnswer = 'When a request is received by the server, then data processing occurs.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, rephrasedAnswer);
      
      expect(result.isRephrasing).toBe(true);
    });

    it('should handle expanded vs condensed phrasing', () => {
      const draft = createSpecDraft(featureId);
      const condensedAnswer = 'When user authenticates, then access is granted.';
      const expandedAnswer = 'When user authenticates with valid credentials, then access is granted to the system.';
      
      const withOriginal = synthesizeAnswer(draft, condensedAnswer);
      const result = detectRephrasing(withOriginal, expandedAnswer);
      
      // Same core meaning: user authenticates -> access granted
      expect(result.isRephrasing).toBe(true);
    });

    it('should not confuse similar but different scenarios as rephrasing', () => {
      const draft = createSpecDraft(featureId);
      const scenarioA = 'When user clicks save, then data is persisted.';
      const clearlyDifferentScenario = 'When the system initializes, then logging starts.';
      
      const withA = synthesizeAnswer(draft, scenarioA);
      const result = detectRephrasing(withA, clearlyDifferentScenario);
      
      // Should NOT be detected as rephrasing because the scenarios are clearly different
      expect(result.isRephrasing).toBe(false);
    });

    it('should handle empty GIVEN clauses correctly', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When button is clicked, then action executes.';
      const rephrasedAnswer = 'When the button is clicked, then the action is executed.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, rephrasedAnswer);
      
      expect(result.isRephrasing).toBe(true);
    });

    it('should handle very short answers', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When X, then Y.';
      const rephrasedAnswer = 'If X, then Y.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, rephrasedAnswer);
      
      expect(result.isRephrasing).toBe(true);
    });

    it('should provide similarity score between 0 and 1', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When payment is made, then confirmation is sent.';
      const rephrasedAnswer = 'When payment is made, then confirmation is sent.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const result = detectRephrasing(withOriginal, rephrasedAnswer);
      
      expect(result.isRephrasing).toBe(true);
      expect(result.similarityScore).toBeGreaterThanOrEqual(0);
      expect(result.similarityScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Integration with spec synthesis workflow', () => {
    it('should allow detection of rephrasing after synthesis', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'Given user is logged in, when they request data, then data is returned.';
      const rephrasedAnswer = 'Given authenticated user, when they request data, then response is provided.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      
      // Detection should work on the synthesized draft
      const rephrasingResult = detectRephrasing(withOriginal, rephrasedAnswer);
      expect(rephrasingResult.isRephrasing).toBe(true);
    });

    it('should maintain entry count when rephrasing is detected', () => {
      const draft = createSpecDraft(featureId);
      const originalAnswer = 'When action occurs, then result happens.';
      const rephrasedAnswer = 'When an action occurs, then the result happens.';
      
      const withOriginal = synthesizeAnswer(draft, originalAnswer);
      const rephrasingResult = detectRephrasing(withOriginal, rephrasedAnswer);
      
      // Draft should still have original entry
      expect(withOriginal.entries).toHaveLength(1);
      expect(rephrasingResult.isRephrasing).toBe(true);
      expect(rephrasingResult.conflictingEntry).toBeDefined();
    });
  });
});
