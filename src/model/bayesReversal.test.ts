import { describe, expect, it } from 'vitest'
import { ensureVocInvariant, FlipError, reverseTreeWithBayes } from './bayesReversal'
import { calculateExpectedValue } from './expectedValue'
import { addOutcome, setChild, TreeNode } from './tree'
import { relinkByName } from './variable'

/** Real usage links same-named nodes at creation time (createLinkedNode).
 * These tests build trees with raw `new TreeNode`, so normalize groups from
 * base names first — mirroring what the UI would have produced. */
function flip(root: TreeNode) {
  relinkByName(root)
  return reverseTreeWithBayes(root)
}

/**
 * The classic textbook case (decision first, one chance variable, one branch
 * terminating early):
 *
 * Bet (decision)
 * ├─ "Yes" -> Weather (chance): Rain 0.3 -> 8, Sun 0.7 -> 2
 * └─ "No"  -> 3   (independent of weather)
 *
 * EV(original) = max(0.3·8 + 0.7·2, 3) = max(3.8, 3) = 3.8
 * Flipped (clairvoyance): Weather first, then Bet; "No" duplicated:
 * EV(flipped) = 0.3·max(8, 3) + 0.7·max(2, 3) = 2.4 + 2.1 = 4.5
 * VOC = 0.7
 */
function classicTree() {
  const root = new TreeNode('d', 'decision', 'Bet')
  const yes = addOutcome(root, 'Yes')
  addOutcome(root, 'No', NaN, 3)
  const weather = new TreeNode('w', 'chance', 'Weather')
  setChild(root, yes, weather)
  addOutcome(weather, 'Rain', 0.3, 8)
  addOutcome(weather, 'Sun', 0.7, 2)
  return root
}

describe('reverseTreeWithBayes — classic asymmetric case with duplication', () => {
  it('computes the hand-calculated VOC', () => {
    const result = flip(classicTree())
    expect(result.originalEv).toBeCloseTo(3.8)
    expect(result.flippedEv).toBeCloseTo(4.5)
    expect(result.voc).toBeCloseTo(0.7)
  })

  it('builds chance-first structure with marginals and duplicated terminals', () => {
    const { flipped } = flip(classicTree())

    expect(flipped.nodeType).toBe('chance')
    expect(flipped.label).toBe('Weather')
    expect(flipped.outcomes.map((o) => o.label)).toEqual(['Rain', 'Sun'])
    expect(flipped.outcomes[0].probability).toBeCloseTo(0.3)
    expect(flipped.outcomes[1].probability).toBeCloseTo(0.7)

    for (const [i, expected] of [
      [0, { Yes: 8, No: 3 }],
      [1, { Yes: 2, No: 3 }],
    ] as const) {
      const decision = flipped.outcomes[i].child!
      expect(decision.nodeType).toBe('decision')
      expect(decision.label).toBe('Bet')
      const values = Object.fromEntries(decision.outcomes.map((o) => [o.label, o.value]))
      expect(values).toEqual(expected)
    }
  })

  it('gives the flipped tree fresh flip_-prefixed ids and no shared references', () => {
    const original = classicTree()
    const { flipped } = flip(original)

    const collect = (n: TreeNode, out: TreeNode[] = []): TreeNode[] => {
      out.push(n)
      for (const o of n.outcomes) if (o.child) collect(o.child, out)
      return out
    }
    const flippedNodes = collect(flipped)
    const originalNodes = collect(original)
    for (const fn of flippedNodes) {
      expect(fn.id.startsWith('flip_')).toBe(true)
      expect(originalNodes).not.toContain(fn)
    }
  })
})

