import DateInput from '../../utils/DateInput.jsx';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import {
  fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc,
  STOCKS_REF, POS_REF,
} from '../../firebase.js';
import { today, formatIDR, formatDateShort, daysBetween, INDO_MONTHS , fmtDate} from '../../utils/utils.js';
import { canDelete } from '../../utils/approvalUtils.js';

// ─── Calculation helpers ──────────────────────────────────────────────────────
function effectivePerL(t, rates, provs) {
  const base  = parseFloat(t.basePrice) || 0;
  // PPN excluded — pass-through tax, claimed back as input credit
  const bphR  = (parseFloat(rates?.bphMigas) || 0) / 100;
  const prov  = provs?.find(p => p.name === t.pbbkbProvince);
  const pbR   = (t.applyPBBKB && !t.noPbbkb) ? (parseFloat(prov?.rate) || 0) / 100 : 0;
  return base + base * pbR + (t.applyBPHBuy ? base * bphR : 0);
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
  // PPN not shown as cost — it's pass-through (input credit)
  return parts.length ? parts.join(' + ') : (t.applyPPN ? 'PPN (pass-through)' : '–');
}

const fmt  = (v, d = 3) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
const fmtV = (v) => { const n = Number(v) || 0; return n >= 1000 ? (n / 1000).toFixed(1) + 'kL' : n + ' L'; };
const BLANK_T = () => ({
  id: Date.now().toString() + Math.random(),
  supplier: '', vessel: '', basePrice: '', vol: '',
  loadDate: today(), payDate: today(),
  applyPPN: true, applyPBBKB: false, noPbbkb: false, pbbkbProvince: '', applyBPHBuy: false,
  linkedPoId: '', linkedPoNumber: '',
});

// PO match check — compare tranche fields against linked PO
function checkPOMatch(tranche, pos) {
  if (!tranche.linkedPoId) return null; // not linked
  const po = pos.find(p => p.id === tranche.linkedPoId);
  if (!po) return { status: 'missing', label: `${tranche.linkedPoNumber} tidak ditemukan` };
  const poItem     = (po.items || [])[0] || {};
  const poPrice    = parseFloat(poItem.unitPrice) || 0;
  const poVol      = parseFloat(poItem.qty)       || 0;
  const tPrice     = parseFloat(tranche.basePrice) || 0;
  const tVol       = parseFloat(tranche.vol)       || 0;
  const priceOk    = poPrice === 0 || Math.abs(tPrice - poPrice) < 1;
  const volOk      = poVol   === 0 || Math.abs(tVol   - poVol)   < 1;
  const mismatches = [];
  if (!priceOk) mismatches.push(`Harga: tranche ${fmt(tPrice,0)} ≠ PO ${fmt(poPrice,0)}`);
  if (!volOk)   mismatches.push(`Volume: tranche ${Number(tVol).toLocaleString('id-ID')} ≠ PO ${Number(poVol).toLocaleString('id-ID')}`);
  return mismatches.length
    ? { status: 'mismatch', label: tranche.linkedPoNumber, mismatches }
    : { status: 'match',    label: tranche.linkedPoNumber };
}

// Badge component for tranche table
function POBadge({ match }) {
  if (!match) return null;
  if (match.status === 'match') return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">
      ✅ {match.label}
    </span>
  );
  if (match.status === 'mismatch') return (
    <span className="group relative inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold cursor-help">
      ⚠️ {match.label}
      <span className="hidden group-hover:block absolute bottom-full left-0 mb-1 w-56 bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 z-50 shadow-xl">
        {match.mismatches.join('\n')}
      </span>
    </span>
  );
  return (
    <span className="text-[10px] text-gray-400 italic">{match.label} (not found)</span>
  );
}

const STATUSES = ['Draft', 'Confirmed', 'Sold Out', 'Closed'];
const STATUS_BADGE = {
  Draft:     'bg-gray-100 text-gray-500',
  Confirmed: 'bg-blue-100 text-blue-700',
  'Sold Out':'bg-green-100 text-green-700',
  Closed:    'bg-gray-200 text-gray-500',
};

