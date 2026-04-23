/**
 * FEAT-002/edge-003: Answer is malformed or unparseable
 * 
 * Edge Case: When the Respondee's answer is malformed or cannot be parsed
 * into structured Given/When/Then format, the Interrogator must handle this
 * gracefully and mark the round as incomplete.
 * 
 * Acceptance Criteria:
 * AC-006: Given malformed answer text, When the Interrogator attempts synthesis,
 *         Then the error is logged and the round is marked as incomplete
 * 
 * This test suite validates the behavior when pi returns unparseable responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  Orchestrator, 
  OrchestratorConfig, 
  OrchestrationResult, 
  RoundResult,
  AgentRole 
} from '../src/orchestrator';

describe('FEAT-002/edge-003: Answer is malformed or unparseable', () => {
  
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });
  
  describe('AC-006: Error handling for malformed answers', () => {
    
    it('should log error when answer is empty string', async () => {
      const mockExecutor = async () => ({
        stdout: '',  // Empty answer
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // AC-006: Error should be logged for malformed answer
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls.some((call: unknown[]) => 
        String(call).toLowerCase().includes('malform')
      )).toBe(true);
    });
    
    it('should log error when answer is whitespace only', async () => {
      const mockExecutor = async () => ({
        stdout: '   \n\t  \r  ',  // Whitespace only
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should detect malformed whitespace answer
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    
    it('should log error when answer is special characters only', async () => {
      const mockExecutor = async () => ({
        stdout: '!!! ??? ... ### @@@ ===',  // Special characters
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should detect unparseable special characters
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    
    it('should mark round as incomplete for malformed answer', async () => {
      const mockExecutor = async () => ({
        stdout: '',  // Empty
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // AC-006: Round should be marked as incomplete
      expect(result.rounds.length).toBeGreaterThan(0);
      expect(result.rounds[0].incomplete).toBe(true);
      expect(result.rounds[0].incompleteReason).toContain('malformed');
    });
    
    it('should continue processing after malformed answer', async () => {
      let roundCount = 0;
      const mockExecutor = async () => {
        roundCount++;
        if (roundCount === 1) {
          return { stdout: '', stderr: '', exitCode: 0 };  // Malformed
        }
        return { stdout: 'DONE', stderr: '', exitCode: 0 };  // Proper answer
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should have attempted both rounds
      expect(roundCount).toBe(2);
    });
    
  });
  
  describe('Malformed answer types', () => {
    
    it('should handle malformed JSON response', async () => {
      const mockExecutor = async () => ({
        stdout: '{ invalid json structure without proper escaping }',  // Malformed JSON
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should handle parsing failure gracefully
      expect(result.error || result.rounds[0].incomplete).toBeDefined();
    });
    
    it('should handle binary/garbage data response', async () => {
      const mockExecutor = async () => ({
        stdout: '\u0000\u0001\u0002\u0003\u0004\u0005 binary garbage \uFFFF',  // Binary data
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should detect and handle unparseable content
      expect(result.rounds[0].incomplete || result.rounds[0].error).toBeDefined();
    });
    
    it('should handle extremely long answer that may cause issues', async () => {
      const longGarbage = 'x'.repeat(100000);  // Very long but unparseable
      const mockExecutor = async () => ({
        stdout: longGarbage,
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      // Should handle without crashing
      const result = await orchestrator.run('test feature context');
      
      expect(result).toBeDefined();
    });
    
    it('should handle answer with only emojis/special unicode', async () => {
      const mockExecutor = async () => ({
        stdout: '🎉🔥💯👍🚀✨❌✅',  // Only emojis
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should handle gracefully
      expect(result).toBeDefined();
    });
    
    it('should handle answer with missing structural components (no When clause)', async () => {
      const mockExecutor = async () => ({
        stdout: 'Given the system is online, then users can access data.',  // Missing When
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should still process but with empty When
      expect(result).toBeDefined();
    });
    
    it('should handle answer with missing Then clause', async () => {
      const mockExecutor = async () => ({
        stdout: 'When user clicks submit, given validation passes.',  // Missing Then (odd structure)
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should still process but may have empty Then
      expect(result).toBeDefined();
    });
    
  });
  
  describe('Round result structure for malformed answers', () => {
    
    it('should have incomplete flag set for malformed round', async () => {
      const mockExecutor = async () => ({
        stdout: '',  // Empty
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      expect(result.rounds[0].incomplete).toBe(true);
    });
    
    it('should have incompleteReason describing the issue', async () => {
      const mockExecutor = async () => ({
        stdout: '',  // Empty
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      expect(result.rounds[0].incompleteReason).toBeDefined();
      expect(
        result.rounds[0].incompleteReason!.toLowerCase().includes('malform') ||
        result.rounds[0].incompleteReason!.toLowerCase().includes('unparse')
      ).toBe(true);
    });
    
    it('should preserve answer content in round result even if malformed', async () => {
      const malformedAnswer = 'just some random text without structure';
      const mockExecutor = async () => ({
        stdout: malformedAnswer,
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Even malformed answer should be captured
      expect(result.rounds[0].answer).toBe(malformedAnswer);
    });
    
  });
  
  describe('Incomplete rounds vs successful rounds', () => {
    
    it('should distinguish between incomplete and successful rounds', async () => {
      let executorCalls = 0;
      // maxRetries=1 means: attempt 1 (initial) + 1 retry = 2 total attempts per round
      // All first 3 executor calls are malformed (exhausts round 1's retries)
      // Fourth call starts round 2 and returns valid
      const mockExecutor = async () => {
        executorCalls++;
        if (executorCalls <= 3) {
          return { stdout: '', stderr: '', exitCode: 0 };  // Malformed (exhausts round 1)
        }
        // Fourth call starts round 2 with valid answer
        return { stdout: 'Given user clicks, when they submit, then save succeeds.', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        maxRetries: 1,  // 1 retry = 2 total attempts per round
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Round 1 should be incomplete after exhausting retries (3 calls = 1 initial + 1 retry = 2, but needs to check again = 3)
      expect(result.rounds[0].incomplete).toBe(true);
      // Round 2 should be complete (got valid answer)
      expect(result.rounds[1].incomplete).toBeUndefined();
    });
    
    it('should include incomplete round in spec draft with marker', async () => {
      const mockExecutor = async () => ({
        stdout: '',  // Empty/malformed
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 1,  // Only 1 round
        maxRetries: 0,  // No retries - fail immediately
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Incomplete entries should still appear in spec draft
      expect(result.specDraft).toBeDefined();
      // Should contain unparseable marker
      expect(result.specDraft).toContain('(unparseable)');
    });
    
  });
  
  describe('Max attempts and retry for malformed answers', () => {
    
    it('should retry malformed answers up to max attempts', async () => {
      let attemptCount = 0;
      const mockExecutor = async () => {
        attemptCount++;
        // maxRetries=1 means: attempt 1 (initial) + 1 retry = 2 total attempts per round
        // Return malformed for first 2 calls (round 1), then DONE on 3rd (starts round 2)
        if (attemptCount <= 2) {
          return { stdout: '', stderr: '', exitCode: 0 };  // Malformed
        }
        return { stdout: 'DONE', stderr: '', exitCode: 0 };  // Fixed on 3rd call (starts round 2)
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        maxRetries: 1,  // 1 retry = 2 total attempts per malformed round
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // With maxRetries=1, round 1 gets 2 attempts (initial + 1 retry), then marks incomplete
      // The 3rd call starts round 2, which gets DONE on first try
      expect(attemptCount).toBe(3);
    });
    
    it('should stop retrying after max attempts exceeded', async () => {
      let attemptCount = 0;
      const mockExecutor = async () => {
        attemptCount++;
        return { stdout: '', stderr: '', exitCode: 0 };  // Always malformed
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 1,  // Only 1 round
        maxRetries: 2,  // Only 2 retries = 3 total attempts
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Should stop after max retries (3 total attempts per round)
      // Given 1 round, should try 3 times then give up
      expect(attemptCount).toBe(3);
      expect(result.rounds[0].incomplete).toBe(true);
      expect(result.rounds[0].incompleteReason).toContain('max retries');
    });
    
  });
  
  describe('Spec draft accumulation with malformed answers', () => {
    
    it('should accumulate entries even when some are malformed', async () => {
      let executorCalls = 0;
      const mockExecutor = async () => {
        executorCalls++;
        // First executor call is malformed (round 1, attempt 1)
        // Second call is malformed retry (round 1, attempt 2)  
        // Third call is malformed retry (round 1, attempt 3) - gives up, marks incomplete
        // Fourth call is for round 2, returns valid
        if (executorCalls <= 3) {
          return { stdout: '', stderr: '', exitCode: 0 };  // Malformed - still added as entry
        }
        if (executorCalls === 4) {
          return { stdout: 'Given valid input, when processed, then success.', stderr: '', exitCode: 0 };  // Good
        }
        return { stdout: 'DONE', stderr: '', exitCode: 0 };
      };
      
      // maxRetries=2 means: 3 total attempts per malformed round
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        maxRetries: 2,
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Both entries should be in spec draft (malformed marked as unparseable)
      expect(result.specDraft).toContain('(unparseable)');
    });
    
    it('should keep malformed entry separate from valid entries', async () => {
      let executorCalls = 0;
      const mockExecutor = async () => {
        executorCalls++;
        // All calls malformed - will exhaust retries for each round
        // maxRetries=2 = 3 attempts per round
        // Round 1: calls 1,2,3 (exhausted, marked incomplete)
        // Round 2: calls 4,5,6 (exhausted, marked incomplete)
        // etc.
        if (executorCalls <= 3) {
          return { stdout: '', stderr: '', exitCode: 0 };  // Malformed - round 1
        }
        if (executorCalls <= 6) {
          return { stdout: '', stderr: '', exitCode: 0 };  // Malformed - round 2
        }
        return { stdout: '', stderr: '', exitCode: 0 };  // Malformed - round 3
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        maxRetries: 2,
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // Malformed entry should be clearly marked
      expect(result.specDraft).toContain('(unparseable)');
      // Should still show at least one entry in the draft
      expect(result.specDraft.length).toBeGreaterThan(0);
    });
    
  });
  
  describe('Comparison: malformed vs valid answers', () => {
    
    it('should mark empty answer as incomplete but valid answer as complete', async () => {
      // Empty answer
      const emptyExecutor = async () => ({ stdout: '', stderr: '', exitCode: 0 });
      const emptyOrchestrator = new Orchestrator({ maxRounds: 1, executePi: emptyExecutor });
      const emptyResult = await emptyOrchestrator.run('test');
      
      // Valid answer
      const validExecutor = async () => ({ 
        stdout: 'Given user logged in, when they click logout, then session ends.', 
        stderr: '', 
        exitCode: 0 
      });
      const validOrchestrator = new Orchestrator({ maxRounds: 1, executePi: validExecutor });
      const validResult = await validOrchestrator.run('test');
      
      // Empty should be incomplete
      expect(emptyResult.rounds[0].incomplete).toBe(true);
      
      // Valid should be complete
      expect(validResult.rounds[0].incomplete).toBeUndefined();
    });
    
    it('should have different error logging for malformed vs valid', async () => {
      // Malformed answer
      const malformedExecutor = async () => ({ stdout: '', stderr: '', exitCode: 0 });
      const malformedOrchestrator = new Orchestrator({ maxRounds: 1, executePi: malformedExecutor });
      await malformedOrchestrator.run('test');
      
      // Valid answer - no error expected
      const validExecutor = async () => ({ 
        stdout: 'When user submits, then validation occurs.', 
        stderr: '', 
        exitCode: 0 
      });
      const validOrchestrator = new Orchestrator({ maxRounds: 1, executePi: validExecutor });
      const validResult = await validOrchestrator.run('test');
      
      // Error was logged for malformed
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Should have error logged for malformed but not for valid
      expect(validResult.rounds[0].error).toBeUndefined();
    });
    
  });

});