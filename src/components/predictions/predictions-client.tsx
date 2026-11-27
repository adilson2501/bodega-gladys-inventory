"use client";

import { useEffect, useState } from "react";
type Product = { id: string; name: string };
type Result = { product_id: string; cutoff_date: string; forecast_next_7d_units: number; model: string; model_version: string; horizon_days: number; source: string };
type Audit = { id: string; productName: string; predictedAt: string; status: string; output: Result | null; errorDetails: string | null; modelVersion: string };

export function PredictionsClient({ products, cutoffDate }: { products: Product[]; cutoffDate: string }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Audit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function loadHistory() { const response = await fetch("/api/predictions"); if (response.ok) setHistory((await response.json()).history); }
  // The initial audit list is synchronized with the authenticated API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadHistory(); }, []);
  async function predict() {
    setBusy(true); setError(null); setResult(null);
    try { const response = await fetch("/api/predictions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, cutoffDate }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "No se pudo generar la predicción."); setResult(payload); await loadHistory(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error inesperado."); } finally { setBusy(false); }
  }
  return <div className="space-y-7">
    <section><p className="text-sm font-semibold text-emerald-800">Machine Learning · SYNTHETIC</p><h1 className="mt-1 page-heading font-bold text-slate-950">Predicción APF3</h1><p className="mt-2 text-sm text-slate-600">Inferencia Ridge en tiempo de solicitud, usando únicamente historia sintética hasta el 31 de octubre de 2026.</p></section>
    <section className="surface p-5"><h2 className="section-heading font-bold">Generar pronóstico</h2><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-sm font-semibold text-slate-700">Producto<select className="form-input mt-1" value={productId} onChange={(event) => setProductId(event.target.value)} disabled={busy}><option value="">Selecciona un producto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><button className="min-h-12 rounded-xl bg-emerald-700 px-5 font-bold text-white hover:bg-emerald-800 disabled:bg-slate-400" onClick={predict} disabled={busy || !productId}>{busy ? "Calculando..." : "Predecir 7 días"}</button></div><p className="mt-3 text-xs text-slate-500">Corte fijo: {cutoffDate}. No se usa demanda futura.</p></section>
    {error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-900">{error}</div> : null}
    {result ? <section className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5" aria-live="polite"><p className="text-sm font-semibold text-emerald-800">Resultado calculado</p><p className="mt-2 text-4xl font-bold text-emerald-950">{new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(result.forecast_next_7d_units)} <span className="text-lg">unidades</span></p><dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Modelo" value={result.model} /><Metric label="Versión" value={result.model_version} /><Metric label="Horizonte" value={`${result.horizon_days} días`} /><Metric label="Origen" value={result.source} /></dl></section> : null}
    <section><h2 className="section-heading font-bold text-slate-950">Historial reciente</h2><div className="mt-3 space-y-2">{history.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Todavía no hay predicciones auditadas.</p> : history.map((item) => <article key={item.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><p className="font-bold text-slate-950">{item.productName}</p><p className="text-slate-500">{new Date(item.predictedAt).toLocaleString("es-PE")} · {item.modelVersion}</p></div><div className="text-right"><p className={item.status === "SUCCESS" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{item.status === "SUCCESS" && item.output ? `${item.output.forecast_next_7d_units.toFixed(2)} u` : "Falló"}</p>{item.errorDetails ? <p className="max-w-xs text-xs text-red-700">{item.errorDetails}</p> : null}</div></article>)}</div></section>
  </div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white/70 p-3"><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1 font-bold text-slate-950">{value}</dd></div>; }
