import DateInput from '../../utils/DateInput.jsx';
import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import {
  fetchCollection, deleteSubDoc, OLS_REF,
  applyApprovalDirect, db, DATA_REF, STOCKS_REF,
} from '../../firebase.js';
import {
  collection, doc, setDoc, runTransaction,
} from 'firebase/firestore';
import {
  today, autoPeriod, buildSPHNumber, formatDateID,
  terbilang, toRoman, fmtDate,
} from '../../utils/utils.js';
import {
  getChain, firstPending, nextStatus,
  isEditable, isApproved, statusMeta, canDelete,
} from '../../utils/approvalUtils.js';
import ApprovalPanel, { StatusBadge, DraftWatermark } from '../Layout/ApprovalPanel.jsx';
import logo from '../../assets/gpp-logo.png';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtNum  = (v, d = 2) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
const fmtIDR  = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(Number(v) || 0);
const n       = (v)  => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

const paymentLabel = (form) => {
  if (form.paymentMode === 'CBD')   return 'Cash Before Delivery (CBD)';
  if (form.paymentMode === 'COD')   return 'Cash On Delivery (COD)';
  if (form.paymentMode === 'Other') return form.paymentOther || '–';
  return `Credit, TOP ${form.clientTOP || '–'} hari sejak tanggal pengiriman`;
};

// ─── Shared field primitives (light theme) ────────────────────────────────────
const Lbl = ({ children, optional }) => (
  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
    {children}{optional && <span className="text-gray-300 font-normal tracking-normal normal-case ml-1">(opsional)</span>}
  </label>
);
const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-800';
const sel = inp + ' cursor-pointer';

// ─── INIT factory ─────────────────────────────────────────────────────────────
const INIT = (nextSeq = 1) => ({
  seqOverride:      nextSeq,
  olDate:           today(),
  period:           autoPeriod(),
  clientId:         '',
  clientName:       '',
  clientCode:       '',
  clientAddress:    '',
  clientNPWP:       '',
  bankId:           '',
  province:         '',
  paymentMode:      'Credit',
  clientTOP:        45,
  paymentOther:     '',          // free-text for custom payment terms
  product:          '',
  dpp:              '',
  pertaminaPrice:   '',
  applyPPN:         true,
  applyPPH:         false,
  applyPBBKB:       false,
  // New fields
  applyPPNOnOAT:    false,       // 5a — PPN on freight/OAT
  showBankInfo:     true,        // 5b — show bank account in letter
  minQtyEnabled:    false,       // 5c — minimum quantity toggle
  minQty:           '',          // 5c — minimum quantity value (liters)
  pbbkbIncludedNote: false,      // 5f — note: PBBKB sudah termasuk harga jual
  //
  computerGenerated: false,
  lossRate:         0.3,
  revisionNo:       0,
  refContract:      '',
  transportSites:   [],
  skipOATKeterangan: false,
  notes:            '',
  approvalStatus:   'draft',
  approvalHistory:  [],
});

