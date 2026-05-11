import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, CALCS_REF, CARGOS_REF } from '../../firebase.js';
import { formatIDR, today, daysBetween } from '../../utils/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const n = (v) => parseFloat(v) || 0;
const fmt2 = (v) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const fmtPct = (v) => (v != null ? (v >= 0 ? '+' : '') + fmt2(v) + '%' : '–');
const addDays = (dateStr, days) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const wtdAvgDate = (tranches) => {
  let sumVolDate = 0, sumVol = 0;
  tranches.forEach(t => {
    const vol = n(t.vol);
    const ms  = new Date((t.loadDate || today()) + 'T00:00:00').getTime();
    sumVolDate += vol * ms;
    sumVol     += vol;
  });
  if (!sumVol) return today();
  return new Date(sumVolDate / sumVol).toISOString().slice(0, 10);
};

const InputCard = ({ title, children }) => (
  <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
    <p className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-3">{title}</p>
    {children}
  </div>
);

const Field = ({ label, children, sub }) => (
  <div className="mb-3">
    <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
      {label}{sub && <span className="normal-case tracking-normal text-gray-400 ml-1">({sub})</span>}
    </label>
    {children}
  </div>
);

const Inp = ({ value, onChange, type = 'number', placeholder = '0', step = 'any' }) => (
  <input type={type} step={step} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono" />
);

const Sel = ({ value, onChange, children }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
    {children}
  </select>
);

