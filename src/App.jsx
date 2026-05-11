import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ensureInit, fetchData, onAuth } from './firebase.js';

import Login          from './components/Auth/Login.jsx';
import Sidebar        from './components/Layout/Sidebar.jsx';
import Dashboard      from './components/Dashboard/Dashboard.jsx';
import Cargo          from './components/Cargo/Cargo.jsx';
import Calculator     from './components/Calculator/Calculator.jsx';
import OfferingLetter from './components/OfferingLetter/OfferingLetter.jsx';
import PurchaseOrder  from './components/PurchaseOrder/PurchaseOrder.jsx';
import DeliveryOrder  from './components/DeliveryOrder/DeliveryOrder.jsx';
import MasterData     from './components/MasterData/MasterData.jsx';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [user,    setUser]    = useState(undefined); // undefined = checking
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Auth listener — runs once
  useEffect(() => {
    const unsub = onAuth(async (u) => {
      setUser(u);
      if (u) {
        try {
          await ensureInit();
          const data = await fetchData();
          setAppData(data);
        } catch (e) {
          setError(e.message);
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const reload = async () => {
    const data = await fetchData();
    setAppData(data);
  };

  // Checking auth state
  if (user === undefined) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700" />
    </div>
  );

  // Not logged in
  if (!user) return <Login />;

  // Firebase error (env vars missing etc.)
  if (error) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
        <p className="text-red-600 font-semibold mb-2">Koneksi Firebase Gagal</p>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <p className="text-gray-400 text-xs">Pastikan environment variables sudah dikonfigurasi.</p>
      </div>
    </div>
  );

  // Loading data
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Memuat data…</p>
      </div>
    </div>
  );

  return (
    <AppCtx.Provider value={{ appData, reload, user }}>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/cargo"           element={<Cargo />} />
            <Route path="/calculator"      element={<Calculator />} />
            <Route path="/offering-letter" element={<OfferingLetter />} />
            <Route path="/purchase-order"  element={<PurchaseOrder />} />
            <Route path="/delivery-order"  element={<DeliveryOrder />} />
            <Route path="/master-data/*"   element={<MasterData />} />
            <Route path="*"               element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </AppCtx.Provider>
  );
}
