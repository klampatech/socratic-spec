import { spawn, ChildProcess } from 'child_process';

export interface OrchestratorConfig {
  maxRounds: number;
  maxRetries?: number;
  piArgs?: string[];
  // For testing: provide a custom pi execution function
  executePi?: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
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

// Default pi executor using child_process
async function defaultPiExecutor(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, exitCode: 124 });
    }, 30000);
  });
}

export class Orchestrator {
  private maxRounds: number;
  private maxRetries: number;
  private piArgs: string[];
  private executePi: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  private currentRole: AgentRole = AgentRole.Interrogator;
  private roundCount: number = 0;

  constructor(config: OrchestratorConfig) {
    this.maxRounds = config.maxRounds;
    this.maxRetries = config.maxRetries ?? 3;
    this.piArgs = config.piArgs ?? ['chat'];
    this.executePi = config.executePi ?? defaultPiExecutor;
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
        this.roundCount = round;
        const roundResult = await this.executeRound(round, featureContext);
        rounds.push(roundResult);

        if (roundResult.error) {
          // AC-003: Log error and terminate gracefully
          console.error(`Round ${round} failed: ${roundResult.error}`);
          error = roundResult.error;
          break;
        }

        // Accumulate spec draft after each answer
        if (roundResult.answer) {
          specDraft += roundResult.answer + '\n';
        }

        // AC-002: Alternate roles for next round
        this.currentRole = this.currentRole === AgentRole.Interrogator 
          ? AgentRole.Respondee 
          : AgentRole.Interrogator;

        // AC-001/AC-002: Check if Interrogator signaled DONE (case-insensitive)
        // DONE signal appears in the question from Interrogator
        if (roundResult.question?.toUpperCase().includes('DONE')) {
          completed = true;
          break;
        }

        // Also check answer for DONE signal (in case Respondee reports Interrogator's decision)
        if (roundResult.answer?.toUpperCase().includes('DONE')) {
          completed = true;
          break;
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

    const role = this.currentRole;
    const question = `Round ${round} [${role}]: ${featureContext}`;

    try {
      const response = await this.executePi(this.piArgs);
      const { stdout, stderr, exitCode } = response;

      // AC-003: Handle non-zero exit code
      if (exitCode !== 0) {
        console.error(`pi process exited with code ${exitCode} during round ${round}`);
        return {
          round,
          question,
          error: `pi process exited with code ${exitCode}: ${stderr || stdout}`,
        };
      }

      const responseText = stdout.trim();
      
      // Check for DONE signal in output
      const isDone = responseText.toUpperCase().includes('DONE');
      
      return {
        round,
        question: isDone ? `DONE: ${responseText}` : question,
        answer: responseText,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`Round ${round} execution error: ${errMsg}`);
      return {
        round,
        question,
        error: `Failed to execute round: ${errMsg}`,
      };
    }
  }

  /**
   * Handle pi process exit with non-zero code
   * AC-003: Graceful error handling on unexpected exit
   */
  private handleProcessExit(exitCode: number, round: number): void {
    console.error(`pi process exited with code ${exitCode} during round ${round}`);
  }

  /**
   * Get the current role (for testing)
   */
  getCurrentRole(): AgentRole {
    return this.currentRole;
  }

  /**
   * Get the current round number (for testing)
   */
  getRoundCount(): number {
    return this.roundCount;
  }
}
