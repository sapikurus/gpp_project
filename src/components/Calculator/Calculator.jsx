import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, CALCS_REF } from '../../firebase.js';
import { runCalculation, formatIDR, formatNum, today } from '../../utils/utils.js';

const INIT_FORM = {
  label: '',
  volume: '',
  // Buy price
  buyMode: 'direct',      // 'direct' | 'hip'
  buyPrice: '',
  hipBase: '',
  // Direct costs
  freight: '',
  portChargesPerL: '',
  portChargesFlat: '',
  surveyorFlat: '',
  otherPerL: '',
  // CoM tranches
  bankRate: 6.5,
  tranches: [
    { pct: 100, buyDate: today(), payDate: today() },
  ],
  // Sell price
  sellMode: 'direct',    // 'direct' | 'formula'
  sellPrice: '',
  mopsUSD: '',
  jisdor: '',
  premium: '',
  mopsWeight: 60,
  hipBBN: '',
};

const Row = ({ label, value, bold, indent, highlight }) => (
  <div className={`flex justify-between py-1.5 border-b border-gray-100 last:border-0 ${indent ? 'pl-4' : ''} ${bold ? 'font-semibold' : ''} ${highlight ? 'bg-green-50 rounded px-2' : ''}`}>
    <span className={`text-sm ${bold ? 'text-gray-800' : 'text-gray-600'}`}>{label}</span>
    <span className={`text-sm font-mono ${bold ? 'text-gray-900' : 'text-gray-700'}`}>{value}</span>
  </div>
);

