import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ensureInit, fetchData } from './firebase.js';

import Sidebar        from './components/Layout/Sidebar.jsx';
import Dashboard      from './components/Dashboard/Dashboard.jsx';
import Calculator     from './components/Calculator/Calculator.jsx';
import OfferingLetter from './components/OfferingLetter/OfferingLetter.jsx';
import PurchaseOrder  from './components/PurchaseOrder/PurchaseOrder.jsx';
import DeliveryOrder  from './components/DeliveryOrder/DeliveryOrder.jsx';
import MasterData     from './components/MasterData/MasterData.jsx';

// ─── Global App Context ──────────────────────────────────────────────────────
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [appData, setAppData] = useState(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState(null);

  const reload = async () => {
    try {
      const data = await fetchData();
      setAppData(data);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await ensureInit();
        await reload();
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Memuat FuelOps GPP…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
        <p className="text-red-600 font-semibold mb-2">Koneksi Firebase Gagal</p>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <p className="text-gray-400 text-xs">Pastikan file <code>.env</code> sudah dikonfigurasi dengan benar.</p>
      </div>
    </div>
  );

  return (
    <AppCtx.Provider value={{ appData, reload }}>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/"                 element={<Dashboard />} />
            <Route path="/calculator"       element={<Calculator />} />
            <Route path="/offering-letter"  element={<OfferingLetter />} />
            <Route path="/purchase-order"   element={<PurchaseOrder />} />
            <Route path="/delivery-order"   element={<DeliveryOrder />} />
            <Route path="/master-data"      element={<MasterData />} />
            <Route path="*"                 element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </AppCtx.Provider>
  );
}
