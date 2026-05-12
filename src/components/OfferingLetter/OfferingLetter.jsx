import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc, OLS_REF, applyApprovalDirect } from '../../firebase.js';
import { today, autoPeriod, buildSPHNumber, formatDateID, terbilang, toRoman } from '../../utils/utils.js';
import { getChain, firstPending, nextStatus, isEditable, isApproved, statusMeta, canDelete } from '../../utils/approvalUtils.js';
import ApprovalPanel, { StatusBadge, DraftWatermark } from '../Layout/ApprovalPanel.jsx';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtIDR2 = n => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(n)||0);
const fmtNum  = (n, d=2) => new Intl.NumberFormat('id-ID', { minimumFractionDigits:d, maximumFractionDigits:d }).format(Number(n)||0);
const n = v => parseFloat(String(v||0).replace(/\./g,'').replace(',','.')) || 0;

// ─── Payment terms helper ─────────────────────────────────────────────────────
const paymentLabel = (form) => {
  if (form.paymentMode === 'CBD')   return 'Cash Before Delivery (CBD)';
  if (form.paymentMode === 'COD')   return 'Cash On Delivery (COD)';
  if (form.paymentMode === 'Other') return form.paymentOther || '–';
  return `Credit, TOP ${form.clientTOP || '–'} hari sejak tanggal pengiriman`;
};

// ─── Field components ─────────────────────────────────────────────────────────
const F = ({ label, children, sub }) => (
  <div className="mb-3">
    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
      {label}{sub && <span className="font-normal tracking-normal normal-case ml-1 text-gray-300">({sub})</span>}
    </label>
    {children}
  </div>
);
const inp = 'w-full border border-gray-700 bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent';
const sel = inp + ' cursor-pointer';

// ─── INIT ─────────────────────────────────────────────────────────────────────
const INIT = () => ({
  olDate:        today(),
  period:        autoPeriod(),
  clientId:      '',
  clientName:    '',
  clientCode:    '',
  clientAddress: '',
  clientNPWP:    '',
  bankId:        '',
  province:      '',
  paymentMode:   'Credit',
  clientTOP:     45,
  paymentOther:  '',
  product:       '',
  dpp:           '',
  pertaminaPrice:'',
  applyPPN:      true,
  applyPPH:      false,
  applyPBBKB:    false,
  lossRate:      0.3,
  revisionNo:    0,
  refContract:   '',
  transportSites: [],
  skipOATKeterangan: false,
  notes:         '',
  approvalStatus:  'draft',
  approvalHistory: [],
});

