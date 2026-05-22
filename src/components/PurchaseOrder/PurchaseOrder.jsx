import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc, POS_REF } from '../../firebase.js';
import { formatIDR, formatDateID, buildPONumber, today, terbilang } from '../../utils/utils.js';
import { getChain, firstPending, nextStatus, isEditable, isApproved, statusMeta, canDelete } from '../../utils/approvalUtils.js';
import { useLang } from '../../utils/i18n.jsx';
import ApprovalPanel, { StatusBadge, DraftWatermark } from '../Layout/ApprovalPanel.jsx';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

const fmtIDR2 = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:2}).format(Number(n)||0);
const BLANK_ITEM = () => ({ id:Date.now().toString()+Math.random(), description:'', qty:'', unit:'Liter', unitPrice:'', discount:'' });
const INIT = () => ({ poDate:today(), vendorName:'', vendorAddr:'', vendorNPWP:'', shipTo:'', items:[BLANK_ITEM()], applyPBBKB:false, pbbkbProvince:'', applyPPH:false, applyBPHBuy:false, notes:'', approvalStatus:'draft', approvalHistory:[] });
const IF = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white';

export default function PurchaseOrder() {
  const { appData, user, userRole } = useApp();
  const [pos, setPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [form, setForm] = useState(INIT());
  const [editingId, setEditingId] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [showApproval, setShowApproval] = useState(null);
  const [saving, setSaving] = useState(false);

  const suppliers = appData?.suppliers || [];
  const pbbkbProvinces = appData?.pbbkbProvinces || [];
  const rates = appData?.rates || {};
  const co = appData?.headOffice || appData?.company || {};
  const chain = getChain(appData?.settings, 'po');
  const { t } = useLang();

  useEffect(() => { fetchCollection(POS_REF()).then(p => { setPOs(p); setLoading(false); }); }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i,k,v) => { const items=[...form.items]; items[i]={...items[i],[k]:v}; setForm(p=>({...p,items})); };
  const addItem = () => setForm(p => ({ ...p, items: [...p.items, BLANK_ITEM()] }));
  const delItem = i => setForm(p => ({ ...p, items: p.items.filter((_,idx)=>idx!==i) }));

  const pbbkbRate = form.applyPBBKB ? (parseFloat(pbbkbProvinces.find(p=>p.name===form.pbbkbProvince)?.rate)||0)/100 : 0;
  const pphRate   = form.applyPPH    ? (parseFloat(rates.pph)||0)/100 : 0;
  const bphRate   = form.applyBPHBuy ? (parseFloat(rates.bphMigas)||0)/100 : 0;
  const itemTotals = form.items.map(it => (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0)-(parseFloat(it.discount)||0));
  const subtotal  = itemTotals.reduce((s,v)=>s+v,0);
  const pbbkbAmt  = subtotal*pbbkbRate, pphAmt=subtotal*pphRate, bphAmt=subtotal*bphRate;
  const totalOrder = subtotal+pbbkbAmt+pphAmt+bphAmt;

  const openNew  = () => { setForm(INIT()); setEditingId(null); setView('form'); };
  const openEdit = (po) => { if(!isEditable(po.approvalStatus))return; setForm({...INIT(),...po}); setEditingId(po.id); setView('form'); };
  const cancelForm = () => { setView('list'); setEditingId(null); };

  const save = async () => {
    setSaving(true);
    try {
      const d = new Date(form.poDate);
      const data = { ...form, subtotal, pbbkbAmt, pphAmt, bphAmt, totalOrder };
      if (editingId) await updateSubDoc(POS_REF(), editingId, data);
      else await createNumberedDoc('po', POS_REF(), data, seq => buildPONumber(seq, d.getMonth()+1, d.getFullYear()));
      setPOs(await fetchCollection(POS_REF())); setView('list');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!canDelete(userRole) || !confirm('Delete this PO?')) return;
    await deleteSubDoc(POS_REF(), id); setPOs(p => p.filter(x => x.id !== id));
  };

  const handleSubmit = async (po) => { setSaving(true); try { const h=[...(po.approvalHistory||[]),{role:userRole,action:'submit',by:user.email,at:Date.now(),note:''}]; await updateSubDoc(POS_REF(),po.id,{approvalStatus:firstPending(chain),approvalHistory:h}); setPOs(await fetchCollection(POS_REF())); setShowApproval(null); } finally { setSaving(false); } };
  const handleApprove = async (po,note) => { setSaving(true); try { const next=nextStatus(chain,po.approvalStatus); const h=[...(po.approvalHistory||[]),{role:userRole,action:'approved',by:user.email,at:Date.now(),note}]; await updateSubDoc(POS_REF(),po.id,{approvalStatus:next,approvalHistory:h}); setPOs(await fetchCollection(POS_REF())); setShowApproval(null); } finally { setSaving(false); } };
  const handleReject = async (po,note) => { setSaving(true); try { const h=[...(po.approvalHistory||[]),{role:userRole,action:'rejected',by:user.email,at:Date.now(),note}]; await updateSubDoc(POS_REF(),po.id,{approvalStatus:'rejected',approvalHistory:h}); setPOs(await fetchCollection(POS_REF())); setShowApproval(null); } finally { setSaving(false); } };

  if (printing) return (<PrintWrapper onClose={()=>setPrinting(null)}><DraftWatermark status={printing.approvalStatus}/><POPrint data={printing} company={co} rates={rates} pbbkbProvinces={pbbkbProvinces}/></PrintWrapper>);

  const ApprovalModal = showApproval && (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div><h2 className="font-bold text-gray-800">{showApproval.docNumber}</h2><p className="text-xs text-gray-400">{showApproval.vendorName} · {formatIDR(showApproval.totalOrder)}</p></div>
          <button onClick={()=>setShowApproval(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-5"><ApprovalPanel doc={showApproval} docType="po" chain={chain} userRole={userRole} userEmail={user?.email} onSubmit={()=>handleSubmit(showApproval)} onApprove={note=>handleApprove(showApproval,note)} onReject={note=>handleReject(showApproval,note)} saving={saving}/></div>
      </div>
    </div>
  );

  if (view === 'form') return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden pt-14 md:pt-0">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={cancelForm} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
          <span className="text-gray-300">|</span>
          <h1 className="text-base font-bold text-gray-800">{editingId ? 'Edit Purchase Order' : 'New Purchase Order'}</h1>
        </div>
        <button onClick={save} disabled={saving||!form.vendorName} className="bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">{saving?'⏳ Saving…':editingId?'💾 Save':'+ Create PO'}</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Detail PO</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-gray-500 mb-1">Tanggal PO</label><input type="date" value={form.poDate} onChange={e=>set('poDate')(e.target.value)} className={IF}/></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Ship To</label><input type="text" value={form.shipTo||''} onChange={e=>set('shipTo')(e.target.value)} placeholder="Lokasi pengiriman" className={IF}/></div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Pilih Supplier</label>
                    <select className={IF} onChange={e=>{const s=suppliers.find(x=>x.name===e.target.value);if(s){set('vendorName')(s.name);set('vendorAddr')(s.address||'');set('vendorNPWP')(s.npwp||'');}}} defaultValue="">
                      <option value="">— Pilih dari database supplier —</option>
                      {suppliers.map((s,i)=><option key={i} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  {[['vendorName','Vendor Name'],['vendorNPWP','Vendor NPWP']].map(([k,l])=>(<div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label><input type="text" value={form[k]||''} onChange={e=>set(k)(e.target.value)} className={IF}/></div>))}
                  <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Alamat Vendor</label><input type="text" value={form.vendorAddr||''} onChange={e=>set('vendorAddr')(e.target.value)} className={IF}/></div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Item Pembelian</h2>
                <div className="space-y-3">
                  {form.items.map((item,i)=>(
                    <div key={item.id||i} className="border border-gray-100 rounded-lg p-3 bg-gray-50 relative">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Deskripsi</label><input type="text" value={item.description} onChange={e=>setItem(i,'description',e.target.value)} className={IF}/></div>
                        {[['qty','Qty','number'],['unit','Satuan','text'],['unitPrice','Unit Price (IDR)','number'],['discount','Discount (IDR)','number']].map(([k,l,t])=>(<div key={k}><label className="block text-xs text-gray-400 mb-1">{l}</label><input type={t} value={item[k]||''} onChange={e=>setItem(i,k,e.target.value)} className={IF}/></div>))}
                        <div><label className="block text-xs text-gray-400 mb-1">Subtotal</label><p className="px-3 py-2 text-sm font-mono text-blue-700">{formatIDR(itemTotals[i]||0)}</p></div>
                      </div>
                      {form.items.length>1&&<button onClick={()=>delItem(i)} className="absolute top-2 right-2 text-red-400 text-xs">✕</button>}
                    </div>
                  ))}
                  <button onClick={addItem} className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500">+ Tambah Item</button>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Pajak & Pungutan</h2>
                <div className="space-y-3">
                  {[['applyPPH',`PPH ${rates.pph||0.3}%`,pphAmt],['applyBPHBuy',`BPH Migas ${rates.bphMigas||0.25}%`,bphAmt]].map(([k,l,amt])=>(
                    <label key={k} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={form[k]} onChange={e=>set(k)(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
                      <span className="text-sm text-gray-700 flex-1">{l}</span>
                      {form[k]&&<span className="font-mono text-xs text-orange-500">{formatIDR(amt)}</span>}
                    </label>
                  ))}
                  <div className="border-t pt-3">
                    <label className="flex items-center gap-3 cursor-pointer mb-2">
                      <input type="checkbox" checked={form.applyPBBKB} onChange={e=>set('applyPBBKB')(e.target.checked)} className="rounded w-4 h-4 accent-blue-600"/>
                      <span className="text-sm text-gray-700 flex-1">PBBKB</span>
                      {form.applyPBBKB&&<span className="font-mono text-xs text-orange-500">{formatIDR(pbbkbAmt)}</span>}
                    </label>
                    {form.applyPBBKB&&(<select value={form.pbbkbProvince} onChange={e=>set('pbbkbProvince')(e.target.value)} className={IF+' ml-7'}><option value="">— Select Province —</option>{pbbkbProvinces.map((p,i)=><option key={i} value={p.name}>{p.name} ({p.rate}%)</option>)}</select>)}
                  </div>
                </div>
                <div className="mt-4"><label className="block text-xs text-gray-500 mb-1">Catatan</label><textarea value={form.notes||''} onChange={e=>set('notes')(e.target.value)} rows={2} className={IF+' resize-none'}/></div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 h-fit sticky top-6">
              <h2 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Ringkasan</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">{formatIDR(subtotal)}</span></div>
                {form.applyPBBKB&&<div className="flex justify-between"><span className="text-gray-500">PBBKB</span><span className="font-mono">{formatIDR(pbbkbAmt)}</span></div>}
                {form.applyPPH&&<div className="flex justify-between"><span className="text-gray-500">PPH</span><span className="font-mono">{formatIDR(pphAmt)}</span></div>}
                {form.applyBPHBuy&&<div className="flex justify-between"><span className="text-gray-500">BPH Migas</span><span className="font-mono">{formatIDR(bphAmt)}</span></div>}
                <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total Order</span><span className="font-mono text-blue-700">{formatIDR(totalOrder)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      {ApprovalModal}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Purchase Order</h1>
          <p className="text-xs text-gray-400 mt-0.5">Procurement from Supplier — cargo addition &amp; fuel procurement</p>
        </div>
        <button onClick={openNew} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800">+ New Entry</button>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700">
        <span className="font-semibold">📋 Purchase Order (PO)</span> is issued to a <strong>supplier</strong> when GPP buys fuel to add to stock/cargo. After approval, link the PO to its stock tranche to confirm inventory.
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading?<p className="p-8 text-gray-400 text-sm">Memuat…</p>:pos.length===0?(
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">📋</p><p className="text-sm">No purchase orders yet.</p>
            <button onClick={openNew} className="mt-3 text-xs text-blue-600 hover:underline">+ Create First PO</button>
          </div>
        ):(
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200"><tr>{['No. PO','Tanggal','Vendor','Total','Status',''].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {pos.map(po=>{
                  const m=statusMeta(po.approvalStatus);
                  return (
                    <tr key={po.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-600 text-xs whitespace-nowrap">{po.docNumber}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{po.poDate}</td>
                      <td className="px-4 py-3 font-medium text-gray-700 max-w-[200px] truncate">{po.vendorName||'–'}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{formatIDR(po.totalOrder)}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${m.badge}`}>{m.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={()=>setShowApproval(po)} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded hover:bg-blue-100">Approval</button>
                          {isEditable(po.approvalStatus)&&<button onClick={()=>openEdit(po)} className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100">Edit</button>}
                          <button onClick={()=>setPrinting(po)} className="text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100">🖨️</button>
                          {canDelete(userRole)&&<button onClick={()=>remove(po.id)} className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-2 py-1 rounded hover:bg-red-100">Del</button>}
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

function POPrint({ data, company, rates, pbbkbProvinces }) {
  return (
    <div className="bg-white font-sans text-sm" style={{minHeight:'297mm',padding:'15mm'}}>
      <div className="flex items-start justify-between mb-6 border-b-2 border-blue-800 pb-4">
        <div className="flex items-center gap-3"><img src={logo} alt="GPP" className="w-16 h-16 object-contain"/><div><p className="font-bold text-blue-900 text-base">{company.name||'PT Global Petro Pasifik'}</p><p className="text-gray-500 text-xs">{company.address}</p></div></div>
        <div className="text-right"><p className="font-bold text-xl text-gray-800">PURCHASE ORDER</p>{!isApproved(data.approvalStatus)&&<span className="text-[10px] text-red-500 border border-red-300 rounded px-2 py-0.5 mt-0.5 inline-block">DRAFT</span>}<p className="text-xs text-gray-500 mt-1">No: <b>{data.docNumber}</b></p><p className="text-xs text-gray-500">{formatDateID(data.poDate)}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-8 mb-5 text-xs">
        <div><p className="font-bold text-gray-400 uppercase mb-1">Vendor</p><p className="font-semibold">{data.vendorName}</p><p className="text-gray-500">{data.vendorAddr}</p>{data.vendorNPWP&&<p className="text-gray-500">NPWP: {data.vendorNPWP}</p>}</div>
        <div><p className="font-bold text-gray-400 uppercase mb-1">Ship To</p><p>{data.shipTo||company.name}</p></div>
      </div>
      <table className="w-full mb-5 border-collapse text-xs">
        <thead><tr className="bg-blue-900 text-white">{['No.','Keterangan','Qty','Satuan','Harga Satuan','Discount','Jumlah'].map(h=><th key={h} className="border border-blue-700 px-3 py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{(data.items||[]).map((it,i)=>{const base=(parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0),disc=parseFloat(it.discount)||0;return(<tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}><td className="border border-gray-200 px-3 py-1.5 text-center">{i+1}</td><td className="border border-gray-200 px-3 py-1.5">{it.description}</td><td className="border border-gray-200 px-3 py-1.5 text-right">{Number(it.qty||0).toLocaleString('id-ID')}</td><td className="border border-gray-200 px-3 py-1.5">{it.unit}</td><td className="border border-gray-200 px-3 py-1.5 text-right">{fmtIDR2(parseFloat(it.unitPrice)||0)}</td><td className="border border-gray-200 px-3 py-1.5 text-right">{disc>0?formatIDR(disc):'–'}</td><td className="border border-gray-200 px-3 py-1.5 text-right font-semibold">{formatIDR(base-disc)}</td></tr>);})}</tbody>
        <tfoot>
          <tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right font-semibold">Sub Total</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(data.subtotal||0)}</td></tr>
          {data.applyPBBKB&&<tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right">PBBKB ({pbbkbProvinces.find(p=>p.name===data.pbbkbProvince)?.rate||0}%)</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(data.pbbkbAmt||0)}</td></tr>}
          {data.applyPPH&&<tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right">PPH ({rates.pph||0.3}%)</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(data.pphAmt||0)}</td></tr>}
          {data.applyBPHBuy&&<tr><td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right">BPH Migas ({rates.bphMigas||0.25}%)</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR(data.bphAmt||0)}</td></tr>}
          <tr className="bg-blue-50"><td colSpan={6} className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">TOTAL ORDER</td><td className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">{formatIDR(data.totalOrder||0)}</td></tr>
        </tfoot>
      </table>
      <p className="text-xs italic text-gray-600 mb-6">Terbilang: <b>{terbilang(data.totalOrder||0)}</b></p>
      {data.notes&&<p className="text-xs text-gray-500 mb-6">{data.notes}</p>}
      <div className="flex justify-between mt-10">
        <div className="text-center w-44 text-xs"><p className="text-gray-500">Vendor,</p><div className="mt-14 border-t border-gray-400"><p className="font-semibold text-gray-700 mt-1">{data.vendorName}</p></div></div>
        <div className="text-center w-44 text-xs"><p className="text-gray-500">Hormat kami,</p><p className="font-semibold mt-0.5">{company.name}</p><div className="mt-14 border-t border-gray-400"><p className="text-gray-500 mt-1">Procurement</p></div></div>
      </div>
    </div>
  );
}
