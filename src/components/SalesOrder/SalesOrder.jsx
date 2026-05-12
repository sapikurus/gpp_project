import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import {
  fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc,
  SOS_REF, STOCKS_REF, applyApprovalDirect, approveSoFinal,
} from '../../firebase.js';
import { today, formatIDR, formatDateID, toRoman } from '../../utils/utils.js';
import {
  getChain, firstPending, nextStatus, canApprove, canSubmit,
  isApproved, isEditable, statusMeta, canDelete,
} from '../../utils/approvalUtils.js';
import ApprovalPanel, { StatusBadge, DraftWatermark } from '../Layout/ApprovalPanel.jsx';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

const INIT = {
  soDate: today(), stockId: '', stockLabel: '', clientName: '', clientContact: '',
  product: '', volume: '', agreedPrice: '', paymentTerms: 'Credit',
  clientTOP: 30, deliveryProvince: '', deliveryLocation: '', notes: '',
  approvalStatus: 'draft', approvalHistory: [],
};

const PAYMENT_TERMS = ['CBD','COD','Credit'];

function buildSONumber(seq, m, y) {
  return `${String(seq).padStart(3,'0')}/SO-GPP/${toRoman(m)}/${y}`;
}

export default function SalesOrder() {
  const { appData, user, userRole } = useApp();
  const [sos, setSOs] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [form, setForm] = useState(INIT);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('Semua');

  const clients = appData?.clients || [];
  const pbbkbProvinces = appData?.pbbkbProvinces || [];
  const chain = getChain(appData?.settings, 'so');
  const co = appData?.headOffice || appData?.company || {};

  useEffect(() => {
    Promise.all([fetchCollection(SOS_REF()), fetchCollection(STOCKS_REF())])
      .then(([s, st]) => { setSOs(s); setStocks(st); setLoading(false); });
  }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  const openNew = () => { setForm(INIT); setEditing(null); setShowForm(true); };
  const openEdit = (so) => {
    if (!isEditable(so.approvalStatus)) return;
    setForm({ ...INIT, ...so }); setEditing(so.id); setShowForm(true);
  };

  const save = async () => {
    if (!form.clientName || !form.stockId) return;
    setSaving(true);
    try {
      const d = new Date(form.soDate);
      if (editing) {
        await updateSubDoc(SOS_REF(), editing, form);
      } else {
        await createNumberedDoc('so', SOS_REF(), form,
          seq => buildSONumber(seq, d.getMonth() + 1, d.getFullYear()));
      }
      setSOs(await fetchCollection(SOS_REF())); setShowForm(false);
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!canDelete(userRole) || !confirm('Hapus SO ini?')) return;
    await deleteSubDoc(SOS_REF(), id);
    setSOs(s => s.filter(x => x.id !== id));
  };

  // Approval actions
  const handleSubmit = async (so) => {
    setSaving(true);
    try {
      const histEntry = { role: userRole, action: 'submitted', by: user.email, at: Date.now(), note: '' };
      await applyApprovalDirect(SOS_REF(), so.id, so.approvalHistory, {
        action: 'submit', nextApprovalStatus: firstPending(chain),
        role: userRole, email: user.email, note: '',
      });
      setSOs(await fetchCollection(SOS_REF())); setShowDetail(null);
    } finally { setSaving(false); }
  };

  const handleApprove = async (so, note) => {
    setSaving(true);
    try {
      const next = nextStatus(chain, so.approvalStatus);
      const histEntry = { role: userRole, action: 'approved', by: user.email, at: Date.now(), note };
      if (next === 'approved') {
        // Final approval — run transaction to deduct from stock
        await approveSoFinal({ soId: so.id, soData: so, historyEntry: histEntry });
      } else {
        await applyApprovalDirect(SOS_REF(), so.id, so.approvalHistory, {
          action: 'approve', nextApprovalStatus: next,
          role: userRole, email: user.email, note,
        });
      }
      setSOs(await fetchCollection(SOS_REF())); setStocks(await fetchCollection(STOCKS_REF()));
      setShowDetail(null);
    } finally { setSaving(false); }
  };

  const handleReject = async (so, note) => {
    setSaving(true);
    try {
      await applyApprovalDirect(SOS_REF(), so.id, so.approvalHistory, {
        action: 'reject', nextApprovalStatus: 'rejected',
        role: userRole, email: user.email, note,
      });
      setSOs(await fetchCollection(SOS_REF())); setShowDetail(null);
    } finally { setSaving(false); }
  };

  const filtered = filterStatus === 'Semua' ? sos : sos.filter(s => s.approvalStatus === filterStatus);
  const statuses = ['Semua', 'draft', 'pending_manager', 'pending_director', 'approved', 'rejected'];

  const provData = pbbkbProvinces.find(p => p.name === form.deliveryProvince);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      {printing && (
        <PrintWrapper onClose={() => setPrinting(null)}>
          <DraftWatermark status={printing.approvalStatus} />
          <SOPrint data={printing} company={co} rates={appData?.rates} />
        </PrintWrapper>
      )}

      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-800">Sales Order</h1><p className="text-gray-500 text-sm mt-1">SO penjualan ke client</p></div>
        <button onClick={openNew} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800">+ SO Baru</button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? 'bg-blue-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
            {s === 'Semua' ? 'Semua' : statusMeta(s).label}
            {s !== 'Semua' && ` (${sos.filter(x => x.approvalStatus === s).length})`}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? <p className="text-gray-400 text-sm">Memuat…</p> : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">🤝</p><p className="text-gray-500">Belum ada Sales Order.</p>
          <button onClick={openNew} className="mt-4 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">+ SO Baru</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(so => {
            const stock = stocks.find(s => s.id === so.stockId);
            return (
              <div key={so.id} className="bg-white rounded-xl shadow-sm p-5 border border-transparent hover:border-blue-100 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{so.clientName}</p>
                    <p className="text-xs font-mono text-blue-500 mt-0.5">{so.docNumber}</p>
                  </div>
                  <StatusBadge status={so.approvalStatus} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-xs">
                  <div><span className="text-gray-400">Produk</span><p className="text-gray-700">{so.product||'-'}</p></div>
                  <div><span className="text-gray-400">Volume</span><p className="text-gray-700 font-semibold">{so.volume ? Number(so.volume).toLocaleString('id-ID')+' L' : '-'}</p></div>
                  <div><span className="text-gray-400">Harga</span><p className="text-gray-700 font-mono">{so.agreedPrice ? formatIDR(so.agreedPrice)+'/L' : '-'}</p></div>
                  <div><span className="text-gray-400">Terms</span><p className="text-gray-700">{so.paymentTerms} {so.clientTOP ? `(${so.clientTOP}d)` : ''}</p></div>
                  {stock && <div className="col-span-2"><span className="text-gray-400">Stok: </span><span className="text-blue-600 font-medium">{stock.label}</span></div>}
                </div>
                <div className="flex gap-2 border-t pt-3">
                  <button onClick={() => setShowDetail(so)} className="flex-1 text-sm text-blue-700 border border-blue-200 py-2 rounded-lg hover:bg-blue-50 font-medium">Detail & Approval</button>
                  <button onClick={() => setPrinting(so)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">🖨️</button>
                  {isEditable(so.approvalStatus) && <button onClick={() => openEdit(so)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">✏️</button>}
                  {canDelete(userRole) && <button onClick={() => remove(so.id)} className="px-3 py-2 border border-red-100 rounded-lg text-xs text-red-400 hover:bg-red-50">🗑️</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail / Approval modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
              <div>
                <h2 className="font-bold text-gray-800">{showDetail.docNumber}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{showDetail.clientName}</p>
              </div>
              <button onClick={() => setShowDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
                {[['Produk', so.product||'-'],['Volume', so.volume ? Number(so.volume).toLocaleString('id-ID')+' L' : '-'],
                  ['Harga', so.agreedPrice ? formatIDR(so.agreedPrice)+'/L' : '-'],['Terms', `${so.paymentTerms} ${so.clientTOP ? `(${so.clientTOP}d)` : ''}`],
                  ['Lokasi', so.deliveryLocation||'-'],['Provinsi', so.deliveryProvince||'-']
                ].map(([k,v]) => (
                  <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-medium text-gray-700">{v}</p></div>
                ))}
                {(() => { const s = showDetail; return s ? null : null; })()}
              </div>
              {/* Show stok availability warning */}
              {(() => {
                const so = showDetail;
                const stock = stocks.find(s => s.id === so.stockId);
                if (!stock) return null;
                const available = (stock.totalVolume||0) - (stock.committedVolume||0);
                const vol = parseFloat(so.volume) || 0;
                if (vol > available && !isApproved(so.approvalStatus)) {
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                      ⚠️ Volume SO ({Number(vol).toLocaleString('id-ID')} L) melebihi stok tersedia ({Number(available).toLocaleString('id-ID')} L)
                    </div>
                  );
                }
                return (
                  <div className="bg-blue-50 rounded-lg px-4 py-2 text-xs text-blue-600">
                    Stok: <b>{stock.label}</b> · Tersedia: <b>{Number(available).toLocaleString('id-ID')} L</b>
                  </div>
                );
              })()}
              <ApprovalPanel
                doc={showDetail} docType="so" chain={chain}
                userRole={userRole} userEmail={user?.email}
                onSubmit={() => handleSubmit(showDetail)}
                onApprove={(note) => handleApprove(showDetail, note)}
                onReject={(note) => handleReject(showDetail, note)}
                saving={saving}
              />
            </div>
          </div>
        </div>
      )}

      {/* New/Edit form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800 text-lg">{editing ? 'Edit SO' : 'Sales Order Baru'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-gray-500 mb-1">Tanggal SO</label>
                  <input type="date" value={form.soDate} onChange={e => set('soDate')(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>

                <div><label className="block text-xs text-gray-500 mb-1">Stok *</label>
                  <select value={form.stockId} onChange={e => {
                    const s = stocks.find(x => x.id === e.target.value);
                    set('stockId')(e.target.value);
                    if (s) { set('stockLabel')(s.label); set('product')(s.product||''); }
                  }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                    <option value="">— Pilih Stok —</option>
                    {stocks.filter(s=>s.status==='Confirmed').map(s => {
                      const avail = (s.totalVolume||0) - (s.committedVolume||0);
                      return <option key={s.id} value={s.id}>{s.label} ({Number(avail).toLocaleString('id-ID')} L tersedia)</option>;
                    })}
                  </select>
                </div>

                <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Client *</label>
                  <select onChange={e => { const c = clients.find(x => x.name === e.target.value); if (c) { set('clientName')(c.name); set('clientContact')(c.contact||''); set('clientTOP')(c.top||30); } }} defaultValue="" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white mb-2">
                    <option value="">— Pilih dari database client —</option>
                    {clients.map((c,i) => <option key={i} value={c.name}>{c.name}</option>)}
                  </select>
                  <input type="text" value={form.clientName} onChange={e => set('clientName')(e.target.value)} placeholder="Nama client *"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>

                {[['product','Produk'],['volume','Volume (Liter)'],['agreedPrice','Harga Disepakati (IDR/L)'],['deliveryLocation','Lokasi Pengiriman']].map(([k,l])=>(
                  <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                    <input type={['volume','agreedPrice'].includes(k)?'number':'text'} value={form[k]||''} onChange={e=>set(k)(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                ))}

                <div><label className="block text-xs text-gray-500 mb-1">Payment Terms</label>
                  <select value={form.paymentTerms} onChange={e=>set('paymentTerms')(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                    {PAYMENT_TERMS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select></div>

                {form.paymentTerms==='Credit'&&(
                  <div><label className="block text-xs text-gray-500 mb-1">Client TOP (hari)</label>
                    <input type="number" value={form.clientTOP||''} onChange={e=>set('clientTOP')(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                )}

                <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Provinsi Pengiriman (PBBKB)</label>
                  <select value={form.deliveryProvince} onChange={e=>set('deliveryProvince')(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                    <option value="">— Pilih Provinsi —</option>
                    {pbbkbProvinces.map((p,i)=><option key={i} value={p.name}>{p.name} — {p.rate}%{p.registered?' ✓':''}</option>)}
                  </select></div>

                <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Catatan</label>
                  <textarea value={form.notes||''} onChange={e=>set('notes')(e.target.value)} rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t sticky bottom-0 bg-white">
              <button onClick={save} disabled={saving||!form.clientName||!form.stockId}
                className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {saving?'⏳':editing?'💾 Simpan':'+ Buat SO'}
              </button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SOPrint({ data, company, rates }) {
  const ppnRate = (parseFloat(rates?.ppn)||11)/100;
  const vol = parseFloat(data.volume)||0, price = parseFloat(data.agreedPrice)||0;
  const subtotal = vol * price, ppn = subtotal * ppnRate, total = subtotal + ppn;
  return (
    <div className="bg-white font-sans text-sm" style={{minHeight:'297mm',padding:'15mm'}}>
      <div className="flex items-start justify-between mb-6 border-b-2 border-blue-800 pb-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="GPP" className="w-16 h-16 object-contain"/>
          <div><p className="font-bold text-blue-900 text-base">{company.name||'PT Global Petro Pasifik'}</p><p className="text-gray-500 text-xs">{company.address}</p></div>
        </div>
        <div className="text-right">
          <p className="font-bold text-xl">SALES ORDER</p>
          {!isApproved(data.approvalStatus)&&<p className="text-xs text-red-500 font-semibold border border-red-300 rounded px-2 py-0.5 mt-1 inline-block">DRAFT</p>}
          <p className="text-xs text-gray-500 mt-1">No: {data.docNumber}</p>
          <p className="text-xs text-gray-500">{formatDateID(data.soDate)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8 mb-5 text-xs">
        <div><p className="font-bold text-gray-400 uppercase mb-1">Client</p><p className="font-semibold">{data.clientName}</p>{data.clientContact&&<p className="text-gray-500">{data.clientContact}</p>}</div>
        <div><p className="font-bold text-gray-400 uppercase mb-1">Pengiriman</p><p>{data.deliveryLocation||'-'}</p>{data.deliveryProvince&&<p className="text-gray-500">Provinsi: {data.deliveryProvince}</p>}</div>
      </div>
      <table className="w-full mb-5 border-collapse text-xs">
        <thead><tr className="bg-blue-900 text-white">{['Produk','Volume','Satuan','Harga/L','Jumlah'].map(h=><th key={h} className="border border-blue-700 px-3 py-2 text-left">{h}</th>)}</tr></thead>
        <tbody><tr className="bg-white"><td className="border border-gray-200 px-3 py-2">{data.product}</td><td className="border border-gray-200 px-3 py-2 text-right">{Number(vol).toLocaleString('id-ID')}</td><td className="border border-gray-200 px-3 py-2">Liter</td><td className="border border-gray-200 px-3 py-2 text-right">{new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:2}).format(price)}</td><td className="border border-gray-200 px-3 py-2 text-right font-semibold">{new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(subtotal)}</td></tr></tbody>
        <tfoot>
          <tr><td colSpan={4} className="border border-gray-200 px-3 py-1.5 text-right font-semibold">PPN {rates?.ppn||11}%</td><td className="border border-gray-200 px-3 py-1.5 text-right">{new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(ppn)}</td></tr>
          <tr className="bg-blue-50"><td colSpan={4} className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">TOTAL</td><td className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">{new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(total)}</td></tr>
        </tfoot>
      </table>
      <div className="text-xs space-y-1 mb-8">
        <p><b>Payment Terms:</b> {data.paymentTerms}{data.clientTOP?` — ${data.clientTOP} hari`:''}</p>
        {data.notes&&<p className="text-gray-500">{data.notes}</p>}
      </div>
      <div className="flex justify-between">
        <div className="text-center w-44 text-xs"><p className="text-gray-500">Client,</p><p className="font-semibold mt-0.5">{data.clientName}</p><div className="mt-14 border-t border-gray-400"><p className="mt-1 text-gray-500">(................................)</p></div></div>
        <div className="text-center w-44 text-xs"><p className="text-gray-500">Hormat kami,</p><p className="font-semibold mt-0.5">{company.name}</p><div className="mt-14 border-t border-gray-400"><p className="mt-1 text-gray-500">Direktur</p></div></div>
      </div>
    </div>
  );
}
