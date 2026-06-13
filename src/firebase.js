import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc,
  runTransaction, orderBy, query,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Persist login across browser sessions
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export const login   = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const logout  = ()          => signOut(auth);
export const onAuth  = (cb)        => onAuthStateChanged(auth, cb);

// Change password — requires current password for re-authentication
export const changePassword = async (currentPw, newPw) => {
  const user       = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, currentPw);
  await reauthenticateWithCredential(user, credential); // throws if wrong password
  await updatePassword(user, newPw);
};

// ─── Firestore refs ───────────────────────────────────────────────────────────
export const DATA_REF   = () => doc(db, 'gpp', 'data');
export const POS_REF    = () => collection(db, 'gpp', 'data', 'purchaseOrders');
export const DOS_REF    = () => collection(db, 'gpp', 'data', 'deliveryOrders');
export const CALCS_REF  = () => collection(db, 'gpp', 'data', 'calculations');
export const OLS_REF    = () => collection(db, 'gpp', 'data', 'offeringLetters');
export const STOCKS_REF = () => collection(db, 'gpp', 'data', 'stocks');
export const SOS_REF    = () => collection(db, 'gpp', 'data', 'salesOrders');
// Legacy alias — keep for any existing data
export const CARGOS_REF = STOCKS_REF;

// ─── Default structure (used ONLY when document does not exist at all) ────────
export const INIT_DATA = {
  counters: { po: 0, do: 0, bdr: 0, ol: 0, stock: 0, so: 0, calc: 0 },
  company: {
    name: 'PT Global Petro Pasifik',
    address1: 'Jl. Central Raya No.17 - Batam',
    address2: 'Jl. Senen Raya - Jakarta Pusat',
    npwp: '', phone: '', email: '',
  },
  rates: { ppn: 11, pph: 0.3, bphMigas: 0.25, bankRate: 6.5 },
  banking: { bankName: '', accountNo: '', accountName: '', branch: '' },
  pbbkbProvinces: [],
  clients:    [],
  suppliers:  [],
  facilities: [],
  products: [
    { id: '1', name: 'Biosolar Industri (B40)', unit: 'Liter', code: 'B40' },
    { id: '2', name: 'Biosolar (B35)',           unit: 'Liter', code: 'B35' },
    { id: '3', name: 'Solar Industrial',         unit: 'Liter', code: 'HSD' },
    { id: '4', name: 'Pertamax',                 unit: 'Liter', code: 'PTX' },
  ],
  signatories: { preparedBy: '', approvedBy: '', fieldOfficer: '' },
};

// ─── Safe init: ONLY seeds if document literally does not exist ───────────────
export async function ensureInit() {
  const ref  = DATA_REF();
  const snap = await getDoc(ref);

  // Document already exists — never overwrite, just return
  if (snap.exists()) return snap.data();

  // Document truly does not exist — seed with defaults
  await setDoc(ref, INIT_DATA);
  return INIT_DATA;
}

export async function fetchData() {
  const snap = await getDoc(DATA_REF());
  return snap.exists() ? snap.data() : null;
}

// ─── Surgical field-level patch (never replaces whole document) ───────────────
// Pass only the specific fields you want to change.
// e.g. patchField('clients', [...]) only writes the clients array.
export async function patchField(field, value) {
  await updateDoc(DATA_REF(), { [field]: value });
}

// For nested fields e.g. patchField('rates.ppn', 11)
export async function patchData(partial) {
  await updateDoc(DATA_REF(), partial);
}

