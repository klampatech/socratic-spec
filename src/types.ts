// Types for spec draft synthesis (FEAT-002)

export interface GivenWhenThen {
  given: string;
  when: string;
  then: string;
  sourceAnswer: string;
  timestamp: number;
}

export interface SpecDraft {
  entries: GivenWhenThen[];
  featureId: string;
  lastUpdated: number;
}

export interface RoundResult {
  specDraft: SpecDraft;
  success: boolean;
  error?: string;
  incompleteReason?: string;
}

export interface AnswerProcessingResult {
  draft: SpecDraft;
  roundResult: RoundResult;
}

export interface ContradictionResult {
  hasContradiction: boolean;
  conflictingEntry?: GivenWhenThen;
  conflictType?: 'given' | 'when' | 'then';
  reason?: string;
}
