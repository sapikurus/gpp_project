import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import { fetchCollection, POS_REF, DOS_REF, CALCS_REF, CARGOS_REF } from '../../firebase.js';
import { formatIDR } from '../../utils/utils.js';

const StatCard = ({ label, value, sub, color='blue', onClick }) => (
  <div onClick={onClick}
    className={`bg-white rounded-xl shadow-sm p-5 border-l-4 border-${color}-500 ${onClick?'cursor-pointer hover:shadow-md transition-shadow':''}`}>
    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
    <p className="text-2xl font-bold text-gray-800">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

export default function Dashboard() {
  const { appData } = useApp();
  const nav = useNavigate();
  const [pos,   setPOs]   = useState([]);
  const [dos,   setDOs]   = useState([]);
  const [cargos,setCargos]= useState([]);
  const [loading,setL]    = useState(true);

  useEffect(() => {
    Promise.all([
      fetchCollection(POS_REF()),
      fetchCollection(DOS_REF()),
      fetchCollection(CARGOS_REF()),
    ]).then(([p,d,c]) => { setPOs(p); setDOs(d); setCargos(c); setL(false); });
  }, []);

  const totalPOValue = pos.reduce((s,p) => s+(p.totalOrder||0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">PT Global Petro Pasifik — FuelOps</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Kargo Aktif" value={loading?'…':cargos.filter(c=>c.status!=='Selesai'&&c.status!=='Batal').length}
          sub="Dari total cargo" color="blue" onClick={() => nav('/cargo')} />
        <StatCard label="Total PO" value={loading?'…':pos.length}
          sub={loading?'…':formatIDR(totalPOValue)} color="purple" onClick={() => nav('/purchase-order')} />
        <StatCard label="Delivery Orders" value={loading?'…':dos.length}
          sub="Surat Jalan + BDR" color="green" onClick={() => nav('/delivery-order')} />
        <StatCard label="Entitas" value="GPP" sub={appData?.company?.name||''} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Cargo */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Kargo Terbaru</h2>
            <button onClick={() => nav('/cargo')} className="text-blue-600 text-xs hover:underline">Lihat Semua →</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">Memuat…</p> :
           cargos.length === 0 ? <p className="text-gray-400 text-sm">Belum ada kargo.</p> : (
            <div className="space-y-2">
              {cargos.slice(0,5).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{c.label}</p>
                    <p className="text-xs text-gray-400">{c.product} · {c.vessel||'-'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    c.status==='Selesai'?'bg-green-100 text-green-700':
                    c.status==='Dalam Perjalanan'?'bg-yellow-100 text-yellow-700':
                    'bg-blue-100 text-blue-700'}`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent POs */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Purchase Order Terbaru</h2>
            <button onClick={() => nav('/purchase-order')} className="text-blue-600 text-xs hover:underline">Lihat Semua →</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">Memuat…</p> :
           pos.length === 0 ? <p className="text-gray-400 text-sm">Belum ada PO.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b">
                <th className="text-left pb-2">No. PO</th>
                <th className="text-left pb-2">Vendor</th>
                <th className="text-right pb-2">Total</th>
              </tr></thead>
              <tbody>{pos.slice(0,5).map(p => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs text-blue-700">{p.docNumber}</td>
                  <td className="py-2 text-gray-600 truncate max-w-[120px]">{p.vendorName||'-'}</td>
                  <td className="py-2 text-right">{formatIDR(p.totalOrder)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      {appData?.company && (
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 text-xs text-blue-700">
          <b>{appData.company.name}</b>{' · '}{appData.company.address1}
          {appData.company.address2 ? ' · '+appData.company.address2 : ''}
        </div>
      )}
    </div>
  );
}