// ─── Tranche Modal ────────────────────────────────────────────────────────────
function TrancheModal({ tranche, rates, provs, pos, onSave, onClose }) {
  const [t, setT] = useState({ ...tranche });
  const eff = effectivePerL(t, rates, provs);
  const set = k => v => setT(p => ({ ...p, [k]: v }));

  const linkedPO  = pos.find(p => p.id === t.linkedPoId);
  const poItem    = (linkedPO?.items || [])[0] || {};
  const poPrice   = parseFloat(poItem.unitPrice) || 0;
  const poVol     = parseFloat(poItem.qty)       || 0;
  const tPrice    = parseFloat(t.basePrice)      || 0;
  const tVol      = parseFloat(t.vol)            || 0;
  const priceOk   = !linkedPO || poPrice === 0 || Math.abs(tPrice - poPrice) < 1;
  const volOk     = !linkedPO || poVol   === 0 || Math.abs(tVol   - poVol)   < 1;
  const isMatched = linkedPO && priceOk && volOk && tPrice > 0;
  const hasMismatch = linkedPO && (!priceOk || !volOk);

  const prefillFromPO = () => {
    if (!linkedPO) return;
    setT(p => ({
      ...p,
      supplier:  linkedPO.vendorName || p.supplier,
      basePrice: poPrice || p.basePrice,
      vol:       poVol   || p.vol,
    }));
  };

  const IF = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-800">{tranche.basePrice ? 'Edit Tranche' : 'Add Tranche'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5 space-y-4">

          {/* PO Link */}
          <div className="border border-blue-100 rounded-xl p-4 bg-blue-50">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Link ke Purchase Order</p>
            <p className="text-[10px] text-blue-400 mb-3">Opsional. Link PO setelah disetujui untuk validasi harga & volume.</p>
            <select className={IF + ' bg-white'} value={t.linkedPoId}
              onChange={e => {
                const po = pos.find(p => p.id === e.target.value);
                setT(p => ({ ...p, linkedPoId: e.target.value, linkedPoNumber: po?.docNumber || '' }));
              }}>
              <option value="">— Tidak ada (modeling saja) —</option>
              {pos.map(po => <option key={po.id} value={po.id}>{po.docNumber} · {po.vendorName || '-'} · {fmtDate(po.poDate)}</option>)}
            </select>

            {linkedPO && (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-blue-700 bg-white rounded-lg px-3 py-2 border border-blue-100">
                  <p className="font-semibold">{linkedPO.docNumber} — {linkedPO.vendorName}</p>
                  {poPrice > 0 && <p className="text-blue-500 mt-0.5">Harga PO: {fmt(poPrice,0)}/L · Vol: {Number(poVol).toLocaleString('id-ID')} L</p>}
                </div>
                {isMatched && (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <span>✅</span><span className="font-semibold">Harga dan volume sesuai PO</span>
                  </div>
                )}
                {hasMismatch && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    <p className="font-semibold mb-1">⚠️ Tidak sesuai PO:</p>
                    {!priceOk && <p>• Harga: tranche <b>{fmt(tPrice,0)}</b> ≠ PO <b>{fmt(poPrice,0)}</b></p>}
                    {!volOk   && <p>• Volume: tranche <b>{Number(tVol).toLocaleString('id-ID')}</b> ≠ PO <b>{Number(poVol).toLocaleString('id-ID')}</b></p>}
                    <button onClick={prefillFromPO} className="mt-2 text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1 rounded-lg font-semibold">↓ Prefill dari PO</button>
                  </div>
                )}
                {linkedPO && !hasMismatch && !isMatched && (
                  <button onClick={prefillFromPO} className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg font-semibold">↓ Prefill dari PO</button>
                )}
              </div>
            )}
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Supplier</label>
              <input type="text" value={t.supplier||''} onChange={e=>set('supplier')(e.target.value)} placeholder="Nama supplier" className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Vessel / SPOB</label>
              <input type="text" value={t.vessel||''} onChange={e=>set('vessel')(e.target.value)} placeholder="SPOB Pandawa V" className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                Base Price (IDR/L){linkedPO && !priceOk && <span className="text-amber-500 ml-1">≠ PO</span>}{linkedPO && priceOk && tPrice>0 && <span className="text-green-500 ml-1">✓</span>}
              </label>
              <input type="number" value={t.basePrice} onChange={e=>set('basePrice')(e.target.value)} placeholder="0" className={IF+(linkedPO&&!priceOk?' border-amber-300':'')}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                Volume (L){linkedPO && !volOk && <span className="text-amber-500 ml-1">≠ PO</span>}{linkedPO && volOk && tVol>0 && <span className="text-green-500 ml-1">✓</span>}
              </label>
              <input type="number" value={t.vol} onChange={e=>set('vol')(e.target.value)} placeholder="0" className={IF+(linkedPO&&!volOk?' border-amber-300':'')}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Load Date</label>
              <DateInput value={t.loadDate} onChange={set('loadDate')} className={IF}/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pay Date (TOP ke supplier)</label>
              <DateInput value={t.payDate} onChange={set('payDate')} className={IF}/>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Province (PBBKB)</label>
              <select value={t.pbbkbProvince} onChange={e=>set('pbbkbProvince')(e.target.value)} className={IF}>
                <option value="">— Pilih Provinsi —</option>
                {provs.map((p,i)=><option key={i} value={p.name}>{p.name} ({p.rate}%)</option>)}
              </select>
            </div>
          </div>

          {/* Tax checkboxes */}
          <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-2.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pajak dari Supplier</p>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={t.applyPPN} onChange={e=>set('applyPPN')(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
              <span className="text-sm text-gray-700">PPN {rates?.ppn||11}%</span>
              <span className="text-[10px] text-gray-400">(pass-through — tidak mempengaruhi modal/L)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={t.applyBPHBuy} onChange={e=>set('applyBPHBuy')(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
              <span className="text-sm text-gray-700">Supplier charges BPH Migas ({rates?.bphMigas||0.25}%)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={t.applyPBBKB} onChange={e=>set('applyPBBKB')(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
              <span className="text-sm text-gray-700">PBBKB {t.pbbkbProvince?`(${t.pbbkbProvince})`:''}</span>
            </label>
            {t.applyPBBKB && (
              <label className="flex items-center gap-2.5 cursor-pointer ml-6">
                <input type="checkbox" checked={t.noPbbkb||false} onChange={e=>set('noPbbkb')(e.target.checked)} className="rounded w-4 h-4 accent-amber-500"/>
                <span className="text-xs text-amber-600">Omit PBBKB (non-Wapu / non-PKP supplier)</span>
              </label>
            )}
          </div>

          {parseFloat(t.basePrice)>0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-blue-700 font-semibold">Modal/L (excl. PPN)</span>
              <span className="font-mono font-bold text-blue-800">{fmt(eff,2)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button onClick={()=>onSave(t)} disabled={!t.basePrice||!t.vol}
            className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            💾 Save Tranche
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
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
                <DateInput value={form[k]} onChange={set(k)} className={IF}/>
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
  const [showEndCycle, setShowEndCycle] = useState(false);

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
      // Auto-confirm stock if any tranche is now linked to a PO
      const hasLinkedPO = next.some(tr => tr.linkedPoId);
      const newStatus = hasLinkedPO && selected.status === 'Draft' ? 'Confirmed' : selected.status;
      await updateSubDoc(STOCKS_REF(), selected.id, { tranches: next, totalVolume, status: newStatus });
      setStocks(s => s.map(x => x.id === selected.id ? { ...x, tranches: next, totalVolume, status: newStatus } : x));
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
    <div className="flex flex-col h-full pt-14 md:pt-0 overflow-hidden">

      {/* Modals */}
      {showNewStock && <NewStockModal onSave={createStock} onClose={() => setShowNewStock(false)} />}
      {trancheModal !== null && (
        <TrancheModal
          tranche={trancheModal}
          rates={rates}
          provs={provs}
          pos={pos}
          onSave={saveTranche}
          onClose={() => setTrancheModal(null)}
        />
      )}
      {/* ── End Cycle Modal ── */}
      {showEndCycle && selected && (
        <EndCycleModal
          stock={selected}
          tranches={selected.tranches || []}
          rates={rates}
          provs={provs}
          onClose={() => setShowEndCycle(false)}
          onConfirm={async (rollover) => {
            await updateSubDoc(STOCKS_REF(), selected.id, {
              tranches: [rollover],
              totalVolume: parseFloat(rollover.vol) || 0,
              committedVolume: 0,
              status: 'Confirmed',
              cycleRollovers: [...(selected.cycleRollovers || []), {
                date: rollover.cycleDate,
                prevBlendedModal: rollover.prevBlendedModal,
                prevCoM: rollover.prevCoM,
                prevTranchesCount: selected.tranches?.length || 0,
                at: Date.now(),
              }],
            });
            setStocks(await fetchCollection(STOCKS_REF()));
            setShowEndCycle(false);
          }}
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
                          <p className="text-xs text-gray-500">{po.vendorName||'-'} · {fmtDate(po.poDate)}</p>
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

      {/* ── Top bar: Cargo position cards (horizontally scrollable) ── */}
      <div className="no-print shrink-0 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">Cargo Positions</p>
          <button onClick={() => setShowNewStock(true)}
            className="shrink-0 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 whitespace-nowrap">
            + New Position
          </button>
          {loading
            ? <p className="text-xs text-gray-400 italic shrink-0">Loading…</p>
            : stocks.length === 0
            ? <p className="text-xs text-gray-400 italic shrink-0">No cargo positions yet.</p>
            : stocks.map(s => {
                const { blended: b, totalVol: tv } = calcBlended(s.tranches||[], rates, provs);
                const isActive = s.id === selectedId;
                return (
                  <div key={s.id} onClick={() => setSelectedId(s.id)}
                    className={`shrink-0 rounded-xl px-4 py-2.5 cursor-pointer transition-colors border min-w-[160px] relative group ${
                      isActive
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}>
                    <p className={`text-xs font-bold leading-tight ${isActive?'text-white':'text-gray-800'}`}>{s.label}</p>
                    <p className={`text-[10px] mt-0.5 ${isActive?'text-blue-200':'text-gray-400'}`}>
                      {(s.tranches||[]).length} tranches · {fmtV(tv)}
                    </p>
                    {b > 0 && (
                      <p className={`text-xs font-mono font-semibold mt-1 ${isActive?'text-blue-100':'text-blue-600'}`}>
                        {new Intl.NumberFormat('id-ID').format(Math.round(b))}/L
                      </p>
                    )}
                    {canDelete(userRole) && (
                      <button onClick={e => { e.stopPropagation(); deleteStock(s.id); }}
                        className={`absolute top-1.5 right-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${
                          isActive?'text-blue-200 hover:text-white':'text-gray-300 hover:text-red-500'
                        }`}>✕</button>
                    )}
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* ── Main area: Detail (full width) ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm font-medium">Select a cargo position above</p>
            <p className="text-xs mt-1">or click + New Position to create one</p>
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
              <button onClick={() => setShowEndCycle(true)}
                className="border border-orange-200 text-orange-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-50">
                🔄 End Cycle
              </button>
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
                        {['Supplier','Vessel','Base Price','Volume (L)','Load Date','Province','Taxes','Modal/L','PO',''].map(h => (
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
                              <POBadge match={checkPOMatch(t, pos)} />
                            </td>
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

// ─── End Cycle Modal ──────────────────────────────────────────────────────────
function EndCycleModal({ stock, tranches, rates, provs, onClose, onConfirm }) {
  const [cycleDate, setCycleDate] = useState(today());
  const [manualDeductions, setManualDeductions] = useState([]);
  const [saving, setSaving] = useState(false);

  const bankRate = (parseFloat(rates?.bankRate) || 6.5) / 100;

  const addManual = () => setManualDeductions(p => [...p, { id: Date.now().toString(), label:'', vol:'' }]);
  const setMd = (id,k,v) => setManualDeductions(p => p.map(x => x.id===id ? {...x,[k]:v} : x));
  const removeMd = id => setManualDeductions(p => p.filter(x => x.id!==id));

  // Blended modal (PPN excluded)
  let tv=0,tval=0;
  tranches.forEach(t => {
    const vol=parseFloat(t.vol)||0,base=parseFloat(t.basePrice)||0;
    const bphR=(parseFloat(rates?.bphMigas)||0)/100;
    const prov=provs?.find(p=>p.name===t.pbbkbProvince);
    const pbR=(t.applyPBBKB&&!t.noPbbkb)?(parseFloat(prov?.rate)||0)/100:0;
    tv+=vol; tval+=(base+base*pbR+(t.applyBPHBuy?base*bphR:0))*vol;
  });
  const blendedModal = tv>0?tval/tv:0;
  const totalVol = tv;

  // Weighted average load date
  let dateN=0,dateD=0;
  tranches.forEach(t => { const vol=parseFloat(t.vol)||0, d=t.loadDate?new Date(t.loadDate).getTime():Date.now(); dateN+=d*vol; dateD+=vol; });
  const avgLoadDate = dateD>0 ? new Date(dateN/dateD).toISOString().slice(0,10) : today();

  const daysHeld = Math.max(0, daysBetween(avgLoadDate, cycleDate));
  const comPerL = blendedModal*(Math.pow(1+bankRate, daysHeld/365)-1);
  const newCostPerL = blendedModal + comPerL;

  const soDeduction = stock.committedVolume || 0;
  const manualTotal = manualDeductions.reduce((s,m)=>s+(parseFloat(m.vol)||0),0);
  const remaining = Math.max(0, totalVol - soDeduction - manualTotal);

  const fmt  = (v,d=2) => new Intl.NumberFormat('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(v)||0);
  const fmtV = v => Number(v).toLocaleString('id-ID');

  const handleConfirm = async () => {
    if (remaining<=0) { alert('Remaining volume is zero or negative.'); return; }
    setSaving(true);
    const rollover = {
      id: Date.now().toString()+Math.random(),
      supplier:'Cycle Rollover', vessel:'',
      basePrice: String(Math.round(newCostPerL*100)/100),
      vol: String(Math.round(remaining)),
      loadDate: cycleDate, payDate: cycleDate,
      applyPPN:false, applyPBBKB:false, noPbbkb:false, pbbkbProvince:'', applyBPHBuy:false,
      isCycleRollover:true, cycleDate,
      prevBlendedModal:blendedModal, prevCoM:comPerL, daysHeld,
    };
    await onConfirm(rollover);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-800">🔄 End Cycle — {stock.label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Consolidate remaining inventory into a new single tranche</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Current summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="font-semibold text-gray-700 mb-3 text-sm">Current Position</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-gray-500">Total Volume</div><div className="font-mono text-right">{fmtV(totalVol)} L</div>
              <div className="text-gray-500">Blended Modal</div><div className="font-mono text-right text-blue-700">{fmt(blendedModal)}/L</div>
              <div className="text-gray-500">Tranches</div><div className="font-mono text-right">{tranches.length}</div>
              <div className="text-gray-500">Avg Load Date</div><div className="font-mono text-right">{avgLoadDate}</div>
            </div>
          </div>

          {/* New cycle date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">New Cycle Date</label>
            <DateInput value={cycleDate} onChange={setCycleDate}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
            <p className="text-[10px] text-gray-400 mt-0.5">
              CoM calculated from avg load date ({avgLoadDate}) to this date: {daysHeld} days at {rates?.bankRate||6.5}% p.a.
            </p>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Deductions</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-blue-50 rounded-lg px-3 py-2.5 text-sm">
                <span className="text-blue-700">Committed to Sales Orders</span>
                <span className="font-mono font-semibold text-blue-800">{fmtV(soDeduction)} L</span>
              </div>
              {manualDeductions.map(md=>(
                <div key={md.id} className="flex items-center gap-2">
                  <input type="text" value={md.label} onChange={e=>setMd(md.id,'label',e.target.value)}
                    placeholder="Description (e.g. physical delivery)"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <input type="number" value={md.vol} onChange={e=>setMd(md.id,'vol',e.target.value)}
                    placeholder="Volume (L)"
                    className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"/>
                  <button onClick={()=>removeMd(md.id)} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                </div>
              ))}
              <button onClick={addManual}
                className="text-xs border border-dashed border-gray-300 text-gray-500 px-3 py-2 rounded-lg hover:border-blue-400 hover:text-blue-600 w-full">
                + Add Manual Deduction
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className={`rounded-xl p-4 border-2 ${remaining>0?'bg-green-50 border-green-200':'bg-red-50 border-red-200'}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3 text-gray-500">New Cycle Preview</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500 text-xs">Remaining Volume</div>
              <div className={`font-mono font-bold text-right ${remaining>0?'text-green-700':'text-red-600'}`}>{fmtV(Math.round(remaining))} L</div>
              <div className="text-gray-500 text-xs">Original Blended Modal</div>
              <div className="font-mono text-right text-gray-700">{fmt(blendedModal)}/L</div>
              <div className="text-gray-500 text-xs">+ Accumulated CoM ({daysHeld}d)</div>
              <div className="font-mono text-right text-orange-600">+{fmt(comPerL)}/L</div>
              <div className="text-gray-600 text-xs font-semibold border-t pt-2">New Base Cost</div>
              <div className="font-mono font-bold text-right text-blue-800 border-t pt-2">{fmt(newCostPerL)}/L</div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3">
              New cycle tranche has <b>no taxes applied</b> — all taxes were already included in the original tranche costs. This prevents double taxation on the rolled-over inventory.
            </p>
          </div>

          {/* Historical — Supply Tranches */}
          <div className="border-t pt-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">📦 Historical — Supply Tranches</p>
            <div className="bg-gray-50 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-100"><tr>
                  {['Supplier','Vessel','Base Price','Volume (L)','Load Date','Modal/L'].map(h=>(
                    <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-200">
                  {tranches.map((t,i)=>{
                    const base=parseFloat(t.basePrice)||0, vol=parseFloat(t.vol)||0;
                    const bphR=(parseFloat(rates?.bphMigas)||0)/100;
                    const prov=provs?.find(p=>p.name===t.pbbkbProvince);
                    const pbR=(t.applyPBBKB&&!t.noPbbkb)?(parseFloat(prov?.rate)||0)/100:0;
                    const eff=base+base*pbR+(t.applyBPHBuy?base*bphR:0);
                    return (
                      <tr key={i} className={i%2===0?'bg-white':''}>
                        <td className="px-3 py-2">{t.supplier||'–'}</td>
                        <td className="px-3 py-2 text-gray-400">{t.vessel||'–'}</td>
                        <td className="px-3 py-2 font-mono">{Number(base).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 font-mono">{Number(vol).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2">{t.loadDate||'–'}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-blue-700">{fmt(eff)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-blue-50 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-blue-700 text-xs">Blended (volume-weighted)</td>
                    <td className="px-3 py-2 font-mono">{fmtV(totalVol)}</td>
                    <td/>
                    <td className="px-3 py-2 font-mono text-blue-700">{fmt(blendedModal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical — Sales Orders */}
          {soDeduction > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">🤝 Historical — Sales Orders Committed</p>
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100"><tr>
                    {['SO Number','Client','Volume (L)','Price/L','Status'].map(h=>(
                      <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-200">
                    {(stock.linkedSOs||[]).length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-3 text-gray-400 italic">
                        Committed volume: {fmtV(soDeduction)} L (detail not available — loaded from stock committedVolume)
                      </td></tr>
                    ) : (stock.linkedSOs||[]).map((so,i)=>(
                      <tr key={i} className={i%2===0?'bg-white':''}>
                        <td className="px-3 py-2 font-mono text-blue-600">{so.docNumber||'–'}</td>
                        <td className="px-3 py-2">{so.clientName||'–'}</td>
                        <td className="px-3 py-2 font-mono">{Number(so.volume||0).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 font-mono">{so.agreedPrice ? Number(so.agreedPrice).toLocaleString('id-ID') : '–'}</td>
                        <td className="px-3 py-2"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">{so.approvalStatus||'–'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button onClick={handleConfirm} disabled={saving||remaining<=0}
            className="flex-1 bg-orange-500 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
            {saving?'⏳ Processing…':'🔄 Confirm End Cycle'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
