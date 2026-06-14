import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, DOS_REF, POS_REF } from '../../firebase.js';
import { formatIDR, formatDateID, buildDONumber, buildBDRNumber, today, terbilang , fmtDate} from '../../utils/utils.js';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

const INIT = { doDate:today(), linkedPO:'', customerName:'', customerAddr:'', destination:'', vessel:'', product:'', qty:'', unit:'Liter', density:'', temperature:'', flowMeter:'', netQty:'', driverName:'', notes:'' };

export default function DeliveryOrder() {
  const { appData } = useApp();
  const [form, setForm] = useState(INIT);
  const [dos, setDOs] = useState([]);
  const [pos, setPOs] = useState([]);
  const [printData, setPrintData] = useState(null);
  const [printMode, setPrintMode] = useState('sj');
  const [saving, setSaving] = useState(false);
  const [loadingList, setLL] = useState(true);
  const co = appData?.company || {};

  useEffect(() => {
    fetchCollection(DOS_REF()).then(d => { setDOs(d); setLL(false); });
    fetchCollection(POS_REF()).then(p => setPOs(p));
  }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  const loadFromPO = (poId) => {
    const po = pos.find(p => p.id === poId);
    if (!po) return;
    const firstItem = (po.items||[])[0]||{};
    setForm(p => ({ ...p, linkedPO: poId, customerName: po.vendorName||'', product: firstItem.description||'', qty: firstItem.qty||'', unit: firstItem.unit||'Liter' }));
  };

  const saveAndPrint = async (mode) => {
    setSaving(true);
    try {
      const d = new Date(form.doDate);
      const { id } = await createNumberedDoc('do', DOS_REF(), { ...form }, (seq) => ({
        sjNumber:  buildDONumber(seq,  d.getMonth()+1, d.getFullYear()),
        bdrNumber: buildBDRNumber(seq, d.getMonth()+1, d.getFullYear()),
      }));
      const fresh = await fetchCollection(DOS_REF()); setDOs(fresh);
      const created = fresh.find(x => x.id === id);
      if (created) { setPrintData(created); setPrintMode(mode); }
    } finally { setSaving(false); }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pt-14 md:pt-6">
      {printData && (
        <PrintWrapper onClose={() => setPrintData(null)}>
          {printMode === 'sj' ? <SJPrint data={printData} company={co} /> : <BDRPrint data={printData} company={co} />}
        </PrintWrapper>
      )}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Delivery Order</h1>
        <div className="flex gap-2">
          <button onClick={() => saveAndPrint('sj')}  disabled={saving} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">{saving?'⏳':'🖨️ Surat Jalan'}</button>
          <button onClick={() => saveAndPrint('bdr')} disabled={saving} className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">{saving?'⏳':'🖨️ BDR'}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Detail Pengiriman</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-gray-500 mb-1">Tanggal DO</label><input type="date" value={form.doDate} onChange={e=>set('doDate')(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              <div><label className="block text-xs text-gray-500 mb-1">Link ke PO (opsional)</label>
                <select value={form.linkedPO} onChange={e=>loadFromPO(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— Tanpa PO —</option>
                  {pos.map(p=><option key={p.id} value={p.id}>{p.docNumber} — {p.vendorName}</option>)}
                </select>
              </div>
              {[['customerName','Nama Customer'],['customerAddr','Alamat Customer'],['destination','Lokasi Pengiriman'],['vessel','Kapal / Armada']].map(([k,l])=>(
                <div key={k} className={k==='customerAddr'||k==='destination'?'col-span-2':''}><label className="block text-xs text-gray-500 mb-1">{l}</label><input type="text" value={form[k]||''} onChange={e=>set(k)(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Detail Produk & Pengukuran</h2>
            <div className="grid grid-cols-2 gap-4">
              {[['product','Produk'],['qty','Volume Awal (L)'],['unit','Satuan'],['density','Density (kg/L)'],['temperature','Suhu (°C)'],['flowMeter','Flow Meter'],['netQty','Volume Nett (L)'],['driverName','Nama Nakhoda / Driver']].map(([k,l])=>(
                <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label><input type="text" value={form[k]||''} onChange={e=>set(k)(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <label className="block text-xs text-gray-500 mb-1">Catatan / Keterangan</label>
            <textarea value={form.notes||''} onChange={e=>set('notes')(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
          </div>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Dokumen</h2>
            <p className="text-xs text-gray-400 mb-3">Klik tombol di atas untuk menyimpan dan langsung mencetak dokumen yang dipilih.</p>
            <div className="space-y-2">
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700"><b>Surat Jalan</b> — Dokumen pengiriman bilingual (ID/EN), untuk sopir/nakhoda dan penerima.</div>
              <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700"><b>BDR</b> — Bunker Delivery Receipt, untuk konfirmasi kuantitas dan kualitas BBM di lokasi penerima.</div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Riwayat DO</h2>
            {loadingList?<p className="text-gray-400 text-sm">Memuat…</p>:dos.length===0?<p className="text-gray-400 text-sm">Belum ada DO.</p>:(
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {dos.map(d=>(
                  <div key={d.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50">
                    <p className="text-xs font-mono text-blue-600">{d.sjNumber}</p>
                    <p className="text-sm text-gray-700 truncate">{d.customerName||'-'}</p>
                    <p className="text-xs text-gray-400">{d.product} · {d.doDate}</p>
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={()=>{setPrintData(d);setPrintMode('sj');}} className="flex-1 text-xs bg-blue-50 text-blue-700 py-1 rounded hover:bg-blue-100">SJ</button>
                      <button onClick={()=>{setPrintData(d);setPrintMode('bdr');}} className="flex-1 text-xs bg-green-50 text-green-700 py-1 rounded hover:bg-green-100">BDR</button>
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

function SJPrint({ data, company }) {
  return (
    <div className="bg-white font-sans text-sm" style={{minHeight:'297mm',padding:'12mm'}}>
      <div className="flex items-start justify-between mb-4 border-b-2 border-blue-800 pb-3">
        <div className="flex items-center gap-3"><img src={logo} alt="GPP" className="w-14 h-14 object-contain"/><div><p className="font-bold text-blue-900">{company.name||'PT Global Petro Pasifik'}</p><p className="text-gray-500 text-xs">{company.address1}</p></div></div>
        <div className="text-right"><p className="font-bold text-lg">SURAT JALAN</p><p className="text-gray-400 text-xs font-normal">DELIVERY ORDER</p><p className="text-xs text-gray-500 mt-1">No: {data.sjNumber}</p><p className="text-xs text-gray-500">{formatDateID(data.doDate)}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-6 mb-4 text-xs">
        <div className="space-y-1">
          <div className="flex gap-2"><span className="text-gray-500 w-28">Kepada / To</span><span className="font-semibold">: {data.customerName}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Alamat / Address</span><span>: {data.customerAddr}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Lokasi / Location</span><span>: {data.destination}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Kapal / Vessel</span><span>: {data.vessel}</span></div>
        </div>
        <div className="space-y-1">
          <div className="flex gap-2"><span className="text-gray-500 w-28">Produk / Product</span><span className="font-semibold">: {data.product}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Volume Awal</span><span>: {Number(data.qty||0).toLocaleString('id-ID')} {data.unit}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Volume Nett</span><span className="font-bold text-blue-800">: {Number(data.netQty||data.qty||0).toLocaleString('id-ID')} {data.unit}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Nakhoda / Driver</span><span>: {data.driverName}</span></div>
        </div>
      </div>
      {data.notes&&<div className="bg-gray-50 rounded p-3 mb-4 text-xs text-gray-600">{data.notes}</div>}
      <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-6 text-xs text-amber-700">⚠️ Mohon periksa volume dan kualitas BBM sebelum penandatanganan. Please verify quantity and quality before signing.</div>
      <div className="grid grid-cols-3 gap-4 text-xs">
        {[['Pengirim / Sender','GPP',company.name],['Nakhoda / Driver','',data.driverName||''],['Penerima / Receiver',data.customerName,'']].map(([label,sub,name])=>(
          <div key={label} className="text-center"><p className="text-gray-500">{label}</p>{sub&&<p className="text-gray-700 text-[10px]">{sub}</p>}<div className="mt-14 border-t border-gray-400"><p className="mt-1 text-gray-600 text-[10px]">{name||'(................................)'}</p></div></div>
        ))}
      </div>
    </div>
  );
}

function BDRPrint({ data, company }) {
  return (
    <div className="bg-white font-sans text-sm" style={{minHeight:'297mm',padding:'12mm'}}>
      <div className="flex items-start justify-between mb-4 border-b-2 border-green-700 pb-3">
        <div className="flex items-center gap-3"><img src={logo} alt="GPP" className="w-14 h-14 object-contain"/><div><p className="font-bold text-green-900">{company.name||'PT Global Petro Pasifik'}</p><p className="text-gray-500 text-xs">{company.address1}</p></div></div>
        <div className="text-right"><p className="font-bold text-lg">BUNKER DELIVERY RECEIPT</p><p className="text-xs text-gray-500 mt-1">No: {data.bdrNumber||data.sjNumber}</p><p className="text-xs text-gray-500">{formatDateID(data.doDate)}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-6 mb-5 text-xs">
        <div className="space-y-1">
          <div className="flex gap-2"><span className="text-gray-500 w-28">Penerima</span><span className="font-semibold">: {data.customerName}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Lokasi</span><span>: {data.destination}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Kapal / Armada</span><span>: {data.vessel}</span></div>
        </div>
        <div className="space-y-1">
          <div className="flex gap-2"><span className="text-gray-500 w-28">Produk</span><span className="font-semibold">: {data.product}</span></div>
          <div className="flex gap-2"><span className="text-gray-500 w-28">Tanggal</span><span>: {formatDateID(data.doDate)}</span></div>
        </div>
      </div>
      <table className="w-full border-collapse text-xs mb-5">
        <thead><tr className="bg-green-700 text-white">{['Parameter','Nilai','Satuan'].map(h=><th key={h} className="border border-green-600 px-3 py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>
          {[['Volume Awal / Gross Quantity',Number(data.qty||0).toLocaleString('id-ID'),data.unit||'L'],['Density',data.density||'-','kg/L'],['Suhu / Temperature',data.temperature||'-','°C'],['Flow Meter',data.flowMeter||'-',''],['Volume Nett / Net Quantity',Number(data.netQty||data.qty||0).toLocaleString('id-ID'),data.unit||'L']].map(([k,v,u],i)=>(
            <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
              <td className="border border-gray-200 px-3 py-2 font-medium">{k}</td>
              <td className="border border-gray-200 px-3 py-2 font-mono font-bold text-green-800">{v}</td>
              <td className="border border-gray-200 px-3 py-2 text-gray-500">{u}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.notes&&<p className="text-xs text-gray-500 mb-5">{data.notes}</p>}
      <div className="grid grid-cols-2 gap-6 text-xs">
        {[['Supplier / Pengirim',company.name||'PT Global Petro Pasifik'],['Penerima / Receiver',data.customerName||'']].map(([label,name])=>(
          <div key={label} className="text-center"><p className="text-gray-500">{label}</p><p className="text-gray-700 text-[10px] mt-0.5">{name}</p><div className="mt-14 border-t border-gray-400"><p className="mt-1 text-gray-600 text-[10px]">(................................)</p></div></div>
        ))}
      </div>
    </div>
  );
}
