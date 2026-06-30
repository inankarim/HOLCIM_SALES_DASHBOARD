/**
 * exportPng.ts
 *
 * Production-ready PNG export utility built on `html-to-image`.
 *
 * Why html-to-image over html2canvas:
 *  - Native SVG support: Recharts renders SVG; html2canvas rasterises the DOM
 *    and loses vector fidelity. html-to-image serialises SVG inline so every
 *    path, gradient, and text renders exactly as on screen.
 *  - No oklch workarounds: html-to-image reads inline styles and serialised
 *    SVG attributes rather than calling getComputedStyle recursively, so
 *    Tailwind v4's oklch colours do not break it.
 *  - No blank-image bugs: html2canvas silently swallows cross-origin and
 *    SVG serialisation errors and returns a blank canvas. html-to-image
 *    throws, letting us handle failures explicitly.
 *
 * Public API (unchanged from the previous implementation):
 *  - exportChartToPng(container, filename)          → single chart export
 *  - exportChartsToPngSequential(jobs, onProgress)  → ordered multi-chart export
 */

import { toPng } from "html-to-image"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportJob {
  /** DOM element to capture. */
  element: HTMLElement | null
  /** Download filename, e.g. "Region-Performance.png". */
  filename: string
  /** Human-readable label shown in progress UI, e.g. "Region Performance". */
  label: string
}

export interface ExportResult {
  filename: string
  label: string
  success: boolean
  error?: Error
}

