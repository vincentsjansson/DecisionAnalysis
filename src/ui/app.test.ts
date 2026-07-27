// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

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
})
