import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, CALCS_REF, CARGOS_REF } from '../../firebase.js';
import { runCalculation, formatIDR, formatNum } from '../../utils/utils.js';

const INIT = { cargoId:'', cargoLabel:'', tranches:[], freight:'', portChargesPerL:'', portChargesFlat:'', surveyorFlat:'', otherPerL:'', applyPPH:false, applyBPHSell:false, deliveryProvince:'', sellMode:'direct', sellPrice:'', mopsUSD:'', jisdor:'', premium:'', mopsWeight:60, hipBBN:'' };
const Row = ({ label, value, bold, indent, highlight, sub }) => (
  <div className={`flex justify-between py-1.5 border-b border-gray-100 last:border-0 ${indent?'pl-4':''} ${bold?'font-semibold':''} ${highlight?'bg-green-50 rounded px-2':''}`}>
    <span className={`text-sm ${bold?'text-gray-800':'text-gray-600'}`}>{label}{sub&&<span className="text-gray-400 text-xs ml-1">({sub})</span>}</span>
    <span className={`text-sm font-mono ${bold?'text-gray-900':'text-gray-700'}`}>{value}</span>
  </div>
);

export default function Calculator() {
  const { appData } = useApp();
  const rates = appData?.rates||{}, pbbkbProvinces = appData?.pbbkbProvinces||[];
  const [form, setForm] = useState({...INIT});
  const [result, setResult] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [loadingSnap, setLS] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    fetchCollection(CALCS_REF()).then(s=>{setSnapshots(s);setLS(false);});
    fetchCollection(CARGOS_REF()).then(c=>setCargos(c));
    const raw = sessionStorage.getItem('calcPrefill');
    if (raw) { try { const d=JSON.parse(raw); setForm(p=>({...p,cargoId:d.cargoId||'',cargoLabel:d.label||'',tranches:d.tranches||[]})); sessionStorage.removeItem('calcPrefill'); } catch{} }
  }, []);

  useEffect(() => { setResult(runCalculation({...form,rates,pbbkbProvinces})); }, [form, rates, pbbkbProvinces]);

  const set = k => v => setForm(p=>({...p,[k]:v}));
  const loadCargo = (c) => setForm(p=>({...p,cargoId:c.id,cargoLabel:c.label,tranches:c.tranches||[]}));

  const saveSnapshot = async () => {
    if (!result) return; setSaving(true);
    try {
      await createNumberedDoc('calc',CALCS_REF(),{label:form.cargoLabel||`Kalkulasi ${new Date().toLocaleDateString('id-ID')}`,form:{...form},result:{...result},ratesSnap:{...rates}},(seq)=>`CALC-GPP-${String(seq).padStart(4,'0')}`);
      const fresh = await fetchCollection(CALCS_REF()); setSnapshots(fresh); setShowSaved(true); setTimeout(()=>setShowSaved(false),2500);
    } finally { setSaving(false); }
  };

  const totalTrVol = (form.tranches||[]).reduce((s,t)=>s+(parseFloat(t.vol)||0),0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kalkulator Profit</h1>
          {form.cargoLabel&&<span className="inline-flex items-center gap-1 mt-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">📦 {form.cargoLabel}</span>}
        </div>
        <button onClick={saveSnapshot} disabled={!result||saving} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saving?'⏳':showSaved?'✅ Tersimpan':'💾 Simpan Snapshot'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {/* Load Cargo */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">📦 Pilih Kargo</h2>
            {form.cargoId?(
              <div className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-3">
                <div><p className="font-semibold text-blue-800 text-sm">{form.cargoLabel}</p><p className="text-xs text-blue-500 mt-0.5">{form.tranches.length} tranche · {Number(totalTrVol).toLocaleString('id-ID')} L</p></div>
                <button onClick={()=>setForm(p=>({...p,cargoId:'',cargoLabel:'',tranches:[]}))} className="text-xs text-gray-400 hover:text-red-500">✕ Lepas</button>
              </div>
            ):(
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {cargos.length===0?<p className="text-gray-400 text-sm">Buat kargo dulu di menu Kargo.</p>:
                  cargos.map(c=>(
                    <div key={c.id} onClick={()=>loadCargo(c)}
                      className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2.5 hover:border-blue-300 cursor-pointer hover:bg-blue-50 transition-colors">
                      <div><p className="text-sm font-medium text-gray-700">{c.label}</p><p className="text-xs text-gray-400">{c.product} · {c.tranches?.length||0} tranche</p></div>
                      <span className="text-xs text-blue-600 font-mono">{c.docNumber}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Tranche summary */}
          {form.tranches.length>0&&result&&(
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-700 mb-3">⛽ Supply Tranches</h2>
              <div className="space-y-2">
                {result.trancheDetails.map((t,i)=>(
                  <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50 text-xs">
                    <div className="flex justify-between mb-1"><span className="font-semibold text-gray-600">Tranche {i+1}</span>
                      <span className={`font-mono font-semibold ${t.warning?'text-red-500':'text-gray-700'}`}>TOP: {t.top} hari{t.warning&&' ⚠'}</span></div>
                    <div className="grid grid-cols-3 gap-2 text-gray-600">
                      <span>Vol: <b>{Number(t.vol).toLocaleString('id-ID')} L</b></span>
                      <span>Base: <b>{formatIDR(t.base)}/L</b></span>
                      <span>Eff: <b className="text-blue-700">{formatIDR(t.effectiveCostPerL)}/L</b></span>
                      <span>Nilai: <b>{formatIDR(t.trancheValue)}</b></span>
                      <span>CoM: <b className="text-orange-600">{formatIDR(t.com)}</b></span>
                    </div>
                    <div className="flex gap-3 mt-1 text-gray-400">
                      {t.applyPPN&&<span>PPN ✓</span>}{t.applyPBBKB&&!t.noPbbkb&&<span>PBBKB ({t.pbbkbProvince}) ✓</span>}{t.applyBPHBuy&&<span>BPH ✓</span>}
                      {t.noPbbkb&&<span className="text-amber-500">PBBKB omitted</span>}
                    </div>
                  </div>
                ))}
                <div className="bg-blue-50 rounded-lg px-3 py-2 flex justify-between text-sm">
                  <span className="font-semibold text-blue-700">Blended Buy Price</span>
                  <span className="font-mono font-bold text-blue-800">{formatIDR(result.blendedBuyPerL)}/L</span>
                </div>
              </div>
            </div>
          )}

          {/* Direct Costs */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🚢 Biaya Langsung</h2>
            <div className="grid grid-cols-2 gap-3">
              {[['freight','Freight (IDR/L)'],['portChargesPerL','Port Charges per L'],['portChargesFlat','Port Charges Flat (total)'],['surveyorFlat','Surveyor (total)'],['otherPerL','Lainnya (IDR/L)']].map(([k,l])=>(
                <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                  <input type="number" placeholder="0" value={form[k]} onChange={e=>set(k)(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              ))}
            </div>
          </div>

          {/* Tax toggles */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🧾 Pajak Jual</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.applyPPH} onChange={e=>set('applyPPH')(e.target.checked)} className="rounded w-4 h-4"/>
                <div><p className="text-sm text-gray-700 font-medium">PPH ({rates.pph||0.3}%)</p><p className="text-xs text-gray-400">Dari harga beli blended — beban GPP</p></div>
                {result?.pphPerL>0&&<span className="ml-auto font-mono text-xs text-orange-600">{formatIDR(result.pphPerL)}/L</span>}
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.applyBPHSell} onChange={e=>set('applyBPHSell')(e.target.checked)} className="rounded w-4 h-4"/>
                <div><p className="text-sm text-gray-700 font-medium">BPH Migas ({rates.bphMigas||0.25}%) — Sell Side</p><p className="text-xs text-gray-400">Dari harga jual</p></div>
                {result?.bphSellPerL>0&&<span className="ml-auto font-mono text-xs text-orange-600">{formatIDR(result.bphSellPerL)}/L</span>}
              </label>
              <div className="border-t pt-3">
                <label className="block text-xs text-gray-500 mb-1">Provinsi Pengiriman (PBBKB)</label>
                <select value={form.deliveryProvince} onChange={e=>set('deliveryProvince')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— Pilih Provinsi —</option>
                  {pbbkbProvinces.map((p,i)=><option key={i} value={p.name}>{p.name} — {p.rate}% {p.registered?'(GPP Terdaftar ✓)':'(Belum Terdaftar)'}</option>)}
                </select>
                {result?.pbbkbRegistered?(
                  <p className="text-xs text-green-600 mt-1">✅ PBBKB {formatNum(result.pbbkbSellRate*100,1)}% pass-through ke client ({formatIDR(result.pbbkbSellPerL)}/L)</p>
                ):form.deliveryProvince?<p className="text-xs text-gray-400 mt-1">GPP belum terdaftar — PBBKB tidak dikenakan</p>:null}
              </div>
            </div>
          </div>

          {/* Sell Price */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🏷️ Harga Jual</h2>
            <div className="flex gap-4 mb-3">
              {['direct','formula'].map(m=>(
                <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="sellMode" value={m} checked={form.sellMode===m} onChange={()=>set('sellMode')(m)}/>
                  {m==='direct'?'Harga Langsung':'Formula MOPS + HIP'}
                </label>
              ))}
            </div>
            {form.sellMode==='direct'?(
              <input type="number" placeholder="Harga jual per Liter (IDR)" value={form.sellPrice} onChange={e=>set('sellPrice')(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
            ):(
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[['mopsUSD','MOPS (USD/bbl)'],['jisdor','JISDOR (IDR/USD)'],['premium','Premium (IDR/L)'],['hipBBN','HIP BBN (IDR/L)']].map(([k,l])=>(
                    <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                      <input type="number" value={form[k]} onChange={e=>set(k)(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                  ))}
                </div>
                <div><label className="block text-xs text-gray-500 mb-1">Bobot MOPS (%)</label>
                  <input type="number" step="0.1" min="0" max="100" value={form.mopsWeight} onChange={e=>set('mopsWeight')(e.target.value)}
                    className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <span className="text-xs text-gray-400 ml-2">HIP: {100-(parseFloat(form.mopsWeight)||0)}%</span></div>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5 sticky top-4">
            <h2 className="font-semibold text-gray-700 mb-4">📊 Hasil Kalkulasi</h2>
            {!result?<p className="text-gray-400 text-sm">Pilih kargo dan isi harga jual.</p>:(
              <>
                <div className="space-y-0.5 mb-4">
                  <Row label="Volume" value={`${formatNum(result.totalVol,0)} L`}/>
                  <Row label="Blended Buy /L" value={formatIDR(result.blendedBuyPerL)} indent/>
                  <Row label="CoM /L" value={formatIDR(result.comPerL)} indent/>
                  <Row label="Biaya Langsung /L" value={formatIDR(result.totalDirectPerL)} indent/>
                  {result.pphPerL>0&&<Row label="PPH /L" value={formatIDR(result.pphPerL)} indent/>}
                  {result.bphSellPerL>0&&<Row label="BPH Migas /L" value={formatIDR(result.bphSellPerL)} indent/>}
                  <Row label="Total HPP /L" value={formatIDR(result.totalCostPerL)} bold/>
                  <div className="my-2 border-t"/>
                  <Row label="Harga Jual /L" value={formatIDR(result.sellPrice)} bold/>
                  {result.pbbkbRegistered&&<Row label="PBBKB Pass-through /L" sub="tidak pengaruhi margin" value={formatIDR(result.pbbkbSellPerL)} indent/>}
                  <div className="my-2 border-t"/>
                  <Row label="Margin /L" value={formatIDR(result.marginPerL)} bold highlight/>
                  <Row label="Margin %" value={`${formatNum(result.marginPct,2)}%`}/>
                  <Row label="Total Profit" value={formatIDR(result.totalProfit)} bold highlight/>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 mb-3">
                  <p className="text-xs font-semibold text-orange-700 mb-2">Cost of Money (Compound)</p>
                  {result.trancheDetails.map((t,i)=>(
                    <div key={i} className="text-xs text-orange-600 flex justify-between py-0.5">
                      <span>T{i+1} ({Number(t.vol).toLocaleString('id-ID')}L · {t.top}d)</span>
                      <span className="font-mono">{formatIDR(t.com)}</span>
                    </div>
                  ))}
                  <div className="border-t border-orange-200 mt-1 pt-1 flex justify-between text-xs font-semibold text-orange-700">
                    <span>Total CoM</span><span className="font-mono">{formatIDR(result.totalCoM)}</span>
                  </div>
                </div>
                <button onClick={saveSnapshot} disabled={saving} className="w-full bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                  {saving?'⏳':showSaved?'✅ Tersimpan':'💾 Simpan Snapshot'}
                </button>
              </>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">📁 Snapshot Tersimpan</h2>
            {loadingSnap?<p className="text-gray-400 text-sm">Memuat…</p>:snapshots.length===0?<p className="text-gray-400 text-sm">Belum ada snapshot.</p>:(
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {snapshots.map(s=>(
                  <div key={s.id} onClick={()=>setForm({...INIT,...s.form})}
                    className="border border-gray-100 rounded-lg p-3 hover:border-blue-300 cursor-pointer transition-colors">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-gray-700 leading-tight">{s.label}</p>
                      <span className="text-xs text-gray-400 ml-2 shrink-0">{new Date(s.createdAt).toLocaleDateString('id-ID')}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span>{formatNum(s.result?.totalVol,0)} L</span>
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
