// ─── Default chains — change here or override in Firestore settings ──────────
export const DEFAULT_CHAINS = {
  po: ['manager', 'director'],
  so: ['manager', 'director'],
  ol: ['manager', 'director'],
};

export const getChain = (settings, docType) =>
  settings?.approvalChain?.[docType] || DEFAULT_CHAINS[docType];

// First pending status when submitted
export const firstPending = (chain) => `pending_${chain[0]}`;

// Next status after a role approves
export const nextStatus = (chain, currentStatus) => {
  const pending = chain.map(r => `pending_${r}`);
  const idx = pending.indexOf(currentStatus);
  if (idx < 0) return 'draft';
  return idx < pending.length - 1 ? pending[idx + 1] : 'approved';
};

// Can this role take approval action on this doc?
export const canApprove = (role, status, chain) =>
  !!role && status === `pending_${role}` && chain.includes(role);

// Can this role submit (any non-approver, or approver when doc is draft)
export const canSubmit = (status) =>
  !status || status === 'draft' || status === 'rejected';

// Is the document editable (only when draft or rejected)
export const isEditable = (status) =>
  !status || status === 'draft' || status === 'rejected';

// Is doc fully approved
export const isApproved = (status) => status === 'approved';

// Status display config
export const statusMeta = (status) => ({
  draft:            { label: 'Draft',             badge: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400' },
  rejected:         { label: 'Ditolak',           badge: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  pending_manager:  { label: 'Menunggu Manager',  badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  pending_director: { label: 'Menunggu Direktur', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  approved:         { label: 'Disetujui',         badge: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
})[status] || { label: status, badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' };

// Roles that can approve anything (bypass chain)
export const isSuperRole = (role) => role === 'director' || role === 'superadmin';

// ─── PO threshold-based dynamic chain ─────────────────────────────────────────
export const DEFAULT_PO_THRESHOLD = 5_000_000_000; // Rp 5 billion

// Returns the approval chain for a PO based on its value.
// Under threshold → manager only. At/above → full configured chain.
export const getPOChain = (settings, totalOrder) => {
  const threshold = parseFloat(settings?.poApprovalThreshold) || DEFAULT_PO_THRESHOLD;
  const fullChain = settings?.approvalChain?.po || DEFAULT_CHAINS.po;
  if ((parseFloat(totalOrder) || 0) < threshold) {
    // Under threshold: only the first approver in the chain (typically manager)
    return [fullChain[0] || 'manager'];
  }
  return fullChain; // Full chain required
};

// Can this role see master data
export const canSeeMasterData = (role) =>
  role === 'director' || role === 'superadmin';

// Can this role delete documents
export const canDelete = (role) =>
  role === 'director' || role === 'superadmin' || role === 'manager';

// All configurable routes (Dashboard '/' is always visible — not listed here)
export const ALL_CONFIGURABLE_ROUTES = [
  { to: '/stok',           label: 'Stok / Cargo',     icon: '📦' },
  { to: '/calculator',     label: 'Calculator',        icon: '🧮' },
  { to: '/offering-letter',label: 'Offering Letter',   icon: '📄' },
  { to: '/sales-order',    label: 'Sales Order',       icon: '🤝' },
  { to: '/invoice',        label: 'Invoice',           icon: '🧾' },
  { to: '/purchase-order', label: 'Purchase Order',    icon: '🛒' },
  { to: '/delivery-order', label: 'Delivery Order',    icon: '🚢' },
  { to: '/mops',           label: 'MOPS Data',         icon: '📊' },
  { to: '/master-data',    label: 'Master Data',       icon: '⚙️' },
];

// Default menu per role (used when no custom settings saved yet)
export const DEFAULT_ROLE_MENU = {
  superadmin: ['/', '/stok', '/calculator', '/offering-letter', '/sales-order', '/invoice', '/purchase-order', '/delivery-order', '/mops', '/master-data'],
  director:   ['/', '/stok', '/calculator', '/offering-letter', '/sales-order', '/invoice', '/purchase-order', '/delivery-order', '/mops', '/master-data'],
  manager:    ['/', '/stok', '/calculator', '/offering-letter', '/sales-order', '/invoice', '/purchase-order', '/delivery-order', '/mops'],
  staff:      ['/', '/stok', '/calculator', '/offering-letter', '/sales-order', '/invoice', '/purchase-order', '/delivery-order', '/mops'],
};

// Superadmin and director always get full access regardless of settings
const SUPER_ROLES = ['superadmin', 'director'];

// Get the effective allowed routes for a role, merging Firestore settings with defaults
export const getEffectiveMenu = (settings, userRole) => {
  if (SUPER_ROLES.includes(userRole)) return DEFAULT_ROLE_MENU[userRole] || DEFAULT_ROLE_MENU.superadmin;
  const custom = settings?.rolePermissions?.[userRole];
  if (Array.isArray(custom)) return ['/', ...custom]; // always include dashboard
  return DEFAULT_ROLE_MENU[userRole] || DEFAULT_ROLE_MENU.staff;
};

// Keep ROLE_MENU as alias for backward compatibility
export const ROLE_MENU = DEFAULT_ROLE_MENU;

export const canAccessRoute = (role, path) => {
  const allowed = ROLE_MENU[role] || ROLE_MENU.staff;
  return allowed.some(r => path === r || (r !== '/' && path.startsWith(r)));
};
