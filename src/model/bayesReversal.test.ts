import { afterEach, describe, expect, it } from 'vitest'
import { ensureVocInvariant, FlipError, reverseTreeWithBayes } from './bayesReversal'
import { calculateExpectedValue } from './expectedValue'
import { addOutcome, setChild, TreeNode } from './tree'
import { relinkByName } from './variable'
import { setLang } from '../i18n'

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

describe('reverseTreeWithBayes — a chance node whose distribution depends on context', () => {
  /**
   * Bet (decision)
   * ├─ "Yes" -> C1 (chance): A 0.4 -> C2a, B 0.6 -> C2b
   * │            C2a: H 0.9 -> 10, T 0.1 -> 0   (C2's distribution depends on C1!)
   * │            C2b: H 0.5 -> 2,  T 0.5 -> 4
   * └─ "No"  -> 5
   *
   * Under the OLD chance-before-decision algorithm this flipped fine — C1
   * always preceded C2 in the reversed tree, so C2's context (which C1 branch)
   * was always already known by the time C2 needed a distribution. Under FULL
   * sequence reversal (segment 22), the whole order reverses: C2 (originally
   * deepest) is now built BEFORE C1 (originally shallowest) — so at the point
   * C2 needs a distribution, C1's value isn't chosen yet. Since probabilities
   * are carried unchanged (no Bayesian recomputation), there's no way to know
   * which of C2's two distributions (0.9/0.1 vs 0.5/0.5) applies — this must
   * fail loud rather than guess.
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

  it('fails loud: C2 depends on C1, which would end up placed after it', () => {
    expect(() => flip(twoChanceTree())).toThrow(FlipError)
    expect(() => flip(twoChanceTree())).toThrow(/olika sannolikheter beroende på kontext/)
  })

  it('a chance node with NO context-dependence still flips fine (control case)', () => {
    // Same shape, but C2 has the SAME distribution everywhere -> no conflict.
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
    addOutcome(c2b, 'H', 0.9, 2) // same 0.9/0.1 as c2a — no context-dependence
    addOutcome(c2b, 'T', 0.1, 4)

    expect(() => flip(root)).not.toThrow()
    const { flipped, voc } = flip(root)
    expect(voc).toBeCloseTo(calculateExpectedValue(flipped) - calculateExpectedValue(root))
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

  it('rejects chance distributions that differ by context (any ancestor, not just decisions)', () => {
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

    expect(() => flip(root)).toThrow(/olika sannolikheter beroende på kontext/)
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
  it('full reversal is NEVER a no-op for two different-typed variables, even chance-first', () => {
    // Weather (chance): Rain 0.3 -> D(Stop 0 / Go 8), Sun 0.7 -> D(Stop 5 / Go 1)
    // Weather already precedes Act — under the OLD chance-first algorithm this
    // was a no-op (VOC=0). Under full reversal (segment 22), Act and Weather
    // swap places regardless (a→b always becomes b→a), so this is genuinely
    // NOT a no-op anymore: the new root is Act (decision), Weather comes after.
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
    // Original (unchanged): EV = 0.3·max(0,8) + 0.7·max(5,1) = 2.4 + 3.5 = 5.9.
    expect(result.originalEv).toBeCloseTo(5.9)
    expect(result.flipped.nodeType).toBe('decision')
    expect(result.flipped.label).toBe('Act')
    // Reversed: Act(root) -> Weather -> payoff. Under Act=Stop: Weather(Rain=0.3
    // ->0, Sun=0.7->5) = 3.5. Under Act=Go: Weather(Rain=0.3->8, Sun=0.7->1) =
    // 2.4+0.7=3.1. Act is a decision -> max(3.5, 3.1) = 3.5.
    expect(result.flippedEv).toBeCloseTo(3.5)
    expect(result.voc).toBeCloseTo(3.5 - 5.9)
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

    it('reverses even when chance already precedes the decision (full reversal, not a no-op)', () => {
      // Weather(chance) -> Bet(decision). Under the OLD chance-first algorithm
      // this was a no-op (chance already first). Under full reversal (segment
      // 22) the whole sequence flips regardless: Bet becomes root, Weather
      // moves after it — so this is NOT VOC=0 anymore.
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
      const r = flip(root)
      expect(r.flipped.nodeType).toBe('decision')
      expect(r.flipped.label).toBe('Bet')
      // Original: Sun(0.5)->max(10,5)=10; Rain(0.5)->max(0,5)=5. EV=0.5*10+0.5*5=7.5.
      expect(r.originalEv).toBeCloseTo(7.5)
      // Reversed: Bet(root) -> Weather -> payoff. Under Bet=Yes: Weather(Sun=0.5
      // ->10, Rain=0.5->0)=5. Under Bet=No: Weather(Sun=0.5->5,Rain=0.5->5)=5.
      // Bet is a decision -> max(5,5)=5.
      expect(r.flippedEv).toBeCloseTo(5)
      expect(r.voc).toBeCloseTo(5 - 7.5)
    })
  })
})

describe('FlipError messages follow the active language', () => {
  afterEach(() => setLang('sv')) // restore default so other model tests stay Swedish

  it('translates the flip error to English / Swedish', () => {
    const emptyRoot = () => new TreeNode('r', 'chance', 'R') // no outcomes -> flip throws

    setLang('en')
    expect(() => reverseTreeWithBayes(emptyRoot())).toThrow(/Cannot reverse: the tree has no outcomes/)

    setLang('sv')
    expect(() => reverseTreeWithBayes(emptyRoot())).toThrow(/Kan inte vända: trädet har inga utfall/)
  })
})