describe('reverseTreeWithBayes — two chance variables with path-dependent distributions', () => {
  /**
   * Bet (decision)
   * ├─ "Yes" -> C1 (chance): A 0.4 -> C2a, B 0.6 -> C2b
   * │            C2a: H 0.9 -> 10, T 0.1 -> 0
   * │            C2b: H 0.5 -> 2,  T 0.5 -> 4
   * └─ "No"  -> 5
   *
   * EV(Yes) = 0.4(0.9·10 + 0.1·0) + 0.6(0.5·2 + 0.5·4) = 3.6 + 1.8 = 5.4
   * EV(original) = max(5.4, 5) = 5.4
   * Flipped: C1 -> C2 -> Bet with P(C2|C1) preserved per context:
   * EV(flipped) = 0.4[0.9·max(10,5) + 0.1·max(0,5)]
   *             + 0.6[0.5·max(2,5) + 0.5·max(4,5)]
   *             = 0.4·9.5 + 0.6·5 = 3.8 + 3 = 6.8
   * VOC = 1.4
   */
  function twoChanceTree() {
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    addOutcome(root, 'No', NaN, 5)
    const c1 = new TreeNode('c1', 'chance', 'C1')
    setChild(root, yes, c1)
    const a = addOutcome(c1, 'A', 0.4)
    const b = addOutcome(c1, 'B', 0.6)
    const c2a = new TreeNode('c2a', 'chance', 'C2')
    setChild(c1, a, c2a)
    addOutcome(c2a, 'H', 0.9, 10)
    addOutcome(c2a, 'T', 0.1, 0)
    const c2b = new TreeNode('c2b', 'chance', 'C2')
    setChild(c1, b, c2b)
    addOutcome(c2b, 'H', 0.5, 2)
    addOutcome(c2b, 'T', 0.5, 4)
    return root
  }

  it('computes the hand-calculated VOC and preserves per-context distributions', () => {
    const result = flip(twoChanceTree())
    expect(result.originalEv).toBeCloseTo(5.4)
    expect(result.flippedEv).toBeCloseTo(6.8)
    expect(result.voc).toBeCloseTo(1.4)

    const { flipped } = result
    expect(flipped.label).toBe('C1')
    const underA = flipped.outcomes.find((o) => o.label === 'A')!.child!
    const underB = flipped.outcomes.find((o) => o.label === 'B')!.child!
    expect(underA.label).toBe('C2')
    expect(underA.outcomes.find((o) => o.label === 'H')!.probability).toBeCloseTo(0.9)
    expect(underB.outcomes.find((o) => o.label === 'H')!.probability).toBeCloseTo(0.5)
    // Last level is the decision with duplicated "No" payoff 5 everywhere.
    const decision = underA.outcomes[0].child!
    expect(decision.nodeType).toBe('decision')
    expect(decision.outcomes.find((o) => o.label === 'No')!.value).toBe(5)
  })

  it('VOC equals EV(flipped) − EV(original) recomputed independently', () => {
    const original = twoChanceTree()
    const { flipped, voc } = flip(original)
    expect(voc).toBeCloseTo(calculateExpectedValue(flipped) - calculateExpectedValue(original))
  })
})

describe('reverseTreeWithBayes — scope validation', () => {
  it('rejects branches that pass different variables at the same level', () => {
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    const no = addOutcome(root, 'No')
    const weather = new TreeNode('w', 'chance', 'Weather')
    setChild(root, yes, weather)
    addOutcome(weather, 'Rain', 0.5, 1)
    addOutcome(weather, 'Sun', 0.5, 2)
    const market = new TreeNode('m', 'chance', 'Market')
    setChild(root, no, market)
    addOutcome(market, 'Up', 0.5, 3)
    addOutcome(market, 'Down', 0.5, 4)

    expect(() => flip(root)).toThrow(FlipError)
    expect(() => flip(root)).toThrow(/Weather/)
    expect(() => flip(root)).toThrow(/Market/)
  })

  it('rejects the same variable with different outcome sets', () => {
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    const no = addOutcome(root, 'No')
    const w1 = new TreeNode('w1', 'chance', 'Weather')
    setChild(root, yes, w1)
    addOutcome(w1, 'Rain', 0.5, 1)
    addOutcome(w1, 'Sun', 0.5, 2)
    const w2 = new TreeNode('w2', 'chance', 'Weather')
    setChild(root, no, w2)
    addOutcome(w2, 'Rain', 0.5, 3)
    addOutcome(w2, 'Snow', 0.5, 4)

    expect(() => flip(root)).toThrow(/samma utfall överallt/)
  })

  it('rejects chance distributions that depend on the decision branch', () => {
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    const no = addOutcome(root, 'No')
    const w1 = new TreeNode('w1', 'chance', 'Weather')
    setChild(root, yes, w1)
    addOutcome(w1, 'Rain', 0.3, 1)
    addOutcome(w1, 'Sun', 0.7, 2)
    const w2 = new TreeNode('w2', 'chance', 'Weather')
    setChild(root, no, w2)
    addOutcome(w2, 'Rain', 0.5, 3)
    addOutcome(w2, 'Sun', 0.5, 4)

    expect(() => flip(root)).toThrow(/skiljer sig mellan grenar/)
  })

  it('rejects a duplicate variable label at two levels', () => {
    const root = new TreeNode('a', 'chance', 'X')
    const edge = addOutcome(root, 'go', 1)
    const inner = new TreeNode('b', 'chance', 'X')
    setChild(root, edge, inner)
    addOutcome(inner, 'stop', 1, 5)

    expect(() => flip(root)).toThrow(/två olika nivåer/)
  })

  it('rejects chance probabilities that do not sum to 1', () => {
    const root = new TreeNode('w', 'chance', 'Weather')
    addOutcome(root, 'Rain', 0.3, 1)
    addOutcome(root, 'Sun', 0.3, 2)
    expect(() => flip(root)).toThrow(/summerar till 0.6/)
  })

  it('rejects an empty tree', () => {
    expect(() => flip(new TreeNode('r', 'chance', 'R'))).toThrow(FlipError)
  })
})

