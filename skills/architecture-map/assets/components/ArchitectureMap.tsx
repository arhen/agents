'use client'

import { useEffect } from 'react'
import type { ArchEdge, ArchFlow, ArchNode, Group } from '../core/types'
import { pauseClock, resumeClock, setClockSpeed, SPEEDS, useClockPlaying, useClockSpeed } from '../stores/useFlowClock'
import { clearView, setActiveFlow, useMapView } from '../stores/useMapView'
import IsoCanvas from './IsoCanvas'
import { ExplainerPanel, LegendRail } from './SidePanels'
import { motion, paint, type as typeface } from './theme'

/**
 * The page: index, stage, reading pane — full height, no page scroll, each
 * column scrolling itself.
 *
 * Escape is bound here rather than on the canvas because it is the page's
 * escape hatch, not the canvas's: it has to clear the view when focus is a
 * rail chip or a button in the panel, which is most of the time.
 *
 * The stat strip counts what the map draws, derived rather than authored — the
 * first module added would otherwise make the header lie.
 */

export type ArchitectureData = {
  groups: readonly Group[]
  nodes: readonly ArchNode[]
  edges: readonly ArchEdge[]
  flows: readonly ArchFlow[]
  intro: { title: string; lede: string; whatItDoes: string; howItsBuilt: string }
  /** Files no module claims. Above zero means the map is behind the code. */
  unmapped: readonly string[]
  repo: string
}

const LABEL: React.CSSProperties = {
  fontFamily: typeface.mono, fontSize: 10, letterSpacing: 0.6,
  textTransform: 'uppercase', color: paint.inkTertiary,
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 12px', borderLeft: `1px solid ${paint.border}`, flexShrink: 0,
    }}>
      <span style={{ ...LABEL, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{
        fontFamily: typeface.mono, fontSize: 12, fontWeight: 600,
        color: accent ? paint.accent : paint.inkPrimary, whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  )
}

export default function ArchitectureMap({ data }: { data: ArchitectureData }) {
  const { activeFlowId, selection } = useMapView()
  const playing = useClockPlaying()
  const speed = useClockSpeed()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        clearView()
        return
      }
      // Space is the transport, but never while someone is typing.
      const target = e.target as HTMLElement | null
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (e.key === ' ' && !typing && activeFlowId) {
        e.preventDefault()
        playing ? pauseClock() : resumeClock()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeFlowId, playing])

  const activeFlow = data.flows.find((f) => f.id === activeFlowId)
  const selectedName =
    selection?.kind === 'node'
      ? (data.nodes.find((n) => n.id === selection.id)?.name ?? 'module')
      : (activeFlow?.name ?? 'system')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: paint.surface }}>
      <header style={{
        display: 'flex', alignItems: 'stretch', height: 56, flexShrink: 0,
        borderBottom: `1px solid ${paint.border}`, paddingLeft: 20, paddingRight: 12,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 12, minWidth: 0 }}>
          <span style={LABEL}>Repository</span>
          <span style={{
            fontFamily: typeface.mono, fontSize: 12, fontWeight: 600, color: paint.inkPrimary,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {data.repo}
          </span>
        </div>

        <Cell label="Flows" value={String(data.flows.length)} />
        <Cell label="Modules" value={String(data.nodes.length)} />
        <Cell label="Paths" value={String(data.edges.length)} />
        <Cell
          label="Unmapped"
          value={data.unmapped.length === 0 ? 'none' : String(data.unmapped.length)}
          accent={data.unmapped.length > 0}
        />
        <Cell label="Selected" value={selectedName} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
          <button
            type="button"
            disabled={!activeFlow}
            onClick={() => (playing ? pauseClock() : resumeClock())}
            style={{
              ...LABEL, cursor: activeFlow ? 'pointer' : 'default',
              opacity: activeFlow ? 1 : 0.4, padding: '6px 10px', borderRadius: 4,
              border: `1px solid ${paint.border}`, background: paint.surface,
              transition: `opacity ${motion.hover}ms ease-in-out`,
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <div style={{ display: 'flex', border: `1px solid ${paint.border}`, borderRadius: 4, overflow: 'hidden' }}>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setClockSpeed(s)}
                style={{
                  ...LABEL, cursor: 'pointer', padding: '6px 8px', border: 'none',
                  background: speed === s ? paint.accentWash : paint.surface,
                  color: speed === s ? paint.accent : paint.inkTertiary,
                }}
              >
                {s}×
              </button>
            ))}
          </div>
          {(selection || activeFlowId) && (
            <button
              type="button"
              onClick={clearView}
              aria-label="Clear selection"
              style={{ ...LABEL, cursor: 'pointer', padding: '6px 10px', borderRadius: 4, border: `1px solid ${paint.border}`, background: paint.surface }}
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <LegendRail groups={data.groups} nodes={data.nodes} flows={data.flows} />
        <div style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column' }}>
          <IsoCanvas groups={data.groups} nodes={data.nodes} edges={data.edges} flows={data.flows} />
          <footer style={{
            display: 'flex', alignItems: 'center', height: 32, flexShrink: 0,
            borderTop: `1px solid ${paint.border}`, padding: '0 20px',
          }}>
            <span style={LABEL}>
              choose a flow · space plays · drag to pan · scroll to zoom · − + 0 · esc clears
            </span>
          </footer>
        </div>
        <ExplainerPanel intro={data.intro} nodes={data.nodes} edges={data.edges} flows={data.flows} />
      </div>
    </div>
  )
}
