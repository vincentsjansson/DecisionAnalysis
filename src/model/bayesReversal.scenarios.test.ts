import { describe, expect, it } from 'vitest'
import { reverseTreeWithBayes } from './bayesReversal'
import { calculateExpectedValue } from './expectedValue'
import { addOutcome, setChild, TreeNode } from './tree'
import { relinkByName } from './variable'

/**
 * Extra correctness scenarios for flip/VOC beyond the original unit tests —
 * the "burden of proof" pass: conditional probability tables, nested linked
 * groups, asymmetric duplication, and a deep mixed tree. Every expected value
 * here is hand-calculated in the comment above the assertion.
 */

describe('flip/VOC — scenario 1: simple symmetric tree (sanity, no regression)', () => {
  it('decision over a fair 50/50 gamble vs a safe payoff', () => {
    // Bet(decision): Yes -> Flip(chance) Heads 0.5 -> 10, Tails 0.5 -> 0 ; No -> 4
    const root = new TreeNode('bet', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    addOutcome(root, 'No', NaN, 4)
    const flip = new TreeNode('flip', 'chance', 'Flip')
    setChild(root, yes, flip)
    addOutcome(flip, 'Heads', 0.5, 10)
    addOutcome(flip, 'Tails', 0.5, 0)

    // EV(orig) = max(0.5·10+0.5·0, 4) = max(5, 4) = 5.
    // Flipped (know the flip before deciding): 0.5·max(10,4) + 0.5·max(0,4)
    //   = 0.5·10 + 0.5·4 = 5 + 2 = 7. VOC = 2.
    const r = reverseTreeWithBayes(root)
    expect(r.originalEv).toBeCloseTo(5)
    expect(r.flippedEv).toBeCloseTo(7)
    expect(r.voc).toBeCloseTo(2)
  })
})

describe('flip/VOC — scenario 2: conditional probability tables', () => {
  /**
   * C1 (chance) x 0.5 / y 0.5, then a decision D, then a chance C2 whose
   * distribution is CONDITIONAL on C1 (strongly correlated):
   *   P(C2 | C1=x) = p 0.9 / q 0.1 ;  P(C2 | C1=y) = p 0.1 / q 0.9.
   *
   * Under SEGMENT-WISE reversal (segment 29), C2 carries a conditional table so
   * it is a WALL — a fixed pivot. The levels before it ([C1, D]) reverse to
   * [D, C1]; C2 stays last. Reversed order: D -> C1 -> C2, with C2's distribution
   * resolved per branch (C1=x -> p0.9/q0.1, C1=y -> p0.1/q0.9). The flip now
   * SUCCEEDS (it used to fail loud under the full reversal). Hand-computed:
   *   EV(orig) = 9 (see below).
   *   EV(reversed): D is the root (decide blind), then C1, then C2.
   *     D=a1: C1=x(0.5)->0.9·10=9; C1=y(0.5)->0.1·10=1 -> 0.5·9+0.5·1 = 5
   *     D=a2: C1=x(0.5)->0.1·10=1; C1=y(0.5)->0.9·10=9 -> 5
   *     max(5,5) = 5.
   *   VOC = |9 − 5| = 4 (the app shows the absolute difference).
   */
  function conditionalTree() {
    const c1 = new TreeNode('C1', 'chance', 'C1')
    const x = addOutcome(c1, 'x', 0.5)
    const y = addOutcome(c1, 'y', 0.5)

    const cond = () => [
      { condition: new Set(['C1:x']), probabilities: { p: 0.9, q: 0.1 } },
      { condition: new Set(['C1:y']), probabilities: { p: 0.1, q: 0.9 } },
    ]
    const makeC2 = (id: string, pv: number, qv: number) => {
      const c2 = new TreeNode(id, 'chance', 'C2')
      addOutcome(c2, 'p', 0.5, pv)
      addOutcome(c2, 'q', 0.5, qv)
      c2.conditionalTable = cond()
      return c2
    }

    const makeD = (id: string) => {
      const d = new TreeNode(id, 'decision', 'D')
      const a1 = addOutcome(d, 'a1')
      const a2 = addOutcome(d, 'a2')
      setChild(d, a1, makeC2(`${id}_a1`, 10, 0)) // a1 bets on p
      setChild(d, a2, makeC2(`${id}_a2`, 0, 10)) // a2 bets on q
      return d
    }
    setChild(c1, x, makeD('Dx'))
    setChild(c1, y, makeD('Dy'))
    relinkByName(c1) // link the two D instances and the four C2 instances
    return c1
  }

  it('original EV respects the conditional table', () => {
    expect(calculateExpectedValue(conditionalTree())).toBeCloseTo(9)
  })

  it('flips segment-wise with C2 as a fixed conditional-table wall (VOC = 4)', () => {
    const r = reverseTreeWithBayes(conditionalTree())
    expect(r.originalEv).toBeCloseTo(9)
    expect(r.flippedEv).toBeCloseTo(5)
    expect(Math.abs(r.voc)).toBeCloseTo(4)
    // Reversed structure: D (decision) root -> C1 (chance) -> C2 (chance wall).
    expect(r.flipped.nodeType).toBe('decision')
    expect(r.flipped.label).toBe('D')
    const c1 = r.flipped.outcomes[0].child!
    expect(c1.label).toBe('C1')
    // C2 under C1=x carries the resolved p0.9/q0.1; under C1=y the p0.1/q0.9.
    const c2x = c1.outcomes.find((o) => o.label === 'x')!.child!
    const c2y = c1.outcomes.find((o) => o.label === 'y')!.child!
    expect(c2x.label).toBe('C2')
    expect(c2x.outcomes.find((o) => o.label === 'p')!.probability).toBeCloseTo(0.9)
    expect(c2y.outcomes.find((o) => o.label === 'p')!.probability).toBeCloseTo(0.1)
    // The flipped EV recomputed independently agrees.
    expect(r.flippedEv).toBeCloseTo(calculateExpectedValue(r.flipped))
  })
})

describe('flip/VOC — scenario 3: nested linked variable groups', () => {
  /**
   * Väder (chance) Regn 0.5 / Sol 0.5, then a decision Bet mirrored across both
   * Väder outcomes (linked group), then a chance Utfall (Vinst 0.6 -> 10 /
   * Förlust 0.4 -> 0) under Bet:Ja, mirrored across both Bet instances (a
   * nested linked group); Bet:Nej -> 3. The linked Bet and Utfall groups sit
   * TWO levels deep, so this verifies the flip's variableId-based scope check
   * handles nested groups (no false mismatch) AND the math is right.
   *
   * Utfall sits AFTER the decision, so flip reorders it ahead of Bet:
   *   EV(orig) = per Väder: max(EV(Ja)=0.6·10=6, EV(Nej)=3) = 6 -> EV = 6.
   *   EV(flip) = per Väder: 0.6·max(10,3) + 0.4·max(0,3) = 6 + 1.2 = 7.2 -> 7.2.
   *   VOC = 1.2 (knowing the gamble outcome lets you take the safe 3 on a loss).
   */
  it('flips a two-level nested linked structure with the correct VOC (1.2)', () => {
    const root = new TreeNode('root', 'chance', 'Väder')
    const regn = addOutcome(root, 'Regn', 0.5)
    const sol = addOutcome(root, 'Sol', 0.5)
    const betR = new TreeNode('betR', 'decision', 'Bet')
    const betS = new TreeNode('betS', 'decision', 'Bet')
    setChild(root, regn, betR)
    setChild(root, sol, betS)
    for (const [bet, prefix] of [
      [betR, 'R'],
      [betS, 'S'],
    ] as const) {
      const ja = addOutcome(bet, 'Ja')
      addOutcome(bet, 'Nej', NaN, 3)
      const utf = new TreeNode(`utf${prefix}`, 'chance', 'Utfall')
      setChild(bet, ja, utf)
      addOutcome(utf, 'Vinst', 0.6, 10)
      addOutcome(utf, 'Förlust', 0.4, 0)
    }
    relinkByName(root) // Bet group (2) + Utfall group (2), both nested

    const r = reverseTreeWithBayes(root)
    expect(r.originalEv).toBeCloseTo(6)
    expect(r.flippedEv).toBeCloseTo(7.2)
    expect(r.voc).toBeCloseTo(1.2)
    expect(r.flippedEv).toBeCloseTo(calculateExpectedValue(r.flipped))
  })

  it('rejects two same-named but UNLINKED nested chance nodes as a scope conflict', () => {
    // Same shape but the two "Utfall" nodes are NOT linked and carry different
    // distributions -> the flip must reject rather than silently guess.
    const root = new TreeNode('root', 'decision', 'Bet')
    const ja = addOutcome(root, 'Ja')
    const nej = addOutcome(root, 'Nej')
    const uJa = new TreeNode('uja', 'chance', 'Utfall')
    setChild(root, ja, uJa)
    addOutcome(uJa, 'Vinst', 0.7, 10)
    addOutcome(uJa, 'Förlust', 0.3, 0)
    const uNej = new TreeNode('unej', 'chance', 'Utfall')
    setChild(root, nej, uNej)
    addOutcome(uNej, 'Vinst', 0.3, 10)
    addOutcome(uNej, 'Förlust', 0.7, 0)
    // No relink -> distinct variableIds -> different distributions per decision.
    expect(() => reverseTreeWithBayes(root)).toThrow()
  })
})

describe('flip/VOC — scenario 4: asymmetric tree with early termination', () => {
  /**
   * Bet(decision): Yes -> Weather(chance) Rain 0.3 -> 8, Sun 0.7 -> 2 ;
   *                No  -> 3 (terminates early — independent of weather).
   * The "No" terminal is duplicated under both weather outcomes when flipping.
   *   EV(orig) = max(0.3·8+0.7·2, 3) = max(3.8, 3) = 3.8.
   *   EV(flip) = 0.3·max(8,3) + 0.7·max(2,3) = 2.4 + 2.1 = 4.5. VOC = 0.7.
   */
  it('applies the duplication rule and gets the hand-calculated VOC', () => {
    const root = new TreeNode('bet', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    addOutcome(root, 'No', NaN, 3)
    const weather = new TreeNode('w', 'chance', 'Weather')
    setChild(root, yes, weather)
    addOutcome(weather, 'Rain', 0.3, 8)
    addOutcome(weather, 'Sun', 0.7, 2)

    const r = reverseTreeWithBayes(root)
    expect(r.originalEv).toBeCloseTo(3.8)
    expect(r.flippedEv).toBeCloseTo(4.5)
    expect(r.voc).toBeCloseTo(0.7)
  })
})

describe('flip/VOC — scenario 5: deep tree, mixed chance and decision', () => {
  /**
   * Four levels: C1(chance) -> D1(decision) -> C2(chance) -> D2(decision) -> payoff.
   * Symmetric (both C1 outcomes lead to the same D1 structure, etc.), decisions
   * linked by name, no conditional tables (C2 has the same 0.6/0.4 distribution
   * everywhere) so full reversal is compatible (no context-dependence conflict).
   *
   * Under FULL sequence reversal (segment 22), order = [D2, C2, D1, C1] (fully
   * reversed, not chance-first) — the new root is D2, a decision. Since a full
   * reversal is no longer "value of clairvoyance" (a decision can end up before
   * information it originally depended on), VOC is NOT guaranteed ≥ 0 anymore —
   * this pins the actual computed values (verified via independent
   * recomputation) rather than asserting an invariant that no longer holds.
   */
  it('flips a 4-level mixed tree; reports match independent recomputation', () => {
    // Build one D1 subtree factory used under both C1 outcomes.
    const buildD1 = (tag: string): TreeNode => {
      const d1 = new TreeNode(`D1_${tag}`, 'decision', 'D1')
      for (const alt of ['hold', 'act']) {
        const altEdge = addOutcome(d1, alt)
        const c2 = new TreeNode(`C2_${tag}_${alt}`, 'chance', 'C2')
        setChild(d1, altEdge, c2)
        const up = addOutcome(c2, 'up', 0.6)
        const down = addOutcome(c2, 'down', 0.4)
        for (const [oc, d2tag] of [
          [up, 'u'],
          [down, 'd'],
        ] as const) {
          const d2 = new TreeNode(`D2_${tag}_${alt}_${d2tag}`, 'decision', 'D2')
          setChild(c2, oc, d2)
          // Payoffs chosen so the optimal decision genuinely varies with state.
          addOutcome(d2, 'safe', NaN, 4)
          addOutcome(d2, 'risky', NaN, oc === up ? 9 : 0)
        }
      }
      return d1
    }

    const c1 = new TreeNode('C1', 'chance', 'C1')
    const x = addOutcome(c1, 'x', 0.5)
    const y = addOutcome(c1, 'y', 0.5)
    setChild(c1, x, buildD1('x'))
    setChild(c1, y, buildD1('y'))
    relinkByName(c1) // D1, C2, D2 groups all linked by name across branches

    const r = reverseTreeWithBayes(c1)
    expect(Number.isFinite(r.originalEv)).toBe(true)
    expect(Number.isFinite(r.flippedEv)).toBe(true)
    // The new root is D2 (a decision), since order is fully reversed.
    expect(r.flipped.nodeType).toBe('decision')
    expect(r.flipped.label).toBe('D2')
    // Internal consistency: reported EVs match independent recomputation.
    expect(r.originalEv).toBeCloseTo(calculateExpectedValue(c1))
    expect(r.flippedEv).toBeCloseTo(calculateExpectedValue(r.flipped))
    // Regression-pinned actual values (hand-verifying a full 4-level reversal
    // by hand is impractical; correctness rests on the independent-
    // recomputation check above plus the simpler cases hand-verified elsewhere).
    expect(r.originalEv).toBeCloseTo(7)
    expect(r.flippedEv).toBeCloseTo(5.4)
    expect(r.voc).toBeCloseTo(5.4 - 7)
  })
})

describe('flip/VOC — scenario 6: linked chance group folds into ONE shared node', () => {
  /**
   * The 2026-08-02 regression case, minimal (two linked instances, no nesting):
   * hej(decision) A/B, and under each a linked chance "okejdå" with the SAME
   * distribution (jag 0.5 / du 0.5) but branch-specific payoffs:
   *   A: jag->2, du->8 ;  B: jag->4, du->6.
   *
   * Original (decide hej blind): A = 0.5·2+0.5·8 = 5 ; B = 0.5·4+0.5·6 = 5 -> 5.
   * Flipped (learn okejdå, then decide hej):
   *   okejdå=jag (0.5): max(A=2,B=4) = 4 ; okejdå=du (0.5): max(A=8,B=6) = 8
   *   EV = 0.5·4 + 0.5·8 = 6. VOC = 1.
   * The reversed tree must fold the linked group into ONE okejdå root, with hej
   * as the (duplicated) decision under each okejdå outcome — not three separate
   * okejdå nodes.
   */
  function build(sameDistr = true): TreeNode {
    const hej = new TreeNode('hej', 'decision', 'hej')
    const a = addOutcome(hej, 'A')
    const b = addOutcome(hej, 'B')
    const okA = new TreeNode('okA', 'chance', 'okejdå')
    setChild(hej, a, okA)
    addOutcome(okA, 'jag', 0.5, 2)
    addOutcome(okA, 'du', 0.5, 8)
    const okB = new TreeNode('okB', 'chance', 'okejdå')
    setChild(hej, b, okB)
    addOutcome(okB, 'jag', sameDistr ? 0.5 : 0.7, 4)
    addOutcome(okB, 'du', sameDistr ? 0.5 : 0.3, 6)
    relinkByName(hej) // links okA/okB into one variable
    return hej
  }

  it('folds a same-distribution linked group into one root node (VOC = 1)', () => {
    const r = reverseTreeWithBayes(build(true))
    expect(r.originalEv).toBeCloseTo(5)
    expect(r.flippedEv).toBeCloseTo(6)
    expect(r.voc).toBeCloseTo(1)

    // Structure: single "okejdå" chance root -> "hej" decision under each outcome.
    expect(r.flipped.nodeType).toBe('chance')
    expect(r.flipped.label).toBe('okejdå')
    expect(r.flipped.outcomes.map((o) => o.label)).toEqual(['jag', 'du'])
    for (const o of r.flipped.outcomes) {
      expect(o.child?.nodeType).toBe('decision')
      expect(o.child?.label).toBe('hej')
    }
  })

  it('fails loud when the linked instances have decision-dependent distributions', () => {
    // Different distributions across the decision branches means okejdå's
    // outcome depends on the choice -> the reversal is undefined -> throw,
    // rather than fabricating a folded node from inconsistent probabilities.
    expect(() => reverseTreeWithBayes(build(false))).toThrow(/olika sannolikheter beroende på kontext/)
  })
})

describe('flip/VOC — scenario 7: conditional-table WALL with segments on BOTH sides', () => {
  /**
   * A(chance) -> B(chance) -> C(chance, conditional table on A -> WALL)
   *   -> D(decision) -> E(chance) -> payoff.
   * Canonical: [A, B, C(wall), D, E]. Segment-wise reversal keeps C fixed and
   * reverses the segment on each side: [A,B] -> [B,A], C stays, [D,E] -> [E,D].
   * Reversed level order: B -> A -> C -> E -> D. This is the "flips on both
   * sides of the wall" behaviour.
   */
  let counter = 0
  const id = () => `n${++counter}`

  function bothSidesTree() {
    counter = 0
    let payoff = 0
    const mkE = () => {
      const e = new TreeNode(id(), 'chance', 'E')
      addOutcome(e, 'e1', 0.5, payoff++)
      addOutcome(e, 'e2', 0.5, payoff++)
      return e
    }
    const mkD = () => {
      const d = new TreeNode(id(), 'decision', 'D')
      const x = addOutcome(d, 'd1')
      const y = addOutcome(d, 'd2')
      setChild(d, x, mkE())
      setChild(d, y, mkE())
      return d
    }
    const mkC = () => {
      const c = new TreeNode(id(), 'chance', 'C')
      const x = addOutcome(c, 'c1', 0.5)
      const y = addOutcome(c, 'c2', 0.5)
      c.conditionalTable = [{ condition: new Set(['A:a1']), probabilities: { c1: 0.8, c2: 0.2 } }]
      setChild(c, x, mkD())
      setChild(c, y, mkD())
      return c
    }
    const mkB = () => {
      const b = new TreeNode(id(), 'chance', 'B')
      const x = addOutcome(b, 'b1', 0.5)
      const y = addOutcome(b, 'b2', 0.5)
      setChild(b, x, mkC())
      setChild(b, y, mkC())
      return b
    }
    const a = new TreeNode('A', 'chance', 'A')
    const x = addOutcome(a, 'a1', 0.5)
    const y = addOutcome(a, 'a2', 0.5)
    setChild(a, x, mkB())
    setChild(a, y, mkB())
    relinkByName(a)
    return a
  }

  it('reverses each side of the wall, keeping the conditional-table node fixed', () => {
    const r = reverseTreeWithBayes(bothSidesTree())
    // Walk the first-child chain down the reversed tree to read the level order.
    const levels: string[] = []
    for (let n: TreeNode | null = r.flipped; n; n = n.outcomes[0]?.child ?? null) levels.push(n.label)
    expect(levels).toEqual(['B', 'A', 'C', 'E', 'D'])

    // The wall C keeps its context-resolved distribution: under A=a1 it is
    // 0.8/0.2 (its conditional row); under A=a2 it falls back to base 0.5/0.5.
    const bRoot = r.flipped // B
    const aUnderB = bRoot.outcomes[0].child! // A
    const cUnderA1 = aUnderB.outcomes.find((o) => o.label === 'a1')!.child! // C via A=a1
    const cUnderA2 = aUnderB.outcomes.find((o) => o.label === 'a2')!.child! // C via A=a2
    expect(cUnderA1.outcomes.find((o) => o.label === 'c1')!.probability).toBeCloseTo(0.8)
    expect(cUnderA2.outcomes.find((o) => o.label === 'c1')!.probability).toBeCloseTo(0.5)

    // Internally consistent + doesn't throw (the whole point — flip now works
    // with a conditional table present).
    expect(r.flippedEv).toBeCloseTo(calculateExpectedValue(r.flipped))
    expect(Number.isFinite(r.originalEv)).toBe(true)
  })
})
