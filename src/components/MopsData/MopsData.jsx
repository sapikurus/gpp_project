import { useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useApp } from '../../App.jsx';
import { patchData } from '../../firebase.js';

const BBL_TO_L = 158.9873;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt2 = n => (n == null || isNaN(+n)) ? '–' : (+n).toFixed(2);
const fmtPct = n => { if (n == null || isNaN(+n)) return '–'; const v = (+n).toFixed(2); return (n > 0 ? '+' : '') + v + '%'; };
const fmtIdr = n => (n == null || isNaN(+n)) ? '–' : new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:2, maximumFractionDigits:2 }).format(+n);
const fmtIdr0 = n => (n == null || isNaN(+n)) ? '–' : new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0, maximumFractionDigits:0 }).format(+n);

const INDO_MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const indoDateShort = s => { if (!s) return '–'; const d = new Date(s + 'T00:00:00'); return `${d.getDate()} ${INDO_MONTHS[d.getMonth()].slice(0,3)} ${d.getFullYear()}`; };

// Build the last 24 months for the preset dropdown
const buildMonthOptions = () => {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const d = new Date(y, m, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    opts.push({ value: val, label: `${INDO_MONTHS[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() });
  }
  return opts;
};
const MONTH_OPTIONS = buildMonthOptions();

// Compute date range for a month-period combination
// month is 0-indexed
const periodDates = (year, month, period) => {
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear  = month === 0 ? year - 1 : year;
  const pm = String(prevMonth + 1).padStart(2,'0');
  const py = prevYear;
  const cm = String(month + 1).padStart(2,'0');
  if (period === 'P1') return { from: `${py}-${pm}-09`, to: `${py}-${pm}-24` };
  return { from: `${py}-${pm}-25`, to: `${year}-${cm}-08` };
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const defaultFrom = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };
const avgOf = (rows, key) => { const v = rows.map(r => r[key]).filter(x => x != null && !isNaN(+x)); return v.length ? v.reduce((a,b) => a + +b, 0) / v.length : null; };
const withChg = rows => rows.map(r => ({ ...r, chg10: r.mops10chg ?? null, chg2500: r.mops2500chg ?? null }));

// ─── Trend chart tooltip ──────────────────────────────────────────────────────
function CTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</p>)}
    </div>
  );
}

// ─── Stat card with hover-chart ───────────────────────────────────────────────
function StatCard({ label, value, sub, accent, chartData, chartKey, chartName }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const avg = avgOf(chartData || [], chartKey);

  return (
    <div ref={ref} className="relative flex-1 min-w-0"
      onMouseEnter={() => chartData?.length > 1 && setShow(true)}
      onMouseLeave={() => setShow(false)}>
      <div className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${accent}`}>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-xl font-bold text-gray-800">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {show && chartData?.length > 1 && (
        <div className="absolute top-full left-0 z-50 bg-gray-900 border border-gray-700 rounded-xl p-3 mt-2 shadow-2xl" style={{ width: 280 }}>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">{chartName} Trend</p>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={[...chartData].reverse()}>
              <XAxis dataKey="date" hide />
              <YAxis domain={['auto','auto']} hide />
              <Tooltip content={<CTip />} />
              {avg != null && <ReferenceLine y={avg} stroke="#4B5563" strokeDasharray="3 3" />}
              <Line type="monotone" dataKey={chartKey} name={chartName} stroke={accent.includes('amber')?'#F59E0B':accent.includes('blue')?'#3B82F6':'#9CA3AF'} dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-500 text-center mt-1">{chartData.length} data points · hover to explore</p>
        </div>
      )}
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(daily, from, to) {
  const rows = withChg(daily).map(r => [
    r.date, r.jisdor ?? '', r.mops10usd ?? '',
    r.chg10 != null ? r.chg10.toFixed(2) + '%' : '',
    r.mops2500usd ?? '', r.chg2500 != null ? r.chg2500.toFixed(2) + '%' : '',
    r.mops10idr != null ? r.mops10idr.toFixed(2) : '',
    r.mops2500idr != null ? r.mops2500idr.toFixed(2) : '',
  ]);
  const csv = [['Date','JISDOR','MOPS 10ppm ($/bbl)','Chg 10ppm %','MOPS 0.25%S ($/bbl)','Chg 0.25%S %','MOPS 10ppm (IDR/L)','MOPS 0.25%S (IDR/L)'], ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' })); a.download = `MOPS_${from}_${to}.csv`; a.click();
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MopsData() {
  const { appData } = useApp();
  const endpoint = appData?.settings?.mopsEndpoint || '';

  const [from,          setFrom]    = useState(defaultFrom());
  const [to,            setTo]      = useState(todayStr());
  const [loading,       setLoading] = useState(false);
  const [error,         setError]   = useState(null);
  const [data,          setData]    = useState(() => appData?.mopsCache?.payload || null);
  const [subTab,        setSubTab]  = useState('daily');
  const [presetMonth,   setPresetMonth]   = useState('');
  const [presetPeriod,  setPresetPeriod]  = useState('');
  const cacheInfo = appData?.mopsCache || null;

  const applyPreset = (monthVal, period) => {
    if (!monthVal || !period) return;
    const [y, m] = monthVal.split('-').map(Number);
    const { from: f, to: t } = periodDates(y, m - 1, period);
    setFrom(f); setTo(t);
  };

  const fetchData = async () => {
    if (!endpoint) return;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${endpoint}?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Script error');
      setData(json);
      await patchData({ mopsCache: { payload: json, savedAt: new Date().toISOString(), from, to } });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const clearCache = async () => {
    setData(null);
    await patchData({ mopsCache: null });
  };

  const daily        = data?.daily || [];
  const dailyWithChg = withChg(daily);
  const avgMops10    = avgOf(daily, 'mops10usd');
  const avgMops2500  = avgOf(daily, 'mops2500usd');
  const avgJisdor    = avgOf(daily, 'jisdor');
  const avgMops10Idr = avgOf(daily, 'mops10idr');
  const avg2500Idr   = avgOf(daily, 'mops2500idr');

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Data MOPS</h1>
        <p className="text-gray-500 text-sm mt-1">MOPS 10ppm & 0.25%S · JISDOR · Bi-Monthly Summary</p>
      </div>

      {/* Endpoint warning */}
      {!endpoint && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6 text-sm text-amber-800">
          <b>⚠️ Endpoint belum dikonfigurasi.</b> Pergi ke Master Data → Settings → Konfigurasi MOPS Endpoint.
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        {/* Period preset row */}
        <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-gray-100">
          <div>
            <label className="block text-xs font-semibold text-blue-600 uppercase tracking-widest mb-1">Quick Select</label>
            <select value={presetMonth} onChange={e => { setPresetMonth(e.target.value); if (presetPeriod) applyPreset(e.target.value, presetPeriod); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[180px]">
              <option value="">— Pilih Bulan —</option>
              {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Periode</label>
            <div className="flex gap-2">
              {['P1','P2'].map(p => {
                // Show the date range this would produce
                const preview = presetMonth
                  ? (() => { const [y,m] = presetMonth.split('-').map(Number); const r = periodDates(y,m-1,p); return `${r.from.slice(8)} – ${r.to.slice(8)} ${r.to.slice(5,7)}/${r.to.slice(0,4)}`; })()
                  : p === 'P1' ? '9–24 prev month' : '25 prev – 8 this';
                return (
                  <button key={p}
                    onClick={() => { setPresetPeriod(p); applyPreset(presetMonth, p); }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      presetPeriod === p
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                    }`}>
                    <span>{p}</span>
                    <span className="block text-[10px] font-normal opacity-75 mt-0.5">{preview}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {presetMonth && presetPeriod && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ {MONTH_OPTIONS.find(o=>o.value===presetMonth)?.label} {presetPeriod}: <span className="font-mono">{from} → {to}</span>
            </div>
          )}
        </div>

        {/* Manual date range row */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dari</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sampai</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <button onClick={fetchData} disabled={!endpoint || loading}
            className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2">
            {loading ? <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Memuat…</> : '⟳ Fetch Data'}
          </button>
          {daily.length > 0 && (
            <button onClick={() => exportCSV(daily, from, to)}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              ⬇️ CSV / Excel
            </button>
          )}
          {cacheInfo?.savedAt && (
            <div className="flex items-center gap-2 text-xs text-gray-400 ml-auto">
              <span className="text-green-500 font-semibold">● cached</span>
              <span>{new Date(cacheInfo.savedAt).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
              {cacheInfo.from && <span>({cacheInfo.from} → {cacheInfo.to})</span>}
              <button onClick={clearCache} className="text-red-400 hover:text-red-600 ml-1">✕ clear</button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-6 text-sm text-red-700">
          <b>Error:</b> {error}
        </div>
      )}

      {/* Stat cards */}
      {daily.length > 0 && (
        <div className="flex gap-4 mb-6 flex-wrap">
          <StatCard label="AVG MOPS 10ppm"   value={`$${fmt2(avgMops10)}`}   sub={`${fmtIdr(avgMops10Idr)} IDR/L`} accent="border-amber-500" chartData={daily} chartKey="mops10usd"   chartName="MOPS 10ppm" />
          {(avgMops2500 || 0) > 0.1 && (
            <StatCard label="AVG MOPS 0.25%S" value={`$${fmt2(avgMops2500)}`} sub={`${fmtIdr(avg2500Idr)} IDR/L`}  accent="border-blue-500"  chartData={daily} chartKey="mops2500usd" chartName="MOPS 0.25%S" />
          )}
          <StatCard label="AVG JISDOR" value={fmtIdr0(avgJisdor)} sub={`${daily.length} hari perdagangan`} accent="border-gray-400" chartData={daily} chartKey="jisdor" chartName="JISDOR" />
        </div>
      )}

      {/* Sub-tabs */}
      {data && (
        <>
          <div className="flex gap-2 mb-4">
            {[['daily','Daily MOPS'],['summary','Bi-Monthly Summary']].map(([k, label]) => (
              <button key={k} onClick={() => setSubTab(k)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  subTab === k ? 'bg-blue-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Daily table */}
          {subTab === 'daily' && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Tanggal','JISDOR','MOPS 10ppm ($/bbl)','Δ','MOPS 0.25%S ($/bbl)','Δ','10ppm (IDR/L)','0.25%S (IDR/L)'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dailyWithChg.length === 0
                      ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Tidak ada data untuk rentang ini</td></tr>
                      : dailyWithChg.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-xs font-mono text-gray-600 whitespace-nowrap">{indoDateShort(row.date)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmtIdr0(row.jisdor)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-amber-600">{fmt2(row.mops10usd)}</td>
                            <td className={`px-4 py-2.5 text-right text-xs font-mono ${row.chg10==null?'text-gray-300':row.chg10>=0?'text-green-600':'text-red-500'}`}>{fmtPct(row.chg10)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-600">{fmt2(row.mops2500usd)}</td>
                            <td className={`px-4 py-2.5 text-right text-xs font-mono ${row.chg2500==null?'text-gray-300':row.chg2500>=0?'text-green-600':'text-red-500'}`}>{fmtPct(row.chg2500)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-amber-600">{fmtIdr(row.mops10idr)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-blue-600">{fmtIdr(row.mops2500idr)}</td>
                          </tr>
                        ))
                    }
                  </tbody>
                  {dailyWithChg.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td className="px-4 py-2.5 text-xs font-bold text-gray-600">Average</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-700">{fmtIdr0(avgJisdor)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">{fmt2(avgMops10)}</td>
                        <td />
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-600">{fmt2(avgMops2500)}</td>
                        <td />
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">{fmtIdr(avgMops10Idr)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-600">{fmtIdr(avg2500Idr)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Bi-monthly summary */}
          {subTab === 'summary' && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-widest">8 Periode Bi-Monthly Terakhir (~4 Bulan)</p>
              </div>
              {!(data.summary?.length)
                ? <p className="px-5 py-8 text-center text-gray-400 text-sm">Tidak ada data summary</p>
                : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Periode','B40 (IDR/L)','MGO 0.25%S ($/bbl)','MGO 10ppm ($/bbl)'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.summary.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-mono font-bold text-gray-700 text-xs">{row.period || '–'}</td>
                        <td className="px-5 py-3 font-mono text-green-600">{(row.b40idr||row.b40) ? `Rp ${fmtIdr0(row.b40idr||row.b40).replace('Rp\u00a0','').replace('Rp ','')}` : '–'}</td>
                        <td className="px-5 py-3 font-mono text-blue-600">{row.mops2500usd ? `$${fmt2(row.mops2500usd)}` : '–'}</td>
                        <td className="px-5 py-3 font-mono text-amber-600">{row.mops10usd ? `$${fmt2(row.mops10usd)}` : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">⚠️ Jika kolom menampilkan "–", verifikasi nomor kolom di konstanta GAS script: SUMMARY_COL_MOPS10, SUMMARY_COL_MOPS2500, SUMMARY_COL_B40.</p>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4 text-right">
            IDR/L = USD/bbl × JISDOR ÷ {BBL_TO_L} · Hover stat card untuk melihat trend chart
          </p>
        </>
      )}
    </div>
  );
}
