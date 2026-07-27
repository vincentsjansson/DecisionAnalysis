import { describe, expect, it } from 'vitest'
import {
  applyInverseUtility,
  applyUtility,
  defaultUtilityFunction,
  gammaFromIndifference,
  gammaFromReferenceAmount,
  riskOddsFromGamma,
  UtilityDomainError,
} from './utility'
import type { UtilityFunction } from './utility'

describe('applyUtility — known values', () => {
  it('linear is the identity', () => {
    expect(applyUtility(7, { type: 'linear', parameter: 0 })).toBe(7)
  })

  it('exponential: u(x) = (1 − e^(−γ·x)) / γ', () => {
    // γ = 0.1, x = 10 -> (1 − e^-1)/0.1 = 6.32120…
    expect(applyUtility(10, { type: 'exponential', parameter: 0.1 })).toBeCloseTo(6.32120559)
  })

  it('exponential reduces to identity as γ → 0', () => {
    expect(applyUtility(10, { type: 'exponential', parameter: 0 })).toBe(10)
  })

  it('propagates NaN instead of throwing (unset payoff)', () => {
    for (const fn of [
      { type: 'linear', parameter: 0 },
      { type: 'exponential', parameter: 0.1 },
    ] as UtilityFunction[]) {
      expect(Number.isNaN(applyUtility(NaN, fn))).toBe(true)
    }
  })
})

describe('applyInverseUtility — round trip u⁻¹(u(x)) ≈ x', () => {
  const cases: { fn: UtilityFunction; xs: number[] }[] = [
    { fn: { type: 'linear', parameter: 0 }, xs: [-10, 0, 3.5, 42] },
    { fn: { type: 'exponential', parameter: 0.1 }, xs: [-10, 0, 5, 25, 100] },
    { fn: { type: 'exponential', parameter: -0.1 }, xs: [-10, 0, 5, 25] },
    { fn: { type: 'exponential', parameter: 0 }, xs: [-10, 0, 7] }, // neutral limit
  ]

  for (const { fn, xs } of cases) {
    it(`${fn.type} (γ ${fn.parameter})`, () => {
      for (const x of xs) {
        expect(applyInverseUtility(applyUtility(x, fn), fn)).toBeCloseTo(x, 6)
      }
    })
  }
})

describe('applyInverseUtility — domain error', () => {
  it('exponential inverse rejects 1 − γ·u ≤ 0', () => {
    // γ = 0.1 -> utility bounded above by 1/γ = 10
    expect(() => applyInverseUtility(11, { type: 'exponential', parameter: 0.1 })).toThrow(
      /must be > 0/,
    )
  })
})

describe('γ elicitation (course methods)', () => {
  it('method 1: γ = ln(p / (1 − p)) from the indifference probability', () => {
    // p = 0.6 -> ln(0.6/0.4) = ln(1.5) = 0.405465…
    expect(gammaFromIndifference(0.6)).toBeCloseTo(Math.log(1.5))
    // p > 0.5 -> γ > 0 (risk-averse); p < 0.5 -> γ < 0 (risk-seeking)
    expect(gammaFromIndifference(0.7)).toBeGreaterThan(0)
    expect(gammaFromIndifference(0.3)).toBeLessThan(0)
  })

  it('method 1: p = 0.5 is the risk-neutral degenerate case (γ = 0)', () => {
    expect(gammaFromIndifference(0.5)).toBeCloseTo(0)
  })

  it('method 1: γ = ln(p/(1−p)) actually solves the CARA indifference equation', () => {
    // u(0) = p·u(1) + (1−p)·u(−1) must hold at the elicited γ.
    const p = 0.65
    const fn: UtilityFunction = { type: 'exponential', parameter: gammaFromIndifference(p) }
    const lhs = applyUtility(0, fn)
    const rhs = p * applyUtility(1, fn) + (1 - p) * applyUtility(-1, fn)
    expect(lhs).toBeCloseTo(rhs, 10)
  })

  it('method 1: rejects p outside (0, 1)', () => {
    expect(() => gammaFromIndifference(0)).toThrow(UtilityDomainError)
    expect(() => gammaFromIndifference(1)).toThrow(UtilityDomainError)
  })

  it('method 2: γ ≈ 0.96 / W from the reference amount', () => {
    expect(gammaFromReferenceAmount(100)).toBeCloseTo(0.0096)
    expect(gammaFromReferenceAmount(48)).toBeCloseTo(0.02)
  })

  it('method 2: rejects W ≤ 0', () => {
    expect(() => gammaFromReferenceAmount(0)).toThrow(UtilityDomainError)
    expect(() => gammaFromReferenceAmount(-5)).toThrow(UtilityDomainError)
  })

  it('risk odds r = e^γ round-trips with γ = ln(r)', () => {
    expect(riskOddsFromGamma(gammaFromIndifference(0.6))).toBeCloseTo(0.6 / 0.4)
  })
})

describe('defaultUtilityFunction', () => {
  it('exponential default is a moderate risk-averse γ', () => {
    expect(defaultUtilityFunction('exponential')).toEqual({ type: 'exponential', parameter: 0.1 })
  })
})
