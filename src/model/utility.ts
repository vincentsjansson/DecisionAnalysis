export type UtilityType = 'linear' | 'quadratic' | 'exponential' | 'logarithmic'

/** A parametrized utility function. `parameter` means different things by
 * type — one scalar per type, which keeps the config UI to a single input:
 * - linear:      unused (u(x) = x, risk-neutral)
 * - quadratic:   b > 0, aversion strength; u(x) = x − b·x²
 * - exponential: r, CARA coefficient; u(x) = (1 − e^(−r·x)) / r  (r>0 averse)
 * - logarithmic: k, shift; u(x) = ln(x + k), requires x + k > 0 */
export interface UtilityFunction {
  type: UtilityType
  parameter: number
}

/** Sensible starting parameters so a first-time user gets a reasonable curve
 * without knowing what to type. quadratic b=0.01 stays monotonically
 * increasing for payoffs up to 1/(2b) = 50; exponential r=0.1 gives visible
 * but moderate curvature for payoffs in the tens; logarithmic k=1 accepts any
 * payoff > −1. */
export const DEFAULT_PARAMETERS: Record<UtilityType, number> = {
  linear: 0,
  quadratic: 0.01,
  exponential: 0.1,
  logarithmic: 1,
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
 * everywhere else. A genuinely out-of-domain *finite* value fails loudly with
 * a specific message (the project's "no silent wrong answers" convention). */
export function applyUtility(value: number, fn: UtilityFunction): number {
  switch (fn.type) {
    case 'linear':
      return value

    case 'quadratic': {
      const b = fn.parameter
      if (!(b > 0)) {
        throw new UtilityDomainError(
          `Quadratic utility needs b > 0, got b = ${b}.`,
        )
      }
      // u is only increasing below the vertex x = 1/(2b); beyond it, more
      // money would mean less utility, which is nonsensical and non-invertible.
      if (Number.isFinite(value) && value >= 1 / (2 * b)) {
        throw new UtilityDomainError(
          `Quadratic utility with b = ${b} is only increasing below x = ${1 / (2 * b)}, ` +
            `but a payoff is ${value}. Lower b or use another utility type.`,
        )
      }
      return value - b * value * value
    }

    case 'exponential': {
      const r = fn.parameter
      if (r === 0) return value // limit r → 0 is the risk-neutral identity
      return (1 - Math.exp(-r * value)) / r
    }

    case 'logarithmic': {
      const k = fn.parameter
      if (Number.isFinite(value) && value + k <= 0) {
        throw new UtilityDomainError(
          `Logarithmic utility requires payoff + k > 0, but payoff ${value} + k ${k} = ` +
            `${value + k} ≤ 0. Increase k or use another utility type.`,
        )
      }
      return Math.log(value + k)
    }
  }
}

/** Inverse of `applyUtility`: maps a utility back to the money value with that
 * utility — the certainty equivalent. NaN propagates; out-of-range utilities
 * fail loudly. */
export function applyInverseUtility(utility: number, fn: UtilityFunction): number {
  switch (fn.type) {
    case 'linear':
      return utility

    case 'quadratic': {
      const b = fn.parameter
      if (!(b > 0)) {
        throw new UtilityDomainError(`Quadratic utility needs b > 0, got b = ${b}.`)
      }
      const disc = 1 - 4 * b * utility
      if (Number.isFinite(disc) && disc < 0) {
        throw new UtilityDomainError(
          `Quadratic inverse undefined: utility ${utility} exceeds the maximum ` +
            `${1 / (4 * b)} reachable with b = ${b}.`,
        )
      }
      // Lower root — the increasing branch (x < 1/(2b)).
      return (1 - Math.sqrt(disc)) / (2 * b)
    }

    case 'exponential': {
      const r = fn.parameter
      if (r === 0) return utility
      const arg = 1 - r * utility
      if (Number.isFinite(arg) && arg <= 0) {
        throw new UtilityDomainError(
          `Exponential inverse undefined: 1 − r·u = ${arg} must be > 0 (r = ${r}, u = ${utility}).`,
        )
      }
      return -Math.log(arg) / r
    }

    case 'logarithmic': {
      const k = fn.parameter
      return Math.exp(utility) - k
    }
  }
}
