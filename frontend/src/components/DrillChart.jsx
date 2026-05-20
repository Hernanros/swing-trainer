import React, { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'
import { CHART_DATA } from '../data/drillChartData'

export default function DrillChart({ chartKey }) {
  const containerRef = useRef(null)
  const data = CHART_DATA[chartKey]

  useEffect(() => {
    if (!containerRef.current || !data) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: '#21262d',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: '#21262d', visible: false },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    })
    series.setData(data.candles)

    if (data.maLine) {
      const ma = chart.addSeries(LineSeries, {
        color: '#58a6ff',
        lineWidth: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      ma.setData(data.maLine)
    }

    chart.timeScale().fitContent()

    return () => { chart.remove() }
  }, [chartKey, data])

  if (!data) return null

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 220,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #21262d',
        marginBottom: 12,
      }}
    />
  )
}
