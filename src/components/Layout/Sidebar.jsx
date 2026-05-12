import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { logout } from '../../firebase.js';
import { useApp } from '../../App.jsx';
import { canSeeMasterData, ROLE_MENU } from '../../utils/approvalUtils.js';
import logo from '../../assets/gpp-logo.png';

const ALL_NAV = [
  { to: '/',                label: 'Dashboard',       icon: '🏠' },
  { to: '/stok',            label: 'Stok',            icon: '📦' },
  { to: '/calculator',      label: 'Kalkulator',      icon: '🧮' },
  { to: '/offering-letter', label: 'Surat Penawaran', icon: '📄' },
  { to: '/sales-order',     label: 'Sales Order',     icon: '🤝' },
  { to: '/purchase-order',  label: 'Purchase Order',  icon: '📋' },
  { to: '/delivery-order',  label: 'Delivery Order',  icon: '🚢' },
  { to: '/mops',            label: 'Data MOPS',       icon: '📈' },
];

const MASTER_SUBS = [
  { to: '/master-data/corporate',  label: 'Corporate' },
  { to: '/master-data/clients',    label: 'Client' },
  { to: '/master-data/suppliers',  label: 'Supplier' },
  { to: '/master-data/products',   label: 'Product' },
  { to: '/master-data/facilities', label: 'Facilities' },
  { to: '/master-data/settings',   label: 'Settings' },
];

const ROLE_LABELS = {
  superadmin: { label: 'Super Admin', color: 'bg-purple-700' },
  director:   { label: 'Direktur',    color: 'bg-blue-700' },
  manager:    { label: 'Manager',     color: 'bg-teal-600' },
  staff:      { label: 'Staff',       color: 'bg-gray-500' },
};

export default function Sidebar() {
  const { user, userRole } = useApp();
  const location = useLocation();
  const isMasterActive = location.pathname.startsWith('/master-data');
  const [masterOpen,  setMasterOpen]  = useState(isMasterActive);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const allowedRoutes = ROLE_MENU[userRole] || ROLE_MENU.staff;
  const visibleNav = ALL_NAV.filter(n => allowedRoutes.some(r => r === n.to));
  const showMaster = canSeeMasterData(userRole);
  const roleInfo = ROLE_LABELS[userRole] || ROLE_LABELS.staff;

  const closeSidebar = () => setSidebarOpen(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-blue-900 text-white">
      <div className="flex items-center gap-3 p-4 border-b border-blue-800">
        <img src={logo} alt="GPP" className="w-10 h-10 object-contain bg-white rounded-full p-1 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold text-xs leading-tight truncate">PT Global Petro Pasifik</p>
          <p className="text-blue-300 text-[10px]">FuelOps</p>
        </div>
        <button onClick={closeSidebar} className="ml-auto text-blue-300 hover:text-white md:hidden">✕</button>
      </div>

      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {visibleNav.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={closeSidebar}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-blue-700 text-white font-semibold' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
              }`}>
            <span>{icon}</span>{label}
          </NavLink>
        ))}

        {showMaster && (
          <div>
            <button onClick={() => setMasterOpen(o => !o)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isMasterActive ? 'bg-blue-700 text-white font-semibold' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
              }`}>
              <span>⚙️</span>
              <span className="flex-1 text-left">Master Data</span>
              <span className="text-xs opacity-60">{masterOpen ? '▲' : '▼'}</span>
            </button>
            {masterOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-blue-700 pl-2">
                {MASTER_SUBS.map(({ to, label }) => (
                  <NavLink key={to} to={to} onClick={closeSidebar}
                    className={({ isActive }) =>
                      `block px-3 py-2 rounded-lg text-xs transition-colors ${
                        isActive ? 'bg-blue-600 text-white font-semibold' : 'text-blue-300 hover:bg-blue-800 hover:text-white'
                      }`}>
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-blue-800 p-3 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${roleInfo.color}`}>
            {roleInfo.label}
          </span>
          <p className="text-blue-400 text-[10px] truncate flex-1">{user?.email}</p>
        </div>
        <button onClick={() => logout()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-blue-200 hover:bg-blue-800 hover:text-white transition-colors">
          <span>🔓</span> Keluar
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setSidebarOpen(true)}
        className="no-print md:hidden fixed top-3 left-3 z-40 bg-blue-900 text-white rounded-lg p-2 shadow-lg">
        ☰
      </button>
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-56 h-full shadow-2xl"><SidebarContent /></div>
          <div className="flex-1 bg-black bg-opacity-50" onClick={closeSidebar} />
        </div>
      )}
      <aside className="no-print hidden md:flex md:flex-col md:w-56 md:shrink-0 h-full">
        <SidebarContent />
      </aside>
    </>
  );
}
