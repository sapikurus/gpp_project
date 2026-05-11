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

// ─── Firestore refs ───────────────────────────────────────────────────────────
export const DATA_REF   = () => doc(db, 'gpp', 'data');
export const POS_REF    = () => collection(db, 'gpp', 'data', 'purchaseOrders');
export const DOS_REF    = () => collection(db, 'gpp', 'data', 'deliveryOrders');
export const CALCS_REF  = () => collection(db, 'gpp', 'data', 'calculations');
export const OLS_REF    = () => collection(db, 'gpp', 'data', 'offeringLetters');
export const CARGOS_REF = () => collection(db, 'gpp', 'data', 'cargos');

// ─── Default structure (used ONLY when document does not exist at all) ────────
export const INIT_DATA = {
  counters: { po: 0, do: 0, bdr: 0, ol: 0, cargo: 0, calc: 0 },
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
  const [data, pos, dos, ols, calcs, cargos] = await Promise.all([
    fetchData(),
    fetchCollection(POS_REF()),
    fetchCollection(DOS_REF()),
    fetchCollection(OLS_REF()),
    fetchCollection(CALCS_REF()),
    fetchCollection(CARGOS_REF()),
  ]);
  return { exportedAt: new Date().toISOString(), data, pos, dos, ols, calcs, cargos };
}

// ─── Restore from backup (only restores data fields, never counters) ──────────
export async function importBackup(json) {
  const { data } = json;
  if (!data) throw new Error('Invalid backup: missing data field');
  // Restore only safe fields — never touch counters
  const { counters: _skip, ...safeFields } = data;
  await updateDoc(DATA_REF(), safeFields);
}
