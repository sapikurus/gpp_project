import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc, STOCKS_REF, POS_REF } from '../../firebase.js';
import { today, formatDateShort, formatIDR, daysBetween } from '../../utils/utils.js';
import { canDelete } from '../../utils/approvalUtils.js';

const STATUSES = ['Draft','Confirmed','Sold Out','Closed'];
const STATUS_COLOR = {
  'Draft':     'bg-gray-100 text-gray-600',
  'Confirmed': 'bg-blue-100 text-blue-700',
  'Sold Out':  'bg-green-100 text-green-700',
  'Closed':    'bg-gray-200 text-gray-500',
};
const BLANK_T = () => ({ id: Date.now().toString()+Math.random(), vol:'', basePrice:'', loadDate:today(), payDate:today(), supplier:'', applyPPN:true, applyPBBKB:false, noPbbkb:false, pbbkbProvince:'', applyBPHBuy:false });
const INIT = { label:'', product:'', vessel:'', loadingPort:'', dischargingPort:'', etaLoad:today(), etaDisch:'', status:'Draft', notes:'', tranches:[BLANK_T()], linkedPOs:[], committedVolume:0 };

function calcBlended(tranches, rates, provinces) {
  const ppnR=(parseFloat(rates?.ppn)||0)/100, bphR=(parseFloat(rates?.bphMigas)||0)/100;
  let tv=0, tval=0;
  tranches.forEach(t=>{
    const vol=parseFloat(t.vol)||0, base=parseFloat(t.basePrice)||0;
    const pR=(t.applyPBBKB&&!t.noPbbkb)?(parseFloat(provinces?.find(p=>p.name===t.pbbkbProvince)?.rate)||0)/100:0;
    tv+=vol; tval+=(base+(t.applyPPN?base*ppnR:0)+base*pR+(t.applyBPHBuy?base*bphR:0))*vol;
  });
  return { blended:tv>0?tval/tv:0, totalVol:tv };
}

function VolumeBar({ total, committed }) {
  const available = Math.max(0, total - committed);
  const pct = total>0 ? Math.min(100,(committed/total)*100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-blue-600 font-semibold">{Number(available).toLocaleString('id-ID')} L tersedia</span>
        <span className="text-gray-400">{Number(total).toLocaleString('id-ID')} L total</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-blue-500 h-2 rounded-full transition-all" style={{width:`${pct}%`}}/>
      </div>
      {committed>0&&<p className="text-xs text-orange-500 mt-0.5">{Number(committed).toLocaleString('id-ID')} L terikat SO</p>}
    </div>
  );
}

