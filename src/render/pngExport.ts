/** PNG export of the tree canvas, with a transparent background.
 *
 * The tree is drawn as an SVG whose colours/fonts/stroke-widths all come from
 * external CSS classes. A serialized standalone SVG does NOT carry that external
 * CSS, so before rasterizing we inline each element's *computed* style — that
 * makes the exported image match the on-screen tree regardless of the theme.
 * The current zoom/pan is ignored (the viewport transform is reset) so the
 * export is always the whole tree at natural size; the viewBox is fitted to the
 * content bounds with a small margin. The background is never filled, so the
 * PNG is transparent. */

/** Computed style properties that carry the tree's visual look. Copied inline
 * onto the export clone (external CSS classes don't survive serialization). */
const STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
] as const

/** Copies computed styles from every element of the live `source` SVG onto the
 * matching element of `target` (a deep clone — identical structure, so a
 * document-order zip lines them up). */
function inlineComputedStyles(source: SVGSVGElement, target: SVGSVGElement): void {
  const src = [source, ...source.querySelectorAll('*')]
  const tgt = [target, ...target.querySelectorAll('*')]
  for (let i = 0; i < src.length && i < tgt.length; i++) {
    const el = src[i]
    if (!(el instanceof Element)) continue
    const cs = getComputedStyle(el)
    let style = ''
    for (const prop of STYLE_PROPS) {
      const value = cs.getPropertyValue(prop)
      if (value) style += `${prop}:${value};`
    }
    if (style) tgt[i].setAttribute('style', style)
  }
}

export interface ExportSvg {
  svgString: string
  width: number
  height: number
}

/** Builds a standalone, self-styled SVG string of the whole tree at natural
 * size (zoom/pan removed, viewBox fitted to content + margin, computed styles
 * inlined). Returns null when there's nothing to export (no content bounds). */
export function buildExportSvg(svgEl: SVGSVGElement, margin = 16): ExportSvg | null {
  const viewport = svgEl.querySelector('#viewport') as SVGGraphicsElement | null
  if (!viewport) return null
  const bbox = viewport.getBBox()
  if (!bbox.width || !bbox.height) return null

  const clone = svgEl.cloneNode(true) as SVGSVGElement
  const cloneViewport = clone.querySelector('#viewport') as SVGGraphicsElement | null
  cloneViewport?.setAttribute('transform', '') // drop zoom/pan -> natural coords

  const width = bbox.width + margin * 2
  const height = bbox.height + margin * 2
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `${bbox.x - margin} ${bbox.y - margin} ${width} ${height}`)

  inlineComputedStyles(svgEl, clone)

  const svgString = new XMLSerializer().serializeToString(clone)
  return { svgString, width, height }
}

/** Rasterizes the tree SVG to a transparent-background PNG and triggers a
 * download named `filename`. `scale` oversamples for a crisp image (default 2×).
 * Returns false synchronously when there's nothing to export; the actual
 * download happens asynchronously once the SVG image has loaded. */
export function exportTreePng(svgEl: SVGSVGElement, filename: string, scale = 2): boolean {
  const built = buildExportSvg(svgEl)
  if (!built) return false

  const svgUrl = URL.createObjectURL(
    new Blob([built.svgString], { type: 'image/svg+xml;charset=utf-8' }),
  )
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(built.width * scale)
    canvas.height = Math.ceil(built.height * scale)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(scale, scale)
      // No fillRect -> the canvas stays transparent behind the tree.
      ctx.drawImage(img, 0, 0, built.width, built.height)
    }
    URL.revokeObjectURL(svgUrl)
    canvas.toBlob((blob) => {
      if (!blob) return
      const pngUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }
  img.onerror = () => URL.revokeObjectURL(svgUrl)
  img.src = svgUrl
  return true
}
