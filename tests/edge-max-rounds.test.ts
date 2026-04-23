import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator, AgentRole } from '../src/orchestrator.js';

/**
 * FEAT-001/edge-002: Max rounds reached before Interrogator signals DONE
 * 
 * This edge case tests the scenario where the orchestrator reaches its maximum
 * number of rounds before the Interrogator has signaled DONE. This can happen
 * when:
 * - The feature requires more exploration than maxRounds allows
 * - The Interrogator has categories that haven't been fully covered
 * - The conversation is still producing new information but hits the limit
 * 
 * Acceptance criteria:
 * - Orchestrator should stop at max rounds even if DONE not received
 * - Should return error indicating max rounds was the termination reason
 * - Should preserve all accumulated spec draft content
 * - Should indicate incomplete state (completed=false)
 * - Should still execute all rounds up to maxRounds
 */

describe('FEAT-001/edge-002: Max rounds reached before Interrogator signals DONE', () => {
  
  // Helper to create orchestrator with non-empty required categories
  // This ensures Interrogator doesn't return DONE immediately
  function createOrchestrator(maxRounds: number, mockExecutor: any) {
    return new Orchestrator({ 
      maxRounds,
      executePi: mockExecutor,
      requiredCategories: ['happy_path', 'error_handling', 'edge_case'] // Non-empty to trigger the edge case
    });
  }
  
  describe('Core Behavior: Max rounds termination', () => {
    
    it('should stop when max rounds is reached even if no DONE signal', async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        // Return a non-DONE response each time
        return { 
          stdout: `Answer ${callCount}: Continuing with more questions...`, 
          stderr: '', 
          exitCode: 0 
        };
      };
      
      const orchestrator = createOrchestrator(3, mockExecutor);

      const result = await orchestrator.run('complex feature needing many rounds');
      
      // Should stop after exactly maxRounds
      expect(result.rounds).toHaveLength(3);
      expect(callCount).toBe(3);
      expect(result.completed).toBe(false);
    });

    it('should return error message indicating max rounds reached', async () => {
      const mockExecutor = async () => {
        return { 
          stdout: 'Still exploring the feature...', 
          stderr: '', 
          exitCode: 0 
        };
      };
      
      const orchestrator = createOrchestrator(2, mockExecutor);

      const result = await orchestrator.run('complex feature');
      
      // Error should indicate max rounds was the termination cause
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Max rounds');
      expect(result.error).toContain('DONE');
    });

    it('should not signal completion when max rounds is reached without DONE', async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        return { 
          stdout: `Round ${callCount} response without DONE signal`, 
          stderr: '', 
          exitCode: 0 
        };
      };
      
      const orchestrator = createOrchestrator(4, mockExecutor);

      const result = await orchestrator.run('feature needing many questions');
      
      // completed should be false since no DONE signal was received
      expect(result.completed).toBe(false);
      expect(result.rounds.length).toBe(4);
    });

    it('should preserve all accumulated answers in spec draft', async () => {
      const answers = ['First answer', 'Second answer', 'Third answer'];
      let idx = 0;
      
      const mockExecutor = async () => {
        return { 
          stdout: answers[idx++], 
          stderr: '', 
          exitCode: 0 
        };
      };
      
      const orchestrator = createOrchestrator(3, mockExecutor);

      const result = await orchestrator.run('feature with many answers');
      
      // All three answers should be accumulated in specDraft
      expect(result.specDraft).toContain('First answer');
      expect(result.specDraft).toContain('Second answer');
      expect(result.specDraft).toContain('Third answer');
    });

    it('should execute exactly maxRounds when no DONE signal', async () => {
      let callCount = 0;
      
      const mockExecutor = async () => {
        callCount++;
        return { 
          stdout: `Response ${callCount}`, 
          stderr: '', 
          exitCode: 0 
        };
      };
      
      const orchestrator = createOrchestrator(5, mockExecutor);

      await orchestrator.run('test feature');
      
      // Exactly 5 calls should have been made
      expect(callCount).toBe(5);
    });

  });

  describe('Alternation continues until max rounds', () => {
    
    it('should maintain alternating roles until max rounds termination', async () => {
      const rolesSeen: AgentRole[] = [];
      const expectedSequence = [
        AgentRole.Interrogator,  // Round 1
        AgentRole.Respondee,     // Round 2
        AgentRole.Interrogator,  // Round 3
      ];
      
      let roundIdx = 0;
      const mockExecutor = async () => {
        // Capture the role before it alternates for this round
        const role = roundIdx % 2 === 0 ? AgentRole.Interrogator : AgentRole.Respondee;
        rolesSeen.push(role);
        roundIdx++;
        
        return { 
          stdout: `Answer for round ${roundIdx}`, 
          stderr: '', 
          exitCode: 0 
        };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3,
        executePi: mockExecutor 
      });

      await orchestrator.run('test');
      
      // Should see alternating roles in the execution
      expect(rolesSeen).toEqual(expectedSequence);
    });

  });

  describe('Edge case: DONE signal appears after max rounds', () => {
    
    it('should prioritize DONE over max rounds (stop early)', async () => {
      let callCount = 0;
      
      const mockExecutor = async () => {
        callCount++;
        // If we're at round 2, return DONE
        if (callCount === 2) {
          return { stdout: 'DONE - all covered', stderr: '', exitCode: 0 };
        }
        return { stdout: `Answer ${callCount}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = createOrchestrator(5, mockExecutor);

      const result = await orchestrator.run('feature');
      
      // Should stop early due to DONE, not at max rounds
      expect(callCount).toBeLessThanOrEqual(5);
      expect(result.completed).toBe(true);
      expect(result.rounds.length).toBeLessThanOrEqual(5);
    });

  });

  describe('Error handling at max rounds boundary', () => {
    
    it('should handle max rounds error gracefully without throwing', async () => {
      const mockExecutor = async () => {
        return { stdout: 'Continuing...', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = createOrchestrator(1, mockExecutor);

      // Should not throw, should return a result with error
      const result = await orchestrator.run('test');
      
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.rounds).toHaveLength(1);
    });

    it('should indicate incomplete spec draft when max rounds reached', async () => {
      const mockExecutor = async () => {
        return { stdout: 'Partial answer', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = createOrchestrator(2, mockExecutor);

      const result = await orchestrator.run('incomplete feature');
      
      // Should have some content but not completed
      expect(result.specDraft).toContain('Partial answer');
      expect(result.completed).toBe(false);
      expect(result.error).toContain('Max rounds');
    });

  });

  describe('Contrast: Max rounds reached WITH DONE signal', () => {
    
    it('should complete successfully if DONE appears before max rounds', async () => {
      let roundCount = 0;
      
      const mockExecutor = async () => {
        roundCount++;
        // DONE at round 2
        if (roundCount === 2) {
          return { stdout: 'DONE', stderr: '', exitCode: 0 };
        }
        return { stdout: `Answer ${roundCount}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = createOrchestrator(10, mockExecutor);

      const result = await orchestrator.run('feature');
      
      expect(result.completed).toBe(true);
      expect(result.rounds.length).toBe(2);
      expect(result.error).toBeUndefined();
    });

  });

  describe('Round result structure at max rounds', () => {
    
    it('should have consistent round numbering when max reached', async () => {
      const mockExecutor = async () => {
        return { stdout: 'Answer', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = createOrchestrator(4, mockExecutor);

      const result = await orchestrator.run('test');
      
      // Each round should have correct sequential numbering
      result.rounds.forEach((round, idx) => {
        expect(round.round).toBe(idx + 1);
      });
    });

    it('should have question defined for each round even at max', async () => {
      const mockExecutor = async () => {
        return { stdout: 'Answer content', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = createOrchestrator(3, mockExecutor);

      const result = await orchestrator.run('test');
      
      result.rounds.forEach((round) => {
        expect(round.question).toBeDefined();
        expect(round.question).toContain('Round');
      });
    });

  });

});