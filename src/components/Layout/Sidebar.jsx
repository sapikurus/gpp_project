import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { logout, changePassword, initPushNotifications } from '../../firebase.js';
import { useApp } from '../../App.jsx';
import { canSeeMasterData, getEffectiveMenu } from '../../utils/approvalUtils.js';
import logo from '../../assets/gpp-logo.jpeg';

const ROLE_LABELS = {
  superadmin: { label: 'Super Admin', color: 'bg-purple-700' },
  director:   { label: 'Director',    color: 'bg-blue-700' },
  manager:    { label: 'Manager',     color: 'bg-teal-600' },
  staff:      { label: 'Staff',       color: 'bg-gray-500' },
};

export default function Sidebar() {
  const { appData, user, userRole, lang, toggleLang, t } = useApp();
  const location = useLocation();
  const isMasterActive = location.pathname.startsWith('/master-data');
  const [masterOpen,  setMasterOpen]  = useState(isMasterActive);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current:'', next:'', confirm:'' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone,   setPwDone]   = useState(false);
  const [notifState,  setNotifState]  = useState('idle'); // idle | loading | ok | denied | error
  const [notifDetail, setNotifDetail] = useState('');

  const registerNotifications = async () => {
    setNotifState('loading'); setNotifDetail('');
    try {
      if (!('Notification' in window)) { setNotifState('error'); setNotifDetail('Browser not supported'); return; }
      const result = await initPushNotifications(user?.email, userRole);
      if (result.ok) {
        setNotifState('ok');
        setNotifDetail('');
        setTimeout(() => setNotifState('idle'), 5000);
      } else if (result.step === 'permission') {
        setNotifState('denied');
        setNotifDetail('Go to browser settings and allow notifications for this site');
        setTimeout(() => { setNotifState('idle'); setNotifDetail(''); }, 6000);
      } else {
        setNotifState('error');
        setNotifDetail(result.error || 'Unknown error');
        setTimeout(() => { setNotifState('idle'); setNotifDetail(''); }, 6000);
      }
    } catch(e) {
      setNotifState('error'); setNotifDetail(e.message);
      setTimeout(() => { setNotifState('idle'); setNotifDetail(''); }, 6000);
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

  const allowedRoutes = getEffectiveMenu(appData?.settings, userRole);
  const ALL_NAV = [
    { to:'/',                label:t('nav_dashboard'),       icon:'🏠' },
    { to:'/stok',            label:t('nav_stock'),           icon:'📦' },
    { to:'/calculator',      label:t('nav_calculator'),      icon:'🧮' },
    { to:'/offering-letter', label:t('nav_offering_letter'), icon:'📄' },
    { to:'/sales-order',     label:t('nav_sales_order'),     icon:'🤝' },
    { to:'/invoice',         label:'Invoice',                 icon:'🧾' },
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

  // ── Sidebar inner content ─────────────────────────────────────────────────
  const SidebarContent = ({ mobile = false }) => (
    <div className="flex flex-col h-full bg-blue-900 text-white overflow-hidden">

      {/* Brand + collapse toggle */}
      <div className={`flex items-center border-b border-blue-800 shrink-0 ${collapsed && !mobile ? 'p-3 justify-center' : 'p-3 gap-2'}`}>
        <img src={logo} alt="GPP" className="w-9 h-9 object-contain bg-white rounded-full p-0.5 shrink-0"/>
        {(!collapsed || mobile) && (
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs leading-tight truncate">PT Global Petro Pasifik</p>
            <p className="text-blue-300 text-[10px]">GPP Portal</p>
          </div>
        )}
        {mobile
          ? <button onClick={closeSidebar} className="ml-auto text-blue-300 hover:text-white text-lg leading-none">✕</button>
          : <button onClick={toggleCollapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`text-blue-400 hover:text-white transition-colors text-sm ${collapsed ? '' : 'ml-auto'}`}>
              {collapsed ? '›' : '‹'}
            </button>
        }
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto overflow-x-hidden">
        {visibleNav.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to==='/'} onClick={mobile ? closeSidebar : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-lg text-sm transition-colors ${
                collapsed && !mobile ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'
              } ${isActive ? 'bg-blue-700 text-white font-semibold' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`}
            title={collapsed && !mobile ? label : undefined}>
            <span className="text-base leading-none shrink-0">{icon}</span>
            {(!collapsed || mobile) && <span className="truncate">{label}</span>}
          </NavLink>
        ))}

        {showMaster && (
          collapsed && !mobile ? (
            <NavLink to="/master-data" onClick={mobile ? closeSidebar : undefined}
              className={({ isActive }) =>
                `flex justify-center items-center px-2 py-2.5 rounded-lg text-sm transition-colors ${
                  isMasterActive ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`}
              title="Master Data">
              <span className="text-base leading-none">⚙️</span>
            </NavLink>
          ) : (
            <div>
              <button onClick={() => setMasterOpen(o => !o)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isMasterActive ? 'bg-blue-700 text-white font-semibold' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`}>
                <span className="text-base leading-none shrink-0">⚙️</span>
                <span className="flex-1 text-left text-sm truncate">{t('nav_master_data')}</span>
                <span className="text-xs opacity-60">{masterOpen ? '▲' : '▼'}</span>
              </button>
              {masterOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-blue-700 pl-2">
                  {MASTER_SUBS.map(({ to, label }) => (
                    <NavLink key={to} to={to} onClick={mobile ? closeSidebar : undefined}
                      className={({ isActive }) =>
                        `block px-3 py-1.5 rounded-lg text-xs transition-colors ${
                          isActive ? 'bg-blue-600 text-white font-semibold' : 'text-blue-300 hover:bg-blue-800 hover:text-white'
                        }`}>
                      {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </nav>

      {/* Footer — compressed */}
      {(!collapsed || mobile) ? (
        <div className="border-t border-blue-800 px-2 py-2 space-y-0.5 shrink-0">
          {/* Role + email */}
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${roleInfo.color}`}>{roleInfo.label}</span>
            <p className="text-blue-400 text-[10px] truncate">{user?.email}</p>
          </div>
          {/* Language */}
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-[10px] text-blue-400">Language:</span>
            <button onClick={toggleLang}
              className="flex items-center gap-1 bg-blue-800 rounded-full px-2 py-0.5 text-[10px] font-bold hover:bg-blue-700">
              <span className={lang==='en'?'text-white':'text-blue-400'}>EN</span>
              <span className="text-blue-600 mx-0.5">|</span>
              <span className={lang==='id'?'text-white':'text-blue-400'}>ID</span>
            </button>
          </div>
          {/* Change Password */}
          <button onClick={()=>{setShowPwModal(true); if(mobile) closeSidebar();}}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-blue-200 hover:bg-blue-800 hover:text-white transition-colors">
            <span>🔑</span> {t('nav_change_pw')}
          </button>
          {/* Notifications */}
          <button onClick={registerNotifications} disabled={notifState === 'loading'}
            className={`w-full flex items-start gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              notifState === 'ok'     ? 'text-green-300 bg-blue-800' :
              notifState === 'denied' ? 'text-red-300 bg-blue-800'  :
              notifState === 'error'  ? 'text-amber-300 bg-blue-800':
                                        'text-blue-200 hover:bg-blue-800 hover:text-white'
            }`}>
            <span className="shrink-0">{notifState==='loading'?'⏳':notifState==='ok'?'✅':notifState==='denied'?'🚫':notifState==='error'?'⚠️':'🔔'}</span>
            <span className="leading-tight">{notifState==='loading'?'Registering…':notifState==='ok'?'Notifications on':notifState==='denied'?'Permission denied':notifState==='error'?'Failed — retry':'Enable Notifications'}</span>
          </button>
          {/* Guides */}
          <div className="flex gap-1 px-1">
            <a href="/manual-id.html" target="_blank" rel="noopener"
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] text-blue-300 hover:bg-blue-800 hover:text-white border border-blue-800">
              📖 {t('nav_guide')}
            </a>
            <a href="/manual-en.html" target="_blank" rel="noopener"
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] text-blue-300 hover:bg-blue-800 hover:text-white border border-blue-800">
              📖 {t('nav_manual')}
            </a>
          </div>
          {/* Logout */}
          <button onClick={() => logout()}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-blue-200 hover:bg-blue-800 hover:text-white transition-colors">
            <span>🔓</span> {t('nav_logout')}
          </button>
        </div>
      ) : (
        /* Collapsed footer — just icons */
        <div className="border-t border-blue-800 py-2 flex flex-col items-center gap-1 shrink-0">
          <button onClick={toggleLang} title="Toggle language" className="text-blue-400 hover:text-white text-xs py-1">
            {lang === 'en' ? 'EN' : 'ID'}
          </button>
          <button onClick={registerNotifications} title="Enable Notifications" className="py-1 text-base hover:scale-110 transition-transform">
            {notifState==='ok'?'✅':notifState==='error'?'⚠️':'🔔'}
          </button>
          <button onClick={() => logout()} title="Log Out" className="text-blue-400 hover:text-white py-1 text-base">
            🔓
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setSidebarOpen(true)}
        className="no-print md:hidden fixed top-3 left-3 z-40 bg-blue-900 text-white rounded-lg p-2 shadow-lg">☰</button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-56 h-full shadow-2xl"><SidebarContent mobile={true} /></div>
          <div className="flex-1 bg-black bg-opacity-50" onClick={closeSidebar}/>
        </div>
      )}

      {/* Desktop sidebar — width controlled by collapsed state */}
      <aside className={`no-print hidden md:flex md:flex-col md:shrink-0 h-full transition-all duration-200 ${collapsed ? 'md:w-16' : 'md:w-56'}`}>
        <SidebarContent mobile={false} />
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