// ─── Collection helpers ───────────────────────────────────────────────────────
export async function fetchCollection(colRef) {
  const q    = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createNumberedDoc(counterKey, colRef, data, buildNumber) {
  let docNumber, newId;

  await runTransaction(db, async (tx) => {
    const dataRef  = DATA_REF();
    const dataSnap = await tx.get(dataRef);
    const counters = dataSnap.data()?.counters || {};
    const seq      = (counters[counterKey] || 0) + 1;
    docNumber      = buildNumber(seq);

    const newRef = doc(colRef);
    newId        = newRef.id;

    tx.update(dataRef, { [`counters.${counterKey}`]: seq });
    tx.set(newRef, { ...data, docNumber, seq, createdAt: Date.now() });
  });

  return { id: newId, docNumber };
}

export async function updateSubDoc(colRef, id, data) {
  await updateDoc(doc(colRef, id), { ...data, updatedAt: Date.now() });
}

export async function deleteSubDoc(colRef, id) {
  await deleteDoc(doc(colRef, id));
}

// ─── Full backup export ───────────────────────────────────────────────────────
export async function exportBackup() {
  const [data, pos, dos, ols, calcs, stocks, sos] = await Promise.all([
    fetchData(),
    fetchCollection(POS_REF()),
    fetchCollection(DOS_REF()),
    fetchCollection(OLS_REF()),
    fetchCollection(CALCS_REF()),
    fetchCollection(STOCKS_REF()),
    fetchCollection(SOS_REF()),
  ]);
  return { exportedAt: new Date().toISOString(), data, pos, dos, ols, calcs, stocks, sos };
}

// ─── Restore from backup (only restores data fields, never counters) ──────────
export async function importBackup(json) {
  const { data } = json;
  if (!data) throw new Error('Invalid backup: missing data field');
  const { counters: _skip, ...safeFields } = data;
  await updateDoc(DATA_REF(), safeFields);
}

// ─── Approval email helpers ───────────────────────────────────────────────────
// Collect all manager + director emails from userRoles map
export async function getApproverEmails() {
  const snap = await getDoc(DATA_REF());
  const userRoles = snap.data()?.userRoles || {};
  const managers = [], directors = [];
  Object.entries(userRoles).forEach(([email, role]) => {
    if (role === 'manager')                       managers.push(email);
    if (role === 'director' || role === 'superadmin') directors.push(email);
  });
  return { managers, directors, all: [...new Set([...managers, ...directors])] };
}

// Send notification via the configured GAS email endpoint
// Fails silently — never blocks the approval flow
export async function sendApprovalEmail(settings, { to, subject, body }) {
  const endpoint = settings?.emailEndpoint;
  if (!endpoint || !to?.length) return;
  try {
    const params = new URLSearchParams({
      action:  'email',
      to:      to.join(','),
      subject,
      body,
    });
    await fetch(`${endpoint}?${params.toString()}`);
  } catch (e) {
    console.warn('Email notification failed (non-blocking):', e.message);
  }
}
export async function getUserRole(email) {
  const snap = await getDoc(DATA_REF());
  const userRoles = snap.data()?.userRoles || {};
  return userRoles[email] || 'staff';
}

// Get the email of whoever originally submitted a document
export function getSubmitterEmail(approvalHistory) {
  const entry = (approvalHistory || []).find(h => h.action === 'submit' || h.action === 'submitted');
  return entry?.by || null;
}

// ─── Approval helpers ─────────────────────────────────────────────────────────
// Apply an approval action to a document
// action: 'submit' | 'approve' | 'reject'
// nextStatus: computed by approvalUtils caller
export async function applyApproval(colRef, docId, { action, nextApprovalStatus, role, email, note }) {
  const historyEntry = { role, action, by: email, at: Date.now(), note: note || '' };
  await updateDoc(doc(colRef, docId), {
    approvalStatus: nextApprovalStatus,
    [`approvalHistory`]: (await getDoc(doc(colRef, docId))).data()?.approvalHistory
      ? [...(await getDoc(doc(colRef, docId))).data().approvalHistory, historyEntry]
      : [historyEntry],
    updatedAt: Date.now(),
  });
}

// Surgical approval update — avoids double-read
export async function applyApprovalDirect(colRef, docId, currentHistory, { action, nextApprovalStatus, role, email, note }) {
  const historyEntry = { role, action, by: email, at: Date.now(), note: note || '' };
  await updateDoc(doc(colRef, docId), {
    approvalStatus: nextApprovalStatus,
    approvalHistory: [...(currentHistory || []), historyEntry],
    updatedAt: Date.now(),
  });
}

// SO approval with Stok deduction — runs as a transaction
// Only called when the final approver (last in chain) approves an SO
export async function approveSoFinal({ soId, soData, historyEntry }) {
  await runTransaction(db, async (tx) => {
    const soRef    = doc(SOS_REF(), soId);
    const stockRef = doc(STOCKS_REF(), soData.stockId);
    const stockSnap = await tx.get(stockRef);

    const newHistory = [...(soData.approvalHistory || []), historyEntry];
    tx.update(soRef, {
      approvalStatus: 'approved',
      approvalHistory: newHistory,
      updatedAt: Date.now(),
    });

    if (stockSnap.exists() && soData.stockId) {
      const existing  = stockSnap.data();
      const newCommitted = (existing.committedVolume || 0) + (parseFloat(soData.volume) || 0);
      const totalVol  = existing.totalVolume || 0;
      const newStatus = newCommitted >= totalVol ? 'Sold Out' : 'Confirmed';
      tx.update(stockRef, {
        committedVolume: newCommitted,
        status: newStatus,
        updatedAt: Date.now(),
      });
    }
  });
}

