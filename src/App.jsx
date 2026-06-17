import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ensureInit, fetchData, onAuth, initPushNotifications } from './firebase.js';
import { getLang, setLang as saveLang, t as translate } from './i18n.js';

import Login          from './components/Auth/Login.jsx';
import Sidebar        from './components/Layout/Sidebar.jsx';
import Dashboard      from './components/Dashboard/Dashboard.jsx';
import Stok           from './components/Stok/Stok.jsx';
import Calculator     from './components/Calculator/Calculator.jsx';
import OfferingLetter from './components/OfferingLetter/OfferingLetter.jsx';
import SalesOrder     from './components/SalesOrder/SalesOrder.jsx';
import Invoice        from './components/Invoice/Invoice.jsx';
import PurchaseOrder  from './components/PurchaseOrder/PurchaseOrder.jsx';
import DeliveryOrder  from './components/DeliveryOrder/DeliveryOrder.jsx';
import MopsData       from './components/MopsData/MopsData.jsx';
import MasterData     from './components/MasterData/MasterData.jsx';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [user,      setUser]      = useState(undefined);
  const [userRole,  setUserRole]  = useState('staff');
  const [appData,   setAppData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [lang,      setLangState] = useState(getLang());

  const toggleLang = () => {
    const next = lang === 'en' ? 'id' : 'en';
    saveLang(next); setLangState(next);
  };
  const t = (key) => translate(lang, key);

  useEffect(() => {
    const unsub = onAuth(async (u) => {
      setUser(u);
      if (u) {
        try {
          await ensureInit();
          const data = await fetchData();
          setAppData(data);
          const role = (data?.userRoles || {})[u.email] || 'staff';
          setUserRole(role);
          // Request push permission and register FCM token (non-blocking)
          initPushNotifications(u.email, role).catch(() => {});
        } catch (e) { setError(e.message); }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const reload = async () => {
    const data = await fetchData();
    setAppData(data);
    if (user) {
      const role = (data?.userRoles || {})[user.email] || 'staff';
      setUserRole(role);
    }
  };

  if (user === undefined) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700" />
    </div>
  );

  if (!user) return <Login />;

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
        <p className="text-red-600 font-semibold mb-2">Firebase Connection Failed</p>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    </div>
  );

  return (
    <AppCtx.Provider value={{ appData, reload, user, userRole, lang, toggleLang, t }}>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/stok"            element={<Stok />} />
            <Route path="/calculator"      element={<Calculator />} />
            <Route path="/offering-letter" element={<OfferingLetter />} />
            <Route path="/sales-order"     element={<SalesOrder />} />
            <Route path="/invoice"         element={<Invoice />} />
            <Route path="/purchase-order"  element={<PurchaseOrder />} />
            <Route path="/delivery-order"  element={<DeliveryOrder />} />
            <Route path="/mops"            element={<MopsData />} />
            <Route path="/master-data/*"   element={<MasterData />} />
            <Route path="*"                element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </AppCtx.Provider>
  );
}
