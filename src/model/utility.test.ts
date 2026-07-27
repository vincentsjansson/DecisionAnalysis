import { describe, expect, it } from 'vitest'
import {
  applyInverseUtility,
  applyUtility,
  defaultUtilityFunction,
  UtilityDomainError,
} from './utility'
import type { UtilityFunction } from './utility'

describe('applyUtility — known values', () => {
  it('linear is the identity', () => {
    expect(applyUtility(7, { type: 'linear', parameter: 0 })).toBe(7)
  })

  it('quadratic: u(x) = x − b·x²', () => {
    // b = 0.01, x = 10 -> 10 − 0.01·100 = 9
    expect(applyUtility(10, { type: 'quadratic', parameter: 0.01 })).toBeCloseTo(9)
  })

  it('exponential: u(x) = (1 − e^(−r·x)) / r', () => {
    // r = 0.1, x = 10 -> (1 − e^-1)/0.1 = 6.32120…
    expect(applyUtility(10, { type: 'exponential', parameter: 0.1 })).toBeCloseTo(6.32120559)
  })

  it('exponential reduces to identity as r → 0', () => {
    expect(applyUtility(10, { type: 'exponential', parameter: 0 })).toBe(10)
  })

  it('logarithmic: u(x) = ln(x + k)', () => {
    expect(applyUtility(9, { type: 'logarithmic', parameter: 1 })).toBeCloseTo(Math.log(10))
  })
})

describe('applyUtility — domain errors (fail loud)', () => {
  it('quadratic rejects b ≤ 0', () => {
    expect(() => applyUtility(1, { type: 'quadratic', parameter: 0 })).toThrow(UtilityDomainError)
  })

  it('quadratic rejects a payoff past the increasing range', () => {
    // b = 0.01 -> increasing only below x = 50
    expect(() => applyUtility(60, { type: 'quadratic', parameter: 0.01 })).toThrow(
      /only increasing below/,
    )
  })

  it('logarithmic rejects payoff + k ≤ 0', () => {
    expect(() => applyUtility(-5, { type: 'logarithmic', parameter: 1 })).toThrow(
      /requires payoff \+ k > 0/,
    )
  })

  it('propagates NaN instead of throwing (unset payoff)', () => {
    for (const fn of [
      { type: 'linear', parameter: 0 },
      { type: 'quadratic', parameter: 0.01 },
      { type: 'exponential', parameter: 0.1 },
      { type: 'logarithmic', parameter: 1 },
    ] as UtilityFunction[]) {
      expect(Number.isNaN(applyUtility(NaN, fn))).toBe(true)
    }
  })
})

describe('applyInverseUtility — round trip u⁻¹(u(x)) ≈ x', () => {
  const cases: { fn: UtilityFunction; xs: number[] }[] = [
    { fn: { type: 'linear', parameter: 0 }, xs: [-10, 0, 3.5, 42] },
    { fn: { type: 'quadratic', parameter: 0.01 }, xs: [0, 1, 8, 20, 40] },
    { fn: { type: 'exponential', parameter: 0.1 }, xs: [-10, 0, 5, 25, 100] },
    { fn: { type: 'exponential', parameter: -0.1 }, xs: [-10, 0, 5, 25] },
    { fn: { type: 'logarithmic', parameter: 1 }, xs: [0, 2, 8, 40] },
  ]

  for (const { fn, xs } of cases) {
    it(`${fn.type} (parameter ${fn.parameter})`, () => {
      for (const x of xs) {
        expect(applyInverseUtility(applyUtility(x, fn), fn)).toBeCloseTo(x, 6)
      }
    })
  }
})

describe('applyInverseUtility — domain errors', () => {
  it('quadratic inverse rejects utility above the reachable max', () => {
    // b = 0.01 -> max utility 1/(4b) = 25
    expect(() => applyInverseUtility(30, { type: 'quadratic', parameter: 0.01 })).toThrow(
      /exceeds the maximum/,
    )
  })

  it('exponential inverse rejects 1 − r·u ≤ 0', () => {
    // r = 0.1 -> utility bounded above by 1/r = 10
    expect(() => applyInverseUtility(11, { type: 'exponential', parameter: 0.1 })).toThrow(
      /must be > 0/,
    )
  })
})

describe('defaultUtilityFunction', () => {
  it('provides sensible per-type defaults', () => {
    expect(defaultUtilityFunction('quadratic')).toEqual({ type: 'quadratic', parameter: 0.01 })
    expect(defaultUtilityFunction('exponential')).toEqual({ type: 'exponential', parameter: 0.1 })
    expect(defaultUtilityFunction('logarithmic')).toEqual({ type: 'logarithmic', parameter: 1 })
  })
})
