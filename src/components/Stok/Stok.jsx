import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import {
  fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc,
  STOCKS_REF, POS_REF,
} from '../../firebase.js';
import { today, formatIDR, formatDateShort } from '../../utils/utils.js';
import { canDelete } from '../../utils/approvalUtils.js';

// ─── Calculation helpers ──────────────────────────────────────────────────────
function effectivePerL(t, rates, provs) {
  const base  = parseFloat(t.basePrice) || 0;
  const ppnR  = (parseFloat(rates?.ppn)      || 0) / 100;
  const bphR  = (parseFloat(rates?.bphMigas) || 0) / 100;
  const prov  = provs?.find(p => p.name === t.pbbkbProvince);
  const pbR   = (t.applyPBBKB && !t.noPbbkb) ? (parseFloat(prov?.rate) || 0) / 100 : 0;
  return base + (t.applyPPN ? base * ppnR : 0) + base * pbR + (t.applyBPHBuy ? base * bphR : 0);
}

function calcBlended(tranches = [], rates, provs) {
  let tv = 0, tval = 0;
  tranches.forEach(t => {
    const vol = parseFloat(t.vol) || 0;
    tv   += vol;
    tval += effectivePerL(t, rates, provs) * vol;
  });
  return { blended: tv > 0 ? tval / tv : 0, totalVol: tv, totalValue: tval };
}

function taxLabel(t, rates, provs) {
  const parts = [];
  if (t.applyPPH)    parts.push(`PPH ${rates?.pph || 0.3}%`);
  if (t.applyBPHBuy) parts.push(`BPH ${rates?.bphMigas || 0.25}%`);
  if (t.applyPBBKB && !t.noPbbkb) {
    const r = provs?.find(p => p.name === t.pbbkbProvince)?.rate;
    parts.push(`PBBKB${r ? ` ${r}%` : ''}`);
  }
  if (t.noPbbkb) parts.push('~PBBKB');
  return parts.length ? parts.join(' + ') : '–';
}

const fmt  = (v, d = 3) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
const fmtV = (v) => { const n = Number(v) || 0; return n >= 1000 ? (n / 1000).toFixed(1) + 'kL' : n + ' L'; };
const BLANK_T = () => ({
  id: Date.now().toString() + Math.random(),
  supplier: '', vessel: '', basePrice: '', vol: '',
  loadDate: today(), payDate: today(),
  applyPPN: true, applyPBBKB: false, noPbbkb: false, pbbkbProvince: '', applyBPHBuy: false,
});

const STATUSES = ['Draft', 'Confirmed', 'Sold Out', 'Closed'];
const STATUS_BADGE = {
  Draft:     'bg-gray-100 text-gray-500',
  Confirmed: 'bg-blue-100 text-blue-700',
  'Sold Out':'bg-green-100 text-green-700',
  Closed:    'bg-gray-200 text-gray-500',
};

