import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, POS_REF, DOS_REF, CALCS_REF } from '../../firebase.js';
import { formatIDR, formatDateShort } from '../../utils/utils.js';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ label, value, sub, color = 'blue', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl shadow-sm p-5 border-l-4 border-${color}-500 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
  >
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
  const [calcs, setCalcs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, d, c] = await Promise.all([
        fetchCollection(POS_REF()),
        fetchCollection(DOS_REF()),
        fetchCollection(CALCS_REF()),
      ]);
      setPOs(p); setDOs(d); setCalcs(c);
      setLoading(false);
    })();
  }, []);

  const totalPOValue = pos.reduce((s, p) => s + (p.totalOrder || 0), 0);
  const recentPOs    = pos.slice(0, 5);
  const recentDOs    = dos.slice(0, 5);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">PT Global Petro Pasifik — FuelOps</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total PO" value={loading ? '…' : pos.length}
          sub={`Nilai: ${loading ? '…' : formatIDR(totalPOValue)}`}
          color="blue" onClick={() => nav('/purchase-order')} />
        <StatCard label="Delivery Orders" value={loading ? '…' : dos.length}
          sub="Surat Jalan + BDR" color="green" onClick={() => nav('/delivery-order')} />
        <StatCard label="Kalkulasi Tersimpan" value={loading ? '…' : calcs.length}
          sub="Snapshot profit" color="purple" onClick={() => nav('/calculator')} />
        <StatCard label="Entitas" value="GPP"
          sub={appData?.company?.name || ''} color="orange" />
      </div>

      {/* Recent tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent POs */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Purchase Order Terbaru</h2>
            <button onClick={() => nav('/purchase-order')}
              className="text-blue-600 text-xs hover:underline">Lihat Semua →</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">Memuat…</p> :
            recentPOs.length === 0 ? <p className="text-gray-400 text-sm">Belum ada PO.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left pb-2">No. PO</th>
                  <th className="text-left pb-2">Vendor</th>
                  <th className="text-right pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {recentPOs.map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 font-mono text-xs text-blue-700">{p.docNumber}</td>
                    <td className="py-2 text-gray-600 truncate max-w-[120px]">{p.vendorName || '-'}</td>
                    <td className="py-2 text-right text-gray-800">{formatIDR(p.totalOrder)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent DOs */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Delivery Order Terbaru</h2>
            <button onClick={() => nav('/delivery-order')}
              className="text-blue-600 text-xs hover:underline">Lihat Semua →</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">Memuat…</p> :
            recentDOs.length === 0 ? <p className="text-gray-400 text-sm">Belum ada DO.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left pb-2">No. Surat Jalan</th>
                  <th className="text-left pb-2">Customer</th>
                  <th className="text-right pb-2">Volume (L)</th>
                </tr>
              </thead>
              <tbody>
                {recentDOs.map(d => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 font-mono text-xs text-green-700">{d.sjNumber || d.docNumber}</td>
                    <td className="py-2 text-gray-600 truncate max-w-[120px]">{d.customerName || '-'}</td>
                    <td className="py-2 text-right text-gray-800">{Number(d.quantity || 0).toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Company info strip */}
      {appData?.company && (
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-xs text-blue-700">
          <span className="font-semibold">{appData.company.name}</span>
          {' · '}{appData.company.address1}
          {appData.company.address2 ? ' · ' + appData.company.address2 : ''}
        </div>
      )}
    </div>
  );
}