export default function OfferingLetter() {
  const { appData, user, userRole } = useApp();
  const [letters,    setLetters]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [showApproval, setShowApproval] = useState(null);
  const [printing,   setPrinting]   = useState(null);
  const [form,       setForm]       = useState(INIT());
  const [editingId,  setEditingId]  = useState(null);
  const [saving,     setSaving]     = useState(false);

  const clients  = appData?.clients         || [];
  const banks    = appData?.banks           || (appData?.banking ? [appData.banking] : []);
  const products = appData?.products        || [];
  const provs    = appData?.pbbkbProvinces  || [];
  const rates    = appData?.rates           || {};
  const co       = appData?.headOffice      || appData?.company || {};
  const chain    = getChain(appData?.settings, 'ol');

  useEffect(() => {
    fetchCollection(OLS_REF()).then(l => { setLetters(l); setLoading(false); });
  }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  const setClient = (c) => {
    setForm(p => ({
      ...p,
      clientId:      c.id || '',
      clientName:    c.name,
      clientCode:    c.code || '',
      clientAddress: c.address || '',
      clientNPWP:    c.npwp || '',
      clientTOP:     c.top ? parseInt(c.top) : p.clientTOP,
    }));
  };

  // OAT sites
  const addSite    = () => setForm(p => ({ ...p, transportSites: [...(p.transportSites||[]), { id: Date.now().toString(), name:'', oatRate:'' }] }));
  const removeSite = (i) => setForm(p => ({ ...p, transportSites: p.transportSites.filter((_,idx)=>idx!==i) }));
  const setSite    = (i,k,v) => setForm(p => {
    const s = [...p.transportSites]; s[i] = {...s[i],[k]:v}; return {...p,transportSites:s};
  });

  // Calculated values
  const ppnRate    = n(rates.ppn)     / 100;
  const pphRate    = n(rates.pph)     / 100;
  const prov       = provs.find(p => p.name === form.province);
  const pbbkbRate  = (form.applyPBBKB && prov) ? n(prov.rate) / 100 : 0;
  const dpp        = n(form.dpp);
  const ppnAmt     = form.applyPPN   ? dpp * ppnRate   : 0;
  const pphAmt     = form.applyPPH   ? dpp * pphRate   : 0;
  const pbbkbAmt   = pbbkbRate > 0   ? dpp * pbbkbRate : 0;
  const totalPerL  = dpp + ppnAmt + pbbkbAmt;

  const save = async () => {
    if (!form.clientName) return;
    setSaving(true);
    try {
      const d = new Date(form.olDate);
      if (editingId) {
        await updateSubDoc(OLS_REF(), editingId, form);
      } else {
        await createNumberedDoc('ol', OLS_REF(), form,
          seq => buildSPHNumber(seq, form.clientCode, d.getMonth()+1, d.getFullYear()));
      }
      const fresh = await fetchCollection(OLS_REF()); setLetters(fresh);
      setShowForm(false); setEditingId(null);
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!canDelete(userRole) || !confirm('Hapus surat penawaran ini?')) return;
    await deleteSubDoc(OLS_REF(), id);
    setLetters(l => l.filter(x => x.id !== id));
  };

  const openEdit = (ol) => {
    setForm({ ...INIT(), ...ol });
    setEditingId(ol.id);
    setShowForm(true);
  };

  const openNew = () => { setForm(INIT()); setEditingId(null); setShowForm(true); };

  // Approval handlers
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
      const next = nextStatus(chain, ol.approvalStatus);
      await applyApprovalDirect(OLS_REF(), ol.id, ol.approvalHistory, {
        action: 'approve', nextApprovalStatus: next, role: userRole, email: user.email, note,
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

  const nextSeq = (appData?.counters?.ol || 0) + 1;

  return (
    <div className="flex flex-col h-full bg-gray-50 pt-14 md:pt-0 overflow-hidden">
      {printing && (
        <PrintWrapper onClose={() => setPrinting(null)}>
          <DraftWatermark status={printing.approvalStatus} />
          <OLPrint data={printing} company={co} rates={rates} provs={provs} />
        </PrintWrapper>
      )}

      {/* Approval modal */}
      {showApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-bold text-gray-800">{showApproval.docNumber}</h2>
                <p className="text-xs text-gray-400">{showApproval.clientName} · {showApproval.period}</p>
              </div>
              <button onClick={() => setShowApproval(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5">
              <ApprovalPanel doc={showApproval} docType="ol" chain={chain}
                userRole={userRole} userEmail={user?.email}
                onSubmit={() => handleSubmit(showApproval)}
                onApprove={note => handleApprove(showApproval, note)}
                onReject={note => handleReject(showApproval, note)}
                saving={saving} />
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

        {/* ── Left: Letter list ── */}
        <div className="w-full lg:w-[55%] flex flex-col overflow-hidden border-r border-gray-200">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
            <div>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">Offering Letters</p>
              <p className="text-[10px] text-gray-400 mt-0.5">SEQ → next: <b>{nextSeq}</b></p>
            </div>
            <button onClick={openNew} className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              + New Letter
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-gray-400 text-sm p-6">Memuat…</p>
            ) : letters.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-2">📄</p>
                <p className="text-sm">Belum ada surat penawaran.</p>
                <button onClick={openNew} className="mt-3 text-xs text-blue-600 hover:underline">+ Buat Baru</button>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    {['No.','Tanggal','Client','Periode','DPP','Status',''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {letters.map(ol => {
                    const m = statusMeta(ol.approvalStatus);
                    return (
                      <tr key={ol.id} className="hover:bg-gray-50 group">
                        <td className="px-3 py-2.5 font-mono text-blue-600 font-semibold whitespace-nowrap">{ol.docNumber}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{ol.olDate}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-700 max-w-[140px] truncate">{ol.clientName}</td>
                        <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{ol.period}</td>
                        <td className="px-3 py-2.5 font-mono text-amber-600 font-semibold">
                          {ol.dpp ? fmtNum(ol.dpp) : '–'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.badge}`}>{m.label}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setShowApproval(ol)}
                              className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded hover:bg-blue-100 whitespace-nowrap">
                              Approval
                            </button>
                            {isEditable(ol.approvalStatus) && (
                              <button onClick={() => openEdit(ol)}
                                className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded hover:bg-gray-100">
                                Edit
                              </button>
                            )}
                            <button onClick={() => setPrinting(ol)}
                              className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded hover:bg-gray-100">
                              🖨️
                            </button>
                            {canDelete(userRole) && (
                              <button onClick={() => remove(ol.id)}
                                className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-2 py-0.5 rounded hover:bg-red-100">
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
            )}
          </div>
        </div>

        {/* ── Right: Form ── */}
        {showForm ? (
          <div className="w-full lg:w-[45%] flex flex-col overflow-hidden bg-gray-900 text-gray-100">
            {/* Form header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                {editingId ? 'Edit Surat' : 'New Letter'}
              </p>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}
                className="text-gray-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Left column of form + Right column */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-700">

                {/* Col 1: Letter Details */}
                <div className="p-5 space-y-1">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-4">Letter Details</p>

                  <F label="Client">
                    <select className={sel} value={form.clientId} onChange={e => {
                      const c = clients.find(x => x.id === e.target.value || x.name === e.target.value);
                      if (c) setClient(c); else set('clientId')(e.target.value);
                    }}>
                      <option value="">— Pilih client —</option>
                      {clients.map((c,i) => <option key={i} value={c.id||c.name}>{c.name}{c.code?` (${c.code})`:''}</option>)}
                    </select>
                    {form.clientName && (
                      <input type="text" value={form.clientName} onChange={e=>set('clientName')(e.target.value)}
                        className={inp + ' mt-1.5'} placeholder="Nama client"/>
                    )}
                  </F>

                  <F label="Bank Account">
                    <select className={sel} value={form.bankId} onChange={e => set('bankId')(e.target.value)}>
                      <option value="">— Pilih rekening —</option>
                      {banks.map((b,i) => <option key={i} value={b.id||i}>{b.bankName} — {b.accountNo}</option>)}
                    </select>
                  </F>

                  <F label="Period">
                    <input type="text" value={form.period} onChange={e=>set('period')(e.target.value)}
                      className={inp} placeholder="1 - 14 Mei 2026"/>
                  </F>

                  <F label="Letter Date">
                    <input type="date" value={form.olDate} onChange={e=>set('olDate')(e.target.value)} className={inp}/>
                  </F>

                  <F label="Province (PBBKB)">
                    <select className={sel} value={form.province} onChange={e=>set('province')(e.target.value)}>
                      <option value="">— Pilih provinsi —</option>
                      {provs.map((p,i) => <option key={i} value={p.name}>{p.name} — {p.rate}%{p.registered?' ✓':''}</option>)}
                    </select>
                  </F>

                  <F label="Terms of Payment">
                    <select className={sel} value={form.paymentMode} onChange={e=>set('paymentMode')(e.target.value)}>
                      <option value="Credit">Credit (TOP in days)</option>
                      <option value="CBD">Cash Before Delivery (CBD)</option>
                      <option value="COD">Cash On Delivery (COD)</option>
                      <option value="Other">Lainnya (input manual)</option>
                    </select>
                    {form.paymentMode === 'Credit' && (
                      <input type="number" value={form.clientTOP} onChange={e=>set('clientTOP')(e.target.value)}
                        className={inp + ' mt-1.5'} placeholder="TOP (hari)"/>
                    )}
                    {form.paymentMode === 'Other' && (
                      <input type="text" value={form.paymentOther} onChange={e=>set('paymentOther')(e.target.value)}
                        className={inp + ' mt-1.5'} placeholder="e.g. DP 30%, sisa 30 hari setelah pengiriman"/>
                    )}
                  </F>

                  <F label="Loss Tolerance" sub="%">
                    <input type="number" step="0.1" value={form.lossRate} onChange={e=>set('lossRate')(e.target.value)} className={inp}/>
                  </F>

                  <F label="Revision No.">
                    <input type="number" value={form.revisionNo} onChange={e=>set('revisionNo')(e.target.value)} className={inp}/>
                  </F>

                  <F label="Reference Contract">
                    <input type="text" value={form.refContract} onChange={e=>set('refContract')(e.target.value)}
                      className={inp} placeholder="No. kontrak (opsional)"/>
                  </F>

                  <F label="Keterangan / Catatan">
                    <textarea value={form.notes} onChange={e=>set('notes')(e.target.value)} rows={3}
                      className={inp + ' resize-none'} placeholder="Catatan tambahan"/>
                  </F>
                </div>

                {/* Col 2: Price + OAT */}
                <div className="p-5 space-y-1">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-4">Price</p>

                  <F label="Fuel Type">
                    <select className={sel} value={form.product} onChange={e=>set('product')(e.target.value)}>
                      <option value="">— Pilih produk —</option>
                      {products.map((p,i) => <option key={i} value={p.name}>{p.name}</option>)}
                    </select>
                  </F>

                  <F label="DPP / Base Price" sub="IDR/L">
                    <input type="number" value={form.dpp} onChange={e=>set('dpp')(e.target.value)} className={inp} placeholder="0"/>
                  </F>

                  <F label="Pertamina Published Price" sub="IDR/L">
                    <input type="number" value={form.pertaminaPrice} onChange={e=>set('pertaminaPrice')(e.target.value)} className={inp} placeholder="0"/>
                  </F>

                  {/* Tax checkboxes */}
                  <div className="space-y-2 py-2">
                    {[
                      ['applyPPN',  `PPN ${rates.ppn||11}%`,      ppnAmt  ],
                      ['applyPPH',  `PPH ${rates.pph||0.3}%`,     pphAmt  ],
                    ].map(([key, label, amt]) => (
                      <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={form[key]} onChange={e=>set(key)(e.target.checked)}
                          className="rounded w-4 h-4 accent-amber-400"/>
                        <span className="text-sm text-gray-300">{label}</span>
                        {form[key] && dpp > 0 && (
                          <span className="ml-auto text-xs font-mono text-amber-300">{fmtNum(amt)}/L</span>
                        )}
                      </label>
                    ))}
                    {prov && (
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={form.applyPBBKB} onChange={e=>set('applyPBBKB')(e.target.checked)}
                          className="rounded w-4 h-4 accent-amber-400"/>
                        <span className="text-sm text-gray-300">PBBKB {prov.rate}% — {form.province}</span>
                        {form.applyPBBKB && dpp > 0 && (
                          <span className="ml-auto text-xs font-mono text-amber-300">{fmtNum(pbbkbAmt)}/L</span>
                        )}
                      </label>
                    )}
                  </div>

                  {/* Total preview */}
                  {dpp > 0 && (
                    <div className="bg-gray-800 rounded-lg px-3 py-2.5 text-xs space-y-1">
                      <div className="flex justify-between text-gray-400"><span>DPP</span><span className="font-mono">{fmtNum(dpp)}</span></div>
                      {form.applyPPN   && <div className="flex justify-between text-gray-400"><span>PPN</span><span className="font-mono">{fmtNum(ppnAmt)}</span></div>}
                      {form.applyPBBKB && <div className="flex justify-between text-gray-400"><span>PBBKB</span><span className="font-mono">{fmtNum(pbbkbAmt)}</span></div>}
                      <div className="flex justify-between font-bold text-amber-300 border-t border-gray-700 pt-1">
                        <span>Total / L</span><span className="font-mono">{fmtNum(totalPerL)}</span>
                      </div>
                    </div>
                  )}

                  {/* Transport Sites (OAT) */}
                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Transport Sites</p>
                      <button onClick={addSite}
                        className="text-[10px] border border-amber-400 text-amber-400 px-2 py-1 rounded hover:bg-amber-400 hover:text-gray-900 transition-colors">
                        + Add Site
                      </button>
                    </div>
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                      <input type="checkbox" checked={form.skipOATKeterangan||false} onChange={e=>set('skipOATKeterangan')(e.target.checked)}
                        className="rounded accent-amber-400"/>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">Skip OAT descriptions in Keterangan (show table only)</span>
                    </label>
                    {(form.transportSites||[]).length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No transport sites — add if applicable</p>
                    ) : (
                      <div className="space-y-2">
                        {form.transportSites.map((site, i) => (
                          <div key={site.id||i} className="flex items-center gap-2">
                            <input type="text" value={site.name} onChange={e=>setSite(i,'name',e.target.value)}
                              placeholder="Nama lokasi / tongkang"
                              className="flex-1 border border-gray-700 bg-gray-800 text-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                            <input type="number" value={site.oatRate} onChange={e=>setSite(i,'oatRate',e.target.value)}
                              placeholder="OAT IDR/L"
                              className="w-28 border border-gray-700 bg-gray-800 text-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"/>
                            <button onClick={()=>removeSite(i)} className="text-red-400 hover:text-red-300 text-xs shrink-0">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Form footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-700 shrink-0">
              <button onClick={save} disabled={saving || !form.clientName}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {saving ? '⏳' : editingId ? '💾 Simpan Perubahan' : '+ Buat Surat'}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2.5 border border-gray-600 text-gray-300 rounded-lg text-sm hover:bg-gray-800">
                Batal
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex lg:w-[45%] items-center justify-center bg-gray-100 text-gray-400">
            <div className="text-center">
              <p className="text-4xl mb-3">📄</p>
              <p className="text-sm font-medium">Pilih surat dari daftar</p>
              <p className="text-xs mt-1">atau klik + New Letter</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Print view ───────────────────────────────────────────────────────────────
function OLPrint({ data, company, rates, provs }) {
  const ppnRate   = (parseFloat(rates?.ppn)     || 11) / 100;
  const pphRate   = (parseFloat(rates?.pph)     || 0.3) / 100;
  const prov      = provs.find(p => p.name === data.province);
  const pbbkbRate = (data.applyPBBKB && prov) ? parseFloat(prov.rate) / 100 : 0;
  const dpp       = parseFloat(data.dpp) || 0;
  const ppnAmt    = data.applyPPN    ? dpp * ppnRate    : 0;
  const pphAmt    = data.applyPPH    ? dpp * pphRate    : 0;
  const pbbkbAmt  = pbbkbRate > 0    ? dpp * pbbkbRate  : 0;
  const totalPerL = dpp + ppnAmt + pbbkbAmt;

  const bank = (() => {
    const banks = (company.banks || []);
    if (data.bankId) {
      const found = banks.find(b => b.id === data.bankId || String(b.id) === String(data.bankId));
      if (found) return found;
    }
    return banks.find(b => b.isPrimary) || banks[0] || {};
  })();

  const addressLines = (data.clientAddress || '').split('\n').filter(Boolean);

  return (
    <div className="bg-white font-sans text-sm" style={{ minHeight:'297mm', padding:'15mm' }}>
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
            <span className="inline-block text-xs text-red-500 border border-red-300 rounded px-2 py-0.5 mt-0.5">DRAFT</span>
          )}
          <p className="text-xs text-gray-500 mt-1">No: <b>{data.docNumber}</b></p>
          <p className="text-xs text-gray-500">{formatDateID(data.olDate)}</p>
          {data.revisionNo > 0 && <p className="text-xs text-orange-500">Rev. {data.revisionNo}</p>}
        </div>
      </div>

      {/* Client address block */}
      <div className="mb-5 text-xs">
        <p className="text-gray-400 mb-0.5">Kepada Yth,</p>
        <p className="font-bold text-gray-800">{data.clientName}</p>
        {addressLines.map((line, i) => <p key={i} className="text-gray-600">{line}</p>)}
        {data.clientNPWP && <p className="text-gray-400 mt-0.5">NPWP: {data.clientNPWP}</p>}
      </div>

      {/* Subject */}
      <table className="mb-5 text-xs w-full max-w-sm">
        <tbody>
          <tr><td className="text-gray-500 w-24 align-top">Perihal</td><td className="font-bold">: Penawaran Harga {data.product}</td></tr>
          <tr><td className="text-gray-500 align-top">Periode</td><td>: {data.period}</td></tr>
          {data.refContract && <tr><td className="text-gray-500">Ref. Kontrak</td><td>: {data.refContract}</td></tr>}
        </tbody>
      </table>

      {/* Body */}
      <p className="mb-4 text-xs text-gray-700 leading-relaxed">
        Dengan hormat, bersama ini kami sampaikan penawaran harga {data.product} periode {data.period} sebagai berikut:
      </p>

      {/* Price table */}
      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="bg-blue-900 text-white">
            <th className="border border-blue-700 px-3 py-2 text-left">Keterangan</th>
            <th className="border border-blue-700 px-3 py-2 text-right">IDR / Liter</th>
            <th className="border border-blue-700 px-3 py-2 text-right">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-white">
            <td className="border border-gray-200 px-3 py-2 font-semibold">DPP / Harga Dasar</td>
            <td className="border border-gray-200 px-3 py-2 text-right font-mono font-semibold">{fmtNum(dpp)}</td>
            <td className="border border-gray-200 px-3 py-2 text-gray-500">Harga jual sebelum pajak</td>
          </tr>
          {data.applyPPN && (
            <tr className="bg-gray-50">
              <td className="border border-gray-200 px-3 py-2">PPN {rates?.ppn||11}%</td>
              <td className="border border-gray-200 px-3 py-2 text-right font-mono">{fmtNum(ppnAmt)}</td>
              <td className="border border-gray-200 px-3 py-2 text-gray-500">Pajak Pertambahan Nilai</td>
            </tr>
          )}
          {pbbkbAmt > 0 && (
            <tr className="bg-gray-50">
              <td className="border border-gray-200 px-3 py-2">PBBKB {prov?.rate}% — {data.province}</td>
              <td className="border border-gray-200 px-3 py-2 text-right font-mono">{fmtNum(pbbkbAmt)}</td>
              <td className="border border-gray-200 px-3 py-2 text-gray-500">Pajak Bahan Bakar</td>
            </tr>
          )}
          <tr className="bg-blue-50">
            <td className="border border-gray-200 px-3 py-2 font-bold text-blue-900">TOTAL HARGA / LITER</td>
            <td className="border border-gray-200 px-3 py-2 text-right font-bold font-mono text-blue-900">{fmtNum(totalPerL)}</td>
            <td className="border border-gray-200 px-3 py-2"/>
          </tr>
        </tbody>
      </table>

      {/* OAT table */}
      {(data.transportSites||[]).length > 0 && (
        <div className="mb-4">
          <p className="font-semibold text-xs text-gray-700 mb-2">Biaya Transportasi (OAT):</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-700 text-white">
                <th className="border border-gray-600 px-3 py-1.5 text-left">Lokasi / Site</th>
                <th className="border border-gray-600 px-3 py-1.5 text-right">OAT (IDR/L)</th>
              </tr>
            </thead>
            <tbody>
              {data.transportSites.map((site, i) => (
                <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
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
        {data.applyPPH && <p><b>PPH {rates?.pph||0.3}%:</b> {fmtNum(pphAmt)}/L (menjadi beban pembeli)</p>}
        {data.lossRate && <p><b>Toleransi Susut:</b> {data.lossRate}% dari volume pengiriman</p>}
        {data.notes && <p className="text-gray-500 mt-2">{data.notes}</p>}
      </div>

      {/* Bank info */}
      {(bank.bankName || bank.accountNo) && (
        <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs mb-6">
          <p className="font-semibold text-gray-700 mb-1">Pembayaran ditujukan ke:</p>
          <p><b>{bank.bankName}</b> — {bank.accountNo} a/n <b>{bank.accountName}</b>
          {bank.branch ? ` (Cab. ${bank.branch})` : ''}</p>
        </div>
      )}

      <p className="text-xs text-gray-600 mb-8">
        Demikian penawaran ini kami sampaikan. Penawaran berlaku sesuai periode yang tercantum.
        Atas perhatian dan kerjasamanya kami ucapkan terima kasih.
      </p>

      {/* Signatures */}
      <div className="flex justify-between">
        <div className="text-center w-48 text-xs">
          <p className="text-gray-500">Hormat kami,</p>
          <p className="font-semibold text-gray-800 mt-0.5">{company.name}</p>
          <div className="mt-14 border-t border-gray-400"><p className="mt-1 text-gray-500">Direktur</p></div>
        </div>
        {!isApproved(data.approvalStatus) && (
          <div className="text-center w-48 text-xs self-end">
            <p className="text-gray-400 italic text-[10px]">Dokumen ini belum final</p>
          </div>
        )}
      </div>
    </div>
  );
}
