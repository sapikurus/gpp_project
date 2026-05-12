import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import { fetchCollection, POS_REF, DOS_REF, CALCS_REF, STOCKS_REF, SOS_REF } from '../../firebase.js';
import { formatIDR } from '../../utils/utils.js';
import { statusMeta, canApprove, getChain } from '../../utils/approvalUtils.js';

const StatCard = ({ label, value, sub, color='blue', onClick, badge }) => (
  <div onClick={onClick} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 border-${color}-500 ${onClick?'cursor-pointer hover:shadow-md transition-shadow':''}`}>
    <div className="flex items-start justify-between">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {badge && <span className="text-[10px] bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full">{badge}</span>}
    </div>
    <p className="text-2xl font-bold text-gray-800">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

export default function Dashboard() {
  const { appData, userRole } = useApp();
  const nav = useNavigate();
  const [pos,    setPOs]    = useState([]);
  const [dos,    setDOs]    = useState([]);
  const [stocks, setStocks] = useState([]);
  const [sos,    setSOs]    = useState([]);
  const [loading,setL]      = useState(true);
  const chain_po = getChain(appData?.settings, 'po');
  const chain_so = getChain(appData?.settings, 'so');
  const chain_ol = getChain(appData?.settings, 'ol');

  useEffect(() => {
    Promise.all([
      fetchCollection(POS_REF()),
      fetchCollection(DOS_REF()),
      fetchCollection(STOCKS_REF()),
      fetchCollection(SOS_REF()),
    ]).then(([p,d,st,s]) => { setPOs(p); setDOs(d); setStocks(st); setSOs(s); setL(false); });
  }, []);

  // Pending approvals for this user's role
  const pendingPOs = pos.filter(p => canApprove(userRole, p.approvalStatus, chain_po));
  const pendingSOs = sos.filter(s => canApprove(userRole, s.approvalStatus, chain_so));
  const totalPending = pendingPOs.length + pendingSOs.length;

  // Stock metrics
  const confirmedStocks = stocks.filter(s => s.status === 'Confirmed');
  const totalAvailable  = confirmedStocks.reduce((sum, s) => sum + Math.max(0, (s.totalVolume||0)-(s.committedVolume||0)), 0);
  const totalCommitted  = confirmedStocks.reduce((sum, s) => sum + (s.committedVolume||0), 0);

  // SO metrics
  const approvedSOs   = sos.filter(s => s.approvalStatus === 'approved');
  const totalSOVolume = approvedSOs.reduce((sum, s) => sum + (parseFloat(s.volume)||0), 0);
  const totalPOValue  = pos.reduce((s, p) => s + (p.totalOrder||0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">PT Global Petro Pasifik</p>
      </div>

      {/* Pending approvals banner */}
      {totalPending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold text-yellow-800">⏳ {totalPending} dokumen menunggu persetujuan Anda</p>
            <p className="text-xs text-yellow-600 mt-0.5">
              {pendingPOs.length > 0 && `${pendingPOs.length} PO`}
              {pendingPOs.length > 0 && pendingSOs.length > 0 && ' · '}
              {pendingSOs.length > 0 && `${pendingSOs.length} SO`}
            </p>
          </div>
          <div className="flex gap-2">
            {pendingPOs.length > 0 && <button onClick={() => nav('/purchase-order')} className="text-xs bg-yellow-600 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-700">Lihat PO →</button>}
            {pendingSOs.length > 0 && <button onClick={() => nav('/sales-order')}    className="text-xs bg-yellow-600 text-white px-3 py-1.5 rounded-lg hover:bg-yellow-700">Lihat SO →</button>}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Stok Tersedia" value={loading?'…':Number(totalAvailable).toLocaleString('id-ID')+' L'}
          sub={`dari ${confirmedStocks.length} stok confirmed`} color="blue" onClick={()=>nav('/stok')} />
        <StatCard label="Terikat SO" value={loading?'…':Number(totalCommitted).toLocaleString('id-ID')+' L'}
          sub={`${approvedSOs.length} SO disetujui`} color="orange" onClick={()=>nav('/sales-order')} />
        <StatCard label="Total PO" value={loading?'…':pos.length}
          sub={formatIDR(totalPOValue)} color="purple" onClick={()=>nav('/purchase-order')}
          badge={pendingPOs.length > 0 ? String(pendingPOs.length) : null} />
        <StatCard label="Delivery Orders" value={loading?'…':dos.length}
          sub="Surat Jalan + BDR" color="green" onClick={()=>nav('/delivery-order')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confirmed stocks with volume bars */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Stok Confirmed</h2>
            <button onClick={()=>nav('/stok')} className="text-blue-600 text-xs hover:underline">Lihat Semua →</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">Memuat…</p> :
           confirmedStocks.length === 0 ? <p className="text-gray-400 text-sm">Belum ada stok confirmed.</p> : (
            <div className="space-y-3">
              {confirmedStocks.slice(0,4).map(s => {
                const avail = Math.max(0,(s.totalVolume||0)-(s.committedVolume||0));
                const pct   = s.totalVolume > 0 ? Math.min(100,((s.committedVolume||0)/s.totalVolume)*100) : 0;
                return (
                  <div key={s.id} className="border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{s.label}</p>
                      <span className="text-xs text-blue-600 font-mono ml-2 shrink-0">{Number(avail).toLocaleString('id-ID')} L</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{width:`${pct}%`}}/>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{Number(s.totalVolume||0).toLocaleString('id-ID')} L total · {pct.toFixed(0)}% terikat</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent SO with approval status */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Sales Order Terbaru</h2>
            <button onClick={()=>nav('/sales-order')} className="text-blue-600 text-xs hover:underline">Lihat Semua →</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">Memuat…</p> :
           sos.length === 0 ? <p className="text-gray-400 text-sm">Belum ada SO.</p> : (
            <div className="space-y-2">
              {sos.slice(0,5).map(s => {
                const m = statusMeta(s.approvalStatus);
                return (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{s.clientName}</p>
                      <p className="text-xs text-gray-400 font-mono">{s.docNumber}</p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.badge}`}>{m.label}</span>
                      <p className="text-xs text-gray-400 mt-0.5">{s.volume ? Number(s.volume).toLocaleString('id-ID')+' L' : '-'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {appData?.headOffice && (
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 text-xs text-blue-700">
          <b>{appData.headOffice.name || appData.company?.name}</b>
          {appData.headOffice.address ? ` · ${appData.headOffice.address}` : ''}
        </div>
      )}
    </div>
  );
}
