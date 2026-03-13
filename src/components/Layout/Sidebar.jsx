import { NavLink } from 'react-router-dom';
import logo from '../../assets/gpp-logo.png';

const NAV = [
  { to: '/',                label: 'Dashboard',        icon: '🏠' },
  { to: '/calculator',      label: 'Kalkulator',       icon: '🧮' },
  { to: '/offering-letter', label: 'Surat Penawaran',  icon: '📄' },
  { to: '/purchase-order',  label: 'Purchase Order',   icon: '📋' },
  { to: '/delivery-order',  label: 'Delivery Order',   icon: '🚢' },
  { to: '/master-data',     label: 'Master Data',      icon: '⚙️' },
];

export default function Sidebar() {
  return (
    <aside className="no-print w-56 flex flex-col bg-blue-900 text-white shrink-0">
      {/* Branding */}
      <div className="flex flex-col items-center gap-2 p-5 border-b border-blue-800">
        <img src={logo} alt="GPP Logo" className="w-14 h-14 object-contain bg-white rounded-full p-1" />
        <div className="text-center">
          <p className="font-bold text-xs leading-tight">PT Global Petro Pasifik</p>
          <p className="text-blue-300 text-[10px] mt-0.5">FuelOps</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-700 text-white font-semibold'
                  : 'text-blue-200 hover:bg-blue-800 hover:text-white'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-blue-800 text-blue-400 text-[10px] text-center">
        GPP FuelOps v1.0
      </div>
    </aside>
  );
}
