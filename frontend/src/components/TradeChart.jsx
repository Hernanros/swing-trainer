import React, { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries } from 'lightweight-charts'

export default function TradeChart({
  symbol, date, entry, stop, target, exit,
  tradeType = 'equity',
  longStrike, shortStrike,
}) {
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

    // Option spreads: entry/stop/target/exit are option PREMIUMS (e.g. $1.50), not underlying
    // prices, so they don't belong on the underlying's candle chart. Draw the strikes (which ARE
    // in the underlying's price domain) and place Entry/Exit markers on the candle timeline.
    const priceLines = []
    if (tradeType === 'option_spread') {
      if (longStrike  != null) priceLines.push({ price: longStrike,  color: '#58a6ff', title: 'Long'  })
      if (shortStrike != null) priceLines.push({ price: shortStrike, color: '#e3b341', title: 'Short' })
    } else {
      priceLines.push({ price: entry,  color: '#58a6ff', title: 'Entry'  })
      priceLines.push({ price: stop,   color: '#f85149', title: 'Stop'   })
      priceLines.push({ price: target, color: '#3fb950', title: 'Target' })
      if (exit != null) priceLines.push({ price: exit, color: '#e3b341', title: 'Exit' })
    }
    priceLines.forEach(({ price, color, title }) => {
      if (price == null || !Number.isFinite(+price)) return
      series.createPriceLine({
        price: +price,
        color,
        lineWidth: 2,
        lineStyle: 0,           // solid — 1px dashed was nearly invisible
        axisLabelVisible: true,
        title,
      })
    })

    // For option spreads, also drop Entry/Exit markers on the candle timeline so the user can
    // see WHEN the trade happened relative to price action. Entry anchors to `date`; Exit anchors
    // to the latest candle in the series (we don't currently persist a close timestamp).
    if (tradeType === 'option_spread' && candles.length > 0) {
      const tradeTs = Math.floor(new Date(date).getTime() / 1000)
      const entryCandle = candles.find(c => c.time >= tradeTs) || candles[0]
      const markers = [
        { time: entryCandle.time, position: 'belowBar', color: '#58a6ff', shape: 'arrowUp', text: 'Entry' },
      ]
      if (exit != null) {
        markers.push({ time: candles[candles.length - 1].time, position: 'aboveBar', color: '#e3b341', shape: 'arrowDown', text: 'Exit' })
      }
      series.setMarkers(markers)
    }

    chart.timeScale().fitContent()

    return () => { chart.remove() }
  }, [candles, entry, stop, target, exit, tradeType, longStrike, shortStrike, date])

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
