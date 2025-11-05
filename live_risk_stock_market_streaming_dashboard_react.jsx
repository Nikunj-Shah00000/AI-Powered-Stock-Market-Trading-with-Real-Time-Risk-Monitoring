/*
LiveRisk — Stock Market Streaming Dashboard (fixed)

This file is a single-file React component (default export) using Tailwind classes.

CHANGES in this revision (bug fix):
- Removed/escaped characters that could confuse JSX parsing (notably any stray ">" characters inside template strings).
- Replaced Unicode arrows with ASCII equivalents to avoid parsers that choke on certain characters.
- Made the conditional rendering for alternatives more explicit: check Array.isArray and length before rendering.
- Cleaned up a few JSX fragments to ensure every tag is properly closed and there are no stray characters outside strings/tags.

If you still see a build error, please paste the exact error stack and the tool/environment (Vite/esbuild/webpack) you use.

Note: I did not change the UI or business logic meaningfully — just made the JSX parser-safe adjustments.
*/

import React, { useEffect, useMemo, useState, useRef } from "react";

// Mock utilities
function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function nowISO() {
  return new Date().toISOString();
}

export default function LiveRiskDashboard() {
  const initialTickers = [
    { symbol: "AAPL", price: 175.12 },
    { symbol: "MSFT", price: 360.8 },
    { symbol: "TSLA", price: 250.3 },
    { symbol: "GOOGL", price: 132.45 },
  ];

  const [tickers, setTickers] = useState(
    initialTickers.map((t) => ({ ...t, bids: [], history: [t.price] }))
  );
  const [log, setLog] = useState([]);
  const [selected, setSelected] = useState(initialTickers[0]?.symbol ?? null);
  const [suggestions, setSuggestions] = useState([]);
  const streamerRef = useRef(null);

  // Mock streamer (replace with real WS in production)
  useEffect(() => {
    streamerRef.current = setInterval(() => {
      setTickers((prev) => {
        if (!prev.length) return prev;
        const i = Math.floor(Math.random() * prev.length);
        const tick = prev[i];
        const changePct = randomBetween(-0.015, 0.015);
        const lastPrice = tick.history[tick.history.length - 1] ?? tick.price;
        const newPrice = +(lastPrice * (1 + changePct)).toFixed(2);
        const updated = prev.map((p, idx) =>
          idx === i
            ? {
                ...p,
                price: newPrice,
                history: [...p.history, newPrice].slice(-500),
                bids: [{ price: newPrice, time: nowISO() }, ...p.bids].slice(0, 20),
              }
            : p
        );

        // safer log string (avoid problematic > characters)
        setLog((L) => [
          `${nowISO()} - ${tick.symbol} -> ${newPrice} (${(changePct * 100).toFixed(2)}%)`,
          ...L,
        ].slice(0, 200));

        return updated;
      });
    }, 800);

    return () => clearInterval(streamerRef.current);
  }, []);

  // compute simple risk metrics per ticker
  const tickerMetrics = useMemo(() => {
    return tickers.map((t) => {
      const prices = t.history || [t.price];
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        const r = Math.log(prices[i] / prices[i - 1]);
        if (Number.isFinite(r)) returns.push(r);
      }

      const window = 60;
      const lastReturns = returns.slice(-window);
      const mean = lastReturns.reduce((a, b) => a + b, 0) / Math.max(1, lastReturns.length);
      const variance = lastReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, lastReturns.length);
      const sigma = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252);
      const z = 2.33; // ~1% VaR
      const var1 = -(mean - z * sigma) * t.price;

      const last5 = prices.slice(-5);
      const lossPct = last5.length > 1 ? ((last5[last5.length - 1] / last5[0] - 1) * 100) : 0;

      return {
        symbol: t.symbol,
        lastPrice: t.price,
        volatilityAnn: +(sigma * 100).toFixed(2),
        var1d: +var1.toFixed(2),
        lossPct: +lossPct.toFixed(2),
      };
    });
  }, [tickers]);

  // Suggestion engine
  useEffect(() => {
    const riskThresholdLoss = -1.5;
    const varDollarThreshold = 40;
    const risky = tickerMetrics.filter((m) => m.lossPct < riskThresholdLoss || m.var1d > varDollarThreshold);

    const newSuggestions = [];
    if (risky.length > 0) {
      risky.forEach((r) => {
        newSuggestions.push({
          symbol: r.symbol,
          reason: r.lossPct < riskThresholdLoss ? `Recent drop ${r.lossPct}%` : `High VaR $${r.var1d}`,
          suggestion: r.lossPct < riskThresholdLoss ? "Consider stop-loss / reduce position" : "Consider hedge/derivative or reduce exposure",
          alternatives: suggestAlternatives(r.symbol),
        });
      });
    } else {
      const opportunistic = tickerMetrics
        .filter((m) => m.lossPct > -0.5 && m.lossPct < 0.5)
        .slice(0, 3)
        .map((m) => ({ symbol: m.symbol, reason: "Stable - low short-term swings", suggestion: "Consider small allocation", alternatives: [] }));
      newSuggestions.push(...opportunistic);
    }

    setSuggestions(newSuggestions);
  }, [tickerMetrics]);

  function suggestAlternatives(symbol) {
    const mapping = {
      AAPL: ["MSFT", "GOOGL"],
      MSFT: ["AAPL", "GOOGL"],
      TSLA: ["NIO", "RIVN"],
      GOOGL: ["META", "AAPL"],
    };
    return mapping[symbol] || ["SPY", "QQQ"];
  }

  function applyStopLoss(symbol) {
    setLog((L) => [`${nowISO()} - STOP-LOSS applied to ${symbol}`, ...L].slice(0, 200));
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">LiveRisk - Streaming Risk Monitor</h1>
          <p className="text-sm text-slate-600">Real-time risk signals, suggestions & live price feed</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Connected: simulated WebSocket</div>
          <div className="text-sm text-slate-500">Last update: {new Date().toLocaleTimeString()}</div>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-6">
        <section className="col-span-7">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Live Price Stream</h2>
              <div className="text-sm text-slate-500">Updates every 0.8s (sim)</div>
            </div>

            <div className="overflow-auto max-h-96">
              <table className="w-full table-auto text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Volatility (ann %)</th>
                    <th>1d VaR ($)</th>
                    <th>Recent %</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickerMetrics.map((m) => (
                    <tr key={m.symbol} className="border-t">
                      <td>
                        <button
                          className={`font-medium ${selected === m.symbol ? "text-indigo-600" : "text-slate-700"}`}
                          onClick={() => setSelected(m.symbol)}
                        >
                          {m.symbol}
                        </button>
                      </td>
                      <td>${m.lastPrice}</td>
                      <td>{m.volatilityAnn}%</td>
                      <td>${m.var1d}</td>
                      <td className={m.lossPct < 0 ? "text-rose-600" : "text-emerald-600"}>{m.lossPct}%</td>
                      <td>
                        <button
                          className="px-2 py-1 rounded bg-rose-50 text-rose-600 text-xs"
                          onClick={() => applyStopLoss(m.symbol)}
                        >
                          Stop-loss
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded">
                <div className="text-xs text-slate-500">Feed latency</div>
                <div className="font-semibold">~0.8s (sim)</div>
              </div>
              <div className="p-3 bg-slate-50 rounded">
                <div className="text-xs text-slate-500">Watched tickers</div>
                <div className="font-semibold">{tickers.length}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded">
                <div className="text-xs text-slate-500">Alerts</div>
                <div className="font-semibold">{suggestions.length}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-2">Activity Log</h3>
            <div className="text-xs text-slate-500 max-h-40 overflow-auto">
              {log.map((l, i) => (
                <div key={i} className="py-1 border-b last:border-b-0">{l}</div>
              ))}
            </div>
          </div>
        </section>

        <aside className="col-span-5">
          <div className="bg-white rounded-2xl shadow p-4 mb-4">
            <h3 className="font-semibold mb-3">Risk Monitor - {selected}</h3>

            {tickerMetrics.filter((m) => m.symbol === selected).map((m) => (
              <div key={m.symbol}>
                <div className="text-sm text-slate-500">Last price</div>
                <div className="text-2xl font-bold mb-2">${m.lastPrice}</div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">Volatility (ann)</div>
                    <div className="font-semibold">{m.volatilityAnn}%</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="text-xs text-slate-500">1d VaR (parametric)</div>
                    <div className="font-semibold">${m.var1d}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-500">Risk level</div>
                  <div className="w-full bg-emerald-100 rounded-full h-3 mt-2">
                    <div
                      className="h-3 rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, m.volatilityAnn)}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Higher means more historical price variability</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow p-4 mb-4">
            <h3 className="font-semibold mb-3">Automated Suggestions</h3>

            {suggestions.length === 0 && (
              <div className="text-sm text-slate-500">No suggestions at this time - market stable</div>
            )}

            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{s.symbol}</div>
                      <div className="text-xs text-slate-500">{s.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Suggestion</div>
                      <div className="font-medium">{s.suggestion || "Reduce / Hedge"}</div>
                    </div>
                  </div>

                  {/* Render alternatives only if it's a non-empty array */}
                  {Array.isArray(s.alternatives) && s.alternatives.length > 0 && (
                    <div className="mt-2 text-xs text-slate-500">Alternatives: {s.alternatives.join(", ")}</div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button className="px-3 py-1 rounded bg-indigo-600 text-white text-sm">Buy alternative</button>
                    <button className="px-3 py-1 rounded bg-rose-50 text-rose-600 text-sm" onClick={() => applyStopLoss(s.symbol)}>
                      Apply Stop
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-3">Portfolio Health (demo)</h3>
            <div className="text-sm text-slate-500 mb-2">Quick overview of suggested adjustments</div>
            <ul className="text-sm list-disc pl-5 space-y-1 text-slate-700">
              <li>Reduce exposure to tickers with VaR &gt; $40</li>
              <li>Diversify into broad ETFs (for example SPY/QQQ) if single stocks spike volatility</li>
              <li>Consider options-based hedges for positions larger than 10%</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
