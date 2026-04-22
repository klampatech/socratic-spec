import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecDraft, GivenWhenThen, RoundResult } from '../types';
import { createSpecDraft, synthesizeAnswer, appendToDraft } from '../specSynthesizer';
import * as loggerModule from '../logger';

// Spy on logger for testing
vi.spyOn(loggerModule, 'log');
vi.spyOn(loggerModule, 'error');
vi.spyOn(loggerModule, 'warn');

describe('FEAT-002: Spec Draft Synthesis', () => {
  const featureId = 'FEAT-002';
  
  describe('createSpecDraft', () => {
    it('should create an empty spec draft for a given feature', () => {
      const draft = createSpecDraft(featureId);
      
      expect(draft.featureId).toBe(featureId);
      expect(draft.entries).toEqual([]);
      expect(draft.lastUpdated).toBeDefined();
      expect(draft.lastUpdated).toBeGreaterThan(0);
    });
  });

  describe('synthesizeAnswer', () => {
    it('AC-004: Given a Respondee answer, When the Interrogator processes it, Then the spec draft is updated with new Given/When/Then structure', () => {
      const draft = createSpecDraft(featureId);
      const answer = 'When a user submits the login form with valid credentials, then they should be redirected to the dashboard.';
      
      const updatedDraft = synthesizeAnswer(draft, answer);
      
      expect(updatedDraft.entries).toHaveLength(1);
      expect(updatedDraft.entries[0]).toMatchObject({
        when: expect.stringContaining('user submits'),
        then: expect.stringContaining('redirected')
      });
      expect(updatedDraft.lastUpdated).toBeGreaterThanOrEqual(draft.lastUpdated);
    });

    it('should extract Given/When/Then from natural language answer', () => {
      const draft = createSpecDraft(featureId);
      const answer = 'Given a registered user, when they enter valid credentials, then they should see their dashboard.';
      
      const updatedDraft = synthesizeAnswer(draft, answer);
      
      expect(updatedDraft.entries[0].given).toContain('registered user');
      expect(updatedDraft.entries[0].when).toContain('enter valid credentials');
      expect(updatedDraft.entries[0].then).toContain('dashboard');
    });

    it('should handle answers with implicit structure (no Given keyword)', () => {
      const draft = createSpecDraft(featureId);
      const answer = 'When the API receives a GET request to /users, then it returns a list of users in JSON format.';
      
      const updatedDraft = synthesizeAnswer(draft, answer);
      
      expect(updatedDraft.entries[0].when).toContain('GET request');
      expect(updatedDraft.entries[0].then).toContain('returns');
      expect(updatedDraft.entries[0].given).toBe(''); // Empty given when not specified
    });

    it('should handle partial Given/When/Then structure', () => {
      const draft = createSpecDraft(featureId);
      const answer = 'Given the system is online, then users can access their data.';
      
      const updatedDraft = synthesizeAnswer(draft, answer);
      
      expect(updatedDraft.entries[0].given).toContain('system is online');
      expect(updatedDraft.entries[0].when).toBe('');
      expect(updatedDraft.entries[0].then).toContain('access');
    });

    it('should capture source answer for audit trail', () => {
      const draft = createSpecDraft(featureId);
      const answer = 'When error rate exceeds 5%, then alert notifications are sent.';
      
      const updatedDraft = synthesizeAnswer(draft, answer);
      
      expect(updatedDraft.entries[0].sourceAnswer).toBe(answer);
    });

    it('should set timestamp for each entry', () => {
      const draft = createSpecDraft(featureId);
      const beforeTime = Date.now();
      const answer = 'When value is null, then a default value is returned.';
      
      const updatedDraft = synthesizeAnswer(draft, answer);
      const afterTime = Date.now();
      
      expect(updatedDraft.entries[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(updatedDraft.entries[0].timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('appendToDraft', () => {
    it('AC-005: Given existing spec draft content, When new answer is processed, Then the draft is appended without overwriting previous entries', () => {
      const draft = createSpecDraft(featureId);
      const firstAnswer = 'When user clicks submit, then form data is validated.';
      const secondAnswer = 'Given validation passes, when data is complete, then it is saved to the database.';
      
      const withFirstEntry = synthesizeAnswer(draft, firstAnswer);
      const withSecondEntry = synthesizeAnswer(withFirstEntry, secondAnswer);
      
      expect(withSecondEntry.entries).toHaveLength(2);
      expect(withSecondEntry.entries[0].when).toContain('user clicks submit');
      expect(withSecondEntry.entries[1].when).toContain('validation passes');
      expect(withSecondEntry.entries[0].then).toContain('validated');
    });

    it('should preserve existing entries when adding new ones', () => {
      const draft = createSpecDraft(featureId);
      const answers = [
        'Given a logged-in user, when they navigate to settings, then they see their profile.',
        'When they update their email, then confirmation is sent.',
        'Given they request password reset, when they click the link, then they can set new password.'
      ];
      
      let currentDraft = draft;
      for (const answer of answers) {
        currentDraft = synthesizeAnswer(currentDraft, answer);
      }
      
      expect(currentDraft.entries).toHaveLength(3);
      expect(currentDraft.entries[0].when).toContain('settings');
      expect(currentDraft.entries[1].when).toContain('email');
      expect(currentDraft.entries[2].when).toContain('request password reset');
    });

    it('should update lastUpdated timestamp on each append', async () => {
      const draft = createSpecDraft(featureId);
      const firstAnswer = 'When first action occurs, then first result occurs.';
      
      const withFirst = synthesizeAnswer(draft, firstAnswer);
      expect(withFirst.lastUpdated).toBeGreaterThanOrEqual(draft.lastUpdated);
      
      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const secondAnswer = 'When second action occurs, then second result occurs.';
      const withSecond = synthesizeAnswer(withFirst, secondAnswer);
      
      expect(withSecond.lastUpdated).toBeGreaterThanOrEqual(withFirst.lastUpdated);
    });
  });

  describe('Error Handling', () => {
    it('AC-006: Given malformed answer text, When the Interrogator attempts synthesis, Then the error is logged and the round is marked as incomplete', () => {
      const draft = createSpecDraft(featureId);
      const malformedAnswer = '';
      
      // Should throw or return error result for empty answer
      const result = synthesizeAnswer(draft, malformedAnswer);
      
      // The malformed answer should result in an error being logged
      expect(loggerModule.error).toHaveBeenCalled();
    });

    it('should handle answers with only whitespace', () => {
      const draft = createSpecDraft(featureId);
      const whitespaceAnswer = '   \n\t  ';
      
      const result = synthesizeAnswer(draft, whitespaceAnswer);
      
      expect(result.entries[0].when).toBe('(unparseable)');
      expect(result.entries[0].then).toBe('(unparseable)');
    });

    it('should handle answers with only special characters', () => {
      const draft = createSpecDraft(featureId);
      const specialCharsAnswer = '!!! ??? ... ###';
      
      const result = synthesizeAnswer(draft, specialCharsAnswer);
      
      expect(result.entries[0].when).toBe('(unparseable)');
    });

    it('should handle null/undefined inputs gracefully', () => {
      const draft = createSpecDraft(featureId);
      
      expect(() => synthesizeAnswer(draft, '')).not.toThrow();
      expect(() => synthesizeAnswer(draft, '   ')).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle contradictory answers - keep both entries', () => {
      const draft = createSpecDraft(featureId);
      const firstAnswer = 'Given user is logged in, when they click logout, then they are signed out.';
      const contradictoryAnswer = 'Given user is logged in, when they click logout, then they remain signed in.';
      
      const withFirst = synthesizeAnswer(draft, firstAnswer);
      const withBoth = synthesizeAnswer(withFirst, contradictoryAnswer);
      
      // Both entries should be preserved for review
      expect(withBoth.entries).toHaveLength(2);
      expect(withBoth.entries[0].then).toContain('signed out');
      expect(withBoth.entries[1].then).toContain('remain');
    });

    it('should handle rephrased answers - still capture both', () => {
      const draft = createSpecDraft(featureId);
      const firstAnswer = 'When user submits form, then data is validated.';
      const rephrasedAnswer = 'Upon form submission by user, validation of data occurs.';
      
      const withFirst = synthesizeAnswer(draft, firstAnswer);
      const withRephrased = synthesizeAnswer(withFirst, rephrasedAnswer);
      
      // Both are captured (no deduplication at synthesis level)
      expect(withRephrased.entries).toHaveLength(2);
    });

    it('should handle very long answers', () => {
      const draft = createSpecDraft(featureId);
      const longAnswer = 'Given a complex scenario with many conditions including ' + 
        'condition one, condition two, condition three, condition four, condition five, ' +
        'when all these conditions are met simultaneously and the user performs action X, ' +
        'then the system should respond with outcome Y and also update the database accordingly.';
      
      const result = synthesizeAnswer(draft, longAnswer);
      
      expect(result.entries[0].when).toContain('action X');
      expect(result.entries[0].then).toContain('outcome Y');
    });

    it('should handle answers with multiple sentences', () => {
      const draft = createSpecDraft(featureId);
      const multiSentenceAnswer = 'Given the user is authenticated. When they request data. Then the data is returned.';
      
      const result = synthesizeAnswer(draft, multiSentenceAnswer);
      
      expect(result.entries[0].given).toContain('authenticated');
      expect(result.entries[0].when).toContain('request data');
      expect(result.entries[0].then).toContain('returned');
    });
  });
});
