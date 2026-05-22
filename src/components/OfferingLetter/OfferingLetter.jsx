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
  terbilang, toRoman,
} from '../../utils/utils.js';
import {
  getChain, firstPending, nextStatus,
  isEditable, isApproved, statusMeta, canDelete,
} from '../../utils/approvalUtils.js';
import ApprovalPanel, { StatusBadge, DraftWatermark } from '../Layout/ApprovalPanel.jsx';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
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
  paymentOther:     '',
  product:          '',
  dpp:              '',
  pertaminaPrice:   '',
  applyPPN:         true,
  applyPPH:         false,
  applyPBBKB:       false,
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
  const [printing,     setPrinting]     = useState(null);
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
  // RENDER: Print view
  // ─────────────────────────────────────────────────────────────────────────────
  if (printing) return (
    <PrintWrapper onClose={() => setPrinting(null)}>
      <DraftWatermark status={printing.approvalStatus} />
      <OLPrint data={printing} company={co} rates={rates} provs={provs} />
    </PrintWrapper>
  );

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
                  <input type="date" value={form.olDate} onChange={e => set('olDate')(e.target.value)} className={inp}/>
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
                    <option value="Other">Lainnya (input manual)</option>
                  </select>
                </div>
                {form.paymentMode === 'Credit' && (
                  <div>
                    <Lbl>TOP (hari)</Lbl>
                    <input type="number" value={form.clientTOP} onChange={e => set('clientTOP')(e.target.value)} className={inp}/>
                  </div>
                )}
                {form.paymentMode === 'Other' && (
                  <div>
                    <Lbl>Syarat Pembayaran</Lbl>
                    <input type="text" value={form.paymentOther}
                      onChange={e => set('paymentOther')(e.target.value)}
                      className={inp} placeholder="e.g. DP 30%, sisa H+30 setelah pengiriman"/>
                  </div>
                )}
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
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{ol.olDate}</td>
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
                          <button onClick={() => setPrinting(ol)}
                            className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100">
                            🖨️
                          </button>
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
// Print view
// ─────────────────────────────────────────────────────────────────────────────
function OLPrint({ data, company, rates, provs }) {
  const ppnRate  = (parseFloat(rates?.ppn) || 11) / 100;
  const pphRate  = (parseFloat(rates?.pph) || 0.3) / 100;
  const prov     = provs.find(p => p.name === data.province);
  const pbbkbR   = (data.applyPBBKB && prov) ? parseFloat(prov.rate) / 100 : 0;
  const dpp      = parseFloat(data.dpp) || 0;
  const ppnAmt   = data.applyPPN    ? dpp * ppnRate : 0;
  const pphAmt   = data.applyPPH    ? dpp * pphRate : 0;
  const pbbkbAmt = pbbkbR > 0       ? dpp * pbbkbR  : 0;
  const totalPerL = dpp + ppnAmt + pbbkbAmt;

  const banks    = company.banks || [];
  const bank     = data.bankId
    ? banks.find(b => b.id === data.bankId || String(b.id) === String(data.bankId)) || banks[0] || {}
    : banks.find(b => b.isPrimary) || banks[0] || {};

  const addrLines = (data.clientAddress || '').split('\n').filter(Boolean);

  return (
    <div className="bg-white font-sans text-sm" style={{ minHeight: '297mm', padding: '15mm' }}>
      {/* Letterhead */}
      <div className="flex items-start justify-between mb-6 border-b-2 border-blue-900 pb-4">
        <div className="flex items-center gap-4">
          <img src={logo} alt="GPP" className="w-16 h-16 object-contain"/>
          <div>
            <p className="font-bold text-blue-900 text-base">{company.name || 'PT Global Petro Pasifik'}</p>
            <p className="text-gray-500 text-xs">{company.address}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-800 text-lg">SURAT PENAWARAN HARGA</p>
          {!isApproved(data.approvalStatus) && (
            <span className="inline-block text-[10px] text-red-500 border border-red-300 rounded px-2 py-0.5 mt-0.5">DRAFT</span>
          )}
          <p className="text-xs text-gray-500 mt-1">No: <b>{data.docNumber}</b></p>
          <p className="text-xs text-gray-500">{formatDateID(data.olDate)}</p>
          {data.revisionNo > 0 && <p className="text-xs text-orange-500">Revisi ke-{data.revisionNo}</p>}
        </div>
      </div>

      {/* Client address block */}
      <div className="mb-5 text-xs">
        <p className="text-gray-400 mb-0.5">Kepada Yth,</p>
        <p className="font-bold text-gray-800 text-sm">{data.clientName}</p>
        {addrLines.map((line, i) => <p key={i} className="text-gray-600">{line}</p>)}
        {data.clientNPWP && <p className="text-gray-400 mt-0.5">NPWP: {data.clientNPWP}</p>}
      </div>

      {/* Meta table */}
      <table className="mb-5 text-xs">
        <tbody>
          <tr><td className="text-gray-500 w-28 pr-2 align-top">Perihal</td><td className="font-bold">: Penawaran Harga {data.product}</td></tr>
          <tr><td className="text-gray-500 pr-2">Periode</td><td>: {data.period}</td></tr>
          {data.refContract && <tr><td className="text-gray-500 pr-2">Ref. Kontrak</td><td>: {data.refContract}</td></tr>}
        </tbody>
      </table>

      <p className="mb-4 text-xs text-gray-700 leading-relaxed">
        Dengan hormat, bersama ini kami sampaikan penawaran harga {data.product} untuk periode {data.period} sebagai berikut:
      </p>

      {/* Price table */}
      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="bg-blue-900 text-white">
            <th className="border border-blue-700 px-3 py-2 text-left">Keterangan</th>
            <th className="border border-blue-700 px-3 py-2 text-right w-36">IDR / Liter</th>
            <th className="border border-blue-700 px-3 py-2 text-left">Catatan</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-white">
            <td className="border border-gray-200 px-3 py-1.5 font-semibold">DPP / Harga Dasar</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right font-mono font-semibold">{fmtNum(dpp)}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-gray-500">Harga jual sebelum pajak</td>
          </tr>
          {data.applyPPN && (
            <tr className="bg-gray-50">
              <td className="border border-gray-200 px-3 py-1.5">PPN {rates?.ppn || 11}%</td>
              <td className="border border-gray-200 px-3 py-1.5 text-right font-mono">{fmtNum(ppnAmt)}</td>
              <td className="border border-gray-200 px-3 py-1.5 text-gray-500">Pajak Pertambahan Nilai</td>
            </tr>
          )}
          {pbbkbAmt > 0 && (
            <tr className="bg-gray-50">
              <td className="border border-gray-200 px-3 py-1.5">PBBKB {prov?.rate}% — {data.province}</td>
              <td className="border border-gray-200 px-3 py-1.5 text-right font-mono">{fmtNum(pbbkbAmt)}</td>
              <td className="border border-gray-200 px-3 py-1.5 text-gray-500">Pajak Bahan Bakar Kend. Bermotor</td>
            </tr>
          )}
          <tr className="bg-blue-50">
            <td className="border border-gray-200 px-3 py-2 font-bold text-blue-900">TOTAL HARGA / LITER</td>
            <td className="border border-gray-200 px-3 py-2 text-right font-bold font-mono text-blue-900 text-sm">{fmtNum(totalPerL)}</td>
            <td className="border border-gray-200 px-3 py-2"/>
          </tr>
        </tbody>
      </table>

      {/* OAT table */}
      {(data.transportSites || []).length > 0 && (
        <div className="mb-4">
          <p className="font-semibold text-xs text-gray-700 mb-2">Biaya Transportasi / OAT:</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-700 text-white">
                <th className="border border-gray-600 px-3 py-1.5 text-left">Lokasi Pengiriman</th>
                <th className="border border-gray-600 px-3 py-1.5 text-right w-32">OAT (IDR/L)</th>
              </tr>
            </thead>
            <tbody>
              {data.transportSites.map((site, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border border-gray-200 px-3 py-1.5">{site.name}</td>
                  <td className="border border-gray-200 px-3 py-1.5 text-right font-mono">{fmtNum(site.oatRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Terms */}
      <div className="text-xs space-y-1 mb-5">
        <p><b>Syarat Pembayaran:</b> {paymentLabel(data)}</p>
        {data.applyPPH && <p><b>PPH {rates?.pph || 0.3}%:</b> {fmtNum(pphAmt)}/L (menjadi beban pembeli)</p>}
        {data.lossRate > 0 && <p><b>Toleransi Susut:</b> {data.lossRate}% dari volume pengiriman</p>}
        {data.notes && <p className="text-gray-500 mt-2">{data.notes}</p>}
      </div>

      {/* Bank */}
      {(bank.bankName || bank.accountNo) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs mb-6">
          <p className="font-semibold text-gray-700 mb-1">Pembayaran ditujukan ke:</p>
          <p>
            <b>{bank.bankName}</b> — {bank.accountNo} a/n <b>{bank.accountName}</b>
            {bank.branch ? ` (Cab. ${bank.branch})` : ''}
          </p>
        </div>
      )}

      <p className="text-xs text-gray-600 mb-8 leading-relaxed">
        Demikian penawaran ini kami sampaikan. Penawaran berlaku sesuai periode yang tercantum di atas.
        Atas perhatian dan kerjasamanya kami ucapkan terima kasih.
      </p>

      {/* Signatures */}
      {data.computerGenerated ? (
        <div className="border border-gray-200 rounded-lg px-4 py-3 text-xs text-center text-gray-400">
          <p className="font-semibold">— Computer Generated — No Signature Required —</p>
          <p className="mt-0.5">Dokumen ini diterbitkan secara elektronik dan sah tanpa tanda tangan basah.</p>
        </div>
      ) : (
        <div className="flex justify-end mt-4">
          <div className="text-center w-52 text-xs">
            <p className="text-gray-500">Hormat kami,</p>
            <p className="font-semibold text-gray-800 mt-0.5">{company.name || 'PT Global Petro Pasifik'}</p>
            <div className="mt-16 border-t border-gray-400">
              <p className="mt-1 text-gray-500">Direktur</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