// P&L row
const Row = ({ label, value, total, notes, section, indent, positive, negative, bold, dimZero }) => {
  if (section) return (
    <tr className="bg-gray-50">
      <td colSpan={4} className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</td>
    </tr>
  );
  const isZero = value === 0;
  const colorClass = bold && positive ? 'text-green-600' : bold && negative ? 'text-red-500' :
    positive ? 'text-green-600' : negative ? 'text-red-500' :
    dimZero && isZero ? 'text-gray-300' : 'text-gray-700';
  const formatted = value < 0 ? `(${fmt2(Math.abs(value))})` : fmt2(value);
  const totalFormatted = total != null ? (total < 0 ? `(${formatIDR(Math.abs(total))})` : formatIDR(total)) : '';

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className={`px-4 py-2 text-sm ${indent ? 'pl-6' : ''} ${bold ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{label}</td>
      <td className={`px-4 py-2 text-right font-mono text-sm ${bold ? 'font-bold' : ''} ${colorClass}`}>
        {formatted}
      </td>
      <td className={`px-4 py-2 text-right font-mono text-sm ${bold ? 'font-bold' : ''} ${total != null ? (total >= 0 ? 'text-blue-600' : 'text-red-500') : ''}`}>
        {totalFormatted}
      </td>
      <td className="px-4 py-2 text-right text-xs text-gray-400 font-mono hidden md:table-cell">{notes || ''}</td>
    </tr>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const INIT = {
  cargoId: '', cargoLabel: '', tranches: [],
  offeringDate: today(), clientTOP: 45,
  province: '', lossRate: 0.3,
  oatModal: 0, oatClient: 0,
  sellQty: '',
  sellMode: 'direct', sellPrice: '',
  mopsUSD: '', jisdor: '', premium: '', mopsWeight: 60, hipBBN: '',
};

export default function Calculator() {
  const { appData } = useApp();
  const rates         = appData?.rates          || {};
  const pbbkbProvinces = appData?.pbbkbProvinces || [];
  const bankRate      = n(rates.bankRate) / 100;
  const ppnRate       = n(rates.ppn)     / 100;

  const [form,      setForm]      = useState({ ...INIT });
  const [cargos,    setCargos]    = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnap, setLS]      = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    fetchCollection(CALCS_REF()).then(s => { setSnapshots(s); setLS(false); });
    fetchCollection(CARGOS_REF()).then(c => setCargos(c));
    const raw = sessionStorage.getItem('calcPrefill');
    if (raw) {
      try { const d = JSON.parse(raw); setForm(p => ({ ...p, cargoId: d.cargoId || '', cargoLabel: d.label || '', tranches: d.tranches || [] })); sessionStorage.removeItem('calcPrefill'); } catch {}
    }
  }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));
  const loadCargo = c => {
    const vol = (c.tranches || []).reduce((s, t) => s + (parseFloat(t.vol) || 0), 0);
    setForm(p => ({ ...p, cargoId: c.id, cargoLabel: c.label, tranches: c.tranches || [], sellQty: vol || '' }));
  };

  // ── Core calculation ────────────────────────────────────────────────────────
  const pl = useMemo(() => {
    const { tranches, offeringDate, clientTOP, province, lossRate, oatModal, oatClient, sellMode, sellPrice, mopsUSD, jisdor, premium, mopsWeight, hipBBN } = form;
    if (!tranches.length) return null;

    // Blended buy — volume-weighted effective cost
    let totalVol = 0, totalEffValue = 0;
    tranches.forEach(t => {
      const vol  = n(t.vol), base = n(t.basePrice);
      const prov = pbbkbProvinces.find(p => p.name === t.pbbkbProvince);
      const pbbkbR = (t.applyPBBKB && !t.noPbbkb) ? (n(prov?.rate) / 100) : 0;
      const ppnAmt = t.applyPPN     ? base * ppnRate              : 0;
      const pbbkb  = base * pbbkbR;
      const bph    = t.applyBPHBuy  ? base * (n(rates.bphMigas) / 100) : 0;
      totalVol      += vol;
      totalEffValue += (base + ppnAmt + pbbkb + bph) * vol;
    });
    if (!totalVol) return null;
    const blendedModal = totalEffValue / totalVol;

    // CoM — from weighted avg loading date to offering date + client TOP
    const avgLoadDate = wtdAvgDate(tranches);
    const payDate     = addDays(offeringDate, n(clientTOP));
    const comDays     = Math.max(0, daysBetween(avgLoadDate, payDate));
    const comPerL     = blendedModal * (Math.pow(1 + bankRate, comDays / 365) - 1);

    // Loss — always on sell price
    let sell = 0;
    if (sellMode === 'formula') {
      const w = n(mopsWeight) / 100;
      sell = w * ((n(mopsUSD) * n(jisdor) / 158.987) + n(premium)) + (1 - w) * n(hipBBN);
    } else {
      sell = n(sellPrice);
    }
    const loss = sell * (n(lossRate) / 100);

    // PBBKB on sell side
    const provData      = pbbkbProvinces.find(p => p.name === province);
    const pbbkbRegistered = provData?.registered || false;
    const pbbkbSellRate  = pbbkbRegistered ? n(provData?.rate) / 100 : 0;
    const pbbkbSell      = sell * pbbkbSellRate;

    // Margins
    const fuelMargin    = sell - blendedModal - comPerL - loss;
    const freightMargin = n(oatClient) - n(oatModal);
    const totalMargin   = fuelMargin + freightMargin;
    const marginPct     = sell > 0 ? (totalMargin / sell) * 100 : 0;

    // Client invoice
    const ppnAmt        = sell * ppnRate;
    const clientFuelOnly = sell + pbbkbSell + ppnAmt;
    const clientPays    = clientFuelOnly + n(oatClient);

    return {
      totalVol, blendedModal, comPerL, comDays, avgLoadDate, payDate,
      sell, loss, oatModal: n(oatModal), oatClient: n(oatClient),
      pbbkbRegistered, pbbkbSellRate, pbbkbSell,
      fuelMargin, freightMargin, totalMargin, marginPct,
      ppnAmt, clientFuelOnly, clientPays,
    };
  }, [form, rates, pbbkbProvinces, bankRate, ppnRate]);

  const saveSnapshot = async () => {
    if (!pl) return;
    setSaving(true);
    try {
      const d = new Date();
      const label = form.cargoLabel || `Kalkulasi ${d.toLocaleDateString('id-ID')}`;
      await createNumberedDoc('calc', CALCS_REF(), { label, form: { ...form }, pl: { ...pl } }, seq => `CALC-GPP-${String(seq).padStart(4, '0')}`);
      const fresh = await fetchCollection(CALCS_REF()); setSnapshots(fresh);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const totalTrVol = form.tranches.reduce((s, t) => s + (n(t.vol)), 0);

  return (
    <div className="flex flex-col md:flex-row h-full pt-14 md:pt-0 bg-gray-50 overflow-hidden">

      {/* ── Left panel — inputs ── */}
      <div className="w-full md:w-72 shrink-0 overflow-y-auto p-4 border-r border-gray-200 bg-gray-50">

        {/* Cargo Position */}
        <InputCard title="Cargo Position">
          <Field label="Position">
            {form.cargoId
              ? <div className="bg-blue-50 rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-blue-800 leading-tight">{form.cargoLabel}</p>
                    <p className="text-xs text-blue-400 mt-0.5">{form.tranches.length} tranche · {Number(totalTrVol).toLocaleString('id-ID')} L</p>
                  </div>
                  <button onClick={() => setForm(p => ({ ...p, cargoId:'', cargoLabel:'', tranches:[] }))} className="text-xs text-gray-400 hover:text-red-500 ml-2">✕</button>
                </div>
              : <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {cargos.length === 0
                    ? <p className="text-gray-400 text-xs italic">Buat kargo dulu.</p>
                    : cargos.map(c => (
                        <div key={c.id} onClick={() => loadCargo(c)}
                          className="border border-gray-100 rounded-lg px-3 py-2 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors">
                          <p className="text-xs font-medium text-gray-700 leading-tight">{c.label}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{c.product} · {c.tranches?.length || 0} tranche</p>
                        </div>
                      ))
                  }
                </div>
            }
          </Field>
        </InputCard>

        {/* Cost of Money */}
        <InputCard title="Cost of Money">
          <Field label="Offering Date">
            <Inp type="date" value={form.offeringDate} onChange={set('offeringDate')} />
          </Field>
          <Field label="Client TOP" sub="days">
            <Inp value={form.clientTOP} onChange={set('clientTOP')} />
          </Field>
          {pl && (
            <div className="bg-orange-50 rounded-lg px-3 py-2 text-xs">
              <div className="flex justify-between text-orange-700 mb-0.5">
                <span>Avg loading date</span><span className="font-mono">{pl.avgLoadDate}</span>
              </div>
              <div className="flex justify-between text-orange-700 mb-0.5">
                <span>Pay date</span><span className="font-mono">{pl.payDate}</span>
              </div>
              <div className="flex justify-between font-bold text-orange-800 border-t border-orange-200 mt-1.5 pt-1.5">
                <span>CoM period</span><span>{pl.comDays} hari</span>
              </div>
              <div className="flex justify-between text-orange-600 mt-0.5">
                <span>CoM / L</span><span className="font-mono">({fmt2(pl.comPerL)})</span>
              </div>
            </div>
          )}
        </InputCard>

        {/* Offering */}
        <InputCard title="Offering">
          <Field label="Province (PBBKB)">
            <Sel value={form.province} onChange={set('province')}>
              <option value="">— Pilih Provinsi —</option>
              {pbbkbProvinces.map((p, i) => (
                <option key={i} value={p.name}>{p.name} — {p.rate}%{p.registered ? ' ✓' : ''}</option>
              ))}
            </Sel>
            {form.province && (
              <p className={`text-[10px] mt-1 ${pl?.pbbkbRegistered ? 'text-green-600' : 'text-gray-400'}`}>
                {pl?.pbbkbRegistered ? `✅ PBBKB ${(pl.pbbkbSellRate * 100).toFixed(1)}% — pass-through ke client` : '⚠ GPP belum terdaftar di provinsi ini'}
              </p>
            )}
          </Field>
          <Field label="Forecast Sell Qty" sub="Liter">
            <Inp value={form.sellQty} onChange={set('sellQty')} placeholder={String(totalTrVol || '')} />
          </Field>
          <Field label="Loss Tolerance" sub="%">
            <Inp value={form.lossRate} onChange={set('lossRate')} step="0.1" />
          </Field>
          <Field label="OAT Modal — Freight Cost" sub="IDR/L">
            <Inp value={form.oatModal} onChange={set('oatModal')} />
          </Field>
          <Field label="OAT Client — Charged in Letter" sub="IDR/L">
            <Inp value={form.oatClient} onChange={set('oatClient')} />
          </Field>
        </InputCard>

        {/* Sell Price */}
        <InputCard title="Sell Price">
          <div className="flex gap-2 mb-3">
            {['direct', 'formula'].map(m => (
              <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="radio" name="sellMode" value={m} checked={form.sellMode === m} onChange={() => set('sellMode')(m)} />
                {m === 'direct' ? 'Direct' : 'MOPS Formula'}
              </label>
            ))}
          </div>
          {form.sellMode === 'direct'
            ? <Field label="Harga Jual (IDR/L)"><Inp value={form.sellPrice} onChange={set('sellPrice')} /></Field>
            : <>
                <Field label="MOPS USD/bbl"><Inp value={form.mopsUSD} onChange={set('mopsUSD')} /></Field>
                <Field label="JISDOR"><Inp value={form.jisdor} onChange={set('jisdor')} /></Field>
                <Field label="Premium IDR/L"><Inp value={form.premium} onChange={set('premium')} /></Field>
                <Field label="HIP BBN IDR/L"><Inp value={form.hipBBN} onChange={set('hipBBN')} /></Field>
                <Field label="Bobot MOPS %">
                  <Inp value={form.mopsWeight} onChange={set('mopsWeight')} />
                  <p className="text-[10px] text-gray-400 mt-0.5">HIP: {100 - n(form.mopsWeight)}%</p>
                </Field>
              </>
          }
        </InputCard>
      </div>

      {/* ── Right panel — P&L ── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Header row */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              Full P&L{form.cargoLabel ? ` — ${form.cargoLabel}` : ''}
              {form.province ? ` · ${form.province}` : ''}
            </h1>
            {pl && (
              <p className="text-xs text-gray-400 mt-0.5">
                {Number(pl.totalVol).toLocaleString('id-ID')} L · CoM {n(rates.bankRate)}% p.a. · TOP {form.clientTOP}d
              </p>
            )}
          </div>

          {/* Summary pills */}
          {pl && (
            <div className="flex gap-3 flex-wrap">
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 text-center">
                <p className="text-xs text-blue-500 uppercase tracking-wide">Client Pays</p>
                <p className="font-bold text-blue-800 text-lg">{fmt2(pl.clientPays)}</p>
                <p className="text-[10px] text-blue-400">DPP + tax</p>
              </div>
              <div className={`border rounded-xl px-4 py-2 text-center ${pl.totalMargin >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <p className={`text-xs uppercase tracking-wide ${pl.totalMargin >= 0 ? 'text-green-500' : 'text-red-400'}`}>Total Margin / L</p>
                <p className={`font-bold text-lg ${pl.totalMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt2(pl.totalMargin)}</p>
                <p className={`text-[10px] ${pl.totalMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt2(pl.marginPct)}% on sell</p>
              </div>
            </div>
          )}
        </div>

        {!pl
          ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-4xl mb-3">🧮</p>
            <p className="text-gray-500">Pilih kargo dan lengkapi input di sebelah kiri.</p>
          </div>
        ) : (
          <>
            {/* P&L Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold">Component</th>
                    <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-semibold">IDR / Litre</th>
                    <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-semibold text-blue-400">
                      IDR Total{form.sellQty ? ` (${Number(n(form.sellQty)).toLocaleString('id-ID')} L)` : ''}
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-semibold hidden md:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const qty = n(form.sellQty) || pl.totalVol;
                    return <>
                  <Row section label="REVENUE" />
                  <Row label="Sell Price (DPP)"      value={pl.sell}      total={pl.sell * qty}      positive={pl.sell > 0} />
                  <Row label="OAT charged to client" value={pl.oatClient} total={pl.oatClient > 0 ? pl.oatClient * qty : null} positive={pl.oatClient > 0} indent />

                  <Row section label="COSTS" />
                  <Row label="Blended modal (excl. CoM)" value={-pl.blendedModal} negative indent notes="buy + tax components" />
                  <Row label="Weighted CoM"  value={-pl.comPerL}   negative indent notes={`${n(rates.bankRate)}% p.a. · TOP ${pl.comDays}d`} />
                  <Row label={`Loss ${n(form.lossRate).toFixed(1)}%`} value={-pl.loss} negative indent notes="on sell price" />
                  <Row label="OAT modal / freight" value={-pl.oatModal}  negative indent notes="your actual cost" />

                  <Row section label="MARGIN" />
                  <Row label="Fuel margin"      value={pl.fuelMargin}    positive={pl.fuelMargin > 0}    negative={pl.fuelMargin < 0}    indent notes="sell − modal − CoM − loss" />
                  <Row label="Freight margin"   value={pl.freightMargin} positive={pl.freightMargin > 0} negative={pl.freightMargin < 0} indent notes="OAT client − OAT modal" />
                  <Row label="Total margin / L" value={pl.totalMargin}   total={pl.totalMargin * qty}    positive={pl.totalMargin > 0}   negative={pl.totalMargin < 0} bold notes={`${fmt2(pl.marginPct)}%`} />

                  <Row section label="CLIENT INVOICE" />
                  <Row label="Base Price (DPP)" value={pl.sell} />
                  {pl.pbbkbRegistered && <Row label={`PBBKB ${(pl.pbbkbSellRate * 100).toFixed(1)}%`} value={pl.pbbkbSell} indent notes="pass-through" />}
                  <Row label={`PPN ${n(rates.ppn)}%`} value={pl.ppnAmt} indent />
                  <Row label="Client total (fuel only)" value={pl.clientFuelOnly} total={pl.clientFuelOnly * qty} bold />
                  <Row label="+ OAT Client"  value={pl.oatClient} indent />
                  <Row label="Client Pays"   value={pl.clientPays} total={pl.clientPays * qty} bold positive={pl.clientPays > 0} />
                    </>;
                  })()}
                </tbody>
              </table>
            </div>

            {/* Total profit banner */}
            {(() => {
              const qty = n(form.sellQty) || pl.totalVol;
              return (
                <div className={`rounded-xl px-5 py-4 mb-4 flex items-center justify-between ${pl.totalMargin >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${pl.totalMargin >= 0 ? 'text-green-600' : 'text-red-500'}`}>Total Profit Forecast</p>
                    <p className="text-xs text-gray-400 mt-0.5">{Number(qty).toLocaleString('id-ID')} L × {fmt2(pl.totalMargin)}/L</p>
                  </div>
                  <p className={`text-2xl font-bold font-mono ${pl.totalMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {formatIDR(pl.totalMargin * qty)}
                  </p>
                </div>
              );
            })()}

            <button onClick={saveSnapshot} disabled={saving}
              className="w-full bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 mb-6">
              {saving ? '⏳ Menyimpan…' : saved ? '✅ Snapshot Tersimpan' : '💾 Simpan Snapshot'}
            </button>
          </>
        )}

        {/* Saved snapshots */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">📁 Snapshot Tersimpan</h2>
          {loadingSnap
            ? <p className="text-gray-400 text-sm">Memuat…</p>
            : snapshots.length === 0
              ? <p className="text-gray-400 text-sm">Belum ada snapshot.</p>
              : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {snapshots.map(s => (
                <div key={s.id} onClick={() => setForm({ ...INIT, ...s.form })}
                  className="border border-gray-100 rounded-lg p-3 hover:border-blue-200 hover:bg-blue-50 cursor-pointer transition-colors">
                  <p className="text-xs font-mono text-blue-600">{s.docNumber}</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5 leading-tight">{s.label}</p>
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>{Number(s.pl?.totalVol || 0).toLocaleString('id-ID')} L</span>
                    <span className={`font-semibold ${(s.pl?.totalMargin || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {fmt2(s.pl?.totalMargin || 0)}/L
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-300 mt-1">{new Date(s.createdAt).toLocaleDateString('id-ID')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
