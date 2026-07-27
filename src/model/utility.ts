export type UtilityType = 'linear' | 'exponential'

/** A parametrized utility function, matching the course's u-curve forms.
 * `parameter` means different things by type:
 * - linear:      unused. u(x) = x (risk-neutral). Since only the ordering of
 *                utilities matters, the general affine a + b·x is equivalent
 *                to the identity, so we implement u(x) = x and CE = EV.
 * - exponential: γ (gamma), the CARA coefficient. u(x) = (1 − e^(−γ·x)) / γ,
 *                γ → 0 the risk-neutral limit. γ > 0 risk-averse,
 *                γ < 0 risk-seeking. The course's "risk odds" r relate by
 *                γ = ln(r): r > 1 averse, r = 1 neutral, r < 1 seeking. */
export interface UtilityFunction {
  type: UtilityType
  parameter: number
}

/** Sensible starting parameter so a first-time user gets a reasonable curve.
 * γ = 0.1 gives visible but moderate risk aversion for payoffs in the tens. */
export const DEFAULT_PARAMETERS: Record<UtilityType, number> = {
  linear: 0,
  exponential: 0.1,
}

export function defaultUtilityFunction(type: UtilityType): UtilityFunction {
  return { type, parameter: DEFAULT_PARAMETERS[type] }
}

export class UtilityDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UtilityDomainError'
  }
}

/** Transforms a money value into utility. NaN (an unset payoff) propagates as
 * NaN rather than throwing — the tree shows "–" for incomplete data, same as
 * everywhere else. */
export function applyUtility(value: number, fn: UtilityFunction): number {
  switch (fn.type) {
    case 'linear':
      return value

    case 'exponential': {
      const gamma = fn.parameter
      if (gamma === 0) return value // limit γ → 0 is the risk-neutral identity
      return (1 - Math.exp(-gamma * value)) / gamma
    }
  }
}

/** Inverse of `applyUtility`: maps a utility back to the money value with that
 * utility — the certainty equivalent. NaN propagates; an out-of-range utility
 * fails loudly with a specific message (the project's "no silent wrong
 * answers" convention). */
export function applyInverseUtility(utility: number, fn: UtilityFunction): number {
  switch (fn.type) {
    case 'linear':
      return utility

    case 'exponential': {
      const gamma = fn.parameter
      if (gamma === 0) return utility
      const arg = 1 - gamma * utility
      if (Number.isFinite(arg) && arg <= 0) {
        throw new UtilityDomainError(
          `Exponential inverse undefined: 1 − γ·u = ${arg} must be > 0 (γ = ${gamma}, u = ${utility}).`,
        )
      }
      return -Math.log(arg) / gamma
    }
  }
}

// ── γ elicitation (course methods) ──────────────────────────────────────────

/** γ from the direct indifference question: the user is indifferent between 0
 * for certain and a gamble that wins 1 with probability p and loses 1 with
 * probability 1 − p. Solving the CARA indifference u(0) = p·u(1) + (1−p)·u(−1)
 * gives the course's risk-odds r(1) = p / (1 − p) and γ = ln(r(1)) exactly
 * (verified: e^γ = p/(1−p) satisfies the equation). p = 0.5 → γ = 0
 * (risk-neutral). */
export function gammaFromIndifference(p: number): number {
  if (!(p > 0 && p < 1)) {
    throw new UtilityDomainError(
      `Indifferenssannolikheten p måste ligga i (0, 1), fick ${p}.`,
    )
  }
  return Math.log(p / (1 - p))
}

/** γ from the quick reference-amount approximation: given a reference amount W
 * the user bases their risk attitude on (indifference for a 50/50 gamble of
 * +W vs −W/2 against 0), the course's closed form is γ ≈ 0.96 / W. */
export function gammaFromReferenceAmount(W: number): number {
  if (!(W > 0)) {
    throw new UtilityDomainError(`Referensbeloppet W måste vara > 0, fick ${W}.`)
  }
  return 0.96 / W
}

/** The course's "risk odds" r = e^γ, shown alongside γ in the elicitation UI. */
export function riskOddsFromGamma(gamma: number): number {
  return Math.exp(gamma)
}
