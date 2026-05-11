import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc, CARGOS_REF } from '../../firebase.js';
import { today, formatDateShort, formatIDR, daysBetween } from '../../utils/utils.js';

const STATUSES = ['Draft','Konfirmasi','Dalam Perjalanan','Selesai','Batal'];
const STATUS_COLOR = { 'Draft':'bg-gray-100 text-gray-600','Konfirmasi':'bg-blue-100 text-blue-700','Dalam Perjalanan':'bg-yellow-100 text-yellow-700','Selesai':'bg-green-100 text-green-700','Batal':'bg-red-100 text-red-600' };
const BLANK_T = () => ({ id:Date.now().toString()+Math.random(), vol:'', basePrice:'', loadDate:today(), payDate:today(), applyPPN:true, applyPBBKB:false, noPbbkb:false, pbbkbProvince:'', applyBPHBuy:false });
const INIT = { label:'', product:'', vessel:'', loadingPort:'', dischargingPort:'', etaLoad:today(), etaDisch:'', status:'Draft', notes:'', tranches:[BLANK_T()] };

function calcBlended(tranches, rates, provinces) {
  const ppnR = (parseFloat(rates?.ppn)||0)/100, bphR = (parseFloat(rates?.bphMigas)||0)/100;
  let tv=0, tval=0;
  tranches.forEach(t => {
    const vol=parseFloat(t.vol)||0, base=parseFloat(t.basePrice)||0;
    const pR = (t.applyPBBKB&&!t.noPbbkb) ? (parseFloat(provinces?.find(p=>p.name===t.pbbkbProvince)?.rate)||0)/100 : 0;
    const eff = base + (t.applyPPN?base*ppnR:0) + base*pR + (t.applyBPHBuy?base*bphR:0);
    tv+=vol; tval+=eff*vol;
  });
  return { blended: tv>0?tval/tv:0, totalVol:tv };
}