export interface ExportProgress {
  completed: number
  total: number
  current: string
  results: ExportResult[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Waits for the browser to commit the current frame to the screen.
 * Using two nested rAF calls guarantees we are past any pending style
 * recalculations and paint operations.
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/**
 * A small delay between sequential downloads prevents browser download
 * throttling (Chrome limits concurrent initiations to ~10/s) and gives
 * Recharts animation time to settle on subsequent charts.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sanitise a filename so it is safe on every OS and browser.
 */
function sanitiseFilename(name: string): string {
  return name.replace(/[^\w.\- ]/g, "_")
}

/**
 * Resolve every CSS custom property (var(--…)) used in inline `style`
 * attributes and SVG `style` / presentation attributes inside the clone.
 *
 * html-to-image serialises the element's innerHTML to an SVG foreignObject,
 * so `var()` references that only resolve at paint time become literal strings
 * and render as nothing. We walk every element in the clone and replace them
 * with computed hex/rgb values from the *live* document.
 *
 * This is the correct approach: we read from the live computed style (which
 * has already resolved oklch → sRGB in modern browsers) and write resolved
 * values into the clone.
 */
function resolveCustomProperties(
  liveRoot: HTMLElement,
  cloneRoot: HTMLElement
): void {
  const liveEls = Array.from(liveRoot.querySelectorAll<Element>("*"))
  const cloneEls = Array.from(cloneRoot.querySelectorAll<Element>("*"))

  // Both NodeLists are in DOM order and have equal length.
  const len = Math.min(liveEls.length, cloneEls.length)

  for (let i = 0; i < len; i++) {
    const live = liveEls[i]
    const clone = cloneEls[i]

    const computed = window.getComputedStyle(live)

    // Properties that commonly use CSS vars in Tailwind / shadcn/ui.
    // Only HTMLElements have a writable .style; SVGElements are handled below.
    if (live instanceof HTMLElement && clone instanceof HTMLElement) {
      const propsToResolve: Array<keyof CSSStyleDeclaration> = [
        "color",
        "backgroundColor",
        "borderColor",
        "borderTopColor",
        "borderBottomColor",
        "borderLeftColor",
        "borderRightColor",
        "outlineColor",
        "fill",
        "stroke",
      ]

      for (const prop of propsToResolve) {
        const value = computed[prop] as string
        if (value && value !== "none" && value !== "") {
          ;(clone.style as any)[prop] = value
        }
      }
    }

    // SVG presentation attributes: fill, stroke, etc. are set as element
    // attributes rather than style on SVG elements.
    // querySelectorAll<Element> returns Element, and both HTMLElement and
    // SVGElement extend Element, so instanceof SVGElement is a valid guard.
    if (live instanceof SVGElement) {
      const cloneSvg = clone as unknown as SVGElement
      for (const attr of ["fill", "stroke", "stop-color", "flood-color"]) {
        const liveAttr = live.getAttribute(attr)
        if (liveAttr?.startsWith("var(")) {
          const resolved = computed.getPropertyValue(
            liveAttr.slice(4, -1).trim()
          )
          if (resolved) cloneSvg.setAttribute(attr, resolved.trim())
        }
      }
    }
  }
}

/**
 * Build toPng options optimised for dashboard charts.
 *
 * - `pixelRatio`: 2× minimum for retina-quality exports.
 * - `backgroundColor`: force white so transparent areas are not black.
 * - `filter`: strip buttons and elements marked `ignore-export` from the
 *   capture (same behaviour as the previous html2canvas implementation).
 * - `style`: temporarily override `overflow` so horizontally-scrollable
 *   chart wrappers are captured in full.
 * - `fontEmbedCSS`: disabled; we rely on system fonts matching what the
 *   browser rendered, which avoids a slow network fetch per export.
 */
function buildToPngOptions() {
  return {
    pixelRatio: Math.max(window.devicePixelRatio ?? 1, 2),
    backgroundColor: "#ffffff",
    filter: (node: Node): boolean => {
      if (!(node instanceof Element)) return true
      if (node.tagName === "BUTTON") return false
      if (node.classList.contains("ignore-export")) return false
      return true
    },
    style: {
      // Reveal content clipped by overflow-x-auto on the container itself.
      overflow: "visible",
    },
    // Prevent html-to-image from injecting a <style> block that re-imports
    // web fonts. The fonts are already rendered by the browser; we just need
    // the pixels.
    skipFonts: true,
  } as const
}

/**
 * Trigger a browser file download for a PNG data URL.
 *
 * Appending the link to the body and removing it afterwards is necessary
 * in Firefox, which does not honour a detached anchor's `download` attribute.
 */
function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement("a")
  link.download = sanitiseFilename(filename)
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a single chart element to a PNG file and trigger a browser download.
 *
 * This is a drop-in replacement for the previous `exportChartToPng` function.
 * All chart components call this function, so the signature is preserved.
 *
 * @param container  The DOM element to capture. May be null (no-op with warning).
 * @param filename   The suggested download filename.
 * @returns          A promise that resolves when the download has been
 *                   triggered, or rejects with an Error on failure.
 */
export async function exportChartToPng(
  container: HTMLElement | null,
  filename: string
): Promise<void> {
  if (!container) {
    console.warn(`exportChartToPng: no container for "${filename}" — skipping`)
    return
  }

  // Wait for any pending React state updates and repaints before capturing.
  await waitForPaint()

  // Resolve CSS custom properties so var() references don't become empty
  // strings inside the serialised foreignObject.
  //
  // We clone the subtree, resolve properties against the live DOM, then pass
  // the clone to toPng via the `onclone` callback so html-to-image uses our
  // pre-resolved version.
  const options = {
    ...buildToPngOptions(),
    onclone: (_doc: Document, clone: HTMLElement) => {
      resolveCustomProperties(container, clone)
    },
  }

  let dataUrl: string

  try {
    // html-to-image occasionally fails on the first call when an SVG contains
    // external resources that haven't been fetched yet. A single retry on
    // failure recovers from those transient cases without masking real errors.
    try {
      dataUrl = await toPng(container, options)
    } catch (firstError) {
      console.warn(
        `exportChartToPng: first attempt failed for "${filename}", retrying…`,
        firstError
      )
      await delay(200)
      dataUrl = await toPng(container, options)
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error(`exportChartToPng: failed to export "${filename}"`, error)
    throw error
  }

  triggerDownload(dataUrl, filename)
}

/**
 * Export multiple charts in sequence with progress reporting.
 *
 * This is used by the EmailReportModal to export all selected charts one
 * by one. Sequential (rather than parallel) execution prevents browser
 * download throttling and avoids overwhelming the rasteriser.
 *
 * @param jobs        Array of { element, filename, label } descriptors.
 * @param onProgress  Optional callback invoked after each chart attempt.
 * @returns           An array of ExportResult — one per job, in order.
 *
 * @example
 * const results = await exportChartsToPngSequential(
 *   [
 *     { element: regionRef.current, filename: "Region.png", label: "Region" },
 *     { element: areaRef.current,   filename: "Area.png",   label: "Area"   },
 *   ],
 *   ({ completed, total, current }) =>
 *     setProgress(`${current} (${completed}/${total})`)
 * );
 */
export async function exportChartsToPngSequential(
  jobs: ExportJob[],
  onProgress?: (progress: ExportProgress) => void
): Promise<ExportResult[]> {
  const results: ExportResult[] = []

  // Wait for the page to settle before starting the batch.
  await waitForPaint()

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]

    onProgress?.({
      completed: i,
      total: jobs.length,
      current: job.label,
      results: [...results],
    })

    if (!job.element) {
      results.push({
        filename: job.filename,
        label: job.label,
        success: false,
        error: new Error(`Element for "${job.label}" is null`),
      })
      console.warn(
        `exportChartsToPngSequential: skipping "${job.label}" — element is null`
      )
      continue
    }

    try {
      await exportChartToPng(job.element, job.filename)
      results.push({ filename: job.filename, label: job.label, success: true })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      results.push({
        filename: job.filename,
        label: job.label,
        success: false,
        error,
      })
      // Log but continue with the remaining jobs.
      console.error(
        `exportChartsToPngSequential: failed on "${job.label}"`,
        error
      )
    }

    // Small gap between downloads:
    //  - Prevents Chrome's download-initiation throttle (> ~10 in 1 s).
    //  - Gives Recharts animations on the next chart time to complete.
    if (i < jobs.length - 1) {
      await delay(350)
    }
  }

  // Final progress callback with all results.
  onProgress?.({
    completed: jobs.length,
    total: jobs.length,
    current: "",
    results,
  })

  return results
}

/**
 * Convenience wrapper for the EmailReportModal pattern where the modal must
 * hide itself before screenshots are taken and must restore itself afterwards
 * — even if an error occurs.
 *
 * Usage:
 *
 *   await exportWithModalHidden(modalRef.current, async () => {
 *     await exportChartsToPngSequential(jobs, setProgress);
 *   });
 *
 * @param modalElement  The modal root element to hide during export.
 *                      Pass `null` to skip hiding (graceful no-op).
 * @param fn            Async function that performs the actual exports.
 */
export async function exportWithModalHidden(
  modalElement: HTMLElement | null,
  fn: () => Promise<void>
): Promise<void> {
  const previousDisplay = modalElement?.style.display

  try {
    if (modalElement) {
      modalElement.style.display = "none"
      // Give the browser one paint cycle to acknowledge the hide before
      // we start capturing other elements.
      await waitForPaint()
    }

    await fn()
  } finally {
    // Always restore the modal, even if fn() threw.
    if (modalElement && previousDisplay !== undefined) {
      modalElement.style.display = previousDisplay
    }
  }
}

// Add this new function at the bottom of exportPng.ts
// ─────────────────────────────────────────────────────────────────────────────
// ADD THIS FUNCTION TO THE BOTTOM OF YOUR EXISTING exportPng.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capture a chart element as a base64 PNG string (no download).
 * Used by the email send flow to attach charts inline via cid:.
 *
 * @param container  The DOM element to capture.
 * @param label      Human-readable name, used as the cid: key.
 *                   Use kebab-case matching CHART_TITLES keys in emailTemplate.ts
 *                   e.g. "Region-Performance", "Product-Mix", etc.
 * @returns          { name, base64 } or null if capture fails.
 */
export async function captureChartAsBase64(
  container: HTMLElement | null,
  label: string
): Promise<{ name: string; base64: string } | null> {
  if (!container) {
    console.warn(`captureChartAsBase64: no element for "${label}" — skipping`)
    return null
  }

  await waitForPaint()

  const options = {
    ...buildToPngOptions(),
    onclone: (_doc: Document, clone: HTMLElement) => {
      resolveCustomProperties(container, clone)
    },
  }

  try {
    // Same single-retry strategy as exportChartToPng
    let dataUrl: string
    try {
      dataUrl = await toPng(container, options)
    } catch (firstError) {
      console.warn(`captureChartAsBase64: retrying "${label}"…`, firstError)
      await delay(200)
      dataUrl = await toPng(container, options)
    }

    return {
      name: label,
      base64: dataUrl.split(",")[1], // strip "data:image/png;base64,"
    }
  } catch (err) {
    console.error(`captureChartAsBase64: failed for "${label}"`, err)
    return null
  }
}