describe('reverseTreeWithBayes — variableId-based matching', () => {
  it('recognizes linked instances as the same variable despite primed display names', () => {
    // Bet(decision): Yes -> Väder (primary), No -> Väder' (linked instance).
    // Same variableId, different display names, same outcomes/distribution.
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    const no = addOutcome(root, 'No')
    const primary = new TreeNode('w1', 'chance', 'Väder')
    setChild(root, yes, primary)
    addOutcome(primary, 'Regn', 0.3, 8)
    addOutcome(primary, 'Sol', 0.7, 2)
    const secondary = new TreeNode('w2', 'chance', 'Väder')
    setChild(root, no, secondary)
    addOutcome(secondary, 'Regn', 0.3, 1)
    addOutcome(secondary, 'Sol', 0.7, 5)

    // Explicitly link them (as createLinkedNode would): shared variableId,
    // secondary primed to instance 1.
    secondary.variableId = primary.variableId
    secondary.instanceIndex = 1
    expect(secondary.label).toBe('Väder') // base name shared

    // Same variable at one level -> flippable. Väder goes first (chance),
    // then the Bet decision. EV(orig) = max(0.3·8+0.7·2, 0.3·1+0.7·5) =
    // max(3.8, 3.8) = 3.8. Flipped: 0.3·max(8,1) + 0.7·max(2,5) = 2.4+3.5 = 5.9.
    const result = reverseTreeWithBayes(root)
    expect(result.flipped.label).toBe('Väder')
    expect(result.originalEv).toBeCloseTo(3.8)
    expect(result.flippedEv).toBeCloseTo(5.9)
    expect(result.voc).toBeCloseTo(2.1)
  })

  it('rejects two same-named but UNLINKED nodes (different variableId) as different variables', () => {
    // Identical to the case above but NOT linked — coincidental name match.
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    const no = addOutcome(root, 'No')
    const a = new TreeNode('w1', 'chance', 'Väder')
    setChild(root, yes, a)
    addOutcome(a, 'Regn', 0.3, 8)
    addOutcome(a, 'Sol', 0.7, 2)
    const b = new TreeNode('w2', 'chance', 'Väder')
    setChild(root, no, b)
    addOutcome(b, 'Regn', 0.3, 1)
    addOutcome(b, 'Sol', 0.7, 5)

    // No relink, distinct variableIds (w1, w2) -> treated as different
    // variables at the same level -> reject.
    expect(() => reverseTreeWithBayes(root)).toThrow(
      /samma variabler i samma ordning|samma namn behandlas som samma variabel bara när de är länkade/,
    )
  })
})

