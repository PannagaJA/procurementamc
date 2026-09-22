/** Typed, human-readable procurement rule violations. */
export class ProcurementRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProcurementRuleError";
    this.code = code;
  }
}

export class ForbiddenError extends ProcurementRuleError {
  constructor(message: string) {
    super("forbidden", message);
    this.name = "ForbiddenError";
  }
}

export const ruleError = (code: string, message: string) => new ProcurementRuleError(code, message);
