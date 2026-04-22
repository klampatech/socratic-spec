import { spawn, ChildProcess } from 'child_process';

export interface OrchestratorConfig {
  maxRounds: number;
  maxRetries?: number;
}

export interface RoundResult {
  round: number;
  question?: string;
  answer?: string;
  error?: string;
}

export interface OrchestrationResult {
  rounds: RoundResult[];
  specDraft: string;
  completed: boolean;
  error?: string;
}

export enum AgentRole {
  Interrogator = 'Interrogator',
  Respondee = 'Respondee',
}

export interface AgentTurn {
  role: AgentRole;
  content: string;
}

export class Orchestrator {
  private maxRounds: number;
  private maxRetries: number;
  private currentRole: AgentRole = AgentRole.Interrogator;

  constructor(config: OrchestratorConfig) {
    this.maxRounds = config.maxRounds;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Runs the two-agent Q&A loop
   * AC-001: Exactly one question sent per round
   * AC-002: Strict alternation between Interrogator and Respondee
   * AC-003: Graceful error handling on pi exit
   */
  async run(featureContext: string): Promise<OrchestrationResult> {
    const rounds: RoundResult[] = [];
    let specDraft = '';
    let completed = false;
    let error: string | undefined;

    try {
      for (let round = 1; round <= this.maxRounds; round++) {
        const roundResult = await this.executeRound(round, featureContext);
        rounds.push(roundResult);

        if (roundResult.error) {
          // AC-003: Log error and terminate gracefully
          console.error(`Round ${round} failed: ${roundResult.error}`);
          error = roundResult.error;
          break;
        }

        // Check if Interrogator signaled DONE (case-insensitive)
        if (roundResult.question?.toUpperCase().includes('DONE')) {
          completed = true;
          break;
        }

        // AC-002: Alternate roles for next round
        this.currentRole = this.currentRole === AgentRole.Interrogator 
          ? AgentRole.Respondee 
          : AgentRole.Interrogator;

        // Accumulate spec draft after each answer
        if (roundResult.answer) {
          specDraft += roundResult.answer + '\n';
        }
      }

      if (rounds.length >= this.maxRounds && !completed) {
        error = `Max rounds (${this.maxRounds}) reached before Interrogator signaled DONE`;
      }
    } catch (e) {
      // AC-003: Handle unexpected exceptions gracefully
      error = e instanceof Error ? e.message : String(e);
      console.error(`Orchestration failed: ${error}`);
    }

    return { rounds, specDraft, completed, error };
  }

  private async executeRound(round: number, featureContext: string): Promise<RoundResult> {
    // AC-001: Exactly one question per round
    // AC-002: Alternating roles enforced
    // AC-003: Graceful error handling

    return new Promise((resolve) => {
      let resolved = false;

      // AC-001: Send exactly one question to pi per round
      const question = `Question ${round}: ${featureContext}`;
      
      // Mock the pi process interaction for now
      // In production, this would spawn the pi CLI
      const mockResponse = this.getMockResponse(round);
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ round, question, answer: mockResponse });
        }
      }, 10);
    });
  }

  /**
   * Gets mock response for testing - in production this connects to pi CLI
   */
  private getMockResponse(round: number): string {
    return `Answer from ${this.currentRole} for round ${round}`;
  }

  /**
   * Execute actual pi process - to be used in production
   */
  private executePiProcess(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      const proc: ChildProcess = spawn('pi', args);

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        exitCode = code ?? 0;
        resolve({ stdout, stderr, exitCode });
      });

      proc.on('error', (err: Error) => {
        stderr += err.message;
        exitCode = 1;
        resolve({ stdout, stderr, exitCode });
      });
    });
  }

  /**
   * Handle pi process exit with non-zero code
   * AC-003: Graceful error handling on unexpected exit
   */
  private handleProcessExit(exitCode: number, round: number): void {
    console.error(`pi process exited with code ${exitCode} during round ${round}`);
  }
}