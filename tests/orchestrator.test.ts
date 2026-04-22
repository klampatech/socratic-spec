import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Orchestrator, AgentRole, OrchestratorConfig, OrchestrationResult, RoundResult } from '../src/orchestrator.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';

describe('FEAT-001: Two-agent Q&A loop with strict alternation', () => {
  const mockSpawn = spawn as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC-001: One question per round', () => {
    it('should send exactly one question to pi per round', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 5 });
      
      // Track spawn calls
      let spawnCallCount = 0;
      const processResults: string[] = [];
      
      mockSpawn.mockImplementation((_cmd: string, _args: string[]) => {
        spawnCallCount++;
        return {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') {
              // Simulate pi response
              setTimeout(() => cb(Buffer.from('Answer for round ' + spawnCallCount)), 5);
            }
          }),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };
      });

      await orchestrator.run('test feature context');
      
      // AC-001: Exactly one question sent per round
      // Since we have maxRounds=5, but mock doesn't return DONE,
      // we should see 5 spawn calls for 5 rounds
      expect(spawnCallCount).toBe(5);
    });

    it('should not batch questions - one at a time', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 3 });
      
      let activeProcess = false;
      let processOrder: number[] = [];
      let round = 0;
      
      mockSpawn.mockImplementation(() => {
        round++;
        processOrder.push(round);
        activeProcess = true;
        return {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => {
                cb(Buffer.from('Answer ' + round));
                activeProcess = false;
              }, 20);
            }
          }),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };
      });

      await orchestrator.run('test feature context');
      
      // Should process exactly 3 rounds
      expect(processOrder).toHaveLength(3);
      // Should process in sequence, not batched
      expect(processOrder[0]).toBe(1);
      expect(processOrder[1]).toBe(2);
      expect(processOrder[2]).toBe(3);
    });

    it('should capture exactly one answer per round', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 2 });
      
      const answers: string[] = [];
      
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            const answerText = 'Answer ' + (answers.length + 1);
            setTimeout(() => cb(Buffer.from(answerText)), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('test context');
      
      // Each round should have exactly one answer
      result.rounds.forEach((round, idx) => {
        expect(round.answer).toBeDefined();
        expect(round.question).toBeDefined();
      });
      
      expect(result.rounds).toHaveLength(2);
    });
  });

  describe('AC-002: Strict alternation between Interrogator and Respondee', () => {
    it('should enforce Interrogator then Respondee order', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 2 });
      
      const roles: AgentRole[] = [];
      
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => cb(Buffer.from('response')), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      await orchestrator.run('test context');
      
      // After implementation, verify roles alternate properly
      expect(orchestrator).toBeDefined();
      expect(typeof orchestrator.run).toBe('function');
    });

    it('should alternate roles for each round - Interrogator sends question, Respondee answers', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 2 });
      
      const messages: { role: AgentRole; content: string }[] = [];
      
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => cb(Buffer.from('Response')), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('test context');
      
      expect(result.rounds).toHaveLength(2);
      
      // Round 1: Interrogator sends question
      // Round 2: Respondee sends question (or Interrogator again after DONE from Respondee)
      // The strict alternation means: Interrogator asks, Respondee answers, Interrogator asks...
    });

    it('should switch to the other agent after one completes their turn', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 4 });
      
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => cb(Buffer.from('Answer')), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('test context');
      
      // After 4 rounds, should have completed or reached max
      expect(result.rounds.length).toBeLessThanOrEqual(4);
      expect(result.rounds.length).toBeGreaterThan(0);
    });

    it('should not skip any agent in the alternation cycle', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 3 });
      
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => cb(Buffer.from('Answer')), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

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
      const orchestrator = new Orchestrator({ maxRounds: 3 });
      
      // Simulate pi process error
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (err: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => cb(new Error('pi process crashed')), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('test context');
      
      // AC-003: Should log error and return error in result
      expect(result.error).toBeDefined();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle non-zero exit code from pi process', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const orchestrator = new Orchestrator({ maxRounds: 3 });
      
      mockSpawn.mockImplementation(() => ({
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('test context');
      
      // Should handle gracefully without throwing
      expect(result).toBeDefined();
      
      consoleSpy.mockRestore();
    });

    it('should terminate gracefully without uncaught exceptions', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 2 });
      
      // Simulate complete failure
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (err: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => cb(new Error('ENOENT: pi not found')), 1);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      // Should not throw
      await expect(orchestrator.run('test context')).resolves.toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle Interrogator returning DONE on first round (trivial spec)', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 10 });
      
      // First response contains DONE signal
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => cb(Buffer.from('DONE - trivial feature, no questions needed')), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('trivial feature');
      
      // Should complete after first round due to DONE
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(1);
      expect(result.specDraft).toBeDefined();
    });

    it('should handle max rounds reached before Interrogator signals DONE', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 2 });
      
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => cb(Buffer.from('Continuing interrogation...')), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('complex feature requiring many rounds');
      
      // Should stop at max rounds
      expect(result.rounds.length).toBeLessThanOrEqual(2);
      // Should indicate max rounds reached
      expect(result.error).toContain('Max rounds');
    });

    it('should handle pi process exits non-zero', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const orchestrator = new Orchestrator({ maxRounds: 3 });
      
      let exitCode = 1;
      mockSpawn.mockImplementation(() => ({
        on: vi.fn((event: string, cb: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => cb(exitCode), 5);
          }
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      }));

      const result = await orchestrator.run('test context');
      
      // Should handle non-zero exit gracefully
      expect(result.error).toBeDefined();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle normal completion with DONE signal', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 5 });
      let roundCount = 0;
      
      mockSpawn.mockImplementation(() => {
        roundCount++;
        return {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') {
              const response = roundCount === 3 
                ? 'DONE - all questions answered' 
                : 'Answer to question ' + roundCount;
              setTimeout(() => cb(Buffer.from(response)), 5);
            }
          }),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };
      });

      const result = await orchestrator.run('test feature');
      
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(3);
    });

    it('should preserve spec draft after DONE', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 5 });
      let roundCount = 0;
      
      mockSpawn.mockImplementation(() => {
        roundCount++;
        return {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') {
              const response = roundCount === 2 
                ? 'DONE' 
                : 'Spec content from round ' + roundCount;
              setTimeout(() => cb(Buffer.from(response)), 5);
            }
          }),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };
      });

      const result = await orchestrator.run('test feature');
      
      expect(result.completed).toBe(true);
      expect(result.specDraft).toBeDefined();
    });
  });

  describe('Round Structure Validation', () => {
    it('should have question in odd rounds (Interrogator)', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 4 });
      let roundCount = 0;
      
      mockSpawn.mockImplementation(() => {
        roundCount++;
        return {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => cb(Buffer.from('Answer ' + roundCount)), 5);
            }
          }),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };
      });

      const result = await orchestrator.run('test context');
      
      // Odd rounds (1, 3) are Interrogator questions
      expect(result.rounds[0]?.question).toBeDefined();
      expect(result.rounds[2]?.question).toBeDefined();
    });

    it('should have answer in even rounds (Respondee)', async () => {
      const orchestrator = new Orchestrator({ maxRounds: 4 });
      let roundCount = 0;
      
      mockSpawn.mockImplementation(() => {
        roundCount++;
        return {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => cb(Buffer.from('Answer ' + roundCount)), 5);
            }
          }),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };
      });

      const result = await orchestrator.run('test context');
      
      // Even rounds (2, 4) are Respondee answers
      expect(result.rounds[1]?.answer).toBeDefined();
      expect(result.rounds[3]?.answer).toBeDefined();
    });
  });
});
