// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../model/tree'
import { validateProbabilities } from '../model/validateProbabilities'
import { collectGroup } from '../model/variable'
import { createApp, distributeSumToOne } from './app'

function newApp(confirmAnswer = true) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return { app: createApp(container, { confirmFn: () => confirmAnswer }), container }
}

describe('createApp', () => {
  it('builds the shell: top bar, add button, canvas, menu/dialog layers', () => {
    const { container } = newApp()
    expect(container.querySelector('.topbar')).not.toBeNull()
    expect(container.querySelector('#add-node')).not.toBeNull()
    expect(container.querySelector('.canvas-host')).not.toBeNull()
    expect(container.querySelector('.menu-layer')).not.toBeNull()
    expect(container.querySelector('.dialog-layer')).not.toBeNull()
    expect(container.querySelector('.empty-hint')).not.toBeNull()
  })

  it('creates a root and adds outcomes with unset probability', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Vädret')
    app.api.addOutcomeTo(root, 'Regn')

    expect(app.state.root).toBe(root)
    expect(root.outcomes).toHaveLength(1)
    expect(Number.isNaN(root.outcomes[0].probability)).toBe(true)
    expect(container.querySelectorAll('g.leaf')).toHaveLength(1)
  })

  it('attaches child nodes through the model layer (cycle-protected setChild)', () => {
    const { app } = newApp()
    const root = app.api.createRoot('chance', 'Vädret')
    const edge = app.api.addOutcomeTo(root, 'Regn', 0.3)
    const child = app.api.attachChild(root, edge, 'decision', 'Åtgärd')

    expect(edge.child).toBe(child)
    expect(child.parent).toBe(root)
    expect(child.nodeType).toBe('decision')
  })

  it('opens the context menu on node click', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Vädret')
    app.api.addOutcomeTo(root, 'Regn', 1, 5)

    container
      .querySelector('[data-node-id]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const items = [...container.querySelectorAll('.menu-item')].map((b) => b.textContent)
    expect(items.some((t) => t?.includes('Byt namn'))).toBe(true)
    expect(items.some((t) => t?.includes('Redigera utfall'))).toBe(true)
    expect(items.some((t) => t?.includes('beslutsnod'))).toBe(true)
    expect(items.some((t) => t?.includes('Villkorstabell'))).toBe(true)
    expect(items.some((t) => t?.includes('Ta bort nod'))).toBe(true)
  })

  it('opens the terminal dialog on leaf click', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Vädret')
    app.api.addOutcomeTo(root, 'Regn', 1, 5)

    container.querySelector('g.leaf')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const dialog = container.querySelector('.dialog')!
    expect(dialog.textContent).toContain('Värde (payoff)')
    expect(dialog.textContent).toContain('backward-fill')
  })

  it('toggle type switches chance <-> decision', () => {
    const { app } = newApp()
    const root = app.api.createRoot('chance', 'N')
    app.api.toggleType(root)
    expect(root.nodeType).toBe('decision')
    app.api.toggleType(root)
    expect(root.nodeType).toBe('chance')
  })

  it('deleting a child node keeps the outcome as a terminal endpoint', () => {
    const { app } = newApp()
    const root = app.api.createRoot('chance', 'Root')
    const edge = app.api.addOutcomeTo(root, 'A', 0.5)
    const child = app.api.attachChild(root, edge, 'chance', 'C')
    app.api.addOutcomeTo(child, 'X', 1, 5)

    app.api.deleteNode(child)

    expect(root.outcomes).toHaveLength(1)
    expect(edge.child).toBeNull()
    expect(edge.value).toBeUndefined()
    expect(child.parent).toBeNull()
  })

  it('deleting the root empties the tree', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Root')
    app.api.deleteNode(root)
    expect(app.state.root).toBeNull()
    expect(container.querySelector('.empty-hint')).not.toBeNull()
  })

  it('renaming an outcome rewrites downstream conditional tokens', () => {
    const { app } = newApp()
    const root = app.api.createRoot('chance', 'Root')
    const edgeA = app.api.addOutcomeTo(root, 'A', 0.5)
    const mid = app.api.attachChild(root, edgeA, 'chance', 'Mid')
    app.api.addOutcomeTo(mid, 'X', 0.5, 1)
    app.api.addOutcomeTo(mid, 'Y', 0.5, 0)
    app.api.setConditionalTable(mid, [
      { condition: new Set([`${root.id}:A`]), probabilities: { X: 0.9, Y: 0.1 } },
    ])

    app.api.renameOutcomeOn(root, edgeA, 'Regn')

    expect(edgeA.label).toBe('Regn')
    expect(mid.conditionalTable[0].condition.has(`${root.id}:Regn`)).toBe(true)
  })

  it('backward-fill adjusts the model and reports transparently in the strip', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Root')
    const edgeA = app.api.addOutcomeTo(root, 'A', 0.3)
    const edgeB = app.api.addOutcomeTo(root, 'B', 0.7, 5)
    const mid = app.api.attachChild(root, edgeA, 'chance', 'Mid')
    const edgeX = app.api.addOutcomeTo(mid, 'X', 0.5, 10)
    app.api.addOutcomeTo(mid, 'Y', 0.5, 0)

    app.api.applyBackwardFill(mid, edgeX, 0.24)

    expect(edgeA.probability).toBeCloseTo(0.48)
    expect(edgeB.probability).toBeCloseTo(0.52)
    const strip = container.querySelector('.message-strip') as HTMLElement
    expect(strip.style.display).not.toBe('none')
    expect(strip.textContent).toContain('Root → A')
    expect(strip.textContent).toContain('0.3')
    expect(strip.textContent).toContain('0.48')
    expect(strip.textContent).toContain('syskon')
  })

  it('backward-fill errors surface in the strip without crashing', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Root')
    const edgeA = app.api.addOutcomeTo(root, 'A', 0.3)
    app.api.addOutcomeTo(root, 'B', 0.7, 5)
    const mid = app.api.attachChild(root, edgeA, 'chance', 'Mid')
    const edgeX = app.api.addOutcomeTo(mid, 'X', 0.5, 10)
    app.api.addOutcomeTo(mid, 'Y', 0.5, 0)

    // Unreachable: max joint via root alone is 0.5, via mid alone 0.3.
    expect(() => app.api.applyBackwardFill(mid, edgeX, 0.9)).toThrow()
    // The UI layer wraps api calls in guarded(); simulate that path too:
    try {
      app.api.applyBackwardFill(mid, edgeX, 0.9)
    } catch (e) {
      app.state.message = (e as Error).message
    }
    expect(app.state.message).toContain('No valid single-outcome adjustment')
    void container
  })

  it('split mode: flip renders both trees, edits re-flip live, merge discards', () => {
    const { app, container } = newApp()
    // Classic tree: Bet(decision): Yes -> Weather(Rain 0.3 -> 8, Sun 0.7 -> 2), No -> 3.
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    app.api.addOutcomeTo(root, 'No', NaN, 3)
    const weather = app.api.attachChild(root, yes, 'chance', 'Weather')
    const rain = app.api.addOutcomeTo(weather, 'Rain', 0.3, 8)
    const sun = app.api.addOutcomeTo(weather, 'Sun', 0.7, 2)

    const rightPane = container.querySelector('.right-pane') as HTMLElement
    const vocBar = container.querySelector('.voc-bar') as HTMLElement
    expect(rightPane.style.display).toBe('none')

    app.api.toggleSplit()

    // Both trees rendered; right is the flipped one (Weather at its root).
    expect(rightPane.style.display).not.toBe('none')
    expect(rightPane.textContent).toContain('klarsyn')
    // flip_1 is the flipped tree's root — the chance variable moved first.
    expect(
      container.querySelector('.canvas-right [data-node-id="flip_1"] .node-label')!.textContent,
    ).toBe('Weather')
    const rightLabels = [...container.querySelectorAll('.canvas-right .node-label')].map(
      (n) => n.textContent,
    )
    expect(rightLabels).toContain('Bet')
    // Hand-calculated: EV orig 3.8, EV flipped 4.5, VOC 0.7.
    expect(vocBar.textContent).toContain('EV original = 3.8')
    expect(vocBar.textContent).toContain('4.5')
    expect(vocBar.textContent).toContain('VOC = 0.7')

    // Editing the left tree re-flips the right side live.
    app.api.setProbability(rain, 0.6)
    app.api.setProbability(sun, 0.4)
    // New: EV orig = max(0.6·8+0.4·2, 3) = 5.6; flipped = 0.6·8+0.4·3 = 6; VOC 0.4.
    expect(vocBar.textContent).toContain('VOC = 0.4')

    // The right tree is read-only: clicking its nodes opens no menu.
    container
      .querySelector('.canvas-right [data-node-id]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(container.querySelector('.menu')).toBeNull()

    // Merge back: right pane and VOC bar hidden, left tree intact.
    app.api.toggleSplit()
    expect(rightPane.style.display).toBe('none')
    expect(vocBar.style.display).toBe('none')
    expect(app.state.root).toBe(root)
    expect(container.querySelector('.canvas-right svg')).toBeNull()
  })

  it('split mode shows the specific flip error for an unflippable tree', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    const no = app.api.addOutcomeTo(root, 'No')
    const weather = app.api.attachChild(root, yes, 'chance', 'Weather')
    app.api.addOutcomeTo(weather, 'Rain', 0.5, 1)
    app.api.addOutcomeTo(weather, 'Sun', 0.5, 2)
    const market = app.api.attachChild(root, no, 'chance', 'Market')
    app.api.addOutcomeTo(market, 'Up', 0.5, 3)
    app.api.addOutcomeTo(market, 'Down', 0.5, 4)

    app.api.toggleSplit()

    const error = container.querySelector('.flip-error') as HTMLElement
    expect(error.style.display).not.toBe('none')
    expect(error.textContent).toContain('Weather')
    expect(error.textContent).toContain('Market')
    expect((container.querySelector('.voc-bar') as HTMLElement).textContent).toBe('VOC = –')
  })

  it('EU mode: toggle switches node labels from EV to CE and shows the utility bar', () => {
    const { app, container } = newApp()
    // Coin flip 0.5 -> 10, 0.5 -> 0. EV = 5.
    const root = app.api.createRoot('chance', 'Flip')
    app.api.addOutcomeTo(root, 'Heads', 0.5, 10)
    app.api.addOutcomeTo(root, 'Tails', 0.5, 0)

    const evLabel = container.querySelector('[data-node-id="n1"] .node-ev')!
    expect(evLabel.textContent).toBe('EV 5')
    expect((container.querySelector('.utility-bar') as HTMLElement).style.display).toBe('none')

    app.api.setDisplayMode('eu')

    // Default EU utility is exponential γ=0.1 -> CE = 3.799 < EV 5 (risk-averse).
    expect((container.querySelector('.utility-bar') as HTMLElement).style.display).not.toBe('none')
    const ceLabel = container.querySelector('[data-node-id="n1"] .node-ev')!
    expect(ceLabel.textContent).toMatch(/^CE 3\.799/)
    expect((container.querySelector('#mode-toggle') as HTMLElement).textContent).toContain('EU/CE')
  })

  it('EU mode: linear utility makes CE equal EV again', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Flip')
    app.api.addOutcomeTo(root, 'Heads', 0.5, 10)
    app.api.addOutcomeTo(root, 'Tails', 0.5, 0)

    app.api.setDisplayMode('eu')
    app.api.setUtilityType('linear')
    expect(container.querySelector('[data-node-id="n1"] .node-ev')!.textContent).toBe('CE 5')
    // Linear has no parameter -> γ input hidden.
    expect((container.querySelector('.utility-param') as HTMLElement).style.display).toBe('none')
  })

  it('EU mode: changing γ updates the displayed CE live', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Flip')
    app.api.addOutcomeTo(root, 'Heads', 0.5, 10)
    app.api.addOutcomeTo(root, 'Tails', 0.5, 0)

    app.api.setDisplayMode('eu')
    app.api.setUtilityParameter(-0.1) // risk-seeking -> CE > EV
    const ce = parseFloat(
      container.querySelector('[data-node-id="n1"] .node-ev')!.textContent!.replace('CE ', ''),
    )
    expect(ce).toBeGreaterThan(5)
  })

  it('EU mode: elicited γ from p is applied (γ = ln(p/(1−p)))', () => {
    const { app } = newApp()
    const root = app.api.createRoot('chance', 'Flip')
    app.api.addOutcomeTo(root, 'Heads', 0.5, 10)
    app.api.addOutcomeTo(root, 'Tails', 0.5, 0)
    app.api.setDisplayMode('eu')

    // Simulate what the elicitation dialog computes and applies for p = 0.6.
    app.api.setUtilityParameter(Math.log(0.6 / 0.4))
    expect(app.state.utilityFn.parameter).toBeCloseTo(0.405465)
  })

  it('EU mode: split VOC is computed on certainty equivalents', () => {
    const { app, container } = newApp()
    // Classic Bet tree; flip gives clairvoyance value.
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    app.api.addOutcomeTo(root, 'No', NaN, 3)
    const weather = app.api.attachChild(root, yes, 'chance', 'Weather')
    app.api.addOutcomeTo(weather, 'Rain', 0.3, 8)
    app.api.addOutcomeTo(weather, 'Sun', 0.7, 2)

    app.api.setDisplayMode('eu')
    app.api.toggleSplit()

    const voc = container.querySelector('.voc-bar')!.textContent!
    expect(voc).toContain('CE original')
    expect(voc).toContain('VOC (CE)')
  })

  it('EU mode: utility errors do not crash render (graceful)', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Flip')
    app.api.addOutcomeTo(root, 'Big', 1, 1000)
    app.api.setDisplayMode('eu')
    // γ large enough that u(1000) pushes EU past the invertible 1/γ boundary.
    app.api.setUtilityParameter(1)
    // Render still produced a tree; the node shows "CE –" rather than crashing.
    expect(container.querySelector('[data-node-id="n1"]')).not.toBeNull()
    expect(container.querySelector('[data-node-id="n1"] .node-ev')!.textContent).toBe('CE –')
  })

  it('shows the calculation trace for a selected node, live and mode-aware', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Väder')
    const rain = app.api.addOutcomeTo(root, 'Regn', 0.3, 8)
    app.api.addOutcomeTo(root, 'Sol', 0.7, 2)

    const traceBar = container.querySelector('.trace-bar') as HTMLElement
    // createRoot auto-selects the root, so the trace is already visible.
    app.api.selectNode(root)
    expect(traceBar.style.display).not.toBe('none')
    expect(traceBar.textContent).toBe('Beräkning (Väder): 0.3 × 8 + 0.7 × 2 = 3.8')

    // Live update: change a payoff, trace text follows.
    app.api.setValue(rain, 18)
    expect(traceBar.textContent).toBe('Beräkning (Väder): 0.3 × 18 + 0.7 × 2 = 6.8')

    // EU mode: trace switches to the utility/CE form.
    app.api.setValue(rain, 8)
    app.api.setDisplayMode('eu')
    expect(traceBar.textContent).toContain('EU =')
    expect(traceBar.textContent).toContain('→ CE =')

    // Deselect hides it.
    app.api.selectNode(null)
    expect(traceBar.style.display).toBe('none')
  })

  it('trace shows the incomplete message when data is missing', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Flip')
    app.api.addOutcomeTo(root, 'A', NaN, 8) // probability unset
    app.api.addOutcomeTo(root, 'B', NaN, 2)
    app.api.selectNode(root)
    expect((container.querySelector('.trace-bar') as HTMLElement).textContent).toContain(
      'Ofullständig data',
    )
  })

  it('terminal dialog shows the utility transform in EU mode only', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Flip')
    app.api.addOutcomeTo(root, 'A', 1, 10)

    // EV mode: no utility line.
    container.querySelector('g.leaf')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(container.querySelector('.dialog')!.textContent).not.toContain('Nyttotransform')
    container.querySelector('.dialog-overlay')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )

    // EU mode: u(10) shown.
    app.api.setDisplayMode('eu')
    container.querySelector('g.leaf')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(container.querySelector('.dialog')!.textContent).toContain('u(10) = 6.321')
  })

  it('Σ-warning uses resolved conditional probabilities and shows in both modes', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('chance', 'Root')
    const a = app.api.addOutcomeTo(root, 'A', 1)
    const mid = app.api.attachChild(root, a, 'chance', 'Mid')
    app.api.addOutcomeTo(mid, 'X', 0.5, 8)
    app.api.addOutcomeTo(mid, 'Y', 0.5, 2)
    // Base probs sum to 1, but a matching conditional row sums to 1.2 — the
    // warning must reflect the resolved (conditional) probabilities.
    app.api.setConditionalTable(mid, [
      { condition: new Set([`${root.id}:A`]), probabilities: { X: 0.9, Y: 0.3 } },
    ])

    const midWarning = () =>
      container.querySelector('[data-node-id="' + mid.id + '"] .node-warning')?.textContent ?? null
    expect(midWarning()).toBe('Σ = 1.2 ⚠')

    // Still shown in EU mode (rendering is mode-independent for warnings).
    app.api.setDisplayMode('eu')
    expect(midWarning()).toBe('Σ = 1.2 ⚠')
  })

  it('auto-links a same-named node, primes its display, and reports the link', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    const no = app.api.addOutcomeTo(root, 'No')
    const first = app.api.attachChild(root, yes, 'chance', 'Väder')
    app.api.addOutcomeTo(first, 'Regn', 0.3, 8)
    app.api.addOutcomeTo(first, 'Sol', 0.7, 2)

    const second = app.api.attachChild(root, no, 'chance', 'Väder')
    expect(second.variableId).toBe(first.variableId)
    expect(second.instanceIndex).toBe(1)
    // Outcome set synced (labels), probabilities unset on the new instance.
    expect(second.outcomes.map((o) => o.label)).toEqual(['Regn', 'Sol'])
    // The tree shows the primed display name.
    const labels = [...container.querySelectorAll('.node-label')].map((n) => n.textContent)
    expect(labels).toContain("Väder'")
    // The user is told about the link.
    expect((container.querySelector('.message-strip') as HTMLElement).textContent).toContain(
      'Länkad till variabeln',
    )
  })

  it('rejects a type-mismatched link with a clear message, no crash', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    const no = app.api.addOutcomeTo(root, 'No')
    app.api.attachChild(root, yes, 'chance', 'Väder')

    // Trying to make a decision node named "Väder" conflicts with the chance one.
    // The menu path wraps in guarded(); simulate the guarded call:
    let caught = ''
    try {
      app.api.attachChild(root, no, 'decision', 'Väder')
    } catch (e) {
      caught = (e as Error).message
    }
    expect(caught).toContain('måste ha samma typ')
    // Tree still intact (no half-applied state).
    expect(container.querySelector('[data-node-id]')).not.toBeNull()
  })

  it('outcome edit on one instance propagates to the linked sibling', () => {
    const { app } = newApp()
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    const no = app.api.addOutcomeTo(root, 'No')
    const a = app.api.attachChild(root, yes, 'chance', 'Väder')
    const b = app.api.attachChild(root, no, 'chance', 'Väder')

    app.api.addOutcomeTo(a, 'Regn', 0.3, 8)
    // Propagated to b (label only).
    expect(b.outcomes.map((o) => o.label)).toEqual(['Regn'])
    expect(Number.isNaN(b.outcomes[0].probability)).toBe(true)

    // Renaming the outcome propagates too.
    app.api.renameOutcomeOn(a, a.outcomes[0], 'Nederbörd')
    expect(b.outcomes.map((o) => o.label)).toEqual(['Nederbörd'])
  })

  it('renaming a linked node renames the whole variable; unlink detaches it', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    const no = app.api.addOutcomeTo(root, 'No')
    const a = app.api.attachChild(root, yes, 'chance', 'Väder')
    const b = app.api.attachChild(root, no, 'chance', 'Väder')

    app.api.renameNode(a, 'Klimat')
    expect(a.label).toBe('Klimat')
    expect(b.label).toBe('Klimat') // propagated

    app.api.unlinkVariable(b)
    expect(b.variableId).toBe(b.id)
    expect(b.instanceIndex).toBe(0)
    // After unlink, edits to a no longer reach b.
    app.api.addOutcomeTo(a, 'X')
    expect(a.outcomes.some((o) => o.label === 'X')).toBe(true)
    expect(b.outcomes.some((o) => o.label === 'X')).toBe(false)
    expect((container.querySelector('.message-strip') as HTMLElement).textContent).toContain(
      'frikopplad',
    )
  })

  it('the outcomes dialog shows which other instances an edit affects', () => {
    const { app, container } = newApp()
    const root = app.api.createRoot('decision', 'Bet')
    const yes = app.api.addOutcomeTo(root, 'Yes')
    const no = app.api.addOutcomeTo(root, 'No')
    const a = app.api.attachChild(root, yes, 'chance', 'Väder')
    app.api.attachChild(root, no, 'chance', 'Väder')

    // Open the outcomes dialog on the primary via its context menu.
    app.api.selectNode(a)
    container
      .querySelector('[data-node-id="' + a.id + '"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    ;[...container.querySelectorAll('.menu-item')]
      .find((b) => b.textContent!.includes('Redigera utfall'))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const note = container.querySelector('.sync-note')
    expect(note).not.toBeNull()
    expect(note!.textContent).toContain("Väder'")
  })

  it('auto-fills linked siblings under a chance parent (the screenshot scenario)', () => {
    const { app, container } = newApp()
    // Chance "test" with outcomes 1/2/3/4.
    const test = app.api.createRoot('chance', 'test')
    const e1 = app.api.addOutcomeTo(test, '1', 0.25)
    app.api.addOutcomeTo(test, '2', 0.25)
    app.api.addOutcomeTo(test, '3', 0.25)
    app.api.addOutcomeTo(test, '4', 0.25)

    // Add "Hej" under outcome "1" only.
    const hej = app.api.attachChild(test, e1, 'chance', 'Hej')

    // Outcomes 2/3/4 now hold linked Hej instances (no more terminals).
    const children = test.outcomes.map((o) => o.child)
    expect(children.every((c) => c !== null)).toBe(true)
    for (const c of children) {
      expect(c!.variableId).toBe(hej.variableId)
      expect(c!.nodeType).toBe('chance')
      expect(c!.label).toBe('Hej')
    }
    // Primed display names appear in the tree.
    const labels = [...container.querySelectorAll('.node-label')].map((n) => n.textContent)
    expect(labels).toEqual(expect.arrayContaining(['test', 'Hej', "Hej'", "Hej''", "Hej'''"]))
    // The user is told several linked instances were created.
    expect((container.querySelector('.message-strip') as HTMLElement).textContent).toContain(
      'Länkade instanser skapade',
    )
    // Adding an outcome on Hej propagates to all instances (synced set).
    app.api.addOutcomeTo(hej, 'x', 0.5, 3)
    for (const c of children) expect(c!.outcomes.some((o) => o.label === 'x')).toBe(true)
  })

  it('mirrors a nested variable across the whole parent-instance grid (deep screenshot scenario)', () => {
    const { app } = newApp()
    // Grandparent chance "G" with three outcomes -> "nämen" grows to 3 linked
    // instances under G's outcomes.
    const g = app.api.createRoot('chance', 'G')
    const ga = app.api.addOutcomeTo(g, 'gA', 0.34)
    app.api.addOutcomeTo(g, 'gB', 0.33)
    app.api.addOutcomeTo(g, 'gC', 0.33)
    const namen = app.api.attachChild(g, ga, 'chance', 'nämen')
    // nämen now has three linked instances; give the variable outcomes 1/2/3.
    app.api.addOutcomeTo(namen, '1', 0.5)
    app.api.addOutcomeTo(namen, '2', 0.25)
    app.api.addOutcomeTo(namen, '3', 0.25)

    // Add "okej" under nämen's outcome "1" — should mirror across the whole
    // 3 nämen-instances × 3 outcomes grid.
    const namenOne = namen.outcomes.find((o) => o.label === '1')!
    const okej = app.api.attachChild(namen, namenOne, 'chance', 'okej')

    // Collect every node labelled "okej": expect nine, all one variable group.
    const collect = (n: TreeNode, out: TreeNode[] = []): TreeNode[] => {
      out.push(n)
      for (const o of n.outcomes) if (o.child) collect(o.child, out)
      return out
    }
    const okejNodes = collect(app.state.root!).filter((n) => n.label === 'okej')
    expect(okejNodes).toHaveLength(9)
    expect(new Set(okejNodes.map((n) => n.variableId)).size).toBe(1)
    expect(okej.variableId).toBe(okejNodes[0].variableId)
    // Each nämen instance has an okej under all three of its outcomes.
    const namenInstances = collect(app.state.root!).filter((n) => n.label === 'nämen')
    expect(namenInstances).toHaveLength(3)
    for (const ni of namenInstances) {
      for (const label of ['1', '2', '3']) {
        expect(ni.outcomes.find((o) => o.label === label)!.child!.label).toBe('okej')
      }
    }
  })

  it('does NOT auto-fill under a decision parent (asymmetric decisions preserved)', () => {
    const { app } = newApp()
    const bet = app.api.createRoot('decision', 'Satsa')
    const ja = app.api.addOutcomeTo(bet, 'Ja')
    app.api.addOutcomeTo(bet, 'Nej', NaN, 3) // safe terminal payoff

    app.api.attachChild(bet, ja, 'chance', 'Väder')

    // "Nej" stays a terminal payoff — not auto-filled with a linked chance node.
    const nej = bet.outcomes.find((o) => o.label === 'Nej')!
    expect(nej.child).toBeNull()
    expect(nej.value).toBe(3)
  })

  it('unlinking an auto-filled instance does not affect the others', () => {
    const { app } = newApp()
    const test = app.api.createRoot('chance', 'test')
    const e1 = app.api.addOutcomeTo(test, '1', 0.25)
    app.api.addOutcomeTo(test, '2', 0.25)
    app.api.addOutcomeTo(test, '3', 0.25)
    app.api.addOutcomeTo(test, '4', 0.25)
    const hej = app.api.attachChild(test, e1, 'chance', 'Hej')

    const under2 = test.outcomes[1].child! // an auto-filled instance
    app.api.unlinkVariable(under2)

    expect(under2.variableId).toBe(under2.id) // independent now
    // The others remain grouped with hej.
    expect(test.outcomes[2].child!.variableId).toBe(hej.variableId)
    expect(test.outcomes[3].child!.variableId).toBe(hej.variableId)
    // And an outcome added on hej no longer reaches the unlinked one.
    app.api.addOutcomeTo(hej, 'z')
    expect(under2.outcomes.some((o) => o.label === 'z')).toBe(false)
    expect(test.outcomes[2].child!.outcomes.some((o) => o.label === 'z')).toBe(true)
  })

  it('save/load round-trips the tree and settings through the app', () => {
    const { app } = newApp()
    const test = app.api.createRoot('chance', 'Väder')
    app.api.addOutcomeTo(test, 'Regn', 0.3, 8)
    app.api.addOutcomeTo(test, 'Sol', 0.7, 2)
    app.api.setDisplayMode('eu')
    app.api.setUtilityParameter(0.2)

    const json = app.api.exportDocument()
    expect(app.state.dirty).toBe(false) // saving clears dirty

    // Load into a fresh app instance (clean state).
    const fresh = newApp().app
    expect(fresh.api.loadDocument(json)).toBe(true)
    expect(fresh.state.root!.label).toBe('Väder')
    expect(fresh.state.root!.outcomes.map((o) => o.value)).toEqual([8, 2])
    expect(fresh.state.displayMode).toBe('eu')
    expect(fresh.state.utilityFn).toEqual({ type: 'exponential', parameter: 0.2 })
    expect(fresh.state.dirty).toBe(false)
  })

  it('round-trips linked variables + conditional tables + EU through save/load', () => {
    const { app } = newApp()
    const test = app.api.createRoot('chance', 'test')
    const e1 = app.api.addOutcomeTo(test, '1', 0.5)
    app.api.addOutcomeTo(test, '2', 0.5)
    const hej = app.api.attachChild(test, e1, 'chance', 'Hej') // auto-fills Hej' under "2"
    app.api.addOutcomeTo(hej, 'a', 0.6, 3)
    app.api.addOutcomeTo(hej, 'b', 0.4, 1)
    app.api.setConditionalTable(hej, [
      { condition: new Set([`${test.id}:1`]), probabilities: { a: 0.9, b: 0.1 } },
    ])
    app.api.setDisplayMode('eu')

    const restored = newApp().app
    restored.api.loadDocument(app.api.exportDocument())

    const nodes: TreeNode[] = []
    const walk = (n: TreeNode) => {
      nodes.push(n)
      for (const o of n.outcomes) if (o.child) walk(o.child)
    }
    walk(restored.state.root!)
    const hejGroup = nodes.filter((n) => n.label === 'Hej')
    expect(hejGroup).toHaveLength(2)
    expect(new Set(hejGroup.map((n) => n.variableId)).size).toBe(1) // still one group
    const primary = hejGroup.find((n) => n.instanceIndex === 0)!
    expect(primary.conditionalTable[0].probabilities).toEqual({ a: 0.9, b: 0.1 })
  })

  it('rejects a malformed file with a clear error, without loading', () => {
    const { app } = newApp()
    app.api.createRoot('chance', 'Original')
    const before = app.state.root

    let err = ''
    try {
      app.api.loadDocument('{ not valid json', { skipConfirm: true })
    } catch (e) {
      err = (e as Error).message
    }
    expect(err).toMatch(/giltig JSON/)
    // Tree untouched.
    expect(app.state.root).toBe(before)
  })

  it('confirms before discarding unsaved changes on load', () => {
    // confirmFn returns false -> load is cancelled.
    const container = document.createElement('div')
    const app = createApp(container, { confirmFn: () => false })
    app.api.createRoot('chance', 'Kladd') // makes state dirty
    expect(app.state.dirty).toBe(true)

    const otherDoc = (() => {
      const c2 = document.createElement('div')
      const a2 = createApp(c2, { confirmFn: () => true })
      a2.api.createRoot('decision', 'Annat')
      return a2.api.exportDocument()
    })()

    // Dirty + confirm=false -> loadDocument returns false, keeps current tree.
    expect(app.api.loadDocument(otherDoc)).toBe(false)
    expect(app.state.root!.label).toBe('Kladd')

    // skipConfirm bypasses the prompt.
    expect(app.api.loadDocument(otherDoc, { skipConfirm: true })).toBe(true)
    expect(app.state.root!.label).toBe('Annat')
  })

  it('"Lägg till nod" opens the create-root dialog only for an empty tree', () => {
    const { app, container } = newApp()
    const btn = container.querySelector('#add-node') as HTMLButtonElement
    btn.click()
    expect(container.querySelector('.dialog')).not.toBeNull()
    expect(container.querySelector('.dialog')!.textContent).toContain('Skapa rotnod')

    // Close, create a root, click again -> hint message instead of dialog.
    container.querySelector('.dialog-overlay')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    app.api.createRoot('chance', 'Root')
    btn.click()
    expect(container.querySelector('.dialog')).toBeNull()
    expect(app.state.message).toContain('redan en rot')
  })

  describe('flip/split VOC bar', () => {
    // Asymmetric tree (SPEC duplication rule): Bet(decision) Yes -> Weather
    // Rain 0.3 -> 8 / Sun 0.7 -> 2 ; No -> 3. EV(orig)=3.8, EV(flip)=4.5, VOC=0.7.
    function buildAsymmetric(app: ReturnType<typeof newApp>['app']) {
      const root = app.api.createRoot('decision', 'Bet')
      const yes = app.api.addOutcomeTo(root, 'Yes')
      app.api.addOutcomeTo(root, 'No', NaN, 3)
      const w = app.api.attachChild(root, yes, 'chance', 'Weather')
      return { root, w }
    }

    it('shows EV/VOC numbers and the explanatory hint when the tree is complete', () => {
      const { app, container } = newApp()
      const { w } = buildAsymmetric(app)
      app.api.addOutcomeTo(w, 'Rain', 0.3, 8)
      app.api.addOutcomeTo(w, 'Sun', 0.7, 2)

      app.api.toggleSplit()

      const vocBar = container.querySelector('.voc-bar')!
      expect(vocBar.textContent).toContain('EV original = 3.8')
      expect(vocBar.textContent).toContain('EV omvänt (klarsyn) = 4.5')
      expect(vocBar.textContent).toContain('VOC = 0.7')

      // The always-on explanation of what VOC means is visible in split mode.
      const vocHint = container.querySelector('.voc-hint') as HTMLElement
      expect(vocHint.style.display).toBe('')
      expect(vocHint.textContent).toContain('värdet av klarsyn')

      // The read-only tree is clearly labelled.
      expect(container.querySelector('.pane-caption')!.textContent).toContain('skrivskyddat')
    })

    it('fails loud (not a silent –) when probabilities/payoffs are missing', () => {
      const { app, container } = newApp()
      const { w } = buildAsymmetric(app)
      app.api.addOutcomeTo(w, 'Rain', 0.3, 8)
      app.api.addOutcomeTo(w, 'Sun', 0.7) // terminal payoff left blank -> EV is NaN

      app.api.toggleSplit()

      const vocBar = container.querySelector('.voc-bar')!
      expect(vocBar.textContent).toContain('fyll i alla sannolikheter')
      // No fabricated number is shown.
      expect(vocBar.textContent).not.toMatch(/VOC = -?\d/)
    })

    it('hides the VOC bar and hint again after merging back to single view', () => {
      const { app, container } = newApp()
      const { w } = buildAsymmetric(app)
      app.api.addOutcomeTo(w, 'Rain', 0.3, 8)
      app.api.addOutcomeTo(w, 'Sun', 0.7, 2)

      app.api.toggleSplit()
      expect(app.state.split).toBe(true)
      app.api.toggleSplit()

      expect(app.state.split).toBe(false)
      const vocBar = container.querySelector('.voc-bar') as HTMLElement
      const vocHint = container.querySelector('.voc-hint') as HTMLElement
      expect(vocBar.style.display).toBe('none')
      expect(vocHint.style.display).toBe('none')
      // The left (editable) tree survives the round-trip.
      expect(app.state.root!.label).toBe('Bet')
    })
  })

  describe('distributeSumToOne — repeating-decimal probabilities', () => {
    const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0)

    it('thirds sum to exactly 1 with the residual on the last outcome', () => {
      const r = distributeSumToOne([1 / 3, 1 / 3, 1 / 3])
      expect(r).toEqual([0.333333, 0.333333, 0.333334])
      expect(Math.abs(sum(r) - 1)).toBeLessThanOrEqual(1e-6)
    })

    it('keeps every even split within the Σ=1 tolerance (2..12 outcomes)', () => {
      for (let n = 2; n <= 12; n++) {
        const r = distributeSumToOne(Array.from({ length: n }, () => 1 / n))
        expect(r).toHaveLength(n)
        expect(Math.abs(sum(r) - 1)).toBeLessThanOrEqual(1e-6)
      }
    })

    it('bare 0.333333 inputs (which sum to 0.999999) are fixed to sum to 1', () => {
      // Without the residual rule three bare 0.333333 sum to 0.999999 and fail.
      expect(Math.abs(sum([0.333333, 0.333333, 0.333333]) - 1)).toBeGreaterThan(1e-6)
      const total = sum([0.333333, 0.333333, 0.333333])
      const r = distributeSumToOne([0.333333 / total, 0.333333 / total, 0.333333 / total])
      expect(Math.abs(sum(r) - 1)).toBeLessThanOrEqual(1e-6)
    })

    it('the normalized set passes validateProbabilities (no Σ error)', () => {
      const { app } = newApp()
      const root = app.api.createRoot('chance', 'Tärning')
      const probs = distributeSumToOne([1 / 3, 1 / 3, 1 / 3])
      app.api.addOutcomeTo(root, 'A', probs[0], 1)
      app.api.addOutcomeTo(root, 'B', probs[1], 2)
      app.api.addOutcomeTo(root, 'C', probs[2], 3)
      expect(() => validateProbabilities(root, new Set())).not.toThrow()
    })

    it('leaves a single outcome at 1 and handles the empty case', () => {
      expect(distributeSumToOne([1])).toEqual([1])
      expect(distributeSumToOne([])).toEqual([])
    })
  })

  describe('linked-instance sync through the UI (2026-08-02 regressions)', () => {
    // Builds a chance root "namen" (outcomes 1/2/3) with a linked "okejdå"
    // group auto-mirrored under every outcome — the screenshot setup.
    function linkedOkejdaGroup(app: ReturnType<typeof newApp>['app']) {
      const namen = app.api.createRoot('chance', 'namen')
      const e1 = app.api.addOutcomeTo(namen, '1', 1 / 3)
      app.api.addOutcomeTo(namen, '2', 1 / 3)
      app.api.addOutcomeTo(namen, '3', 1 / 3)
      const okej = app.api.attachChild(namen, e1, 'chance', 'okejdå')
      return { namen, okej }
    }

    it('REGRESSION #2: toggleType on one instance propagates to the whole group', () => {
      const { app } = newApp()
      const { namen, okej } = linkedOkejdaGroup(app)
      const group = collectGroup(namen, okej.variableId)
      expect(group.length).toBe(3)
      expect(group.every((n) => n.nodeType === 'chance')).toBe(true)

      app.api.toggleType(okej) // change ONE instance

      expect(group.every((n) => n.nodeType === 'decision')).toBe(true)
    })

    it('a type change skips an explicitly unlinked instance', () => {
      const { app } = newApp()
      const { namen, okej } = linkedOkejdaGroup(app)
      const group = collectGroup(namen, okej.variableId)
      const odd = group.find((n) => n !== okej)!
      app.api.unlinkVariable(odd) // odd becomes its own variable

      app.api.toggleType(okej)

      expect(okej.nodeType).toBe('decision')
      expect(odd.nodeType).toBe('chance') // untouched
    })

    it('DESIGN #1: editing probabilities in the outcomes dialog syncs the group', () => {
      const { app, container } = newApp()
      const { namen, okej } = linkedOkejdaGroup(app)
      app.api.addOutcomeTo(okej, 'jag', NaN)
      app.api.addOutcomeTo(okej, 'du', NaN)

      // Open okejdå's outcomes dialog, set probabilities, Save.
      app.api.selectNode(okej)
      container
        .querySelector('[data-node-id="' + okej.id + '"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      ;[...container.querySelectorAll('.menu-item')]
        .find((b) => b.textContent!.includes('Redigera utfall'))!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const probInputs = [...container.querySelectorAll('.dialog input.prob')] as HTMLInputElement[]
      probInputs[0].value = '0.7'
      probInputs[1].value = '0.3'
      ;[...container.querySelectorAll('.dialog button')]
        .find((b) => b.textContent === 'Spara')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // Every no-table instance in the group adopted 0.7 / 0.3.
      for (const inst of collectGroup(namen, okej.variableId)) {
        expect(inst.outcomes.map((o) => o.probability)).toEqual([0.7, 0.3])
      }
    })

    it('DESIGN #1: an instance with a conditional table opts out of probability sync', () => {
      const { app, container } = newApp()
      const { namen, okej } = linkedOkejdaGroup(app)
      app.api.addOutcomeTo(okej, 'jag', 0.5)
      app.api.addOutcomeTo(okej, 'du', 0.5)
      const group = collectGroup(namen, okej.variableId)
      const tabled = group.find((n) => n !== okej)!
      // Give one sibling a conditional table (context-driven).
      app.api.setConditionalTable(tabled, [
        { condition: new Set(['namen:2']), probabilities: { jag: 0.9, du: 0.1 } },
      ])
      tabled.outcomes[0].probability = 0.9
      tabled.outcomes[1].probability = 0.1

      // Edit okej's probabilities via the dialog.
      app.api.selectNode(okej)
      container
        .querySelector('[data-node-id="' + okej.id + '"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      ;[...container.querySelectorAll('.menu-item')]
        .find((b) => b.textContent!.includes('Redigera utfall'))!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const probInputs = [...container.querySelectorAll('.dialog input.prob')] as HTMLInputElement[]
      probInputs[0].value = '0.2'
      probInputs[1].value = '0.8'
      ;[...container.querySelectorAll('.dialog button')]
        .find((b) => b.textContent === 'Spara')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // The table-driven instance kept its own probabilities...
      expect(tabled.outcomes.map((o) => o.probability)).toEqual([0.9, 0.1])
      // ...while the other no-table instances synced to 0.2 / 0.8.
      for (const inst of group) {
        if (inst === tabled) continue
        expect(inst.outcomes.map((o) => o.probability)).toEqual([0.2, 0.8])
      }
    })
  })
})
