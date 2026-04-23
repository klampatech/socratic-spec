/**
 * FEAT-001/edge-003: pi process exits non-zero
 * 
 * Edge Case: When the pi process exits with a non-zero exit code,
 * the orchestrator must log the error and terminate gracefully.
 * 
 * Acceptance Criteria:
 * AC-003: Given pi exits unexpectedly, When a round fails, 
 *         Then the orchestrator logs the error and terminates gracefully
 * 
 * This test suite validates the behavior when pi CLI returns non-zero exit codes
 * during any round of the Q&A loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Orchestrator, OrchestratorConfig, OrchestrationResult, RoundResult, AgentRole } from '../src/orchestrator';

describe('FEAT-001/edge-003: pi process exits non-zero', () => {
  
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });
  
  describe('AC-003: Graceful error handling when pi exits unexpectedly', () => {
    
    it('should log error when pi exits with code 1', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Application error occurred',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test feature context');
      
      // AC-003: Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('pi process exited with code 1');
    });
    
    it('should terminate gracefully (no uncaught exception) when pi exits non-zero', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'pi crashed',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      // Should not throw - must handle gracefully
      await expect(orchestrator.run('test context')).resolves.toBeDefined();
    });
    
    it('should return error in result when pi exits non-zero', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Critical failure',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // AC-003: Error must be present in result
      expect(result.error).toBeDefined();
      expect(result.error).toContain('pi process exited with code 1');
    });
    
    it('should include the failed round in results', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Error message',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Failed round should be recorded
      expect(result.rounds.length).toBeGreaterThanOrEqual(1);
      expect(result.rounds[0].error).toBeDefined();
      expect(result.rounds[0].round).toBe(1);
    });
    
    it('should stop execution after first non-zero exit', async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        return {
          stdout: '',
          stderr: 'Process error',
          exitCode: 1
        };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Should only execute one round before failing
      expect(callCount).toBe(1);
      expect(result.rounds.length).toBe(1);
    });
    
    it('should include stderr content in error message', async () => {
      const expectedErrorMsg = 'pi encountered a fatal error';
      const mockExecutor = async () => ({
        stdout: '',
        stderr: expectedErrorMsg,
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Error message should include stderr content
      expect(result.error).toContain(expectedErrorMsg);
    });
    
    it('should handle exit code 127 (command not found)', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'pi: command not found',
        exitCode: 127
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('code 127');
    });
    
    it('should handle exit code 124 (timeout)', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Process timed out',
        exitCode: 124
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('code 124');
    });
    
    it('should handle exit code 143 (SIGTERM)', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Terminated',
        exitCode: 143
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('code 143');
    });
    
    it('should handle exit code 139 (SIGSEGV)', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Segmentation fault',
        exitCode: 139
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('code 139');
    });
    
    it('should handle non-zero exit with partial stdout', async () => {
      const mockExecutor = async () => ({
        stdout: 'Partial output before crash',
        stderr: 'pi crashed',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Should still log the error even with partial output
      expect(result.error).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    
    it('should handle non-zero exit with empty stderr', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: '',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Should still capture the exit code even with empty stderr
      expect(result.error).toBeDefined();
      expect(result.error).toContain('code 1');
    });
    
  });
  
  describe('Non-zero exit during specific rounds', () => {
    
    it('should handle non-zero exit on round 1 (first round)', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Failed to start',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.rounds.length).toBe(1);
      expect(result.rounds[0].round).toBe(1);
      expect(result.rounds[0].error).toBeDefined();
      expect(result.completed).toBe(false);
    });
    
    it('should handle non-zero exit on round 2 (mid-execution)', async () => {
      let round = 0;
      const mockExecutor = async () => {
        round++;
        if (round === 1) {
          return { stdout: 'First round succeeded', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: 'Crashed on round 2', exitCode: 1 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Should have executed round 1 successfully
      expect(result.rounds.length).toBe(2);
      expect(result.rounds[0].error).toBeUndefined();
      expect(result.rounds[0].answer).toContain('First round succeeded');
      
      // Round 2 should have failed
      expect(result.rounds[1].error).toBeDefined();
      expect(result.rounds[1].error).toContain('code 1');
    });
    
    it('should handle non-zero exit on last possible round', async () => {
      let round = 0;
      const mockExecutor = async () => {
        round++;
        if (round < 3) {
          return { stdout: `Round ${round} response`, stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: 'Failed on final round', exitCode: 1 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.rounds.length).toBe(3);
      expect(result.rounds[2].error).toBeDefined();
    });
    
  });
  
  describe('Comparison: zero exit vs non-zero exit', () => {
    
    it('should indicate completed=false on non-zero exit', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Error',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.completed).toBe(false);
    });
    
    it('should indicate completed=false on successful run without DONE', async () => {
      const mockExecutor = async () => ({
        stdout: 'Response without DONE signal',
        stderr: '',
        exitCode: 0
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 2, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Without DONE signal, should not be completed
      expect(result.completed).toBe(false);
    });
    
    it('should have different error states for zero vs non-zero exit', async () => {
      // Non-zero exit
      const failingExecutor = async () => ({
        stdout: '',
        stderr: 'Error',
        exitCode: 1
      });
      
      const failingOrchestrator = new Orchestrator({ 
        maxRounds: 1, 
        executePi: failingExecutor 
      });
      
      const failingResult = await failingOrchestrator.run('test');
      
      // Zero exit
      const successExecutor = async () => ({
        stdout: 'DONE',
        stderr: '',
        exitCode: 0
      });
      
      const successOrchestrator = new Orchestrator({ 
        maxRounds: 1, 
        executePi: successExecutor 
      });
      
      const successResult = await successOrchestrator.run('test');
      
      // Errors should differ
      expect(failingResult.error).toBeDefined();
      expect(successResult.error).toBeUndefined();
      expect(failingResult.completed).toBe(false);
      expect(successResult.completed).toBe(true);
    });
    
  });
  
  describe('Error message formatting', () => {
    
    it('should include round number in error message', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Error',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.error).toContain('round 1');
    });
    
    it('should include exit code in error message', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Critical error',
        exitCode: 42
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.error).toContain('code 42');
    });
    
    it('should include error details in round result', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Detailed error info',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      expect(result.rounds[0].error).toBeDefined();
      expect(result.rounds[0].error).toContain('Detailed error info');
    });
    
  });
  
  describe('Spec draft state after non-zero exit', () => {
    
    it('should preserve spec draft from successful rounds before failure', async () => {
      let round = 0;
      const mockExecutor = async () => {
        round++;
        if (round === 1) {
          return { stdout: 'Answer 1 content', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: 'Crashed', exitCode: 1 };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Should have accumulated content from round 1
      expect(result.specDraft).toContain('Answer 1 content');
    });
    
    it('should have empty spec draft when failure is on round 1', async () => {
      const mockExecutor = async () => ({
        stdout: '',
        stderr: 'Immediate failure',
        exitCode: 1
      });
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 5, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // No successful rounds, so spec draft is empty
      expect(result.specDraft).toBe('');
    });
    
  });
  
  describe('Multiple consecutive non-zero exits', () => {
    
    it('should handle executor that always returns non-zero', async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        return {
          stdout: '',
          stderr: `Failure ${callCount}`,
          exitCode: 1
        };
      };
      
      const orchestrator = new Orchestrator({ 
        maxRounds: 3, 
        executePi: mockExecutor 
      });
      
      const result = await orchestrator.run('test context');
      
      // Should fail on first call and stop
      expect(callCount).toBe(1);
      expect(result.error).toBeDefined();
    });
    
  });
  
  describe('handleProcessExit method', () => {
    
    it('should have handleProcessExit method available', () => {
      const mockExecutor = async () => ({ stdout: '', stderr: '', exitCode: 0 });
      const orchestrator = new Orchestrator({ 
        maxRounds: 1, 
        executePi: mockExecutor 
      });
      
      // Method should exist
      expect(typeof orchestrator.handleProcessExit).toBe('function');
    });
    
    it('should log when handleProcessExit is called', async () => {
      const mockExecutor = async () => ({ stdout: '', stderr: '', exitCode: 0 });
      const orchestrator = new Orchestrator({ 
        maxRounds: 1, 
        executePi: mockExecutor 
      });
      
      orchestrator.handleProcessExit(1, 1);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('pi process exited with code 1 during round 1')
      );
    });
    
  });

});