describe('reverseTreeWithBayes — edge cases and invariants', () => {
  it('is a VOC = 0 no-op when chance already precedes the decision', () => {
    // Weather (chance): Rain 0.3 -> D(Stop 0 / Go 8), Sun 0.7 -> D(Stop 5 / Go 1)
    const root = new TreeNode('w', 'chance', 'Weather')
    const rain = addOutcome(root, 'Rain', 0.3)
    const sun = addOutcome(root, 'Sun', 0.7)
    const d1 = new TreeNode('d1', 'decision', 'Act')
    setChild(root, rain, d1)
    addOutcome(d1, 'Stop', NaN, 0)
    addOutcome(d1, 'Go', NaN, 8)
    const d2 = new TreeNode('d2', 'decision', 'Act')
    setChild(root, sun, d2)
    addOutcome(d2, 'Stop', NaN, 5)
    addOutcome(d2, 'Go', NaN, 1)

    const result = flip(root)
    // EV = 0.3·max(0,8) + 0.7·max(5,1) = 2.4 + 3.5 = 5.9 in both trees.
    expect(result.originalEv).toBeCloseTo(5.9)
    expect(result.flippedEv).toBeCloseTo(5.9)
    expect(result.voc).toBe(0)
  })

  it('propagates NaN for unset probabilities instead of fabricating a VOC', () => {
    const root = new TreeNode('w', 'chance', 'Weather')
    addOutcome(root, 'Rain', NaN, 8)
    addOutcome(root, 'Sun', NaN, 2)
    const result = flip(root)
    expect(Number.isNaN(result.voc)).toBe(true)
    expect(result.flipped.outcomes.every((o) => Number.isNaN(o.probability))).toBe(true)
  })

  it('ensureVocInvariant throws on a genuinely negative VOC and clamps float noise', () => {
    expect(() => ensureVocInvariant(-0.5)).toThrow(FlipError)
    expect(() => ensureVocInvariant(-0.5)).toThrow(/negativt/)
    expect(ensureVocInvariant(-1e-12)).toBe(0)
    expect(ensureVocInvariant(0.3)).toBeCloseTo(0.3)
    expect(Number.isNaN(ensureVocInvariant(NaN))).toBe(true)
  })

  // Regression (part 1): node type/VOC must read node.nodeType, never assume a
  // position (e.g. "root is a decision"). A tree with a CHANCE node as root and
  // a decision *below* a later chance must still produce the correct nonzero VOC
  // — clairvoyance about the deeper chance variable moves it ahead of the
  // decision even though the root chance is already first.
  describe('chance-node root (no position-based type assumption)', () => {
    it('chance root -> decision -> chance yields the correct nonzero VOC', () => {
      // C1(chance): a 0.5 / b 0.5
      //   under each: Bet(decision): Go -> Payoff(chance): win 0.5 -> 10 / lose 0.5 -> 0
      //                              Stay -> 4
      const root = new TreeNode('c1', 'chance', 'C1')
      const ea = addOutcome(root, 'a', 0.5)
      const eb = addOutcome(root, 'b', 0.5)
      const branch = (tag: string) => {
        const d = new TreeNode('bet' + tag, 'decision', 'Bet')
        const go = addOutcome(d, 'Go')
        addOutcome(d, 'Stay', NaN, 4)
        const c2 = new TreeNode('pay' + tag, 'chance', 'Payoff')
        addOutcome(c2, 'win', 0.5, 10)
        addOutcome(c2, 'lose', 0.5, 0)
        setChild(d, go, c2)
        return d
      }
      setChild(root, ea, branch('a'))
      setChild(root, eb, branch('b'))

      const r = flip(root)
      // Original: each branch max(EV(Payoff)=5, Stay=4) = 5 -> 0.5·5 + 0.5·5 = 5.
      expect(r.originalEv).toBeCloseTo(5)
      // Clairvoyance: know Payoff before Bet: win->max(10,4)=10, lose->max(0,4)=4
      //   -> 0.5·10 + 0.5·4 = 7. C1 already known. VOC = 2 (NOT 0).
      expect(r.flippedEv).toBeCloseTo(7)
      expect(r.voc).toBeCloseTo(2)
      // The flipped root is a chance node (Payoff moves first), read from type.
      expect(r.flipped.nodeType).toBe('chance')
    })

    it('chance root already ahead of every decision correctly gives VOC 0', () => {
      // Weather(chance) -> Bet(decision): the chance is already observed before
      // deciding, so clairvoyance adds nothing. VOC 0 here is CORRECT, not a bug.
      const root = new TreeNode('w', 'chance', 'Weather')
      const sun = addOutcome(root, 'Sun', 0.5)
      const rain = addOutcome(root, 'Rain', 0.5)
      const bet = (tag: string, go: number) => {
        const d = new TreeNode('bet' + tag, 'decision', 'Bet')
        addOutcome(d, 'Yes', NaN, go)
        addOutcome(d, 'No', NaN, 5)
        return d
      }
      setChild(root, sun, bet('a', 10))
      setChild(root, rain, bet('b', 0))
      expect(flip(root).voc).toBeCloseTo(0)
    })
  })
})
