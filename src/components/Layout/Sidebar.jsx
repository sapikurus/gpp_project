import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { logout, changePassword, initPushNotifications } from '../../firebase.js';
import { useApp } from '../../App.jsx';
import { canSeeMasterData, ROLE_MENU } from '../../utils/approvalUtils.js';
import logo from '../../assets/gpp-logo.png';

const ROLE_LABELS = {
  superadmin: { label: 'Super Admin', color: 'bg-purple-700' },
  director:   { label: 'Director',    color: 'bg-blue-700' },
  manager:    { label: 'Manager',     color: 'bg-teal-600' },
  staff:      { label: 'Staff',       color: 'bg-gray-500' },
};

export default function Sidebar() {
  const { user, userRole, lang, toggleLang, t } = useApp();
  const location = useLocation();
  const isMasterActive = location.pathname.startsWith('/master-data');
  const [masterOpen,  setMasterOpen]  = useState(isMasterActive);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current:'', next:'', confirm:'' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone,   setPwDone]   = useState(false);
  const [notifState, setNotifState] = useState('idle'); // idle | loading | ok | denied | error

  const registerNotifications = async () => {
    setNotifState('loading');
    try {
      if (!('Notification' in window)) { setNotifState('error'); return; }
      const perm = await Notification.requestPermission();
      if (perm === 'denied') { setNotifState('denied'); setTimeout(() => setNotifState('idle'), 4000); return; }
      await initPushNotifications(user?.email, userRole);
      setNotifState('ok');
      setTimeout(() => setNotifState('idle'), 4000);
    } catch(e) {
      console.warn('Notification registration:', e.message);
      setNotifState('error');
      setTimeout(() => setNotifState('idle'), 4000);
    }
  };

  const handleChangePw = async () => {
    setPwError('');
    if (!pwForm.current) return setPwError(lang==='en'?'Enter your current password.':'Masukkan password saat ini.');
    if (pwForm.next.length < 6) return setPwError(lang==='en'?'New password must be at least 6 characters.':'Password baru minimal 6 karakter.');
    if (pwForm.next !== pwForm.confirm) return setPwError(lang==='en'?'Passwords do not match.':'Konfirmasi password tidak cocok.');
    setPwSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwDone(true);
      setTimeout(()=>{setShowPwModal(false);setPwDone(false);setPwForm({current:'',next:'',confirm:''}); },2000);
    } catch(err) {
      setPwError(err.code==='auth/wrong-password'||err.code==='auth/invalid-credential'
        ? (lang==='en'?'Current password is incorrect.':'Password saat ini salah.')
        : err.code==='auth/too-many-requests'
        ? (lang==='en'?'Too many attempts. Try again later.':'Terlalu banyak percobaan. Coba lagi nanti.')
        : (lang==='en'?'Failed to change password. Try again.':'Gagal mengubah password. Coba lagi.'));
    } finally { setPwSaving(false); }
  };

  const allowedRoutes = ROLE_MENU[userRole] || ROLE_MENU.staff;
  const ALL_NAV = [
    { to:'/',                label:t('nav_dashboard'),       icon:'🏠' },
    { to:'/stok',            label:t('nav_stock'),           icon:'📦' },
    { to:'/calculator',      label:t('nav_calculator'),      icon:'🧮' },
    { to:'/offering-letter', label:t('nav_offering_letter'), icon:'📄' },
    { to:'/sales-order',     label:t('nav_sales_order'),     icon:'🤝' },
    { to:'/purchase-order',  label:t('nav_purchase_order'),  icon:'📋' },
    { to:'/delivery-order',  label:t('nav_delivery_order'),  icon:'🚢' },
    { to:'/mops',            label:t('nav_mops'),            icon:'📈' },
  ];
  const MASTER_SUBS = [
    { to:'/master-data/corporate',  label:t('nav_corporate') },
    { to:'/master-data/clients',    label:t('nav_clients') },
    { to:'/master-data/suppliers',  label:t('nav_suppliers') },
    { to:'/master-data/products',   label:t('nav_products') },
    { to:'/master-data/facilities', label:t('nav_facilities') },
    { to:'/master-data/settings',   label:t('nav_settings') },
  ];

  const showMaster   = canSeeMasterData(userRole);
  const visibleNav   = ALL_NAV.filter(n => allowedRoutes.some(r => r === n.to));
  const roleInfo     = ROLE_LABELS[userRole] || ROLE_LABELS.staff;
  const closeSidebar = () => setSidebarOpen(false);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-blue-900 text-white">
      <div className="flex items-center gap-3 p-4 border-b border-blue-800">
        <img src={logo} alt="GPP" className="w-10 h-10 object-contain bg-white rounded-full p-1 shrink-0"/>
        <div className="min-w-0">
          <p className="font-bold text-xs leading-tight truncate">PT Global Petro Pasifik</p>
          <p className="text-blue-300 text-[10px]">GPP Portal</p>
        </div>
        <button onClick={closeSidebar} className="ml-auto text-blue-300 hover:text-white md:hidden">✕</button>
      </div>

      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        {visibleNav.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to==='/'} onClick={closeSidebar}
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
              <span className="flex-1 text-left">{t('nav_master_data')}</span>
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

      {/* Footer */}
      <div className="border-t border-blue-800 p-3 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${roleInfo.color}`}>{roleInfo.label}</span>
          <p className="text-blue-400 text-[10px] truncate flex-1">{user?.email}</p>
        </div>

        {/* Language toggle */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-blue-400">Language:</span>
          <button onClick={toggleLang}
            className="flex items-center gap-1 bg-blue-800 rounded-full px-2 py-1 text-[10px] font-bold hover:bg-blue-700 transition-colors">
            <span className={lang==='en'?'text-white':'text-blue-400'}>EN</span>
            <span className="text-blue-600 mx-0.5">|</span>
            <span className={lang==='id'?'text-white':'text-blue-400'}>ID</span>
          </button>
        </div>

        <button onClick={()=>{setShowPwModal(true);closeSidebar();}}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-blue-200 hover:bg-blue-800 hover:text-white transition-colors">
          <span>🔑</span> {t('nav_change_pw')}
        </button>

        {/* Notification registration — visible to all users */}
        <button onClick={registerNotifications} disabled={notifState === 'loading'}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
            notifState === 'ok'     ? 'text-green-300 hover:bg-blue-800' :
            notifState === 'denied' ? 'text-red-300 hover:bg-blue-800'  :
            notifState === 'error'  ? 'text-amber-300 hover:bg-blue-800':
                                      'text-blue-200 hover:bg-blue-800 hover:text-white'
          }`}>
          <span>
            {notifState === 'loading' ? '⏳' :
             notifState === 'ok'      ? '✅' :
             notifState === 'denied'  ? '🚫' :
             notifState === 'error'   ? '⚠️' : '🔔'}
          </span>
          <span>
            {notifState === 'loading' ? 'Registering…' :
             notifState === 'ok'      ? 'Notifications enabled!' :
             notifState === 'denied'  ? 'Permission denied — check browser settings' :
             notifState === 'error'   ? 'Registration failed — try again' :
                                        'Enable Notifications'}
          </span>
        </button>
        <div className="flex gap-1 px-3">
          <a href="/manual-id.html" target="_blank" rel="noopener"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-blue-300 hover:bg-blue-800 hover:text-white transition-colors border border-blue-800">
            📖 {t('nav_guide')}
          </a>
          <a href="/manual-en.html" target="_blank" rel="noopener"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-blue-300 hover:bg-blue-800 hover:text-white transition-colors border border-blue-800">
            📖 {t('nav_manual')}
          </a>
        </div>
        <button onClick={() => logout()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-blue-200 hover:bg-blue-800 hover:text-white transition-colors">
          <span>🔓</span> {t('nav_logout')}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setSidebarOpen(true)}
        className="no-print md:hidden fixed top-3 left-3 z-40 bg-blue-900 text-white rounded-lg p-2 shadow-lg">☰</button>
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-56 h-full shadow-2xl"><SidebarContent /></div>
          <div className="flex-1 bg-black bg-opacity-50" onClick={closeSidebar}/>
        </div>
      )}
      <aside className="no-print hidden md:flex md:flex-col md:w-56 md:shrink-0 h-full">
        <SidebarContent />
      </aside>

      {/* Change Password Modal */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-gray-800">🔑 {t('nav_change_pw')}</h2>
              <button onClick={()=>{setShowPwModal(false);setPwError('');setPwForm({current:'',next:'',confirm:''}); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-400">{user?.email}</p>
              {['current','next','confirm'].map(key=>(
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">
                    {key==='current'?(lang==='en'?'Current Password':'Password Saat Ini'):key==='next'?(lang==='en'?'New Password':'Password Baru'):(lang==='en'?'Confirm New Password':'Konfirmasi Password Baru')}
                  </label>
                  <input type="password" value={pwForm[key]} onChange={e=>setPwForm(p=>({...p,[key]:e.target.value}))}
                    onKeyDown={e=>e.key==='Enter'&&handleChangePw()} placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                </div>
              ))}
              {pwError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">{pwError}</div>}
              {pwDone  && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-600 font-semibold">✅ {lang==='en'?'Password changed successfully!':'Password berhasil diubah!'}</div>}
              <button onClick={handleChangePw} disabled={pwSaving||pwDone}
                className="w-full bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {pwSaving?'…':pwDone?'✅':(lang==='en'?'Change Password':'Ubah Password')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