// ─── Tranche Modal ────────────────────────────────────────────────────────────
function TrancheModal({ tranche, rates, provs, onSave, onClose }) {
  const [t, setT] = useState({ ...tranche });
  const eff = effectivePerL(t, rates, provs);
  const set = k => v => setT(p => ({ ...p, [k]: v }));

  const IF = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-800">
            {tranche.supplier || tranche.basePrice ? 'Edit Tranche' : 'Add Tranche'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Supplier</label>
              <input type="text" value={t.supplier || ''} onChange={e => set('supplier')(e.target.value)}
                placeholder="Nama supplier" className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Vessel / SPOB</label>
              <input type="text" value={t.vessel || ''} onChange={e => set('vessel')(e.target.value)}
                placeholder="SPOB Pandawa V" className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Base Price (IDR/L)</label>
              <input type="number" value={t.basePrice} onChange={e => set('basePrice')(e.target.value)}
                placeholder="0" className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Volume (L)</label>
              <input type="number" value={t.vol} onChange={e => set('vol')(e.target.value)}
                placeholder="0" className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Load Date</label>
              <input type="date" value={t.loadDate} onChange={e => set('loadDate')(e.target.value)} className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pay Date (TOP to supplier)</label>
              <input type="date" value={t.payDate} onChange={e => set('payDate')(e.target.value)} className={IF}/>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Province (PBBKB)</label>
              <select value={t.pbbkbProvince} onChange={e => set('pbbkbProvince')(e.target.value)} className={IF}>
                <option value="">— Pilih Provinsi —</option>
                {provs.map((p, i) => <option key={i} value={p.name}>{p.name} ({p.rate}%)</option>)}
              </select>
            </div>
          </div>

          {/* Tax checkboxes */}
          <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pajak dari Supplier</p>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={t.applyPPN} onChange={e => set('applyPPN')(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
              <span className="text-sm text-gray-700">PPN {rates?.ppn || 11}%</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={t.applyBPHBuy} onChange={e => set('applyBPHBuy')(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
              <span className="text-sm text-gray-700">Supplier charges BPH Migas ({rates?.bphMigas || 0.25}%)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={t.applyPBBKB} onChange={e => set('applyPBBKB')(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
              <span className="text-sm text-gray-700">PBBKB {t.pbbkbProvince ? `(${t.pbbkbProvince})` : ''}</span>
            </label>
            {t.applyPBBKB && (
              <label className="flex items-center gap-2.5 cursor-pointer ml-6">
                <input type="checkbox" checked={t.noPbbkb || false} onChange={e => set('noPbbkb')(e.target.checked)} className="rounded w-4 h-4 accent-amber-500"/>
                <span className="text-xs text-amber-600">Omit PBBKB from buying price (non-Wapu / non-PKP supplier)</span>
              </label>
            )}
          </div>

          {/* Live modal preview */}
          {(parseFloat(t.basePrice) > 0) && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-blue-700 font-semibold">Modal/L (Effective)</span>
              <span className="font-mono font-bold text-blue-800">{fmt(eff, 2)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button onClick={() => onSave(t)} disabled={!t.basePrice || !t.vol}
            className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            💾 Save Tranche
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Stock Modal ──────────────────────────────────────────────────────────
function NewStockModal({ onSave, onClose }) {
  const [form, setForm] = useState({ label:'', product:'', loadingPort:'', dischargingPort:'', etaLoad:today(), etaDisch:'', notes:'' });
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const IF  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-800">New Position</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Label / Nama Stok *</label>
            <input type="text" value={form.label} onChange={set('label')} placeholder="e.g. PPS APR CARGO" className={IF}/>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Produk</label>
            <input type="text" value={form.product} onChange={set('product')} placeholder="B40, HSD..." className={IF}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['loadingPort','Loading Port'],['dischargingPort','Discharging Port']].map(([k,l]) => (
              <div key={k}>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{l}</label>
                <input type="text" value={form[k]} onChange={set(k)} className={IF}/>
              </div>
            ))}
            {[['etaLoad','ETA Loading'],['etaDisch','ETA Discharging']].map(([k,l]) => (
              <div key={k}>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{l}</label>
                <input type="date" value={form[k]} onChange={set(k)} className={IF}/>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Catatan</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={IF + ' resize-none'}/>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button onClick={() => form.label && onSave(form)} disabled={!form.label}
            className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            + Create Position
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Volume progress bar ──────────────────────────────────────────────────────
function VolumeBar({ total, committed }) {
  const available = Math.max(0, total - committed);
  const pct = total > 0 ? Math.min(100, (committed / total) * 100) : 0;
  return (
    <div className="mt-1.5">
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }}/>
      </div>
      <div className="flex justify-between text-[10px] mt-0.5">
        <span className="text-blue-600 font-semibold">{Number(available).toLocaleString('id-ID')} L avail</span>
        <span className="text-gray-400">{Number(total).toLocaleString('id-ID')} L total</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Stok() {
  const { appData, userRole } = useApp();
  const nav = useNavigate();
  const [stocks,      setStocks]      = useState([]);
  const [pos,         setPOs]         = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedId,  setSelectedId]  = useState(null);
  const [showNewStock, setShowNewStock] = useState(false);
  const [trancheModal, setTrancheModal] = useState(null); // null | tranche obj (blank = add, filled = edit)
  const [savingTranche, setSavingTranche] = useState(false);
  const [showLinkPO, setShowLinkPO] = useState(false);

  const rates = appData?.rates || {};
  const provs = appData?.pbbkbProvinces || [];

  useEffect(() => {
    Promise.all([fetchCollection(STOCKS_REF()), fetchCollection(POS_REF())])
      .then(([s, p]) => { setStocks(s); setPOs(p); setLoading(false); if (s.length) setSelectedId(s[0].id); });
  }, []);

  const selected = stocks.find(s => s.id === selectedId);
  const tranches = selected?.tranches || [];
  const { blended, totalVol, totalValue } = calcBlended(tranches, rates, provs);
  const committed = selected?.committedVolume || 0;
  const available = Math.max(0, totalVol - committed);

  // ── Stock CRUD ────────────────────────────────────────────────────────────
  const createStock = async (form) => {
    const newStock = await createNumberedDoc('stock', STOCKS_REF(), { ...form, status:'Draft', tranches:[], linkedPOs:[], committedVolume:0, totalVolume:0 },
      seq => `STK-GPP-${String(seq).padStart(4,'0')}`);
    const fresh = await fetchCollection(STOCKS_REF());
    setStocks(fresh);
    setSelectedId(newStock.id || fresh[0]?.id);
    setShowNewStock(false);
  };

  const deleteStock = async (id) => {
    if (!canDelete(userRole) || !confirm('Hapus stok ini?')) return;
    await deleteSubDoc(STOCKS_REF(), id);
    const fresh = await fetchCollection(STOCKS_REF());
    setStocks(fresh);
    setSelectedId(fresh[0]?.id || null);
  };

  const updateStatus = async (id, status) => {
    await updateSubDoc(STOCKS_REF(), id, { status });
    setStocks(s => s.map(x => x.id === id ? { ...x, status } : x));
  };

  // ── Tranche CRUD ──────────────────────────────────────────────────────────
  const saveTranche = async (t) => {
    if (!selected) return;
    setSavingTranche(true);
    try {
      const existing = tranches.find(x => x.id === t.id);
      const next = existing ? tranches.map(x => x.id === t.id ? t : x) : [...tranches, t];
      const totalVolume = next.reduce((s, tr) => s + (parseFloat(tr.vol) || 0), 0);
      await updateSubDoc(STOCKS_REF(), selected.id, { tranches: next, totalVolume });
      setStocks(s => s.map(x => x.id === selected.id ? { ...x, tranches: next, totalVolume } : x));
      setTrancheModal(null);
    } finally { setSavingTranche(false); }
  };

  const deleteTranche = async (tid) => {
    if (!confirm('Hapus tranche ini?') || !selected) return;
    const next = tranches.filter(t => t.id !== tid);
    const totalVolume = next.reduce((s, t) => s + (parseFloat(t.vol) || 0), 0);
    await updateSubDoc(STOCKS_REF(), selected.id, { tranches: next, totalVolume });
    setStocks(s => s.map(x => x.id === selected.id ? { ...x, tranches: next, totalVolume } : x));
  };

  // ── PO linking ────────────────────────────────────────────────────────────
  const linkPO = async (po) => {
    if (!selected) return;
    const existing = selected.linkedPOs || [];
    if (existing.find(p => p.poId === po.id)) return;
    const next = [...existing, { poId:po.id, docNumber:po.docNumber, vendor:po.vendorName||'', linkedAt:Date.now() }];
    await updateSubDoc(STOCKS_REF(), selected.id, { linkedPOs: next, status:'Confirmed' });
    setStocks(s => s.map(x => x.id === selected.id ? { ...x, linkedPOs:next, status:'Confirmed' } : x));
    setShowLinkPO(false);
  };

  const unlinkPO = async (poId) => {
    if (!selected) return;
    const next = (selected.linkedPOs||[]).filter(p => p.poId !== poId);
    const newStatus = next.length === 0 ? 'Draft' : selected.status;
    await updateSubDoc(STOCKS_REF(), selected.id, { linkedPOs:next, status:newStatus });
    setStocks(s => s.map(x => x.id === selected.id ? { ...x, linkedPOs:next, status:newStatus } : x));
  };

  const goCalc = (s) => {
    sessionStorage.setItem('calcPrefill', JSON.stringify({ cargoId:s.id, label:s.label, tranches:s.tranches||[] }));
    nav('/calculator');
  };

  return (
    <div className="flex h-full pt-14 md:pt-0 overflow-hidden">

      {/* Modals */}
      {showNewStock && <NewStockModal onSave={createStock} onClose={() => setShowNewStock(false)} />}
      {trancheModal !== null && (
        <TrancheModal
          tranche={trancheModal}
          rates={rates}
          provs={provs}
          onSave={saveTranche}
          onClose={() => setTrancheModal(null)}
        />
      )}
      {showLinkPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-gray-800">Link PO → Stok</h2>
              <button onClick={() => setShowLinkPO(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5">
              <p className="text-xs text-gray-400 mb-4">Pilih PO pengadaan. Stok otomatis menjadi Confirmed.</p>
              {pos.length === 0 ? <p className="text-gray-400 text-sm">Belum ada PO.</p> : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {pos.map(po => {
                    const linked = (selected?.linkedPOs||[]).find(l => l.poId === po.id);
                    return (
                      <div key={po.id} onClick={() => !linked && linkPO(po)}
                        className={`flex items-center justify-between border rounded-lg px-4 py-3 ${linked?'bg-green-50 border-green-200':'hover:border-blue-300 cursor-pointer'}`}>
                        <div>
                          <p className="text-sm font-mono font-semibold text-blue-700">{po.docNumber}</p>
                          <p className="text-xs text-gray-500">{po.vendorName||'-'} · {po.poDate}</p>
                        </div>
                        {linked ? <span className="text-xs text-green-600 font-semibold">✓ Terhubung</span>
                                : <span className="text-xs text-blue-600">+ Hubungkan</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Left panel: Stock list ── */}
      <div className="no-print w-64 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b border-gray-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Cargo Positions</p>
          <button onClick={() => setShowNewStock(true)}
            className="w-full bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-800">
            + New Position
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {loading ? <p className="text-xs text-gray-400 p-3">Memuat…</p> :
           stocks.length === 0 ? <p className="text-xs text-gray-400 p-3 italic">Belum ada stok.</p> :
           stocks.map(s => {
             const { blended: b, totalVol: tv } = calcBlended(s.tranches||[], rates, provs);
             const isActive = s.id === selectedId;
             return (
               <div key={s.id} onClick={() => setSelectedId(s.id)}
                 className={`rounded-xl p-3 mb-1.5 cursor-pointer transition-colors ${
                   isActive ? 'bg-blue-700 text-white' : 'bg-white border border-gray-100 hover:border-blue-200'
                 }`}>
                 <div className="flex items-start justify-between">
                   <p className={`text-xs font-bold leading-tight ${isActive?'text-white':'text-gray-800'}`}>{s.label}</p>
                   {canDelete(userRole) && (
                     <button onClick={e => { e.stopPropagation(); deleteStock(s.id); }}
                       className={`text-[10px] ml-1 shrink-0 ${isActive?'text-blue-200 hover:text-white':'text-gray-300 hover:text-red-400'}`}>✕</button>
                   )}
                 </div>
                 <p className={`text-[10px] mt-0.5 ${isActive?'text-blue-200':'text-gray-400'}`}>
                   {(s.tranches||[]).length} tranches · {fmtV(tv)}
                 </p>
                 {b > 0 && <p className={`text-xs font-mono font-semibold mt-1 ${isActive?'text-blue-100':'text-blue-600'}`}>
                   {new Intl.NumberFormat('id-ID').format(Math.round(b))}/L
                 </p>}
               </div>
             );
           })
          }
        </div>
      </div>

      {/* ── Right panel: Detail ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm font-medium">Pilih stok dari kiri</p>
            <p className="text-xs mt-1">atau klik + New Position</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Detail header */}
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
            <div>
              <h1 className="text-base font-bold text-gray-800">{selected.label}</h1>
              <p className="text-[10px] text-gray-400 mt-0.5">
                CoM rate: {rates.bankRate || 6.5}% p.a.
                {selected.product && ` · ${selected.product}`}
                {selected.docNumber && <span className="font-mono ml-2">{selected.docNumber}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select value={selected.status} onChange={e => updateStatus(selected.id, e.target.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border-0 cursor-pointer ${STATUS_BADGE[selected.status]||'bg-gray-100 text-gray-600'}`}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => setShowLinkPO(true)}
                className="border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50">
                🔗 Link PO
              </button>
              <button onClick={() => goCalc(selected)}
                className="border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50">
                🧮 Kalkulasi
              </button>
              <button onClick={() => setTrancheModal(BLANK_T())}
                className="bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-800">
                + Add Tranche
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-5">

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              {[
                { label:'BLENDED MODAL', value: blended > 0 ? `${new Intl.NumberFormat('id-ID').format(Math.round(blended))}/L` : '–', sub:'per litre (excl. logistics)', accent:'blue' },
                { label:'TOTAL VOLUME',  value: fmtV(totalVol), sub:`${Number(totalVol).toLocaleString('id-ID')} L`, accent:'gray' },
                { label:'TRANCHES',      value: tranches.length, sub:`${tranches.length} supply tranche(s)`, accent:'gray' },
                { label:'TOTAL CARGO VALUE', value: totalValue > 0 ? new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(totalValue) : '–', sub:'excl. CoM & logistics', accent:'blue' },
              ].map(c => (
                <div key={c.label} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${c.accent==='blue'?'border-blue-500':'border-gray-300'}`}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{c.label}</p>
                  <p className={`text-lg font-bold ${c.accent==='blue'?'text-blue-700':'text-gray-800'}`}>{c.value}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                </div>
              ))}
            </div>

            {/* Volume availability (if Confirmed) */}
            {selected.status === 'Confirmed' && totalVol > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600">Volume Availability</p>
                  <span className="text-xs text-gray-400">{Number(committed).toLocaleString('id-ID')} L terikat SO</span>
                </div>
                <VolumeBar total={totalVol} committed={committed}/>
              </div>
            )}

            {/* Tranche table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Supply Tranches</p>
              </div>
              {tranches.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-3xl mb-2">⛽</p>
                  <p className="text-sm">Belum ada tranche. Klik "+ Add Tranche" untuk menambahkan.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Supplier','Vessel','Base Price','Volume (L)','Load Date','Province','Taxes','Modal/L',''].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {tranches.map((t, i) => {
                        const eff = effectivePerL(t, rates, provs);
                        return (
                          <tr key={t.id || i} className="hover:bg-gray-50 group">
                            <td className="px-4 py-3 font-medium text-gray-700">{t.supplier || '–'}</td>
                            <td className="px-4 py-3 text-gray-500">{t.vessel || '–'}</td>
                            <td className="px-4 py-3 font-mono text-gray-700">{Number(t.basePrice||0).toLocaleString('id-ID')}</td>
                            <td className="px-4 py-3 font-mono text-gray-700">{Number(t.vol||0).toLocaleString('id-ID')}</td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.loadDate || '–'}</td>
                            <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{t.pbbkbProvince || '–'}</td>
                            <td className="px-4 py-3 text-gray-400 text-[10px] whitespace-nowrap">{taxLabel(t, rates, provs)}</td>
                            <td className="px-4 py-3 font-mono font-bold text-blue-600">{fmt(eff, 2)}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setTrancheModal({ ...t })}
                                  className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded hover:bg-blue-100">
                                  Edit
                                </button>
                                <button onClick={() => deleteTranche(t.id)}
                                  className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-2 py-1 rounded hover:bg-red-100">
                                  Del
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {tranches.length > 1 && (
                      <tfoot className="bg-blue-50 border-t-2 border-blue-100">
                        <tr>
                          <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-blue-700">Blended (volume-weighted)</td>
                          <td className="px-4 py-2.5"/>
                          <td className="px-4 py-2.5 font-mono font-bold text-blue-700">{Number(totalVol).toLocaleString('id-ID')}</td>
                          <td colSpan={3}/>
                          <td className="px-4 py-2.5 font-mono font-bold text-blue-800">{fmt(blended, 2)}</td>
                          <td/>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Linked POs */}
            {(selected.linkedPOs||[]).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">PO Terhubung</p>
                <div className="space-y-2">
                  {selected.linkedPOs.map(lp => (
                    <div key={lp.poId} className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-xs font-mono font-bold text-blue-700">{lp.docNumber}</p>
                        <p className="text-[10px] text-gray-500">{lp.vendor}</p>
                      </div>
                      <button onClick={() => unlinkPO(lp.poId)} className="text-xs text-red-400 hover:text-red-600">✕ Lepas</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Port info */}
            {(selected.loadingPort || selected.dischargingPort) && (
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
                {selected.loadingPort    && <div className="bg-white rounded-xl shadow-sm px-4 py-3"><p className="text-gray-400 mb-0.5">Loading Port</p><p className="font-medium text-gray-700">{selected.loadingPort}</p></div>}
                {selected.dischargingPort && <div className="bg-white rounded-xl shadow-sm px-4 py-3"><p className="text-gray-400 mb-0.5">Discharging Port</p><p className="font-medium text-gray-700">{selected.dischargingPort}</p></div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