export default function Cargo() {
  const { appData } = useApp();
  const nav = useNavigate();
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INIT);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('Semua');
  const products = appData?.products||[], vessels = appData?.vessels||appData?.facilities||[], pbbkbProvinces = appData?.pbbkbProvinces||[], rates = appData?.rates||{};

  useEffect(() => { fetchCollection(CARGOS_REF()).then(c=>{setCargos(c);setLoading(false);}); }, []);

  const set = k => v => setForm(p=>({...p,[k]:v}));
  const setT = (i,k,v) => { const t=[...form.tranches]; t[i]={...t[i],[k]:v}; setForm(p=>({...p,tranches:t})); };
  const addT = () => setForm(p=>({...p,tranches:[...p.tranches,BLANK_T()]}));
  const remT = (i) => setForm(p=>({...p,tranches:p.tranches.filter((_,idx)=>idx!==i)}));
  const { blended, totalVol } = calcBlended(form.tranches, rates, pbbkbProvinces);

  const openNew = () => { setForm(INIT); setEditing(null); setShowForm(true); };
  const openEdit = (c) => { setForm({...INIT,...c,tranches:c.tranches||[BLANK_T()]}); setEditing(c.id); setShowForm(true); };

  const save = async () => {
    if (!form.label) return; setSaving(true);
    try {
      if (editing) await updateSubDoc(CARGOS_REF(), editing, form);
      else await createNumberedDoc('cargo', CARGOS_REF(), form, seq=>`CARGO-GPP-${String(seq).padStart(4,'0')}`);
      const fresh = await fetchCollection(CARGOS_REF()); setCargos(fresh); setShowForm(false);
    } finally { setSaving(false); }
  };
  const remove = async (id) => { if(!confirm('Hapus kargo ini?'))return; await deleteSubDoc(CARGOS_REF(),id); setCargos(c=>c.filter(x=>x.id!==id)); };
  const goCalc = (cargo) => { sessionStorage.setItem('calcPrefill',JSON.stringify({label:cargo.label,cargoId:cargo.id,tranches:cargo.tranches||[]})); nav('/calculator'); };
  const updStatus = async (id,status) => { await updateSubDoc(CARGOS_REF(),id,{status}); setCargos(c=>c.map(x=>x.id===id?{...x,status}:x)); };
  const filtered = filter==='Semua'?cargos:cargos.filter(c=>c.status===filter);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-800">Kargo</h1><p className="text-gray-500 text-sm mt-1">Manajemen supply kargo</p></div>
        <button onClick={openNew} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800">+ Kargo Baru</button>
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {['Semua',...STATUSES].map(s=>(
          <button key={s} onClick={()=>setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter===s?'bg-blue-700 text-white':'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}>
            {s}{s!=='Semua'&&` (${cargos.filter(c=>c.status===s).length})`}
          </button>
        ))}
      </div>
      {loading?<p className="text-gray-400 text-sm">Memuat…</p>:filtered.length===0?(
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">📦</p><p className="text-gray-500">Belum ada kargo.</p>
          <button onClick={openNew} className="mt-4 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-800">+ Buat Kargo Baru</button>
        </div>
      ):(
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(cargo=>{
            const{blended:b,totalVol:tv}=calcBlended(cargo.tranches||[],rates,pbbkbProvinces);
            return(
              <div key={cargo.id} className="bg-white rounded-xl shadow-sm p-5 border border-transparent hover:border-blue-100 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div><p className="font-semibold text-gray-800">{cargo.label}</p><p className="text-xs font-mono text-blue-500 mt-0.5">{cargo.docNumber}</p></div>
                  <select value={cargo.status} onChange={e=>updStatus(cargo.id,e.target.value)} className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLOR[cargo.status]||'bg-gray-100'}`}>
                    {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 text-xs">
                  <div><span className="text-gray-400">Produk</span><p className="text-gray-700 font-medium">{cargo.product||'-'}</p></div>
                  <div><span className="text-gray-400">Kapal</span><p className="text-gray-700 truncate">{cargo.vessel||'-'}</p></div>
                  <div><span className="text-gray-400">Loading</span><p className="text-gray-700">{cargo.loadingPort||'-'}</p></div>
                  <div><span className="text-gray-400">Discharging</span><p className="text-gray-700">{cargo.dischargingPort||'-'}</p></div>
                  <div><span className="text-gray-400">ETA Load</span><p className="text-gray-700">{cargo.etaLoad?formatDateShort(cargo.etaLoad):'-'}</p></div>
                  <div><span className="text-gray-400">ETA Disch.</span><p className="text-gray-700">{cargo.etaDisch?formatDateShort(cargo.etaDisch):'-'}</p></div>
                </div>
                <div className="bg-blue-50 rounded-lg px-3 py-2 mb-3 text-xs">
                  <div className="flex justify-between text-blue-700 mb-1"><span className="font-semibold">Supply Tranches ({(cargo.tranches||[]).length})</span><span>Total: <b>{Number(tv).toLocaleString('id-ID')} L</b></span></div>
                  <div className="flex justify-between text-blue-600"><span>Blended Buy Price</span><span className="font-mono font-semibold">{formatIDR(b)}/L</span></div>
                </div>
                <div className="flex gap-2 border-t pt-3">
                  <button onClick={()=>goCalc(cargo)} className="flex-1 bg-blue-700 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-800">🧮 Hitung Profit</button>
                  <button onClick={()=>openEdit(cargo)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">✏️</button>
                  <button onClick={()=>remove(cargo.id)} className="px-3 py-2 border border-red-100 rounded-lg text-xs text-red-400 hover:bg-red-50">🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm&&(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-800 text-lg">{editing?'Edit Kargo':'Kargo Baru'}</h2>
              <button onClick={()=>setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Label Kargo *</label>
                  <input type="text" value={form.label} onChange={e=>set('label')(e.target.value)} placeholder="e.g. Kargo Maret 2026 - Bontang"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                {[['product','Produk'],['vessel','Kapal / SPOB'],['loadingPort','Loading Port'],['dischargingPort','Discharging Port']].map(([k,l])=>(
                  <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                    <input type="text" value={form[k]||''} onChange={e=>set(k)(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                ))}
                {[['etaLoad','ETA Loading','date'],['etaDisch','ETA Discharging','date']].map(([k,l,t])=>(
                  <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                    <input type={t} value={form[k]||''} onChange={e=>set(k)(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                ))}
                <div><label className="block text-xs text-gray-500 mb-1">Status</label>
                  <select value={form.status} onChange={e=>set('status')(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select></div>
              </div>

              {/* Tranches */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700">⛽ Supply Tranches</h3>
                  <button onClick={addT} className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-100">+ Tambah Tranche</button>
                </div>
                <div className="space-y-3">
                  {form.tranches.map((t,i)=>{
                    const vol=parseFloat(t.vol)||0, base=parseFloat(t.basePrice)||0;
                    const pR=(t.applyPBBKB&&!t.noPbbkb)?(parseFloat(pbbkbProvinces.find(p=>p.name===t.pbbkbProvince)?.rate)||0)/100:0;
                    const ppnA=t.applyPPN?base*((parseFloat(rates.ppn)||0)/100):0;
                    const pbbkbA=base*pR, bphA=t.applyBPHBuy?base*((parseFloat(rates.bphMigas)||0)/100):0;
                    const eff=base+ppnA+pbbkbA+bphA, top=daysBetween(t.loadDate,t.payDate);
                    return(
                      <div key={t.id||i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tranche {i+1}</span>
                          {form.tranches.length>1&&<button onClick={()=>remT(i)} className="text-red-400 hover:text-red-600 text-xs">✕ Hapus</button>}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {[['vol','Volume (Liter)','number'],['basePrice','Harga Dasar (IDR/L)','number'],['loadDate','Tgl Loading','date'],['payDate','Tgl Bayar (TOP)','date']].map(([k,l,tp])=>(
                            <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
                              <input type={tp} value={t[k]||''} onChange={e=>setT(i,k,e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={t.applyPPN} onChange={e=>setT(i,'applyPPN',e.target.checked)} className="rounded"/>
                            <span className="text-xs text-gray-700">PPN ({rates.ppn||11}%){t.applyPPN&&base>0&&<span className="text-gray-400 ml-1">+{formatIDR(ppnA)}/L</span>}</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={t.applyBPHBuy} onChange={e=>setT(i,'applyBPHBuy',e.target.checked)} className="rounded"/>
                            <span className="text-xs text-gray-700">BPH Migas ({rates.bphMigas||0.25}%){t.applyBPHBuy&&base>0&&<span className="text-gray-400 ml-1">+{formatIDR(bphA)}/L</span>}</span>
                          </label>
                          <div>
                            <label className="flex items-center gap-2 cursor-pointer mb-1">
                              <input type="checkbox" checked={t.applyPBBKB} onChange={e=>setT(i,'applyPBBKB',e.target.checked)} className="rounded"/>
                              <span className="text-xs text-gray-700">PBBKB (supplier charge)</span>
                            </label>
                            {t.applyPBBKB&&(
                              <div className="ml-6 space-y-1">
                                <select value={t.pbbkbProvince} onChange={e=>setT(i,'pbbkbProvince',e.target.value)}
                                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                                  <option value="">— Pilih Provinsi Supplier —</option>
                                  {pbbkbProvinces.map((p,pi)=><option key={pi} value={p.name}>{p.name} ({p.rate}%)</option>)}
                                </select>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={t.noPbbkb||false} onChange={e=>setT(i,'noPbbkb',e.target.checked)} className="rounded"/>
                                  <span className="text-xs text-amber-600">Omit PBBKB <span className="text-gray-400">(non-Wapu / non-PKP supplier)</span></span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                        {base>0&&vol>0&&(
                          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-4 text-xs text-gray-600">
                            <span>TOP: <b className={top>365?'text-red-500':''}>{top} hari</b></span>
                            <span>Effective: <b className="text-blue-700">{formatIDR(eff)}/L</b></span>
                            <span>Vol: <b>{Number(vol).toLocaleString('id-ID')} L</b></span>
                            <span>Nilai: <b>{formatIDR(eff*vol)}</b></span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {totalVol>0&&(
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex justify-between items-center">
                    <span className="text-sm text-blue-700 font-semibold">Blended Buy Price</span>
                    <div className="text-right"><p className="font-mono font-bold text-blue-800 text-base">{formatIDR(blended)}/L</p><p className="text-xs text-blue-500">Total: {Number(totalVol).toLocaleString('id-ID')} L</p></div>
                  </div>
                )}
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">Catatan</label>
                <textarea value={form.notes||''} onChange={e=>set('notes')(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
            </div>
            <div className="flex gap-3 p-5 border-t sticky bottom-0 bg-white">
              <button onClick={save} disabled={saving||!form.label} className="flex-1 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {saving?'⏳ Menyimpan…':editing?'💾 Simpan Perubahan':'+ Buat Kargo'}
              </button>
              <button onClick={()=>setShowForm(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