export default function Stok() {
  const { appData, userRole } = useApp();
  const nav = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [pos, setPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showLinkPO, setShowLinkPO] = useState(null);
  const [form, setForm] = useState(INIT);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('Semua');
  const pbbkbProvinces=appData?.pbbkbProvinces||[], rates=appData?.rates||{};

  useEffect(()=>{
    Promise.all([fetchCollection(STOCKS_REF()),fetchCollection(POS_REF())])
      .then(([s,p])=>{setStocks(s);setPOs(p);setLoading(false);});
  },[]);

  const set=k=>v=>setForm(p=>({...p,[k]:v}));
  const setT=(i,k,v)=>{const t=[...form.tranches];t[i]={...t[i],[k]:v};setForm(p=>({...p,tranches:t}));};
  const addT=()=>setForm(p=>({...p,tranches:[...p.tranches,BLANK_T()]}));
  const remT=(i)=>setForm(p=>({...p,tranches:p.tranches.filter((_,idx)=>idx!==i)}));
  const {blended,totalVol}=calcBlended(form.tranches,rates,pbbkbProvinces);

  const openNew=()=>{setForm(INIT);setEditing(null);setShowForm(true);};
  const openEdit=(s)=>{setForm({...INIT,...s,tranches:s.tranches||[BLANK_T()]});setEditing(s.id);setShowForm(true);};

  const save=async()=>{
    if(!form.label)return; setSaving(true);
    try{
      const totalVolume=form.tranches.reduce((s,t)=>s+(parseFloat(t.vol)||0),0);
      if(editing) await updateSubDoc(STOCKS_REF(),editing,{...form,totalVolume});
      else await createNumberedDoc('stock',STOCKS_REF(),{...form,totalVolume},seq=>`STK-GPP-${String(seq).padStart(4,'0')}`);
      const fresh=await fetchCollection(STOCKS_REF());setStocks(fresh);setShowForm(false);
    }finally{setSaving(false);}
  };

  const remove=async(id)=>{
    if(!canDelete(userRole)||!confirm('Hapus stok?'))return;
    await deleteSubDoc(STOCKS_REF(),id);setStocks(s=>s.filter(x=>x.id!==id));
  };

  const linkPO=async(stockId,po)=>{
    const stock=stocks.find(s=>s.id===stockId);if(!stock)return;
    const existing=stock.linkedPOs||[];
    if(existing.find(p=>p.poId===po.id))return;
    const newLinked=[...existing,{poId:po.id,docNumber:po.docNumber,vendor:po.vendorName||'',linkedAt:Date.now()}];
    await updateSubDoc(STOCKS_REF(),stockId,{linkedPOs:newLinked,status:'Confirmed'});
    setStocks(await fetchCollection(STOCKS_REF()));setShowLinkPO(null);
  };

  const unlinkPO=async(stockId,poId)=>{
    const stock=stocks.find(s=>s.id===stockId);if(!stock)return;
    const newLinked=(stock.linkedPOs||[]).filter(p=>p.poId!==poId);
    await updateSubDoc(STOCKS_REF(),stockId,{linkedPOs:newLinked,status:newLinked.length===0?'Draft':stock.status});
    setStocks(await fetchCollection(STOCKS_REF()));
  };

  const goCalc=(s)=>{sessionStorage.setItem('calcPrefill',JSON.stringify({cargoId:s.id,label:s.label,tranches:s.tranches||[]}));nav('/calculator');};
  const filtered=filter==='Semua'?stocks:stocks.filter(s=>s.status===filter);

  return(
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-800">Stok</h1><p className="text-gray-500 text-sm mt-1">Manajemen stok & supply tranches</p></div>
        <button onClick={openNew} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800">+ Stok Baru</button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {['Semua',...STATUSES].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter===s?'bg-blue-700 text-white':'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
            {s}{s!=='Semua'&&` (${stocks.filter(x=>x.status===s).length})`}
          </button>
        ))}
      </div>

      {loading?<p className="text-gray-400 text-sm">Memuat…</p>:filtered.length===0?(
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">📦</p><p className="text-gray-500">Belum ada stok.</p>
          <button onClick={openNew} className="mt-4 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">+ Stok Baru</button>
        </div>
      ):(
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(stock=>{
            const{blended:b,totalVol:tv}=calcBlended(stock.tranches||[],rates,pbbkbProvinces);
            const committed=stock.committedVolume||0;
            return(
              <div key={stock.id} className="bg-white rounded-xl shadow-sm p-5 border border-transparent hover:border-blue-100 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div><p className="font-semibold text-gray-800">{stock.label}</p><p className="text-xs font-mono text-blue-500 mt-0.5">{stock.docNumber}</p></div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[stock.status]||'bg-gray-100'}`}>{stock.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-xs">
                  <div><span className="text-gray-400">Produk</span><p className="text-gray-700 font-medium">{stock.product||'-'}</p></div>
                  <div><span className="text-gray-400">Kapal</span><p className="text-gray-700 truncate">{stock.vessel||'-'}</p></div>
                  <div><span className="text-gray-400">Loading Port</span><p className="text-gray-700">{stock.loadingPort||'-'}</p></div>
                  <div><span className="text-gray-400">ETA Load</span><p className="text-gray-700">{stock.etaLoad?formatDateShort(stock.etaLoad):'-'}</p></div>
                </div>
                <div className="bg-blue-50 rounded-lg px-3 py-2.5 mb-3">
                  <VolumeBar total={tv} committed={committed}/>
                  <div className="flex justify-between text-xs mt-2 text-blue-700">
                    <span>{(stock.tranches||[]).length} tranches</span>
                    <span className="font-semibold">Blended: {formatIDR(b)}/L</span>
                  </div>
                </div>
                {(stock.linkedPOs||[]).length>0&&(
                  <div className="mb-3">
                    <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">PO Terhubung</p>
                    <div className="space-y-1">
                      {stock.linkedPOs.map(lp=>(
                        <div key={lp.poId} className="flex items-center justify-between bg-gray-50 rounded px-2.5 py-1.5 text-xs">
                          <span className="font-mono text-blue-600">{lp.docNumber}</span>
                          <span className="text-gray-500 truncate mx-2">{lp.vendor}</span>
                          <button onClick={()=>unlinkPO(stock.id,lp.poId)} className="text-red-300 hover:text-red-500">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 border-t pt-3 flex-wrap">
                  <button onClick={()=>goCalc(stock)} className="flex-1 bg-blue-700 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-800">🧮 Kalkulasi</button>
                  <button onClick={()=>setShowLinkPO(stock.id)} className="px-3 py-2 border border-blue-200 rounded-lg text-xs text-blue-700 hover:bg-blue-50">🔗 PO</button>
                  <button onClick={()=>openEdit(stock)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">✏️</button>
                  {canDelete(userRole)&&<button onClick={()=>remove(stock.id)} className="px-3 py-2 border border-red-100 rounded-lg text-xs text-red-400 hover:bg-red-50">🗑️</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link PO modal */}
      {showLinkPO&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-gray-800">Hubungkan PO → Stok</h2>
              <button onClick={()=>setShowLinkPO(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5">
              <p className="text-xs text-gray-400 mb-4">Pilih PO pengadaan. Stok otomatis jadi <b>Confirmed</b>.</p>
              {pos.length===0?<p className="text-gray-400 text-sm">Belum ada PO.</p>:(
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {pos.map(po=>{
                    const stock=stocks.find(s=>s.id===showLinkPO);
                    const linked=(stock?.linkedPOs||[]).find(l=>l.poId===po.id);
                    return(
                      <div key={po.id} onClick={()=>!linked&&linkPO(showLinkPO,po)}
                        className={`flex items-center justify-between border rounded-lg px-4 py-3 ${linked?'bg-green-50 border-green-200':'hover:border-blue-300 cursor-pointer'}`}>
                        <div><p className="text-sm font-mono font-semibold text-blue-700">{po.docNumber}</p><p className="text-xs text-gray-500">{po.vendorName||'-'} · {po.poDate}</p></div>
                        {linked?<span className="text-xs text-green-600 font-semibold">✓ Terhubung</span>:<span className="text-xs text-blue-600">+ Hubungkan</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit/New form modal */}
      {showForm&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800 text-lg">{editing?'Edit Stok':'Stok Baru'}</h2>
              <button onClick={()=>setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Label Stok *</label>
                  <input type="text" value={form.label} onChange={e=>set('label')(e.target.value)} placeholder="e.g. Stok B40 Maret 2026 — Bontang"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                {[['product','Produk'],['vessel','Kapal / SPOB'],['loadingPort','Loading Port'],['dischargingPort','Discharging Port']].map(([k,l])=>(
                  <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                    <input type="text" value={form[k]||''} onChange={e=>set(k)(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                ))}
                {[['etaLoad','ETA Loading'],['etaDisch','ETA Discharging']].map(([k,l])=>(
                  <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                    <input type="date" value={form[k]||''} onChange={e=>set(k)(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700">⛽ Supply Tranches</h3>
                  <button onClick={addT} className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-100">+ Tranche</button>
                </div>
                <div className="space-y-3">
                  {form.tranches.map((t,i)=>{
                    const base=parseFloat(t.basePrice)||0,vol=parseFloat(t.vol)||0;
                    const ppnR=(parseFloat(rates.ppn)||0)/100;
                    const pR=(t.applyPBBKB&&!t.noPbbkb)?(parseFloat(pbbkbProvinces.find(p=>p.name===t.pbbkbProvince)?.rate)||0)/100:0;
                    const eff=base+(t.applyPPN?base*ppnR:0)+base*pR+(t.applyBPHBuy?base*(parseFloat(rates.bphMigas)||0)/100:0);
                    return(
                      <div key={t.id||i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <div className="flex justify-between mb-3">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tranche {i+1}</span>
                          {form.tranches.length>1&&<button onClick={()=>remT(i)} className="text-red-400 text-xs">✕ Hapus</button>}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Supplier</label>
                            <input type="text" value={t.supplier||''} onChange={e=>setT(i,'supplier',e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                          {[['vol','Volume (L)','number'],['basePrice','Harga Dasar (IDR/L)','number'],['loadDate','Tgl Loading','date'],['payDate','Tgl Bayar','date']].map(([k,l,tp])=>(
                            <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                              <input type={tp} value={t[k]||''} onChange={e=>setT(i,k,e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2">
                          {[['applyPPN',`PPN (${rates.ppn||11}%)`],['applyBPHBuy',`BPH (${rates.bphMigas||0.25}%)`]].map(([k,l])=>(
                            <label key={k} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                              <input type="checkbox" checked={t[k]} onChange={e=>setT(i,k,e.target.checked)} className="rounded"/>{l}
                            </label>
                          ))}
                          <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={t.applyPBBKB} onChange={e=>setT(i,'applyPBBKB',e.target.checked)} className="rounded"/>PBBKB
                          </label>
                        </div>
                        {t.applyPBBKB&&(
                          <div className="ml-4 flex items-center gap-3 mb-2">
                            <select value={t.pbbkbProvince} onChange={e=>setT(i,'pbbkbProvince',e.target.value)}
                              className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none bg-white">
                              <option value="">— Provinsi —</option>
                              {pbbkbProvinces.map((p,pi)=><option key={pi} value={p.name}>{p.name} ({p.rate}%)</option>)}
                            </select>
                            <label className="flex items-center gap-1.5 text-xs text-amber-600 cursor-pointer">
                              <input type="checkbox" checked={t.noPbbkb||false} onChange={e=>setT(i,'noPbbkb',e.target.checked)} className="rounded"/>Omit
                            </label>
                          </div>
                        )}
                        {base>0&&vol>0&&(
                          <div className="pt-2 border-t border-gray-200 flex flex-wrap gap-3 text-xs text-gray-600">
                            <span>Eff: <b className="text-blue-700">{formatIDR(eff)}/L</b></span>
                            <span>{Number(vol).toLocaleString('id-ID')} L → <b>{formatIDR(eff*vol)}</b></span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {totalVol>0&&(
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex justify-between items-center">
                    <span className="text-sm text-blue-700 font-semibold">Blended Buy Price</span>
                    <div className="text-right">
                      <p className="font-mono font-bold text-blue-800">{formatIDR(blended)}/L</p>
                      <p className="text-xs text-blue-400">{Number(totalVol).toLocaleString('id-ID')} L</p>
                    </div>
                  </div>
                )}
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Catatan</label>
                <textarea value={form.notes||''} onChange={e=>set('notes')(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
            </div>
            <div className="flex gap-3 p-5 border-t sticky bottom-0 bg-white">
              <button onClick={save} disabled={saving||!form.label} className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {saving?'⏳':editing?'💾 Simpan':'+ Buat Stok'}
              </button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
