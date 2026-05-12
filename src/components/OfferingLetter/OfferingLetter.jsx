import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, OLS_REF } from '../../firebase.js';
import { formatIDR, formatDateID, buildOLNumber, today, terbilang } from '../../utils/utils.js';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

// 2-decimal IDR formatter for offering letters
const formatIDR2 = (n) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(n) || 0);

const INIT = { olDate:today(), validDays:14, attentionTo:'', customerName:'', customerAddr:'', subject:'', items:[{description:'',qty:'',unit:'Liter',unitPrice:''}], terms:'Net 14 hari setelah pengiriman', paymentTo:'', notes:'' };

export default function OfferingLetter() {
  const { appData } = useApp();
  const [form,setForm]=useState(INIT);
  const [letters,setLetters]=useState([]);
  const [printing,setPrinting]=useState(null);
  const [saving,setSaving]=useState(false);
  const [loadingList,setLL]=useState(true);

  useEffect(()=>{fetchCollection(OLS_REF()).then(l=>{setLetters(l);setLL(false);});}, []);

  const set=k=>v=>setForm(p=>({...p,[k]:v}));
  const setItem=(i,k,v)=>{const items=[...form.items];items[i]={...items[i],[k]:v};setForm(p=>({...p,items}));};
  const addItem=()=>setForm(p=>({...p,items:[...p.items,{description:'',qty:'',unit:'Liter',unitPrice:''}]}));
  const removeItem=(i)=>setForm(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}));

  const ppnRate=(appData?.rates?.ppn||11)/100;
  const subtotal=form.items.reduce((s,it)=>s+(parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0),0);
  const taxAmt=subtotal*ppnRate, grandTotal=subtotal+taxAmt;

  const saveAndPrint=async()=>{
    setSaving(true);
    try{
      const d=new Date(form.olDate);
      const{id}=await createNumberedDoc('ol',OLS_REF(),{...form,subtotal,taxAmt,grandTotal},(seq)=>buildOLNumber(seq,d.getMonth()+1,d.getFullYear()));
      const fresh=await fetchCollection(OLS_REF());setLetters(fresh);setPrinting(fresh.find(l=>l.id===id)||null);
    }finally{setSaving(false);}
  };

  const co=appData?.company||{}, clients=appData?.clients||[];

  return(
    <div className="p-4 md:p-6 max-w-5xl mx-auto pt-14 md:pt-6">
      {printing&&<PrintWrapper onClose={()=>setPrinting(null)}><OLPrint data={printing} company={co} rates={appData?.rates}/></PrintWrapper>}
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-800">Surat Penawaran</h1></div>
        <button onClick={saveAndPrint} disabled={saving} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">{saving?'⏳':'🖨️ Simpan & Cetak'}</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Detail Surat</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">Tanggal</label><input type="date" value={form.olDate} onChange={e=>set('olDate')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Berlaku (hari)</label><input type="number" value={form.validDays} onChange={e=>set('validDays')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Pilih Client</label>
                <select onChange={e=>{const c=clients.find(x=>x.name===e.target.value);if(c){set('customerName')(c.name);set('customerAddr')(c.address||'');}}} defaultValue="" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— Pilih dari database client —</option>
                  {clients.map((c,i)=><option key={i} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              {[['attentionTo','Kepada Yth.'],['customerName','Nama Perusahaan']].map(([k,l])=>(
                <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label><input type="text" value={form[k]} onChange={e=>set(k)(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              ))}
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Alamat Customer</label><input type="text" value={form.customerAddr} onChange={e=>set('customerAddr')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Perihal</label><input type="text" value={form.subject} onChange={e=>set('subject')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Item Penawaran</h2>
            <div className="space-y-3">
              {form.items.map((item,i)=>(
                <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50 relative">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Deskripsi</label><input type="text" value={item.description} onChange={e=>setItem(i,'description',e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"/></div>
                    {[['qty','Qty'],['unit','Satuan'],['unitPrice','Harga Satuan (IDR)']].map(([k,l])=>(
                      <div key={k}><label className="block text-xs text-gray-400 mb-1">{l}</label><input type={k==='unit'?'text':'number'} value={item[k]} onChange={e=>setItem(i,k,e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none"/></div>
                    ))}
                    <div><label className="block text-xs text-gray-400 mb-1">Subtotal</label><p className="px-2 py-1.5 text-sm font-mono text-blue-700">{formatIDR2((parseFloat(item.qty)||0)*(parseFloat(item.unitPrice)||0))}</p></div>
                  </div>
                  {form.items.length>1&&<button onClick={()=>removeItem(i)} className="absolute top-2 right-2 text-red-400 text-xs">✕</button>}
                </div>
              ))}
              <button onClick={addItem} className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500">+ Tambah Item</button>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Syarat & Ketentuan</h2>
            <div className="space-y-3">
              {[['terms','Syarat Pembayaran'],['paymentTo','Rekening Tujuan']].map(([k,l])=>(
                <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label><input type="text" value={form[k]} onChange={e=>set(k)(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              ))}
              <div><label className="block text-xs text-gray-500 mb-1">Catatan</label><textarea value={form.notes} onChange={e=>set('notes')(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
            </div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5 sticky top-4">
            <h2 className="font-semibold text-gray-700 mb-3">Ringkasan</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">{formatIDR2(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">PPN {appData?.rates?.ppn||11}%</span><span className="font-mono">{formatIDR2(taxAmt)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span className="font-mono text-blue-700">{formatIDR2(grandTotal)}</span></div>
            </div>
            <button onClick={saveAndPrint} disabled={saving} className="w-full mt-4 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">{saving?'⏳':'🖨️ Simpan & Cetak'}</button>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Riwayat</h2>
            {loadingList?<p className="text-gray-400 text-sm">Memuat…</p>:letters.length===0?<p className="text-gray-400 text-sm">Belum ada surat.</p>:(
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {letters.map(l=>(
                  <div key={l.id} className="border border-gray-100 rounded-lg p-2.5 hover:border-blue-200 cursor-pointer" onClick={()=>setPrinting(l)}>
                    <p className="text-xs font-mono text-blue-600">{l.docNumber}</p>
                    <p className="text-sm text-gray-700 truncate">{l.customerName}</p>
                    <p className="text-xs text-gray-400">{formatDateID(l.olDate)}</p>
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

function OLPrint({ data, company, rates }) {
  const ppn=(rates?.ppn||11)/100;
  const subtotal=data.subtotal||0, taxAmt=data.taxAmt||subtotal*ppn, grandTotal=data.grandTotal||subtotal+taxAmt;
  return(
    <div className="bg-white font-sans text-sm" style={{minHeight:'297mm',padding:'15mm'}}>
      <div className="flex items-start justify-between mb-6 border-b-2 border-blue-800 pb-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="GPP" className="w-16 h-16 object-contain"/>
          <div><p className="font-bold text-blue-900 text-base">{company.name||'PT Global Petro Pasifik'}</p><p className="text-gray-600 text-xs">{company.address1}</p>{company.address2&&<p className="text-gray-600 text-xs">{company.address2}</p>}</div>
        </div>
        <div className="text-right"><p className="font-bold text-lg text-gray-800">SURAT PENAWARAN</p><p className="text-xs text-gray-500 mt-1">No: {data.docNumber}</p><p className="text-xs text-gray-500">{formatDateID(data.olDate)}</p></div>
      </div>
      <div className="mb-5"><p className="text-xs text-gray-500 mb-0.5">Kepada Yth.</p><p className="font-semibold">{data.attentionTo}</p><p className="font-semibold">{data.customerName}</p><p className="text-gray-600 text-xs">{data.customerAddr}</p></div>
      <div className="mb-5"><p><span className="font-semibold">Perihal:</span> {data.subject}</p></div>
      <p className="mb-4 text-gray-700">Dengan hormat, bersama ini kami sampaikan penawaran harga sebagai berikut:</p>
      <table className="w-full mb-5 border-collapse text-xs">
        <thead><tr className="bg-blue-900 text-white">
          {['No.','Keterangan','Qty','Satuan','Harga Satuan','Jumlah'].map(h=><th key={h} className="border border-blue-700 px-3 py-2 text-left">{h}</th>)}
        </tr></thead>
        <tbody>{(data.items||[]).map((it,i)=>(
          <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
            <td className="border border-gray-200 px-3 py-1.5 text-center">{i+1}</td>
            <td className="border border-gray-200 px-3 py-1.5">{it.description}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right">{Number(it.qty||0).toLocaleString('id-ID')}</td>
            <td className="border border-gray-200 px-3 py-1.5">{it.unit}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR2(parseFloat(it.unitPrice)||0)}</td>
            <td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR2((parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0))}</td>
          </tr>
        ))}</tbody>
        <tfoot>
          <tr><td colSpan={5} className="border border-gray-200 px-3 py-1.5 text-right font-semibold">Subtotal</td><td className="border border-gray-200 px-3 py-1.5 text-right font-semibold">{formatIDR2(subtotal)}</td></tr>
          <tr><td colSpan={5} className="border border-gray-200 px-3 py-1.5 text-right">PPN {rates?.ppn||11}%</td><td className="border border-gray-200 px-3 py-1.5 text-right">{formatIDR2(taxAmt)}</td></tr>
          <tr className="bg-blue-50"><td colSpan={5} className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">TOTAL</td><td className="border border-gray-200 px-3 py-2 text-right font-bold text-blue-900">{formatIDR2(grandTotal)}</td></tr>
        </tfoot>
      </table>
      <p className="text-xs italic text-gray-600 mb-5">Terbilang: <b>{terbilang(grandTotal)}</b></p>
      <div className="mb-5 text-xs space-y-1">
        {data.terms&&<p><b>Syarat Pembayaran:</b> {data.terms}</p>}
        {data.paymentTo&&<p><b>Pembayaran ke:</b> {data.paymentTo}</p>}
        {data.notes&&<p className="text-gray-600">{data.notes}</p>}
      </div>
      <p className="mb-8 text-gray-700 text-xs">Demikian penawaran ini kami sampaikan. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.</p>
      <div className="flex justify-end"><div className="text-center w-48"><p className="text-xs text-gray-600">Hormat kami,</p><p className="text-xs font-semibold text-gray-800 mt-1">{company.name||'PT Global Petro Pasifik'}</p><div className="mt-12 border-t border-gray-400"><p className="text-xs text-gray-600 mt-1">Direktur</p></div></div></div>
    </div>
  );
}
