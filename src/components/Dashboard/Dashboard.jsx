import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import { fetchCollection, POS_REF, DOS_REF, STOCKS_REF, SOS_REF, OLS_REF } from '../../firebase.js';
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

const TYPE_COLORS = { po:'purple', so:'blue', ol:'amber' };
const TYPE_ROUTES = { po:'/purchase-order', so:'/sales-order', ol:'/offering-letter' };

export default function Dashboard() {
  const { appData, userRole, t } = useApp();
  const nav = useNavigate();
  const TYPE_LABELS = { po:'Purchase Order', so:'Sales Order', ol: t('nav_offering_letter') };

  const [pos,    setPOs]    = useState([]);
  const [dos,    setDOs]    = useState([]);
  const [stocks, setStocks] = useState([]);
  const [sos,    setSOs]    = useState([]);
  const [ols,    setOLs]    = useState([]);
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
      fetchCollection(OLS_REF()),
    ]).then(([p,d,st,s,ol]) => { setPOs(p); setDOs(d); setStocks(st); setSOs(s); setOLs(ol); setL(false); });
  }, []);

  const pendingItems = [
    ...pos.filter(p => {
      // PO uses threshold-based dynamic chain stored on the document
      const chain = p.effectiveChain || (
        (p.totalOrder || 0) >= (appData?.settings?.poApprovalThreshold || 5_000_000_000)
          ? ['manager','director'] : ['manager']
      );
      return canApprove(userRole, p.approvalStatus, chain);
    }).map(p => ({ type:'po', doc:p, number:p.docNumber, name:p.vendorName, amount:formatIDR(p.totalOrder) })),
    ...sos.filter(s => canApprove(userRole, s.approvalStatus, chain_so)).map(s => ({ type:'so', doc:s, number:s.docNumber, name:s.clientName, amount:s.volume ? Number(s.volume).toLocaleString('id-ID')+' L' : '' })),
    ...ols.filter(o => canApprove(userRole, o.approvalStatus, chain_ol)).map(o => ({ type:'ol', doc:o, number:o.docNumber, name:o.clientName, amount:o.dpp ? `${Number(o.dpp).toLocaleString('id-ID')}/L` : '' })),
  ];

  const confirmedStocks = stocks.filter(s => s.status === 'Confirmed');
  const totalAvailable  = confirmedStocks.reduce((sum,s) => sum + Math.max(0,(s.totalVolume||0)-(s.committedVolume||0)), 0);
  const totalCommitted  = confirmedStocks.reduce((sum,s) => sum + (s.committedVolume||0), 0);
  const approvedSOs     = sos.filter(s => s.approvalStatus === 'approved');
  const totalPOValue    = pos.reduce((s,p) => s+(p.totalOrder||0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
      {/* Greeting header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'} 👋
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        {pendingItems.length > 0 && (
          <span className="bg-amber-100 text-amber-700 text-sm font-semibold px-3 py-1.5 rounded-full border border-amber-200">
            ⏳ {pendingItems.length} pending
          </span>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-6">
        {[
          { icon:'📦', label:'New Cargo',    action: () => nav('/stok') },
          { icon:'🤝', label:'New SO',       action: () => nav('/sales-order') },
          { icon:'🧾', label:'New Invoice',  action: () => nav('/invoice') },
          { icon:'🛒', label:'New PO',       action: () => nav('/purchase-order') },
          { icon:'🚢', label:'New DO',       action: () => nav('/delivery-order') },
          { icon:'📄', label:'New Offering', action: () => nav('/offering-letter') },
          { icon:'🧮', label:'Calculator',   action: () => nav('/calculator') },
          { icon:'📈', label:'MOPS Data',    action: () => nav('/mops') },
        ].map(({ icon, label, action }) => (
          <button key={label} onClick={action}
            className="flex flex-col items-center gap-1.5 bg-white border border-gray-200 rounded-xl py-3 px-2 hover:border-blue-300 hover:bg-blue-50 transition-colors group">
            <span className="text-xl">{icon}</span>
            <span className="text-[10px] text-gray-500 group-hover:text-blue-700 font-medium text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* Pending tasks */}
      {loading ? null : pendingItems.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 mb-6 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border-b border-amber-100">
            <span>⏳</span>
            <p className="font-semibold text-amber-800">{t('dash_pending_title')}</p>
            <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{pendingItems.length}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingItems.map((item,i) => {
              const m = statusMeta(item.doc.approvalStatus);
              const color = TYPE_COLORS[item.type];
              return (
                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-8 rounded-full bg-${color}-400 shrink-0`}/>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold text-${color}-600 uppercase tracking-widest`}>{TYPE_LABELS[item.type]}</span>
                        <span className="font-mono text-xs font-semibold text-gray-700">{item.number}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.badge}`}>{m.label}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{item.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.amount && <span className="text-xs text-gray-400 font-mono hidden sm:block">{item.amount}</span>}
                    <button onClick={() => nav(TYPE_ROUTES[item.type])}
                      className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 font-semibold whitespace-nowrap">
                      {t('dash_open')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 mb-6 flex items-center gap-3">
          <span className="text-lg">✅</span>
          <p className="text-green-700 text-sm font-medium">{t('dash_no_pending')}</p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t('dash_available_stock')}
          value={loading ? '…' : Number(totalAvailable).toLocaleString('id-ID')+' L'}
          sub={`${confirmedStocks.length} ${t('dash_available_sub')}`}
          color="blue" onClick={() => nav('/stok')} />
        <StatCard
          label={t('dash_committed_so')}
          value={loading ? '…' : Number(totalCommitted).toLocaleString('id-ID')+' L'}
          sub={`${approvedSOs.length} ${t('dash_committed_sub')}`}
          color="orange" onClick={() => nav('/sales-order')} />
        <StatCard
          label={t('dash_total_po')}
          value={loading ? '…' : pos.length}
          sub={formatIDR(totalPOValue)}
          color="purple" onClick={() => nav('/purchase-order')}
          badge={pendingItems.filter(p=>p.type==='po').length || null} />
        <StatCard
          label={t('dash_delivery')}
          value={loading ? '…' : dos.length}
          sub={t('dash_delivery_sub')}
          color="green" onClick={() => nav('/delivery-order')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confirmed stocks */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">{t('dash_confirmed_stock')}</h2>
            <button onClick={() => nav('/stok')} className="text-blue-600 text-xs hover:underline">{t('dash_view_all')}</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">{t('dash_loading')}</p> :
           confirmedStocks.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-3xl mb-2">📦</p>
              <p className="text-sm">No confirmed cargo yet</p>
              <button onClick={() => nav('/stok')} className="mt-2 text-xs text-blue-600 hover:underline">Create first position →</button>
            </div>
           ) : (
            <div className="space-y-3">
              {confirmedStocks.slice(0,4).map(s => {
                const avail = Math.max(0,(s.totalVolume||0)-(s.committedVolume||0));
                const pct = s.totalVolume > 0 ? Math.min(100,((s.committedVolume||0)/s.totalVolume)*100) : 0;
                return (
                  <div key={s.id} className="border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{s.label}</p>
                      <span className="text-xs text-blue-600 font-mono ml-2 shrink-0">{Number(avail).toLocaleString('id-ID')} L</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{width:`${pct}%`}}/>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{Number(s.totalVolume||0).toLocaleString('id-ID')} L total · {pct.toFixed(0)}% committed</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent SO */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">{t('dash_recent_so')}</h2>
            <button onClick={() => nav('/sales-order')} className="text-blue-600 text-xs hover:underline">{t('dash_view_all')}</button>
          </div>
          {loading ? <p className="text-gray-400 text-sm">{t('dash_loading')}</p> :
           sos.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-3xl mb-2">🤝</p>
              <p className="text-sm">No sales orders yet</p>
              <button onClick={() => nav('/sales-order')} className="mt-2 text-xs text-blue-600 hover:underline">Create first SO →</button>
            </div>
           ) : (
            <div className="space-y-2">
              {sos.slice(0,5).map(s => {
                const m = statusMeta(s.approvalStatus);
                return (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-700 truncate">{s.clientName}</p>
                        {s.linkedOlNumber && <span className="text-[10px] text-purple-500 font-mono bg-purple-50 px-1.5 py-0.5 rounded shrink-0">📄 {s.linkedOlNumber}</span>}
                      </div>
                      <p className="text-xs text-gray-400 font-mono">{s.docNumber}</p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.badge}`}>{m.label}</span>
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
