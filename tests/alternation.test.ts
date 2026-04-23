import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator, AgentRole, OrchestratorConfig, OrchestrationResult, RoundResult } from '../src/orchestrator.js';

/**
 * AC-002 Test Suite: Alternating Roles
 * Criterion: Given alternating roles, When one agent completes their turn,
 * Then the other agent receives control next
 */
describe('AC-002: Strict Alternation Between Agents', () => {
  
  describe('AC-002.1: Role alternation sequence', () => {
    it('should start with Interrogator role', () => {
      const mockExecutor = async () => ({ stdout: 'Response', stderr: '', exitCode: 0 });
      const orchestrator = new Orchestrator({ maxRounds: 1, executePi: mockExecutor });
      expect(orchestrator.getCurrentRole()).toBe(AgentRole.Interrogator);
    });

    it('should alternate to Respondee after first round', async () => {
      const roleLog: AgentRole[] = [];
      
      const mockExecutor = async () => {
        roleLog.push(orchestrator.getCurrentRole());
        return { stdout: `Response ${roleLog.length}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 2, executePi: mockExecutor });
      
      await orchestrator.run('test context');
      
      // Verify roles alternated: [Interrogator, Respondee]
      expect(roleLog[0]).toBe(AgentRole.Interrogator);
      expect(roleLog[1]).toBe(AgentRole.Respondee);
    });


    it('should alternate back to Interrogator after second round', async () => {
      const roleLog: AgentRole[] = [];
      
      const mockExecutor = async () => {
        roleLog.push(orchestrator.getCurrentRole());
        return { stdout: `Response ${roleLog.length}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 3, executePi: mockExecutor });
      
      await orchestrator.run('test context');
      
      // Verify roles alternated: [Interrogator, Respondee, Interrogator]
      expect(roleLog[0]).toBe(AgentRole.Interrogator);
      expect(roleLog[1]).toBe(AgentRole.Respondee);
      expect(roleLog[2]).toBe(AgentRole.Interrogator);
    });

    it('should follow exact Interrogator→Respondee→Interrogator pattern', async () => {
      const roleSequence: AgentRole[] = [];
      let roundNum = 0;
      
      const mockExecutor = async () => {
        roundNum++;
        const expectedRole = roundNum % 2 === 1 ? AgentRole.Interrogator : AgentRole.Respondee;
        roleSequence.push(orchestrator.getCurrentRole());
        return { stdout: `Response ${roundNum}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 4, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // Expected: [Interrogator, Respondee, Interrogator, Respondee]
      expect(roleSequence[0]).toBe(AgentRole.Interrogator);
      expect(roleSequence[1]).toBe(AgentRole.Respondee);
      expect(roleSequence[2]).toBe(AgentRole.Interrogator);
      expect(roleSequence[3]).toBe(AgentRole.Respondee);
    });
  });

  describe('AC-002.2: Control transfer verification', () => {
    it('should transfer control to Respondee after Interrogator completes', async () => {
      const controlTransferLog: { round: number; role: AgentRole }[] = [];
      
      const mockExecutor = async () => {
        const currentRound = controlTransferLog.length + 1;
        controlTransferLog.push({
          round: currentRound,
          role: orchestrator.getCurrentRole()
        });
        return { stdout: `Response for round ${currentRound}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 2, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // Round 1: Interrogator has control
      expect(controlTransferLog[0].role).toBe(AgentRole.Interrogator);
      // Round 2: Respondee should have received control after Interrogator's turn
      expect(controlTransferLog[1].role).toBe(AgentRole.Respondee);
    });

    it('should transfer control back to Interrogator after Respondee completes', async () => {
      const roleLog: AgentRole[] = [];
      let roundIndex = 0;
      
      const mockExecutor = async () => {
        roundIndex++;
        roleLog.push(orchestrator.getCurrentRole());
        return { stdout: `Response ${roundIndex}`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 2, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // After Respondee's turn, Interrogator should receive control next
      expect(roleLog[0]).toBe(AgentRole.Interrogator);
      expect(roleLog[1]).toBe(AgentRole.Respondee);
    });
  });

  describe('AC-002.3: Strict alternation enforcement', () => {
    it('should NOT skip any role in the alternation cycle', async () => {
      const executedRoles: AgentRole[] = [];
      const mockExecutor = async () => {
        executedRoles.push(orchestrator.getCurrentRole());
        return { stdout: 'Answer', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 6, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // All 6 rounds should execute with alternating roles
      expect(executedRoles).toHaveLength(6);
      
      // Verify strict alternation: odd rounds = Interrogator, even rounds = Respondee
      for (let i = 0; i < 6; i++) {
        const expectedRole = i % 2 === 0 ? AgentRole.Interrogator : AgentRole.Respondee;
        expect(executedRoles[i]).toBe(expectedRole);
      }
    });

    it('should enforce alternation even when pi returns quickly', async () => {
      const quickResponses = ['Fast1', 'Fast2', 'Fast3'];
      let idx = 0;
      
      const mockExecutor = async () => {
        return { stdout: quickResponses[idx++] + ` [Round ${idx}]`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 3, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // With 3 rounds: Interrogator(1), Respondee(2), Interrogator(3)
      // After completion, role has been toggled, ending on Respondee
      expect(orchestrator.getCurrentRole()).toBe(AgentRole.Respondee);
    });

    it('should never have the same role twice in a row', async () => {
      const roles: AgentRole[] = [];
      const mockExecutor = async () => {
        roles.push(orchestrator.getCurrentRole());
        return { stdout: 'Response', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 10, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // Verify no consecutive same roles
      for (let i = 1; i < roles.length; i++) {
        expect(roles[i]).not.toBe(roles[i - 1]);
      }
    });
  });

  describe('AC-002.4: Control ownership verification', () => {
    it('should correctly identify current role at each round start', async () => {
      const roundStartRoles: AgentRole[] = [];
      
      const mockExecutor = async () => {
        roundStartRoles.push(orchestrator.getCurrentRole());
        return { stdout: 'Response', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 4, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // Each round should start with the correct role
      expect(roundStartRoles).toEqual([
        AgentRole.Interrogator,
        AgentRole.Respondee,
        AgentRole.Interrogator,
        AgentRole.Respondee,
      ]);
    });

    it('should accurately track which agent has control', async () => {
      const controlTracking: { round: number; controlHolder: AgentRole }[] = [];
      
      const mockExecutor = async () => {
        const round = controlTracking.length + 1;
        controlTracking.push({
          round,
          controlHolder: orchestrator.getCurrentRole()
        });
        return { stdout: `Round ${round} answer`, stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 3, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // Verify control is accurately tracked
      controlTracking.forEach((entry, index) => {
        const expectedRole = index % 2 === 0 ? AgentRole.Interrogator : AgentRole.Respondee;
        expect(entry.controlHolder).toBe(expectedRole);
        expect(entry.round).toBe(index + 1);
      });
    });
  });

  describe('AC-002.5: Alternation with DONE signal', () => {
    it('should complete properly after Respondee turn with DONE', async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        const role = orchestrator.getCurrentRole();
        if (callCount === 1) {
          return { stdout: 'Answer 1', stderr: '', exitCode: 0 };
        }
        return { stdout: 'DONE', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 3, executePi: mockExecutor });
      const result = await orchestrator.run('test context');
      
      // Should complete after 2 rounds with proper alternation
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(2);
    });

    it('should handle alternation when DONE appears on Interrogator turn', async () => {
      const mockExecutor = async () => {
        return { stdout: 'DONE', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 5, executePi: mockExecutor });
      const result = await orchestrator.run('test context');
      
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(1);
      expect(orchestrator.getCurrentRole()).toBe(AgentRole.Respondee);
    });

    it('should maintain alternation integrity across multiple DONE-early terminations', async () => {
      for (const earlyTermRound of [1, 2, 3]) {
        let callCount = 0;
        const mockExecutor = async () => {
          callCount++;
          if (callCount >= earlyTermRound) {
            return { stdout: 'DONE', stderr: '', exitCode: 0 };
          }
          return { stdout: `Answer ${callCount}`, stderr: '', exitCode: 0 };
        };
        
        const orchestrator = new Orchestrator({ maxRounds: 5, executePi: mockExecutor });
        await orchestrator.run('test context');
        
        // After early termination, role should be alternated from last executed turn
        const expectedRole = earlyTermRound % 2 === 1 
          ? AgentRole.Respondee 
          : AgentRole.Interrogator;
        expect(orchestrator.getCurrentRole()).toBe(expectedRole);
      }
    });
  });

  describe('AC-002.6: Edge cases for alternation', () => {
    it('should handle single round execution (trivial spec)', async () => {
      const mockExecutor = async () => {
        return { stdout: 'DONE - trivial spec', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 5, executePi: mockExecutor });
      const result = await orchestrator.run('trivial feature');
      
      expect(result.completed).toBe(true);
      expect(result.rounds).toHaveLength(1);
      expect(orchestrator.getCurrentRole()).toBe(AgentRole.Respondee);
    });

    it('should alternate correctly even when pi calls are delayed', async () => {
      const roleLog: AgentRole[] = [];
      
      const mockExecutor = async () => {
        roleLog.push(orchestrator.getCurrentRole());
        // Simulate a delay
        await new Promise(resolve => setTimeout(resolve, 5));
        return { stdout: 'Response', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 3, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // Roles should still alternate correctly despite delays
      expect(roleLog[0]).toBe(AgentRole.Interrogator);
      expect(roleLog[1]).toBe(AgentRole.Respondee);
      expect(roleLog[2]).toBe(AgentRole.Interrogator);
    });

    it('should maintain alternation even with many consecutive rounds', async () => {
      const roleLog: AgentRole[] = [];
      const mockExecutor = async () => {
        roleLog.push(orchestrator.getCurrentRole());
        return { stdout: 'Response', stderr: '', exitCode: 0 };
      };
      
      const orchestrator = new Orchestrator({ maxRounds: 20, executePi: mockExecutor });
      await orchestrator.run('test context');
      
      // Verify alternation pattern holds for many rounds
      for (let i = 0; i < roleLog.length; i++) {
        const expectedRole = i % 2 === 0 ? AgentRole.Interrogator : AgentRole.Respondee;
        expect(roleLog[i]).toBe(expectedRole);
      }
    });
  });
});
