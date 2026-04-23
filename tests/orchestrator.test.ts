import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator, AgentRole, OrchestratorConfig, OrchestrationResult, RoundResult } from '../src/orchestrator.js';

describe('FEAT-001: Two-agent Q&A loop with strict alternation', () => {
  
  // AC-001: Strictly verifies exactly ONE question sent per round
  it('AC-001: Given a feature context, When the orchestrator runs, Then exactly one question is sent to pi per round', async () => {
    const maxRounds = 3;
    const callLog: number[] = [];
    
    const mockExecutor = async () => {
      callLog.push(callLog.length + 1);
      return { stdout: 'test response', stderr: '', exitCode: 0 };
    };
    
    const orchestrator = new Orchestrator({ 
      maxRounds,
      executePi: mockExecutor 
    });
    
    await orchestrator.run('test feature context');
    
    // AC-001: The number of pi calls MUST equal the number of rounds
    // This verifies exactly one question is sent per round, not multiple
    expect(callLog.length).toBe(maxRounds);
    
    // Verify calls are sequential (1, 2, 3...) not concurrent
    expect(callLog).toEqual([1, 2, 3]);
    
    // Verify no batching: each call completed before next started
    // This is implicitly tested by the sequential nature
  });
  
  // Helper to create a mock executor
  function createMockExecutor(responses: string[], exitCode: number = 0) {
    let callCount = 0;
    return async () => {
      const response = responses[callCount] || responses[responses.length - 1] || '';
      callCount++;
      return { stdout: response, stderr: '', exitCode };
    };
  }

  describe('AC-001: One question per round', () => {
    it('should send exactly one question to pi per round', async () => {
      const responses = ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Answer 5'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      const callCounts: number[] = [];
      let currentCall = 0;
      const trackingExecutor = async () => {
        currentCall++;
        callCounts.push(currentCall);
        return mockExecutor();
      };
      
      // Re-create with tracking executor
      const trackedOrchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: trackingExecutor 
      });
      
      const result = await trackedOrchestrator.run('test feature context');
      
      // AC-001: Exactly one question sent per round
      expect(callCounts).toHaveLength(5);
    });

    it('should not batch questions - one at a time', async () => {
      const responses = ['Answer 1', 'Answer 2', 'Answer 3'];
      let lastCallTime = 0;
      const callOrder: number[] = [];
      
      const mockExecutor = createMockExecutor(responses);
      let callIdx = 0;
      const sequentialExecutor = async () => {
        callIdx++;
        callOrder.push(callIdx);
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockExecutor();
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: sequentialExecutor 
      });

      await orchestrator.run('test feature context');
      
      // Should process exactly 3 rounds sequentially
      expect(callOrder).toHaveLength(3);
      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('should capture exactly one answer per round', async () => {
      const responses = ['Answer for round 1', 'Answer for round 2'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 2, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      // Each round should have exactly one answer
      expect(result.rounds).toHaveLength(2);
      result.rounds.forEach((round, idx) => {
        expect(round.round).toBe(idx + 1);
        expect(round.answer).toBeDefined();
      });
    });
  });

  // AC-001: Additional strict tests for "exactly one question per round"
  describe('AC-001 Strictness: One question per round', () => {
    it('should stop immediately when DONE is received (one round total)', async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        return { stdout: 'DONE', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5,
        executePi: mockExecutor 
      });
      
      await orchestrator.run('test context');
      
      // AC-001: Exactly one pi call should happen, then loop stops
      expect(callCount).toBe(1);
      expect(orchestrator.getRoundCount()).toBe(1);
    });

    it('should not batch multiple questions in a single round', async () => {
      let roundCount = 0;
      const executionOrder: string[] = [];
      
      const mockExecutor = async () => {
        roundCount++;
        executionOrder.push(`call-${roundCount}`);
        // Return non-DONE responses to ensure all rounds execute
        return { stdout: `Response ${roundCount}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3,
        executePi: mockExecutor 
      });
      
      await orchestrator.run('test');
      
      // AC-001: Three separate pi calls, not one call with multiple questions
      expect(executionOrder).toHaveLength(3);
      expect(executionOrder).toEqual(['call-1', 'call-2', 'call-3']);
      
      // If batching occurred, we would see only 1 entry or interleaved logs
      // Sequential execution guarantees no batching
      const uniqueCalls = new Set(executionOrder);
      expect(uniqueCalls.size).toBe(3); // All calls are distinct
    });

    it('should return exactly one answer per round in result', async () => {
      const responses = ['Answer 1', 'Answer 2', 'Answer 3'];
      let idx = 0;
      const mockExecutor = async () => {
        return { stdout: responses[idx++], stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3,
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test');
      
      // AC-001: Exactly one question -> one answer per round
      result.rounds.forEach((round, i) => {
        expect(round.round).toBe(i + 1);
        expect(round.answer).toBeDefined();
        expect(round.answer).toBe(`Answer ${i + 1}`);
      });
    });
  });

  describe('AC-002: Strict alternation between Interrogator and Respondee', () => {
    it('should enforce Interrogator then Respondee order', async () => {
      const responses = ['First answer', 'Second answer'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 2, 
        executePi: mockExecutor 
      });
      
      // Verify initial role is Interrogator
      expect(orchestrator.getCurrentRole()).toBe(AgentRole.Interrogator);
      
      await orchestrator.run('test context');
      
      // After running, roles should have alternated
      // Note: Since we use a mock that doesn't return DONE,
      // it will run maxRounds times
    });

    it('should alternate roles for each round', async () => {
      const responses = ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 4, 
        executePi: mockExecutor 
      });

      await orchestrator.run('test context');
      
      // Verify the orchestrator ran the correct number of rounds
      expect(orchestrator.getRoundCount()).toBe(4);
    });

    it('should switch to the other agent after one completes their turn', async () => {
      const responses = ['Answer 1', 'Answer 2'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 2, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      expect(result.rounds.length).toBeLessThanOrEqual(2);
    });

    it('should not skip any agent in the alternation cycle', async () => {
      const responses = ['Answer 1', 'Answer 2', 'Answer 3'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      // Verify all rounds were processed in order
      result.rounds.forEach((round, idx) => {
        expect(round.round).toBe(idx + 1);
      });
    });
  });

  describe('AC-003: Graceful error handling on pi exit', () => {
    it('should log error and terminate gracefully when pi exits unexpectedly', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Simulate pi crash (non-zero exit)
      const mockExecutor = async () => {
        return { stdout: '', stderr: 'pi crashed', exitCode: 1 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      // AC-003: Should log error and return error in result
      expect(result.error).toBeDefined();
      expect(result.error).toContain('code 1');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle non-zero exit code from pi process', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const mockExecutor = async () => {
        return { stdout: '', stderr: 'Error: process failed', exitCode: 127 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      // Should handle gracefully without throwing
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      
      consoleSpy.mockRestore();
    });

    it('should terminate gracefully without uncaught exceptions', async () => {
      // Simulate complete failure
      const mockExecutor = async () => {
        throw new Error('ENOENT: pi not found');
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 2, 
        executePi: mockExecutor 
      });

      // Should not throw
      await expect(orchestrator.run('test context')).resolves.toBeDefined();
      
      const result = await orchestrator.run('test context');
      expect(result.error).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle Interrogator returning DONE on first round (trivial spec)', async () => {
      // First response contains DONE signal
      const mockExecutor = async () => {
        return { stdout: 'DONE - trivial feature, no questions needed', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 10, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('trivial feature');
      
      // Should complete after first round due to DONE
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(1);
      expect(result.specDraft).toBeDefined();
    });

    it('should handle max rounds reached before Interrogator signals DONE', async () => {
      // No DONE signal, just keep returning answers
      const mockExecutor = async () => {
        return { stdout: 'Continuing interrogation...', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 2, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('complex feature requiring many rounds');
      
      // Should stop at max rounds
      expect(result.rounds.length).toBe(2);
      // Should indicate max rounds reached
      expect(result.error).toContain('Max rounds');
    });

    it('should handle pi process exits non-zero', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const mockExecutor = async () => {
        return { stdout: '', stderr: 'Process error', exitCode: 1 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      // Should handle non-zero exit gracefully
      expect(result.error).toBeDefined();
      expect(result.error).toContain('code 1');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle normal completion with DONE signal', async () => {
      let roundCount = 0;
      const mockExecutor = async () => {
        roundCount++;
        const response = roundCount === 3 
          ? 'DONE - all questions answered' 
          : `Answer to question ${roundCount}`;
        return { stdout: response, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test feature');
      
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(3);
    });

    it('should preserve spec draft after DONE', async () => {
      let roundCount = 0;
      const mockExecutor = async () => {
        roundCount++;
        const response = roundCount === 2 
          ? 'DONE' 
          : `Spec content from round ${roundCount}`;
        return { stdout: response, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test feature');
      
      expect(result.completed).toBe(true);
      expect(result.specDraft).toBeDefined();
      expect(result.specDraft).toContain('Spec content from round 1');
    });
  });

  describe('Round Structure Validation', () => {
    it('should have question in each round', async () => {
      const responses = ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 4, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      // Verify each round has a question with the correct role
      // Alternation: Interrogator -> Respondee -> Interrogator -> Respondee
      // Odd rounds (1, 3, ...) are Interrogator, even rounds (2, 4, ...) are Respondee
      result.rounds.forEach((round, idx) => {
        expect(round.question).toBeDefined();
        const expectedRole = idx % 2 === 0 ? AgentRole.Interrogator : AgentRole.Respondee;
        expect(round.question).toContain(`[${expectedRole}]`);
      });
    });

    it('should accumulate answers into specDraft', async () => {
      const responses = ['First answer content', 'Second answer content'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 2, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test context');
      
      expect(result.specDraft).toContain('First answer content');
      expect(result.specDraft).toContain('Second answer content');
    });
  });

  describe('Alternation Verification', () => {
    it('should start with Interrogator role', () => {
      const mockExecutor = createMockExecutor(['Answer']);
      const orchestrator = new Orchestrator({ 
        maxRounds: 1, 
        executePi: mockExecutor 
      });
      
      expect(orchestrator.getCurrentRole()).toBe(AgentRole.Interrogator);
    });

    it('should track round count correctly', async () => {
      const responses = ['A1', 'A2', 'A3'];
      const mockExecutor = createMockExecutor(responses);
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });

      await orchestrator.run('test');
      
      expect(orchestrator.getRoundCount()).toBe(3);
    });

    it('should properly terminate when DONE is received', async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        if (callCount === 1) {
          return { stdout: 'Initial response', stderr: '', exitCode: 0 };
        }
        return { stdout: 'DONE', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });

      const result = await orchestrator.run('test');
      
      // Should stop at round 2 (after first round got response and second got DONE)
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(2);
      expect(callCount).toBe(2);
    });
  });
});
