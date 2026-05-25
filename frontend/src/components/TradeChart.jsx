import React, { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries } from 'lightweight-charts'

export default function TradeChart({ symbol, date, entry, stop, target, exit }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [candles, setCandles] = useState(null)

  useEffect(() => {
    if (!symbol || !date) return
    setLoading(true)
    setError(null)
    fetch(`/api/market/candles/${encodeURIComponent(symbol)}?date=${date}&days=60`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then(data => {
        setCandles(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [symbol, date])

  useEffect(() => {
    if (!containerRef.current || !candles) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: '#21262d',
        scaleMargins: { top: 0.1, bottom: 0.15 },
      },
      timeScale: { borderColor: '#21262d' },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#3fb950',
      downColor:      '#f85149',
      borderUpColor:  '#3fb950',
      borderDownColor:'#f85149',
      wickUpColor:    '#3fb950',
      wickDownColor:  '#f85149',
    })
    series.setData(candles)

    const priceLines = [
      { price: entry, color: '#58a6ff', title: 'Entry' },
      { price: stop,  color: '#f85149', title: 'Stop'  },
      { price: target,color: '#3fb950', title: 'Target'},
    ]
    if (exit != null) {
      priceLines.push({ price: exit, color: '#e3b341', title: 'Exit' })
    }
    priceLines.forEach(({ price, color, title }) => {
      series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: 2,   // dashed
        axisLabelVisible: true,
        title,
      })
    })

    chart.timeScale().fitContent()

    return () => { chart.remove() }
  }, [candles, entry, stop, target, exit])

  if (loading) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
        Loading chart…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ height: 60, display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 12 }}>
        Chart unavailable
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 240,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #21262d',
      }}
    />
  )
}
