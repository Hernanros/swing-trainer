import React, { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts'
import { api } from '../api'

const RANGES = [
  { label: '1M',  days: 30 },
  { label: '3M',  days: 90 },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
]

function findMaxVolumeBar(candles) {
  if (!candles || candles.length === 0) return null
  let max = candles[0]
  for (const c of candles) {
    if ((c.volume ?? 0) > (max.volume ?? 0)) max = c
  }
  return max.volume > 0 ? max : null
}

export default function ChartModal({ symbol, onClose }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const [range, setRange] = useState(60)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: '#161b22' }, textColor: '#e0e0e0' },
      grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#21262d' },
      timeScale: { borderColor: '#21262d', timeVisible: true },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3fb950', downColor: '#f85149',
      borderUpColor: '#3fb950', borderDownColor: '#f85149',
      wickUpColor: '#3fb950', wickDownColor: '#f85149',
    })
    chartRef.current = chart
    seriesRef.current = series

    return () => { chart.remove() }
  }, [])

  const [volPeak, setVolPeak] = useState(null)

  // Load data when range changes
  useEffect(() => {
    if (!seriesRef.current) return
    setLoading(true)
    setError('')
    api.market.candles(symbol, range)
      .then(data => {
        seriesRef.current.setData(
          data.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
        )
        // 52-week volume peak: mark the bar with the highest volume in the visible window.
        // When range >= 250 trading days this IS the 52w peak; on shorter ranges it's
        // labeled as "Vol peak (in view)" so we don't claim 52w over insufficient data.
        const peak = findMaxVolumeBar(data)
        setVolPeak(peak)
        if (peak) {
          const label = range >= 250 ? '52w vol peak' : 'Vol peak (in view)'
          createSeriesMarkers(seriesRef.current, [{
            time: peak.time,
            position: 'aboveBar',
            color: '#e3b341',
            shape: 'arrowDown',
            text: label,
          }])
        } else {
          createSeriesMarkers(seriesRef.current, [])
        }
        chartRef.current.timeScale().fitContent()
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load chart data')
        setLoading(false)
      })
  }, [symbol, range])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{symbol}</span>
          <div className="modal-range-btns">
            {RANGES.map(r => (
              <button
                key={r.label}
                className={`range-btn${range === r.days ? ' active' : ''}`}
                onClick={() => setRange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-chart-wrap" ref={containerRef}>
          {loading && <div className="modal-loading">Loading…</div>}
          {error && <div className="modal-error">{error}</div>}
        </div>
        {volPeak && !loading && !error && (
          <div style={{ padding: '6px 18px 10px', fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>
              <span style={{ color: '#e3b341', fontWeight: 700, marginRight: 4 }}>▼</span>
              {range >= 250 ? '52w vol peak' : 'Vol peak (in view)'}: {volPeak.volume.toLocaleString()} on {new Date(volPeak.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