export default function Calculator() {
  const { appData } = useApp();
  const [form,      setForm]      = useState({ ...INIT_FORM, bankRate: appData?.rates?.bankRate || 6.5 });
  const [result,    setResult]    = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnap, setLS]      = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    fetchCollection(CALCS_REF()).then(s => { setSnapshots(s); setLS(false); });
  }, []);

  // Live recalculate
  useEffect(() => {
    setResult(runCalculation(form));
  }, [form]);

  const set = (key) => (val) => setForm(p => ({ ...p, [key]: val }));

  const setTranche = (i, key, val) => {
    const t = [...form.tranches];
    t[i] = { ...t[i], [key]: val };
    setForm(p => ({ ...p, tranches: t }));
  };
  const addTranche = () => setForm(p => ({
    ...p,
    tranches: [...p.tranches, { pct: 0, buyDate: today(), payDate: today() }]
  }));
  const removeTranche = (i) => setForm(p => ({
    ...p,
    tranches: p.tranches.filter((_, idx) => idx !== i)
  }));

  const saveSnapshot = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await createNumberedDoc(
        'calc',
        CALCS_REF(),
        {
          label:    form.label || `Kalkulasi ${new Date().toLocaleDateString('id-ID')}`,
          form:     { ...form },
          result:   { ...result },
          ratesSnap: { ...appData?.rates },
        },
        (seq) => `CALC-GPP-${String(seq).padStart(4, '0')}`
      );
      const fresh = await fetchCollection(CALCS_REF());
      setSnapshots(fresh);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const loadSnapshot = (snap) => {
    setForm({ ...snap.form });
  };

  const pctSum = form.tranches.reduce((s, t) => s + (parseFloat(t.pct) || 0), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kalkulator Profit</h1>
          <p className="text-gray-500 text-sm mt-1">Hitung margin & CoM per kargo</p>
        </div>
        <button onClick={saveSnapshot} disabled={!result || saving}
          className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2">
          {saving ? '⏳' : showSaved ? '✅ Tersimpan' : '💾 Simpan Snapshot'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── FORM ── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Label */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <label className="block text-xs text-gray-500 mb-1">Label Kalkulasi</label>
            <input type="text" placeholder="e.g. Kargo Maret 2026 - MV Meratus"
              value={form.label} onChange={e => set('label')(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>

          {/* Volume */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">📦 Volume</h2>
            <div className="flex items-center gap-3">
              <input type="number" placeholder="Jumlah Liter"
                value={form.volume} onChange={e => set('volume')(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <span className="text-sm text-gray-400">Liter</span>
            </div>
          </div>

          {/* Buy Price */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">💰 Harga Beli</h2>
            <div className="flex gap-4 mb-3">
              {['direct', 'hip'].map(m => (
                <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="buyMode" value={m}
                    checked={form.buyMode === m} onChange={() => set('buyMode')(m)} />
                  {m === 'direct' ? 'Harga Langsung' : 'Dari HIP (×111%)'}
                </label>
              ))}
            </div>
            {form.buyMode === 'direct' ? (
              <input type="number" placeholder="Harga beli per Liter (IDR)"
                value={form.buyPrice} onChange={e => set('buyPrice')(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            ) : (
              <div className="flex gap-3 items-center">
                <input type="number" placeholder="HIP Base (IDR/L)"
                  value={form.hipBase} onChange={e => set('hipBase')(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <span className="text-gray-400 text-sm">× 111% =</span>
                <span className="font-mono text-blue-700 text-sm w-28 text-right">
                  {form.hipBase ? formatIDR((parseFloat(form.hipBase) || 0) * 1.11) + '/L' : '—'}
                </span>
              </div>
            )}
          </div>

          {/* Direct Costs */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🚢 Biaya Langsung</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'freight',          label: 'Freight (IDR/L)' },
                { key: 'portChargesPerL',  label: 'Port Charges per L (IDR)' },
                { key: 'portChargesFlat',  label: 'Port Charges Flat (IDR total)' },
                { key: 'surveyorFlat',     label: 'Surveyor (IDR total)' },
                { key: 'otherPerL',        label: 'Lainnya (IDR/L)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type="number" placeholder="0"
                    value={form[key]} onChange={e => set(key)(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              ))}
            </div>
          </div>

          {/* Cost of Money */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">🏦 Cost of Money</h2>
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500">Bunga Bank (% p.a.)</label>
                <input type="number" step="0.1"
                  value={form.bankRate} onChange={e => set('bankRate')(e.target.value)}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            </div>

            <div className="space-y-3">
              {form.tranches.map((t, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 w-16">Tranche {i + 1}</span>
                    {form.tranches.length > 1 && (
                      <button onClick={() => removeTranche(i)} className="text-red-400 text-xs ml-auto">✕</button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">% Pembayaran</label>
                      <input type="number" placeholder="100"
                        value={t.pct} onChange={e => setTranche(i, 'pct', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Tgl Beli</label>
                      <input type="date"
                        value={t.buyDate} onChange={e => setTranche(i, 'buyDate', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Tgl Bayar</label>
                      <input type="date"
                        value={t.payDate} onChange={e => setTranche(i, 'payDate', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                  </div>
                  {/* tranche result inline */}
                  {result && result.trancheDetails[i] && (
                    <div className="mt-2 flex gap-4 text-xs text-gray-500">
                      <span>Hari: <b className={result.trancheDetails[i].warning ? 'text-red-500' : ''}>{result.trancheDetails[i].days}</b></span>
                      <span>Nilai: <b>{formatIDR(result.trancheDetails[i].value)}</b></span>
                      <span>CoM: <b className="text-orange-600">{formatIDR(result.trancheDetails[i].com)}</b></span>
                      {result.trancheDetails[i].warning && <span className="text-red-500 font-semibold">⚠ Periksa tahun!</span>}
                    </div>
                  )}
                </div>
              ))}

              {pctSum !== 100 && (
                <p className="text-xs text-orange-500">⚠ Total tranche: {pctSum}% (harus 100%)</p>
              )}

              <button onClick={addTranche}
                className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                + Tambah Tranche
              </button>
            </div>
          </div>

          {/* Sell Price */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🏷️ Harga Jual</h2>
            <div className="flex gap-4 mb-3">
              {['direct', 'formula'].map(m => (
                <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="sellMode" value={m}
                    checked={form.sellMode === m} onChange={() => set('sellMode')(m)} />
                  {m === 'direct' ? 'Harga Langsung' : 'Formula MOPS + HIP'}
                </label>
              ))}
            </div>

            {form.sellMode === 'direct' ? (
              <input type="number" placeholder="Harga jual per Liter (IDR)"
                value={form.sellPrice} onChange={e => set('sellPrice')(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">MOPS (USD/bbl)</label>
                    <input type="number" value={form.mopsUSD} onChange={e => set('mopsUSD')(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">JISDOR (IDR/USD)</label>
                    <input type="number" value={form.jisdor} onChange={e => set('jisdor')(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Premium (IDR/L)</label>
                    <input type="number" value={form.premium} onChange={e => set('premium')(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">HIP BBN (IDR/L)</label>
                    <input type="number" value={form.hipBBN} onChange={e => set('hipBBN')(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bobot MOPS (%)</label>
                  <input type="number" value={form.mopsWeight} onChange={e => set('mopsWeight')(e.target.value)}
                    className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <span className="text-xs text-gray-400 ml-2">Bobot HIP: {100 - (parseFloat(form.mopsWeight) || 0)}%</span>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 font-mono">
                  Harga Jual = {form.mopsWeight}% × (MOPS IDR/L + Premium) + {100 - (parseFloat(form.mopsWeight) || 0)}% × HIP BBN
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RESULTS ── */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5 sticky top-4">
            <h2 className="font-semibold text-gray-700 mb-4">📊 Hasil Kalkulasi</h2>
            {!result ? (
              <p className="text-gray-400 text-sm">Masukkan volume untuk mulai.</p>
            ) : (
              <>
                <div className="space-y-0.5 mb-4">
                  <Row label="Volume"           value={`${formatNum(result.volume, 0)} L`} />
                  <Row label="Harga Beli /L"    value={formatIDR(result.buyPrice)} indent />
                  <Row label="Total Biaya Langsung /L" value={formatIDR(result.totalDirectPerL)} indent />
                  <Row label="Cost of Money /L" value={formatIDR(result.comPerL)} indent />
                  <Row label="Total HPP /L"     value={formatIDR(result.totalCostPerL)} bold />
                  <div className="my-2 border-t" />
                  <Row label="Harga Jual /L"    value={formatIDR(result.sellPrice)} bold />
                  <Row label="Margin /L"        value={formatIDR(result.marginPerL)} bold highlight />
                  <Row label="Margin %"         value={`${formatNum(result.marginPct, 2)}%`} />
                  <div className="my-2 border-t" />
                  <Row label="Total Profit"     value={formatIDR(result.totalProfit)} bold highlight />
                  <Row label="Total HPP"        value={formatIDR(result.totalCost)} />
                </div>

                {/* CoM detail */}
                <div className="bg-orange-50 rounded-lg p-3 mb-3">
                  <p className="text-xs font-semibold text-orange-700 mb-2">Rincian Cost of Money</p>
                  {result.trancheDetails.map((t, i) => (
                    <div key={i} className="text-xs text-orange-600 flex justify-between py-0.5">
                      <span>Tranche {i + 1} ({t.pct}% · {t.days} hari)</span>
                      <span className="font-mono">{formatIDR(t.com)}</span>
                    </div>
                  ))}
                  <div className="border-t border-orange-200 mt-1 pt-1 flex justify-between text-xs font-semibold text-orange-700">
                    <span>Total CoM</span>
                    <span className="font-mono">{formatIDR(result.totalCoM)}</span>
                  </div>
                </div>

                <button onClick={saveSnapshot} disabled={saving}
                  className="w-full bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors">
                  {saving ? '⏳' : showSaved ? '✅ Tersimpan' : '💾 Simpan Snapshot'}
                </button>
              </>
            )}
          </div>

          {/* Saved snapshots */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">📁 Snapshot Tersimpan</h2>
            {loadingSnap ? <p className="text-gray-400 text-sm">Memuat…</p> :
             snapshots.length === 0 ? <p className="text-gray-400 text-sm">Belum ada snapshot.</p> : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {snapshots.map(s => (
                  <div key={s.id}
                    className="border border-gray-100 rounded-lg p-3 hover:border-blue-300 transition-colors cursor-pointer"
                    onClick={() => loadSnapshot(s)}>
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-gray-700 leading-tight">{s.label}</p>
                      <span className="text-xs text-gray-400 ml-2 shrink-0">
                        {new Date(s.createdAt).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span>{formatNum(s.result?.volume, 0)} L</span>
                      <span>Profit: <b className="text-green-600">{formatIDR(s.result?.totalProfit)}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