export default function OfferingLetter() {
  const { appData, user, userRole } = useApp();
  const [letters,      setLetters]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState('list'); // 'list' | 'form'
  const [showApproval, setShowApproval] = useState(null);
  const [form,         setForm]         = useState(null);
  const [editingId,    setEditingId]    = useState(null);
  const [saving,       setSaving]       = useState(false);

  const clients  = appData?.clients          || [];
  const banks    = appData?.banks            || (appData?.banking ? [{ ...appData.banking, id: '0' }] : []);
  const products = appData?.products         || [];
  const provs    = appData?.pbbkbProvinces   || [];
  const rates    = appData?.rates            || {};
  const co       = appData?.headOffice       || appData?.company || {};
  const chain    = getChain(appData?.settings, 'ol');
  const nextSeq  = (appData?.counters?.ol || 0) + 1;

  useEffect(() => {
    fetchCollection(OLS_REF()).then(l => {
      setLetters(l);
      setLoading(false);
      // Auto-open new letter form if arriving from Calculator
      if (sessionStorage.getItem('calcToOL')) {
        setTimeout(() => openNew(), 50);
      }
    });
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  const setClient = (c) => setForm(p => ({
    ...p,
    clientId:      c.id || '',
    clientName:    c.name || '',
    clientCode:    c.code || '',
    clientAddress: c.address || '',
    clientNPWP:    c.npwp || '',
    clientTOP:     c.top ? parseInt(c.top) : p.clientTOP,
  }));

  const addSite    = () => setForm(p => ({ ...p, transportSites: [...(p.transportSites || []), { id: Date.now().toString(), name: '', oatRate: '' }] }));
  const removeSite = i  => setForm(p => ({ ...p, transportSites: p.transportSites.filter((_, idx) => idx !== i) }));
  const setSite    = (i, k, v) => setForm(p => {
    const s = [...p.transportSites]; s[i] = { ...s[i], [k]: v }; return { ...p, transportSites: s };
  });

  // ── Derived values ────────────────────────────────────────────────────────────
  const ppnRate   = n(rates.ppn)  / 100;
  const pphRate   = n(rates.pph)  / 100;
  const prov      = provs.find(p => p.name === form?.province);
  const pbbkbRate = (form?.applyPBBKB && prov) ? n(prov.rate) / 100 : 0;
  const dpp       = n(form?.dpp);
  const ppnAmt    = form?.applyPPN    ? dpp * ppnRate   : 0;
  const pphAmt    = form?.applyPPH    ? dpp * pphRate   : 0;
  const pbbkbAmt  = pbbkbRate > 0     ? dpp * pbbkbRate : 0;
  const totalPerL = dpp + ppnAmt + pbbkbAmt;

  // Doc number preview
  const previewDocNumber = () => {
    if (!form) return '';
    const d = new Date(form.olDate);
    return buildSPHNumber(form.seqOverride || nextSeq, form.clientCode, d.getMonth() + 1, d.getFullYear());
  };

  // ── Open form ─────────────────────────────────────────────────────────────────
  const openNew = () => {
    const base = INIT(nextSeq);
    const calcPrefill = sessionStorage.getItem('calcToOL');
    if (calcPrefill) {
      try {
        const { dpp, product, period } = JSON.parse(calcPrefill);
        sessionStorage.removeItem('calcToOL');
        setForm({ ...base, dpp: dpp||'', product: product||'', period: period||base.period });
      } catch { setForm(base); }
    } else {
      setForm(base);
    }
    setEditingId(null);
    setView('form');
  };

  const openEdit = (ol) => {
    setForm({ ...INIT(ol.seq || nextSeq), ...ol });
    setEditingId(ol.id);
    setView('form');
  };

  const cancelForm = () => { setView('list'); setEditingId(null); setForm(null); };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.clientName) return;
    setSaving(true);
    try {
      const d         = new Date(form.olDate);
      const seq       = parseInt(form.seqOverride) || nextSeq;
      const docNumber = buildSPHNumber(seq, form.clientCode, d.getMonth() + 1, d.getFullYear());

      if (editingId) {
        // Update existing — just patch, don't touch counter
        const { setDoc: _s, ...rest } = form; // strip any stray fields
        const { default: _d, ...cleanForm } = { ...form };
        await import('firebase/firestore').then(({ updateDoc, doc: fdoc }) =>
          updateDoc(fdoc(OLS_REF(), editingId), { ...form, docNumber, updatedAt: Date.now() })
        );
      } else {
        // New letter — atomic: set counter + create doc
        await runTransaction(db, async (tx) => {
          const dataRef  = DATA_REF();
          const dataSnap = await tx.get(dataRef);
          const current  = dataSnap.data()?.counters?.ol || 0;
          const newCount = Math.max(current, seq);

          const newRef = doc(OLS_REF());
          tx.update(dataRef, { 'counters.ol': newCount });
          tx.set(newRef, { ...form, docNumber, seq, createdAt: Date.now() });
        });
      }

      setLetters(await fetchCollection(OLS_REF()));
      setView('list');
      setEditingId(null);
      setForm(null);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!canDelete(userRole) || !confirm('Hapus surat penawaran ini?')) return;
    await deleteSubDoc(OLS_REF(), id);
    setLetters(l => l.filter(x => x.id !== id));
  };

  // ── Approval handlers ─────────────────────────────────────────────────────────
  const handleSubmit = async (ol) => {
    setSaving(true);
    try {
      await applyApprovalDirect(OLS_REF(), ol.id, ol.approvalHistory, {
        action: 'submit', nextApprovalStatus: firstPending(chain), role: userRole, email: user.email, note: '',
      });
      setLetters(await fetchCollection(OLS_REF())); setShowApproval(null);
    } finally { setSaving(false); }
  };

  const handleApprove = async (ol, note) => {
    setSaving(true);
    try {
      await applyApprovalDirect(OLS_REF(), ol.id, ol.approvalHistory, {
        action: 'approve', nextApprovalStatus: nextStatus(chain, ol.approvalStatus), role: userRole, email: user.email, note,
      });
      setLetters(await fetchCollection(OLS_REF())); setShowApproval(null);
    } finally { setSaving(false); }
  };

  const handleReject = async (ol, note) => {
    setSaving(true);
    try {
      await applyApprovalDirect(OLS_REF(), ol.id, ol.approvalHistory, {
        action: 'reject', nextApprovalStatus: 'rejected', role: userRole, email: user.email, note,
      });
      setLetters(await fetchCollection(OLS_REF())); setShowApproval(null);
    } finally { setSaving(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Print in new window
  // ─────────────────────────────────────────────────────────────────────────────
  const printInNewWindow = (ol, lang = 'id') => {
    // Merge banks into company so generateOLHtml can find them
    const coWithBanks = { ...co, banks };
    // Expose generator on window so the print window's toggle can call back
    window._gppGenerateOL = (olDoc, l) => generateOLHtml(olDoc, coWithBanks, rates, provs, l);
    const html = generateOLHtml(ol, coWithBanks, rates, provs, lang);
    const win = window.open('', '_blank', 'width=960,height=800,scrollbars=yes');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
  };
  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Approval modal
  // ─────────────────────────────────────────────────────────────────────────────
  const ApprovalModal = showApproval && (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-800">{showApproval.docNumber}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{showApproval.clientName} · {showApproval.period}</p>
          </div>
          <button onClick={() => setShowApproval(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5">
          <ApprovalPanel
            doc={showApproval} docType="ol" chain={chain}
            userRole={userRole} userEmail={user?.email}
            onSubmit={() => handleSubmit(showApproval)}
            onApprove={note => handleApprove(showApproval, note)}
            onReject={note  => handleReject(showApproval, note)}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Form (full page)
  // ─────────────────────────────────────────────────────────────────────────────
  if (view === 'form' && form) return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden pt-14 md:pt-0">
      {/* Form header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 no-print">
        <div className="flex items-center gap-3">
          <button onClick={cancelForm} className="text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
            ← Kembali
          </button>
          <span className="text-gray-300">|</span>
          <h1 className="text-base font-bold text-gray-800">
            {editingId ? 'Edit Surat Penawaran' : 'Surat Penawaran Baru'}
          </h1>
          {previewDocNumber() && (
            <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
              {previewDocNumber()}
            </span>
          )}
        </div>
        <button onClick={save} disabled={saving || !form.clientName}
          className="bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saving ? '⏳ Menyimpan…' : editingId ? '💾 Simpan Perubahan' : '📄 Buat Surat'}
        </button>
      </div>

      {/* Form body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Column 1: Letter Details ── */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Letter Details</h2>

                {/* SEQ — editable */}
                <div className="mb-4">
                  <Lbl>Sequence No.</Lbl>
                  <div className="flex items-center gap-2">
                    <button onClick={() => set('seqOverride')(Math.max(1, (parseInt(form.seqOverride)||1) - 1))}
                      className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 shrink-0">−</button>
                    <input type="number" min={1} value={form.seqOverride}
                      onChange={e => set('seqOverride')(parseInt(e.target.value) || 1)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                    <button onClick={() => set('seqOverride')((parseInt(form.seqOverride)||1) + 1)}
                      className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 shrink-0">+</button>
                    <span className="text-xs text-gray-400 shrink-0">next: {nextSeq}</span>
                  </div>
                </div>

                {/* Client */}
                <div className="mb-3">
                  <Lbl>Client</Lbl>
                  <select className={sel} value={form.clientId}
                    onChange={e => {
                      const c = clients.find(x => (x.id || x.name) === e.target.value);
                      if (c) setClient(c);
                    }}>
                    <option value="">— Pilih client —</option>
                    {clients.map((c, i) => (
                      <option key={i} value={c.id || c.name}>{c.name}{c.code ? ` (${c.code})` : ''}</option>
                    ))}
                  </select>
                  {form.clientName && (
                    <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2 text-xs">
                      <p className="font-semibold text-blue-800">{form.clientName}</p>
                      {form.clientCode && <p className="text-blue-500 font-mono">Kode: {form.clientCode}</p>}
                      {form.clientAddress && (
                        <p className="text-blue-600 mt-0.5">
                          {form.clientAddress.split('\n').map((l,i) => <span key={i}>{i>0?', ':''}{l}</span>)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Bank */}
                <div className="mb-3">
                  <Lbl>Bank Account</Lbl>
                  <select className={sel} value={form.bankId} onChange={e => set('bankId')(e.target.value)}>
                    <option value="">— Pilih rekening —</option>
                    {banks.map((b, i) => (
                      <option key={i} value={b.id || String(i)}>
                        {b.bankName} — {b.accountNo}{b.isPrimary ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Period */}
                <div className="mb-3">
                  <Lbl>Period</Lbl>
                  <input type="text" value={form.period} onChange={e => set('period')(e.target.value)}
                    className={inp} placeholder="1 - 14 Mei 2026"/>
                </div>

                {/* Letter Date */}
                <div className="mb-3">
                  <Lbl>Letter Date</Lbl>
                  <DateInput value={form.olDate} onChange={set('olDate')} className={inp}/>
                </div>

                {/* Revision No */}
                <div className="mb-3">
                  <Lbl>Revision No.</Lbl>
                  <input type="number" min={0} value={form.revisionNo}
                    onChange={e => set('revisionNo')(e.target.value)} className={inp}/>
                </div>

                {/* Reference Contract */}
                <div className="mb-3">
                  <Lbl optional>Reference Contract</Lbl>
                  <input type="text" value={form.refContract}
                    onChange={e => set('refContract')(e.target.value)}
                    className={inp} placeholder="No. kontrak (opsional)"/>
                </div>

                {/* Notes */}
                <div className="mb-3">
                  <Lbl optional>Keterangan / Catatan</Lbl>
                  <textarea value={form.notes} onChange={e => set('notes')(e.target.value)}
                    rows={3} className={inp + ' resize-none'} placeholder="Catatan tambahan"/>
                </div>
              </div>

              {/* Terms of Payment */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Terms of Payment</h2>
                <div className="mb-3">
                  <select className={sel} value={form.paymentMode} onChange={e => set('paymentMode')(e.target.value)}>
                    <option value="Credit">Credit (TOP in days)</option>
                    <option value="CBD">Cash Before Delivery (CBD)</option>
                    <option value="COD">Cash On Delivery (COD)</option>
                    <option value="SKBDN">SKBDN / LC</option>
                    <option value="DP">Downpayment (DP)</option>
                    <option value="Other">Custom / Lainnya</option>
                  </select>
                </div>
                {form.paymentMode === 'Credit' && (
                  <div><Lbl>TOP (hari setelah pengiriman)</Lbl>
                    <input type="number" value={form.clientTOP} onChange={e => set('clientTOP')(e.target.value)} className={inp}/>
                  </div>
                )}
                {form.paymentMode === 'DP' && (
                  <div><Lbl>Detail Downpayment</Lbl>
                    <input type="text" value={form.paymentOther||''} onChange={e => set('paymentOther')(e.target.value)}
                      className={inp} placeholder="e.g. DP 30% di muka, sisa H+14 setelah pengiriman"/>
                  </div>
                )}
                {form.paymentMode === 'SKBDN' && (
                  <div><Lbl>Detail SKBDN / LC</Lbl>
                    <input type="text" value={form.paymentOther||''} onChange={e => set('paymentOther')(e.target.value)}
                      className={inp} placeholder="e.g. SKBDN at sight, cover 100% nilai transaksi"/>
                  </div>
                )}
                {form.paymentMode === 'Other' && (
                  <div><Lbl>Syarat Pembayaran (bebas)</Lbl>
                    <input type="text" value={form.paymentOther||''} onChange={e => set('paymentOther')(e.target.value)}
                      className={inp} placeholder="Tuliskan syarat pembayaran"/>
                  </div>
                )}
              </div>

              {/* Additional Options */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Additional Options</h2>
                <div className="space-y-3">
                  {/* 5a — PPN on OAT */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.applyPPNOnOAT||false} onChange={e => set('applyPPNOnOAT')(e.target.checked)} className="w-4 h-4 rounded accent-blue-600"/>
                    <div><p className="text-sm text-gray-700 font-medium">Apply PPN 11% on OAT / Freight</p>
                      <p className="text-xs text-gray-400">Check if freight cost is subject to VAT</p></div>
                  </label>
                  {/* 5b — Bank info */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.showBankInfo !== false} onChange={e => set('showBankInfo')(e.target.checked)} className="w-4 h-4 rounded accent-blue-600"/>
                    <div><p className="text-sm text-gray-700 font-medium">Show Bank Account in Letter</p>
                      <p className="text-xs text-gray-400">Includes payment bank details in the quotation</p></div>
                  </label>
                  {/* 5c — Min quantity */}
                  <div className="border-t pt-3">
                    <label className="flex items-center gap-3 cursor-pointer mb-2">
                      <input type="checkbox" checked={form.minQtyEnabled||false} onChange={e => set('minQtyEnabled')(e.target.checked)} className="w-4 h-4 rounded accent-blue-600"/>
                      <div><p className="text-sm text-gray-700 font-medium">Minimum Order Quantity</p>
                        <p className="text-xs text-gray-400">Show minimum volume requirement in letter</p></div>
                    </label>
                    {form.minQtyEnabled && (
                      <div className="ml-7">
                        <Lbl>Minimum Quantity (Liter)</Lbl>
                        <input type="number" value={form.minQty||''} onChange={e => set('minQty')(e.target.value)}
                          className={inp} placeholder="e.g. 100000"/>
                      </div>
                    )}
                  </div>
                  {/* 5f — PBBKB included note */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.pbbkbIncludedNote||false} onChange={e => set('pbbkbIncludedNote')(e.target.checked)} className="w-4 h-4 rounded accent-blue-600"/>
                    <div><p className="text-sm text-gray-700 font-medium">PBBKB sudah termasuk harga jual</p>
                      <p className="text-xs text-gray-400">Tampilkan catatan bahwa PBBKB sudah di-include (non-WAPU area)</p></div>
                  </label>
                </div>
              </div>

              {/* Options */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Opsi Dokumen</h2>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.computerGenerated}
                      onChange={e => set('computerGenerated')(e.target.checked)}
                      className="rounded w-4 h-4 accent-blue-600"/>
                    <div>
                      <p className="text-sm text-gray-700 font-medium">Computer Generated — No Signature Required</p>
                      <p className="text-xs text-gray-400">Tanda tangan tidak dicetak pada surat</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.skipOATKeterangan||false}
                      onChange={e => set('skipOATKeterangan')(e.target.checked)}
                      className="rounded w-4 h-4 accent-blue-600"/>
                    <div>
                      <p className="text-sm text-gray-700 font-medium">Skip OAT descriptions in Keterangan</p>
                      <p className="text-xs text-gray-400">Hanya tampilkan tabel OAT, tanpa deskripsi teks</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* ── Column 2: Price + Tax + OAT ── */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Price</h2>

                {/* Province (PBBKB) — needed for PBBKB checkbox */}
                <div className="mb-3">
                  <Lbl>Province (PBBKB)</Lbl>
                  <select className={sel} value={form.province} onChange={e => set('province')(e.target.value)}>
                    <option value="">— Pilih provinsi —</option>
                    {provs.map((p, i) => (
                      <option key={i} value={p.name}>{p.name} — {p.rate}%{p.registered ? ' ✓' : ''}</option>
                    ))}
                  </select>
                </div>

                {/* Fuel Type */}
                <div className="mb-3">
                  <Lbl>Fuel Type</Lbl>
                  <select className={sel} value={form.product} onChange={e => set('product')(e.target.value)}>
                    <option value="">— Pilih produk —</option>
                    {products.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
                  </select>
                </div>

                {/* DPP */}
                <div className="mb-3">
                  <Lbl>DPP / Base Price</Lbl>
                  <input type="number" value={form.dpp} onChange={e => set('dpp')(e.target.value)}
                    className={inp} placeholder="0"/>
                  <p className="text-[10px] text-gray-400 mt-0.5">IDR per Liter</p>
                </div>

                {/* Pertamina Published Price — optional */}
                <div className="mb-4">
                  <Lbl optional>Pertamina Published Price</Lbl>
                  <input type="number" value={form.pertaminaPrice}
                    onChange={e => set('pertaminaPrice')(e.target.value)}
                    className={inp} placeholder="0"/>
                  <p className="text-[10px] text-gray-400 mt-0.5">IDR per Liter</p>
                </div>

                {/* Tax cluster */}
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Pajak</p>
                  <div className="space-y-3">

                    {/* PPN */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={form.applyPPN}
                        onChange={e => set('applyPPN')(e.target.checked)}
                        className="rounded w-4 h-4 accent-blue-600"/>
                      <span className="text-sm text-gray-700 flex-1">PPN {rates.ppn || 11}%</span>
                      {form.applyPPN && dpp > 0 && (
                        <span className="font-mono text-xs text-blue-600">{fmtNum(ppnAmt)}/L</span>
                      )}
                    </label>

                    {/* PPH */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={form.applyPPH}
                        onChange={e => set('applyPPH')(e.target.checked)}
                        className="rounded w-4 h-4 accent-blue-600"/>
                      <span className="text-sm text-gray-700 flex-1">PPH {rates.pph || 0.3}%</span>
                      {form.applyPPH && dpp > 0 && (
                        <span className="font-mono text-xs text-orange-500">{fmtNum(pphAmt)}/L</span>
                      )}
                    </label>

                    {/* PBBKB — checkbox + conditional province dropdown */}
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer mb-2">
                        <input type="checkbox" checked={form.applyPBBKB}
                          onChange={e => set('applyPBBKB')(e.target.checked)}
                          className="rounded w-4 h-4 accent-blue-600"/>
                        <span className="text-sm text-gray-700 flex-1">
                          PBBKB {prov ? `${prov.rate}% — ${prov.name}` : ''}
                        </span>
                        {form.applyPBBKB && dpp > 0 && pbbkbAmt > 0 && (
                          <span className="font-mono text-xs text-green-600">{fmtNum(pbbkbAmt)}/L</span>
                        )}
                      </label>
                      {form.applyPBBKB && (
                        <div className="ml-7">
                          {provs.length === 0 ? (
                            <p className="text-xs text-red-400">Belum ada provinsi di Master Data → Corporate → Rates & PBBKB</p>
                          ) : !form.province ? (
                            <p className="text-xs text-amber-500">↑ Pilih provinsi di atas untuk menerapkan PBBKB</p>
                          ) : !prov?.registered ? (
                            <p className="text-xs text-amber-500">⚠ GPP belum terdaftar di {form.province} — PBBKB tidak dikenakan</p>
                          ) : (
                            <p className="text-xs text-green-600">✓ GPP terdaftar di {form.province} — rate {prov.rate}%</p>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Total preview */}
                {dpp > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs space-y-1.5">
                    <div className="flex justify-between text-gray-600"><span>DPP</span><span className="font-mono">{fmtNum(dpp)}</span></div>
                    {form.applyPPN   && <div className="flex justify-between text-gray-500"><span>+ PPN {rates.ppn||11}%</span><span className="font-mono">{fmtNum(ppnAmt)}</span></div>}
                    {form.applyPBBKB && pbbkbAmt > 0 && <div className="flex justify-between text-gray-500"><span>+ PBBKB {prov?.rate}%</span><span className="font-mono">{fmtNum(pbbkbAmt)}</span></div>}
                    {form.applyPPH   && <div className="flex justify-between text-orange-500"><span>PPH {rates.pph||0.3}% (beban pembeli)</span><span className="font-mono">{fmtNum(pphAmt)}</span></div>}
                    <div className="flex justify-between font-bold text-blue-700 border-t border-blue-200 pt-1.5">
                      <span>Total / L</span><span className="font-mono">{fmtNum(totalPerL)}</span>
                    </div>
                  </div>
                )}

                {/* Loss Tolerance */}
                <div className="mt-4">
                  <Lbl>Loss Tolerance (%)</Lbl>
                  <input type="number" step="0.1" value={form.lossRate}
                    onChange={e => set('lossRate')(e.target.value)} className={inp}/>
                </div>
              </div>

              {/* Transport Sites (OAT) */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest">Transport Sites (OAT)</h2>
                  <button onClick={addSite}
                    className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium">
                    + Add Site
                  </button>
                </div>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={form.skipOATKeterangan || false}
                    onChange={e => set('skipOATKeterangan')(e.target.checked)}
                    className="rounded accent-blue-600"/>
                  <span className="text-xs text-gray-500">Skip OAT descriptions in Keterangan (show table only)</span>
                </label>
                {(form.transportSites || []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No transport sites — add if applicable</p>
                ) : (
                  <div className="space-y-2">
                    {form.transportSites.map((site, i) => (
                      <div key={site.id || i} className="flex items-center gap-2">
                        <input type="text" value={site.name} onChange={e => setSite(i, 'name', e.target.value)}
                          placeholder="Nama lokasi / tongkang"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                        <input type="number" value={site.oatRate} onChange={e => setSite(i, 'oatRate', e.target.value)}
                          placeholder="OAT IDR/L"
                          className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"/>
                        <button onClick={() => removeSite(i)} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: List view
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      {ApprovalModal}

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Surat Penawaran</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Offering Letters · SEQ → next: <b className="text-blue-600">{nextSeq}</b>
          </p>
        </div>
        <button onClick={openNew}
          className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800">
          + New Letter
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-5">
        {loading ? (
          <p className="text-gray-400 text-sm p-8">Memuat…</p>
        ) : letters.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📄</p>
            <p className="text-sm">Belum ada surat penawaran.</p>
            <button onClick={openNew} className="mt-3 text-xs text-blue-600 hover:underline">+ Buat Baru</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['No. Surat', 'Tanggal', 'Client', 'Periode', 'DPP/L', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {letters.map(ol => {
                  const m = statusMeta(ol.approvalStatus);
                  return (
                    <tr key={ol.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3 font-mono text-blue-600 font-semibold text-xs whitespace-nowrap">
                        {ol.docNumber}
                        {ol.revisionNo > 0 && <span className="ml-1 text-orange-500 text-[10px]">Rev.{ol.revisionNo}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(ol.olDate)}</td>
                      <td className="px-4 py-3 font-medium text-gray-700 max-w-[180px] truncate">{ol.clientName}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{ol.period}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-700">
                        {ol.dpp ? fmtNum(ol.dpp) : '–'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${m.badge}`}>{m.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setShowApproval(ol)}
                            className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded hover:bg-blue-100 whitespace-nowrap">
                            Approval
                          </button>
                          {isEditable(ol.approvalStatus) && (
                            <button onClick={() => openEdit(ol)}
                              className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100">
                              Edit
                            </button>
                          )}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => printInNewWindow(ol, 'id')}
                              className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100" title="Print Bahasa Indonesia">
                              🖨️ ID
                            </button>
                            <button onClick={() => printInNewWindow(ol, 'en')}
                              className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100" title="Print English">
                              🖨️ EN
                            </button>
                          </div>
                          {canDelete(userRole) && (
                            <button onClick={() => remove(ol.id)}
                              className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-2 py-1 rounded hover:bg-red-100">
                              Del
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate complete self-contained HTML for print window
// ─────────────────────────────────────────────────────────────────────────────
function generateOLHtml(data, company, rates, provs, lang = 'id') {
  const isEN = lang === 'en';
  const fmtNum = (v) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
  const fmtDateFull = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T12:00:00');
    const months_id = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const months_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return isEN
      ? `${d.getDate()} ${months_en[d.getMonth()]} ${d.getFullYear()}`
      : `${d.getDate()} ${months_id[d.getMonth()]} ${d.getFullYear()}`;
  };

  const ppnRate  = (parseFloat(rates?.ppn) || 11) / 100;
  const pphRate  = (parseFloat(rates?.pph) || 0.3) / 100;
  const prov     = provs.find(p => p.name === data.province);
  const pbbkbR   = (data.applyPBBKB && prov) ? parseFloat(prov.rate) / 100 : 0;
  const dpp      = parseFloat(data.dpp) || 0;
  const ppnAmt   = data.applyPPN  ? dpp * ppnRate  : 0;
  const pphAmt   = data.applyPPH  ? dpp * pphRate  : 0;
  const pbbkbAmt = pbbkbR > 0     ? dpp * pbbkbR   : 0;
  const totalPerL = dpp + ppnAmt + pbbkbAmt;

  const banks = company.banks || [];
  const bank  = data.bankId
    ? banks.find(b => b.id === data.bankId || String(b.id) === String(data.bankId)) || banks[0] || {}
    : banks.find(b => b.isPrimary) || banks[0] || {};

  const addrLines = (data.clientAddress || '').split('\n').filter(Boolean);
  const isDraft   = data.approvalStatus !== 'approved';

  // Payment label
  const payLabel = () => {
    const t = data.paymentMode;
    if (t === 'Credit') return isEN
      ? `Net ${data.clientTOP || 45} days after delivery`
      : `${data.clientTOP || 45} hari setelah pengiriman`;
    if (t === 'CBD') return isEN ? 'Cash Before Delivery (CBD)' : 'Tunai Sebelum Pengiriman (CBD)';
    if (t === 'COD') return isEN ? 'Cash On Delivery (COD)'     : 'Tunai Saat Pengiriman (COD)';
    if (t === 'SKBDN') return (data.paymentOther ? data.paymentOther + ' — ' : '') + 'SKBDN / LC';
    if (t === 'DP')    return data.paymentOther || (isEN ? 'Downpayment arrangement' : 'Pembayaran dengan uang muka');
    return data.paymentOther || t;
  };

  // OAT PPN
  const oatRows = (data.transportSites || []).map(s => {
    const oat = parseFloat(s.oatRate) || 0;
    const ppnOAT = (data.applyPPNOnOAT && data.applyPPN) ? oat * ppnRate : 0;
    return { ...s, oat, ppnOAT, total: oat + ppnOAT };
  });

  const T = {
    title:     isEN ? 'PRICE QUOTATION'          : 'SURAT PENAWARAN HARGA',
    to:        isEN ? 'Attention:'               : 'Kepada Yth,',
    re:        isEN ? 'Subject'                  : 'Perihal',
    period:    isEN ? 'Pricing Period'           : 'Periode',
    ref:       isEN ? 'Contract Ref.'            : 'Ref. Kontrak',
    intro:     isEN
      ? `Dear Sir / Madam, we are pleased to submit our price quotation for ${data.product} for the period of ${data.period} as follows:`
      : `Dengan hormat, bersama ini kami sampaikan penawaran harga ${data.product} untuk periode ${data.period} sebagai berikut:`,
    hdpp:      isEN ? 'Base Price (Tax Base)'    : 'Harga Dasar Pengenaan Pajak',
    hppn:      isEN ? `VAT ${rates?.ppn||11}%`   : `PPN ${rates?.ppn||11}%`,
    hpbbkb:    isEN ? `Fuel Tax (PBBKB) ${prov?.rate||''}%` : `PBBKB ${prov?.rate||''}% — ${data.province}`,
    htotal:    isEN ? 'TOTAL PRICE / LITRE'      : 'TOTAL HARGA / LITER',
    noteBase:  isEN ? 'Base selling price excl. tax' : 'Harga jual sebelum pajak',
    notePPN:   isEN ? 'Value Added Tax (VAT)'    : 'Pajak Pertambahan Nilai',
    notePBBKB: isEN ? 'Motor Vehicle Fuel Tax'   : 'Pajak Bahan Bakar Kend. Bermotor',
    freight:   isEN ? 'Freight / OAT:'           : 'Biaya Transportasi / OAT:',
    freightSite: isEN ? 'Delivery Location'      : 'Lokasi Pengiriman',
    freightRate: isEN ? 'OAT (IDR/L)'            : 'OAT (IDR/L)',
    freightPPN:  isEN ? 'PPN 11%'                : 'PPN 11%',
    freightTotal:isEN ? 'Total OAT'              : 'Total OAT',
    payTerm:   isEN ? 'Terms of Payment'         : 'Syarat Pembayaran',
    pph:       isEN ? `Income Tax (PPH) ${rates?.pph||0.3}% (charged to buyer)` : `PPH ${rates?.pph||0.3}% (menjadi beban pembeli)`,
    loss:      isEN ? 'Loss Tolerance'           : 'Toleransi Susut',
    lossVal:   isEN
      ? `${data.lossRate || 0}% of delivered volume — based on valid calibrated flowmeter or other valid measurement equipment`
      : `${data.lossRate || 0}% dari volume pengiriman — berdasarkan flowmeter atau bejana ukur lainnya yang valid terkalibrasi oleh metrologi`,
    minQty:    isEN ? 'Minimum Order Quantity'   : 'Minimum Kuantitas Pesanan',
    bankTitle: isEN ? 'Payment to:'              : 'Pembayaran ditujukan ke:',
    closing:   isEN
      ? 'We hope this quotation meets your requirements. This offer is valid for the pricing period stated above. Thank you for your kind attention.'
      : 'Demikian penawaran ini kami sampaikan. Penawaran berlaku sesuai periode yang tercantum di atas. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.',
    regards:   isEN ? 'Yours sincerely,'         : 'Hormat kami,',
    director:  isEN ? 'Director'                 : 'Direktur',
    compGen:   isEN
      ? '— Computer Generated — No Signature Required — This document is electronically issued and valid without a wet signature.'
      : '— Computer Generated — No Signature Required — Dokumen ini diterbitkan secara elektronik dan sah tanpa tanda tangan basah.',
    pbbkbNote: isEN
      ? 'Note: Fuel Tax (PBBKB) is already included in the stated base price.'
      : 'Catatan: PBBKB sudah termasuk dalam harga jual yang tercantum di atas.',
  };

  const rows = [
    `<tr><td class="border px-3 py-2 font-semibold">${T.hdpp}</td><td class="border px-3 py-2 text-right font-mono font-semibold">${fmtNum(dpp)}</td><td class="border px-3 py-2 text-gray-500">${T.noteBase}</td></tr>`,
    data.applyPPN ? `<tr class="bg-gray-50"><td class="border px-3 py-2">${T.hppn}</td><td class="border px-3 py-2 text-right font-mono">${fmtNum(ppnAmt)}</td><td class="border px-3 py-2 text-gray-500">${T.notePPN}</td></tr>` : '',
    pbbkbAmt > 0  ? `<tr class="bg-gray-50"><td class="border px-3 py-2">${T.hpbbkb}</td><td class="border px-3 py-2 text-right font-mono">${fmtNum(pbbkbAmt)}</td><td class="border px-3 py-2 text-gray-500">${T.notePBBKB}</td></tr>` : '',
    `<tr class="bg-blue-50"><td class="border px-3 py-2 font-bold text-blue-900">${T.htotal}</td><td class="border px-3 py-2 text-right font-bold font-mono text-blue-900 text-base">${fmtNum(totalPerL)}</td><td class="border px-3 py-2"></td></tr>`,
  ].join('');

  const oatHtml = oatRows.length > 0 ? `
    <p style="font-weight:600;font-size:12px;margin-bottom:6px">${T.freight}</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px">
      <thead><tr style="background:#374151;color:white">
        <th style="border:1px solid #6b7280;padding:6px 10px;text-align:left">${T.freightSite}</th>
        <th style="border:1px solid #6b7280;padding:6px 10px;text-align:right">${T.freightRate}</th>
        ${data.applyPPNOnOAT && data.applyPPN ? `<th style="border:1px solid #6b7280;padding:6px 10px;text-align:right">${T.freightPPN}</th><th style="border:1px solid #6b7280;padding:6px 10px;text-align:right">${T.freightTotal}</th>` : ''}
      </tr></thead>
      <tbody>
        ${oatRows.map((s,i)=>`
          <tr style="background:${i%2===0?'white':'#f9fafb'}">
            <td style="border:1px solid #e5e7eb;padding:5px 10px">${s.name}</td>
            <td style="border:1px solid #e5e7eb;padding:5px 10px;text-align:right;font-family:monospace">${fmtNum(s.oat)}</td>
            ${data.applyPPNOnOAT && data.applyPPN ? `<td style="border:1px solid #e5e7eb;padding:5px 10px;text-align:right;font-family:monospace">${fmtNum(s.ppnOAT)}</td><td style="border:1px solid #e5e7eb;padding:5px 10px;text-align:right;font-family:monospace;font-weight:600">${fmtNum(s.total)}</td>` : ''}
          </tr>`).join('')}
      </tbody>
    </table>` : '';

  const bankHtml = (data.showBankInfo !== false) && bank.bankName ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;font-size:11px;margin-bottom:20px">
      <p style="font-weight:600;color:#374151;margin-bottom:4px">${T.bankTitle}</p>
      <p><b>${bank.bankName}</b> — ${bank.accountNo} a/n <b>${bank.accountName || company.name}</b>${bank.branch ? ` (Cab. ${bank.branch})` : ''}</p>
    </div>` : '';

  const toggleScript = `
    <div id="lang-bar" style="position:fixed;top:0;left:0;right:0;background:#1e3a8a;color:white;padding:8px 20px;display:flex;align-items:center;gap:16px;z-index:999;font-family:sans-serif;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
      <span style="font-weight:700">GPP Portal — Offering Letter Preview</span>
      <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span>Language:</span>
        <button onclick="switchLang('id')" id="btn-id" style="padding:3px 12px;border-radius:99px;border:none;cursor:pointer;font-weight:700;background:${!isEN?'white':'rgba(255,255,255,0.2)'};color:${!isEN?'#1e3a8a':'white'}">🇮🇩 ID</button>
        <button onclick="switchLang('en')" id="btn-en" style="padding:3px 12px;border-radius:99px;border:none;cursor:pointer;font-weight:700;background:${isEN?'white':'rgba(255,255,255,0.2)'};color:${isEN?'#1e3a8a':'white'}">🇬🇧 EN</button>
        <button onclick="window.print()" style="padding:4px 16px;border-radius:6px;border:none;cursor:pointer;background:#f59e0b;color:white;font-weight:700;margin-left:8px">🖨️ Print / Save PDF</button>
      </span>
    </div>
    <script>
      // Store the OL document so we can re-render without re-opening
      window._olDoc = ${JSON.stringify(data)};

      function switchLang(l) {
        // Call back to the opener window which holds the generator function
        const opener = window.opener;
        if (opener && typeof opener._gppGenerateOL === 'function') {
          const html = opener._gppGenerateOL(window._olDoc, l);
          document.open();
          document.write(html);
          document.close();
        } else {
          // Opener was closed — show fallback message
          alert('Please re-open the preview from the app to switch language.');
        }
      }
    <\/script>`;

  return `<!DOCTYPE html><html lang="${lang}"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${isDraft ? '[DRAFT] ' : ''}${data.docNumber} — ${data.clientName}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#374151; font-size:12px; line-height:1.5; background:white; }
  .page { max-width:210mm; margin:0 auto; padding:70px 20mm 15mm; }
  table { width:100%; border-collapse:collapse; }
  .border { border:1px solid #e5e7eb; }
  .font-mono { font-family:monospace; }
  .font-bold { font-weight:700; }
  .font-semibold { font-weight:600; }
  .text-right { text-align:right; }
  .bg-gray-50 { background:#f9fafb; }
  .bg-blue-50 { background:#eff6ff; }
  .text-blue-900 { color:#1e3a8a; }
  .text-gray-500 { color:#6b7280; }
  th { background:#1e3a8a; color:white; text-align:left; padding:8px 12px; font-size:11px; }
  td { padding:7px 12px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
  @media print {
    #lang-bar { display:none !important; }
    .page { padding:15mm; }
    @page { size:A4; margin:0; }
  }
</style></head><body>
${toggleScript}
<div class="page">
  ${isDraft ? `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:80px;color:rgba(220,38,38,0.12);font-weight:900;pointer-events:none;user-select:none;z-index:0">DRAFT</div>` : ''}

  <!-- Letterhead -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #1e3a8a;padding-bottom:16px;margin-bottom:20px">
    <div>
      <p style="font-weight:800;color:#1e3a8a;font-size:15px">${company.name || 'PT Global Petro Pasifik'}</p>
      <p style="color:#6b7280;font-size:10px;margin-top:2px">${company.address||''}</p>
      ${company.npwp ? `<p style="color:#6b7280;font-size:10px">NPWP: ${company.npwp}</p>` : ''}
    </div>
    <div style="text-align:right">
      <p style="font-weight:800;color:#1f2937;font-size:16px;letter-spacing:.5px">${T.title}</p>
      ${isDraft ? `<span style="font-size:10px;color:#dc2626;border:1px solid #dc2626;border-radius:4px;padding:1px 8px;display:inline-block;margin-top:2px">DRAFT</span>` : ''}
      <p style="color:#6b7280;font-size:10px;margin-top:4px">No: <b>${data.docNumber||''}</b>${data.revisionNo>0 ? ` | Rev.${data.revisionNo}` : ''}</p>
      <p style="color:#6b7280;font-size:10px">${fmtDateFull(data.olDate)}</p>
    </div>
  </div>

  <!-- Address -->
  <div style="margin-bottom:16px;font-size:11px">
    <p style="color:#9ca3af;margin-bottom:2px">${T.to}</p>
    <p style="font-weight:700;font-size:13px;color:#111827">${data.clientName||''}</p>
    ${addrLines.map(l=>`<p style="color:#4b5563">${l}</p>`).join('')}
    ${data.clientNPWP ? `<p style="color:#9ca3af;margin-top:2px">NPWP: ${data.clientNPWP}</p>` : ''}
  </div>

  <!-- Meta -->
  <table style="width:auto;margin-bottom:16px">
    <tbody style="font-size:11px">
      <tr><td style="color:#6b7280;width:120px;padding:2px 0;border:none">${T.re}</td><td style="font-weight:700;border:none;padding:2px 0">: ${isEN?'Price Quotation for':'Penawaran Harga'} ${data.product||''}</td></tr>
      <tr><td style="color:#6b7280;padding:2px 0;border:none">${T.period}</td><td style="border:none;padding:2px 0">: ${data.period||''}</td></tr>
      ${data.refContract ? `<tr><td style="color:#6b7280;padding:2px 0;border:none">${T.ref}</td><td style="border:none;padding:2px 0">: ${data.refContract}</td></tr>` : ''}
    </tbody>
  </table>

  <p style="margin-bottom:16px;font-size:11px;color:#374151;line-height:1.6">${T.intro}</p>

  <!-- Price table -->
  <table style="font-size:11px;margin-bottom:16px">
    <thead><tr>
      <th style="text-align:left;width:40%">${isEN?'Description':'Keterangan'}</th>
      <th style="text-align:right;width:25%">IDR / Liter</th>
      <th style="text-align:left">${isEN?'Notes':'Catatan'}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  ${data.pbbkbIncludedNote ? `<p style="font-size:10px;color:#d97706;margin-bottom:12px;font-style:italic">* ${T.pbbkbNote}</p>` : ''}

  <!-- OAT -->
  ${oatHtml}

  <!-- Terms -->
  <div style="font-size:11px;margin-bottom:16px;line-height:1.7">
    <p><b>${T.payTerm}:</b> ${payLabel()}</p>
    ${data.applyPPH ? `<p><b>${T.pph}:</b> ${fmtNum(pphAmt)}/L</p>` : ''}
    ${data.lossRate > 0 ? `<p><b>${T.loss}:</b> ${T.lossVal}</p>` : ''}
    ${data.minQtyEnabled && data.minQty ? `<p><b>${T.minQty}:</b> ${Number(data.minQty).toLocaleString('id-ID')} Liter</p>` : ''}
    ${data.notes ? `<p style="color:#6b7280;margin-top:6px">${data.notes}</p>` : ''}
  </div>

  <!-- Bank -->
  ${bankHtml}

  <p style="font-size:11px;color:#4b5563;margin-bottom:32px;line-height:1.6">${T.closing}</p>

  <!-- Signature -->
  ${data.computerGenerated ? `
    <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;text-align:center;font-size:10px;color:#9ca3af">
      <p>${T.compGen}</p>
    </div>` : `
    <div style="display:flex;justify-content:flex-end">
      <div style="text-align:center;width:180px;font-size:11px">
        <p style="color:#6b7280">${T.regards}</p>
        <p style="font-weight:700;color:#1f2937;margin-top:2px">${company.name||'PT Global Petro Pasifik'}</p>
        <div style="margin-top:60px;border-top:1px solid #9ca3af;padding-top:4px">
          <p style="color:#6b7280">${T.director}</p>
        </div>
      </div>
    </div>`}

</div>
</body></html>`;
}
