import { spawn, ChildProcess } from 'child_process';
import { Interrogator, createInterrogator, DONE_SIGNAL } from './interrogator';
import { createSpecDraft, isMalformedAnswer } from './specSynthesizer';
import { log, error } from './logger';

export interface OrchestratorConfig {
  maxRounds: number;
  maxRetries?: number;
  piArgs?: string[];
  requiredCategories?: string[];
  // For testing: provide a custom pi execution function
  executePi?: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface RoundResult {
  round: number;
  question?: string;
  answer?: string;
  error?: string;
  isDone?: boolean;
  // FEAT-002/edge-003: Mark round as incomplete for malformed answers
  incomplete?: boolean;
  incompleteReason?: string;
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
  private interrogator: Interrogator;
  private specDraft: any;

  constructor(config: OrchestratorConfig) {
    this.maxRounds = config.maxRounds;
    this.maxRetries = config.maxRetries ?? 3;
    this.piArgs = config.piArgs ?? ['chat'];
    this.executePi = config.executePi ?? defaultPiExecutor;
    // Create interrogator with required categories (defaults to empty for trivial specs)
    this.interrogator = createInterrogator({
      requiredCategories: config.requiredCategories ?? [],
      maxCycles: config.maxRounds,
      similarityThreshold: 0.7
    });
    this.specDraft = createSpecDraft('default');
    this.currentRole = AgentRole.Interrogator;
    this.roundCount = 0;
  }

  /**
   * Runs the two-agent Q&A loop
   * AC-001: Exactly one question sent per round
   * AC-002: Strict alternation between Interrogator and Respondee
   * AC-003: Graceful error handling on pi exit
   * FEAT-002/edge-003: Handle malformed/unparseable answers
   */
  async run(featureContext: string): Promise<OrchestrationResult> {
    const rounds: RoundResult[] = [];
    let specDraftText = '';
    let completed = false;
    let error: string | undefined;

    // Reset state for each run
    this.currentRole = AgentRole.Interrogator;
    this.roundCount = 0;

    // Try to execute at least one round even for trivial specs
    // The DONE signal will be checked from the pi response
    try {
      for (let round = 1; round <= this.maxRounds; round++) {
        this.roundCount = round;
        const roundResult = await this.executeRoundWithRetry(round, featureContext);
        rounds.push(roundResult);

        if (roundResult.error) {
          // AC-003: Log error and terminate gracefully
          console.error(`Round ${round} failed: ${roundResult.error}`);
          error = roundResult.error;
          break;
        }

        // Accumulate spec draft after each answer
        // FEAT-002/edge-003: Mark malformed answers in spec draft with (unparseable) marker
        if (roundResult.answer) {
          if (roundResult.incomplete) {
            // Malformed answer - mark with unparseable indicator
            specDraftText += `(unparseable) ${roundResult.answer}\n`;
          } else {
            specDraftText += roundResult.answer + '\n';
          }
        } else if (roundResult.incomplete) {
          // Incomplete round with no answer - add unparseable marker
          specDraftText += '(unparseable)\n';
        }

        // AC-002: Alternate roles for next round
        this.currentRole = this.currentRole === AgentRole.Interrogator 
          ? AgentRole.Respondee 
          : AgentRole.Interrogator;
        
        // Check for DONE signal from round execution
        if (roundResult.isDone) {
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

    return { rounds, specDraft: specDraftText, completed, error };
  }

  /**
   * Execute a round with retry logic for malformed answers
   * FEAT-002/edge-003: Retry malformed answers up to maxRetries times
   * Note: maxRetries=1 means 1 initial + 1 retry = 2 total attempts
   */
  private async executeRoundWithRetry(round: number, featureContext: string): Promise<RoundResult> {
    let attempt = 0;
    let malformedReason: string | undefined;
    let lastAnswer: string | undefined;

    while (true) {
      attempt++;
      const result = await this.executeRound(round, featureContext);

      // Check for execution errors first - don't retry those
      if (result.error) {
        return result;
      }

      // Track last answer for incomplete return
      if (result.answer) {
        lastAnswer = result.answer;
      }

      // AC-006: Handle malformed answers with error logging
      const malformedCheck = this.checkMalformedAnswer(result.answer, result.isDone ?? false);
      
      if (malformedCheck.isMalformed) {
        malformedReason = malformedCheck.reason;
        // AC-006: Log error for malformed answer
        const errorMsg = `malformed answer detected${malformedCheck.reason ? ': ' + malformedCheck.reason : ''}`;
        console.error(`${errorMsg} in round ${round}, attempt ${attempt}`);
        
        // maxRetries is the total number of retries allowed after the initial attempt
        // So with maxRetries=1: attempt 1 (initial) + attempt 2 (retry 1) = 2 total
        // We check if attempt > maxRetries
        if (attempt > this.maxRetries) {
          // Max retries exceeded - mark round as incomplete with the reason
          return {
            ...result,
            incomplete: true,
            incompleteReason: malformedReason 
              ? `malformed answer: ${malformedReason} (max retries ${this.maxRetries} exceeded)`
              : `malformed answer: max retries (${this.maxRetries}) exceeded`,
            answer: lastAnswer
          };
        }
        // Continue to retry
        continue;
      }

      // Good answer or done - return success
      return result;
    }
  }

  /**
   * Check if an answer is malformed and return details
   * FEAT-002/edge-003: Detect unparseable content
   * NOTE: DONE signals with empty content after prefix stripping are NOT malformed
   */
  private checkMalformedAnswer(answer: string | undefined, isDone: boolean = false): { isMalformed: boolean; reason?: string } {
    // If DONE signal (even with empty content), it's valid
    if (isDone) {
      return { isMalformed: false };
    }
    
    // Handle undefined/empty answers
    if (!answer || answer.trim() === '') {
      return { isMalformed: true, reason: 'empty answer' };
    }
    
    const trimmed = answer.trim();
    
    // Check for empty/whitespace only
    if (!trimmed) {
      return { isMalformed: true, reason: 'whitespace only' };
    }
    
    // Check for special character only content
    if (/^[\s!?.,#@$%^&*()_+\-=\[\]{}|;:'"<>\\/\\`~]+$/.test(trimmed)) {
      return { isMalformed: true, reason: 'special characters only' };
    }
    
    // Check if the GWT parser would mark it as unparseable
    if (isMalformedAnswer(trimmed)) {
      return { isMalformed: true, reason: 'unparseable structure' };
    }
    
    // Check for binary/garbage content (high ratio of non-printable chars)
    if (trimmed.length > 10) {
      const nonPrintableCount = (trimmed.match(/[^\x20-\x7E\n\t\r\s]/g) || []).length;
      const nonPrintableRatio = nonPrintableCount / trimmed.length;
      if (nonPrintableRatio > 0.3) {
        return { isMalformed: true, reason: 'binary/garbage content' };
      }
    }
    
    return { isMalformed: false };
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
        const errorMessage = `pi process exited with code ${exitCode} during round ${round}: ${stderr || stdout}`;
        console.error(errorMessage);
        return {
          round,
          question,
          error: errorMessage,
        };
      }

      const responseText = stdout.trim();
      
      // Check for DONE signal - the Interrogator signals DONE when coverage is complete
      // DONE signal should be checked in the response, not in the constructed question
      // We filter out DONE prefix for storage but track the signal
      const isDone = responseText.toUpperCase().startsWith('DONE') || 
                     responseText.toUpperCase() === 'DONE';
      
      // Extract clean answer (remove DONE prefix for storage if present)
      const cleanAnswer = isDone 
        ? responseText.replace(/^DONE\s*:?\s*/i, '')
        : responseText;
      
      return {
        round,
        question,  // Always the original question text
        answer: cleanAnswer,
        isDone,  // Include DONE signal indicator for main loop
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
  public handleProcessExit(exitCode: number, round: number): void {
    console.error(`pi process exited with code ${exitCode} during round ${round}`);
  }

  /**
   * Get the current role (for testing)
   */
  getCurrentRole(): AgentRole {
    return this.currentRole;
  }

  /**
   * Get the Interrogator instance (for testing)
   */
  getInterrogator(): Interrogator {
    return this.interrogator;
  }

  /**
   * Get the current round number (for testing)
   */
  getRoundCount(): number {
    return this.roundCount;
  }
}
