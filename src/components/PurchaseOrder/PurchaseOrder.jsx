import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, updateSubDoc, POS_REF, applyApprovalDirect } from '../../firebase.js';
import { formatIDR, formatDateID, buildPONumber, today, terbilang } from '../../utils/utils.js';
import { getChain, firstPending, nextStatus, isEditable, isApproved, canDelete } from '../../utils/approvalUtils.js';
import ApprovalPanel, { StatusBadge, DraftWatermark } from '../Layout/ApprovalPanel.jsx';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

const BLANK_ITEM = () => ({ id:Date.now().toString()+Math.random(), description:'', qty:'', unit:'Liter', unitPrice:'', discount:'' });
const INIT = { poDate:today(), vendorName:'', vendorAddr:'', vendorNPWP:'', shipTo:'', items:[BLANK_ITEM()], applyPBBKB:false, pbbkbProvince:'', applyPPH:false, applyBPHBuy:false, notes:'', approvalStatus:'draft', approvalHistory:[] };

export default function PurchaseOrder() {
  const { appData, user, userRole } = useApp();
  const [form, setForm] = useState(INIT);
  const [pos, setPOs] = useState([]);
  const [printing, setPrinting] = useState(null);
  const [showApproval, setShowApproval] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLL] = useState(true);
  const suppliers = appData?.suppliers || [], pbbkbProvinces = appData?.pbbkbProvinces || [], rates = appData?.rates || {};
  const chain = getChain(appData?.settings, 'po');

  useEffect(() => { fetchCollection(POS_REF()).then(p => { setPOs(p); setLL(false); }); }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => { const items = [...form.items]; items[i] = { ...items[i], [k]: v }; setForm(p => ({ ...p, items })); };
  const addItem = () => setForm(p => ({ ...p, items: [...p.items, BLANK_ITEM()] }));
  const removeItem = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const pbbkbRate = form.applyPBBKB ? (parseFloat(pbbkbProvinces.find(p => p.name === form.pbbkbProvince)?.rate) || 0) / 100 : 0;
  const pphRate   = form.applyPPH    ? (parseFloat(rates.pph)     || 0) / 100 : 0;
  const bphRate   = form.applyBPHBuy ? (parseFloat(rates.bphMigas) || 0) / 100 : 0;

  const itemTotals = form.items.map(it => {
    const base = (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0);
    const disc = (parseFloat(it.discount) || 0);
    return base - disc;
  });
  const subtotal   = itemTotals.reduce((s, v) => s + v, 0);
  const pbbkbAmt   = subtotal * pbbkbRate;
  const pphAmt     = subtotal * pphRate;
  const bphAmt     = subtotal * bphRate;
  const totalOrder = subtotal + pbbkbAmt + pphAmt + bphAmt;

  const saveAndPrint = async () => {
    setSaving(true);
    try {
      const d = new Date(form.poDate);
      const { id } = await createNumberedDoc('po', POS_REF(), { ...form, subtotal, pbbkbAmt, pphAmt, bphAmt, totalOrder }, (seq) => buildPONumber(seq, d.getMonth() + 1, d.getFullYear()));
      const fresh = await fetchCollection(POS_REF()); setPOs(fresh); setPrinting(fresh.find(p => p.id === id) || null);
    } finally { setSaving(false); }
  };

  const handleApprove = async (po, note) => {
    setSaving(true);
    try {
      const next = nextStatus(chain, po.approvalStatus);
      await applyApprovalDirect(POS_REF(), po.id, po.approvalHistory, { action:'approve', nextApprovalStatus:next, role:userRole, email:user.email, note });
      setPOs(await fetchCollection(POS_REF())); setShowApproval(null);
    } finally { setSaving(false); }
  };
  const handleReject = async (po, note) => {
    setSaving(true);
    try {
      await applyApprovalDirect(POS_REF(), po.id, po.approvalHistory, { action:'reject', nextApprovalStatus:'rejected', role:userRole, email:user.email, note });
      setPOs(await fetchCollection(POS_REF())); setShowApproval(null);
    } finally { setSaving(false); }
  };
  const handleSubmit = async (po) => {
    setSaving(true);
    try {
      await applyApprovalDirect(POS_REF(), po.id, po.approvalHistory, { action:'submit', nextApprovalStatus:firstPending(chain), role:userRole, email:user.email, note:'' });
      setPOs(await fetchCollection(POS_REF())); setShowApproval(null);
    } finally { setSaving(false); }
  };

  const co = appData?.headOffice || appData?.company || {};

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pt-14 md:pt-6">
      {printing && <PrintWrapper onClose={() => setPrinting(null)}><DraftWatermark status={printing.approvalStatus}/><POPrint data={printing} company={co} rates={rates} pbbkbProvinces={pbbkbProvinces} /></PrintWrapper>}

      {/* Approval modal */}
      {showApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-gray-800">{showApproval.docNumber}</h2>
              <button onClick={()=>setShowApproval(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-gray-600"><b>{showApproval.vendorName}</b> · {formatIDR(showApproval.totalOrder)}</div>
              <ApprovalPanel doc={showApproval} docType="po" chain={chain} userRole={userRole} userEmail={user?.email}
                onSubmit={()=>handleSubmit(showApproval)} onApprove={note=>handleApprove(showApproval,note)} onReject={note=>handleReject(showApproval,note)} saving={saving}/>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Purchase Order</h1>
        <button onClick={saveAndPrint} disabled={saving} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">{saving ? '⏳' : '🖨️ Simpan & Cetak'}</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Detail PO</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">Tanggal PO</label><input type="date" value={form.poDate} onChange={e=>set('poDate')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Ship To</label><input type="text" value={form.shipTo} onChange={e=>set('shipTo')(e.target.value)} placeholder="Lokasi pengiriman" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Pilih Supplier</label>
                <select onChange={e => { const s = suppliers.find(x => x.name === e.target.value); if (s) { set('vendorName')(s.name); set('vendorAddr')(s.address||''); set('vendorNPWP')(s.npwp||''); }}} defaultValue="" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— Pilih dari database supplier —</option>
                  {suppliers.map((s,i) => <option key={i} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              {[['vendorName','Nama Vendor'],['vendorNPWP','NPWP Vendor']].map(([k,l]) => (
                <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label><input type="text" value={form[k]||''} onChange={e=>set(k)(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              ))}
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Alamat Vendor</label><input type="text" value={form.vendorAddr||''} onChange={e=>set('vendorAddr')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Item Pembelian</h2>
            <div className="space-y-3">
              {form.items.map((item, i) => (
                <div key={item.id||i} className="border border-gray-100 rounded-lg p-3 bg-gray-50 relative">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Deskripsi</label><input type="text" value={item.description} onChange={e=>setItem(i,'description',e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"/></div>
                    {[['qty','Qty','number'],['unit','Satuan','text'],['unitPrice','Harga Satuan (IDR)','number'],['discount','Discount (IDR)','number']].map(([k,l,t]) => (
                      <div key={k}><label className="block text-xs text-gray-400 mb-1">{l}</label><input type={t} value={item[k]||''} onChange={e=>setItem(i,k,e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"/></div>
                    ))}
                    <div><label className="block text-xs text-gray-400 mb-1">Subtotal</label><p className="px-2 py-1.5 text-sm font-mono text-blue-700">{formatIDR(itemTotals[i]||0)}</p></div>
                  </div>
                  {form.items.length > 1 && <button onClick={() => removeItem(i)} className="absolute top-2 right-2 text-red-400 text-xs">✕</button>}
                </div>
              ))}
              <button onClick={addItem} className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500">+ Tambah Item</button>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Pajak & Pungutan</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.applyPPH} onChange={e=>set('applyPPH')(e.target.checked)} className="rounded w-4 h-4"/>
                <span className="text-sm text-gray-700">PPH ({rates.pph||0.3}%)</span>
                {form.applyPPH && <span className="ml-auto font-mono text-xs text-orange-600">{formatIDR(pphAmt)}</span>}
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.applyBPHBuy} onChange={e=>set('applyBPHBuy')(e.target.checked)} className="rounded w-4 h-4"/>
                <span className="text-sm text-gray-700">BPH Migas ({rates.bphMigas||0.25}%)</span>
                {form.applyBPHBuy && <span className="ml-auto font-mono text-xs text-orange-600">{formatIDR(bphAmt)}</span>}
              </label>
              <div className="border-t pt-3">
                <label className="flex items-center gap-3 cursor-pointer mb-2">
                  <input type="checkbox" checked={form.applyPBBKB} onChange={e=>set('applyPBBKB')(e.target.checked)} className="rounded w-4 h-4"/>
                  <span className="text-sm text-gray-700">PBBKB</span>
                  {form.applyPBBKB && <span className="ml-auto font-mono text-xs text-orange-600">{formatIDR(pbbkbAmt)}</span>}
                </label>
                {form.applyPBBKB && (
                  <select value={form.pbbkbProvince} onChange={e=>set('pbbkbProvince')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ml-7">
                    <option value="">— Pilih Provinsi —</option>
                    {pbbkbProvinces.map((p,i) => <option key={i} value={p.name}>{p.name} ({p.rate}%)</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <label className="block text-xs text-gray-500 mb-1">Catatan</label>
            <textarea value={form.notes||''} onChange={e=>set('notes')(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
          </div>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5 sticky top-4">
            <h2 className="font-semibold text-gray-700 mb-3">Ringkasan PO</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">{formatIDR(subtotal)}</span></div>
              {form.applyPBBKB && <div className="flex justify-between"><span className="text-gray-500">PBBKB</span><span className="font-mono">{formatIDR(pbbkbAmt)}</span></div>}
              {form.applyPPH    && <div className="flex justify-between"><span className="text-gray-500">PPH</span><span className="font-mono">{formatIDR(pphAmt)}</span></div>}
              {form.applyBPHBuy && <div className="flex justify-between"><span className="text-gray-500">BPH Migas</span><span className="font-mono">{formatIDR(bphAmt)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total Order</span><span className="font-mono text-blue-700">{formatIDR(totalOrder)}</span></div>
            </div>
            <button onClick={saveAndPrint} disabled={saving} className="w-full mt-4 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">{saving?'⏳':'🖨️ Simpan & Cetak'}</button>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Riwayat PO</h2>
            {loadingList ? <p className="text-gray-400 text-sm">Memuat…</p> : pos.length===0 ? <p className="text-gray-400 text-sm">Belum ada PO.</p> : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pos.map(p => (
                  <div key={p.id} className="border border-gray-100 rounded-lg p-2.5 hover:border-blue-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-mono text-blue-600">{p.docNumber}</p>
                      <StatusBadge status={p.approvalStatus||'draft'}/>
                    </div>
                    <p className="text-sm text-gray-700 truncate">{p.vendorName||'-'}</p>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <span className="text-xs text-gray-400 font-mono">{formatIDR(p.totalOrder)}</span>
                      <div className="flex gap-1.5">
                        <button onClick={()=>setShowApproval(p)} className="text-xs text-blue-600 border border-blue-100 px-2 py-0.5 rounded hover:bg-blue-50">Approval</button>
                        <button onClick={()=>setPrinting(p)} className="text-xs text-gray-500 border border-gray-100 px-2 py-0.5 rounded hover:bg-gray-50">🖨️</button>
                      </div>
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

function POPrint({ data, company, rates, pbbkbProvinces }) {
  return (
    <div className="bg-white font-sans text-sm" style={{minHeight:'297mm',padding:'15mm'}}>
      <div className="flex items-start justify-between mb-6 border-b-2 border-blue-800 pb-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="GPP" className="w-16 h-16 object-contain"/>
          <div><p className="font-bold text-blue-900 text-base">{company.name||'PT Global Petro Pasifik'}</p><p className="text-gray-600 text-xs">{company.address1}</p>{company.address2&&<p className="text-gray-600 text-xs">{company.address2}</p>}</div>
        </div>
        <div className="text-right"><p className="font-bold text-xl text-gray-800">PURCHASE ORDER</p><p className="text-xs text-gray-500 mt-1">No: {data.docNumber}</p><p className="text-xs text-gray-500">{formatDateID(data.poDate)}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-8 mb-5 text-xs">
        <div><p className="font-bold text-gray-500 uppercase mb-1">Vendor</p><p className="font-semibold">{data.vendorName}</p><p className="text-gray-600">{data.vendorAddr}</p>{data.vendorNPWP&&<p className="text-gray-600">NPWP: {data.vendorNPWP}</p>}</div>
        <div><p className="font-bold text-gray-500 uppercase mb-1">Ship To</p><p className="text-gray-700">{data.shipTo||company.name}</p></div>
      </div>
      <table className="w-full mb-5 border-collapse text-xs">
        <thead><tr className="bg-blue-900 text-white">{['No.','Keterangan','Qty','Satuan','Harga Satuan','Discount','Jumlah'].map(h=><th key={h} className="border border-blue-700 px-3 py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{(data.items||[]).map((it,i)=>{const base=(parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0),disc=parseFloat(it.discount)||0;return(
          <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
            <td className="border border-gray-200 px-3 py-1.5 text-center">{i+1}</td>
            <td className="border border-gray-200 px-3 py-1.5">{it.description}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right">{Number(it.qty||0).toLocaleString('id-ID')}</td>
            <td className="border border-gray-200 px-3 py-1.5">{it.unit}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(parseFloat(it.unitPrice)||0)}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right">{disc>0?formatIDR(disc):'-'}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(base-disc)}</td>
          </tr>
        );})}</tbody>
        <tfoot>
          <tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right font-semibold">Sub Total</td><td className="border border-gray-200 px-3 py-1.5 text-right font-semibold">{formatIDR(data.subtotal||0)}</td></tr>
          {data.applyPBBKB&&<tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right">PBBKB ({pbbkbProvinces.find(p=>p.name===data.pbbkbProvince)?.rate||0}%)</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(data.pbbkbAmt||0)}</td></tr>}
          {data.applyPPH&&<tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right">PPH ({rates.pph||0.3}%)</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(data.pphAmt||0)}</td></tr>}
          {data.applyBPHBuy&&<tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right">BPH Migas ({rates.bphMigas||0.25}%)</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(data.bphAmt||0)}</td></tr>}
          <tr className="bg-blue-50"><td colSpan={6} className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">TOTAL ORDER</td><td className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">{formatIDR(data.totalOrder||0)}</td></tr>
        </tfoot>
      </table>
      <p className="text-xs italic text-gray-600 mb-6">Terbilang: <b>{terbilang(data.totalOrder||0)}</b></p>
      {data.notes&&<p className="text-xs text-gray-500 mb-6">{data.notes}</p>}
      <div className="flex justify-between mt-10">
        <div className="text-center w-44"><p className="text-xs text-gray-600">Vendor,</p><div className="mt-12 border-t border-gray-400"><p className="text-xs font-semibold text-gray-700 mt-1">{data.vendorName}</p></div></div>
        <div className="text-center w-44"><p className="text-xs text-gray-600">Hormat kami,</p><p className="text-xs text-gray-800 font-semibold mt-1">{company.name}</p><div className="mt-12 border-t border-gray-400"><p className="text-xs text-gray-600 mt-1">Procurement</p></div></div>
      </div>
    </div>
  );
}
