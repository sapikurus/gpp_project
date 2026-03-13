import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  runTransaction,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ─── Firestore paths ────────────────────────────────────────────────────────
export const DATA_REF      = () => doc(db, 'gpp', 'data');
export const POS_REF       = () => collection(db, 'gpp', 'data', 'purchaseOrders');
export const DOS_REF       = () => collection(db, 'gpp', 'data', 'deliveryOrders');
export const CALCS_REF     = () => collection(db, 'gpp', 'data', 'calculations');
export const OLS_REF       = () => collection(db, 'gpp', 'data', 'offeringLetters');

// ─── Initial DB structure ───────────────────────────────────────────────────
export const INIT_DATA = {
  counters: { po: 0, do: 0, bdr: 0, ol: 0 },
  company: {
    name:     'PT Global Petro Pasifik',
    address1: 'Jl. Central Raya No.17 - Batam',
    address2: 'Jl. Senen Raya - Jakarta Pusat',
    npwp:     '',
    phone:    '',
    email:    '',
  },
  rates: {
    ppn:      11,
    bankRate: 6.5,
  },
  customers:   [],
  vendors:     [],
  vessels:     [],
  products: [
    { id: '1', name: 'Biosolar Industri (B40)', unit: 'Liter' },
    { id: '2', name: 'Biosolar (B35)',           unit: 'Liter' },
    { id: '3', name: 'Solar Industrial',          unit: 'Liter' },
    { id: '4', name: 'Pertamax',                  unit: 'Liter' },
    { id: '5', name: 'Pertalite',                 unit: 'Liter' },
  ],
  signatories: {
    preparedBy:   '',
    approvedBy:   '',
    fieldOfficer: '',
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Ensure gpp/data document exists; create with defaults if not. */
export async function ensureInit() {
  const ref = DATA_REF();
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, INIT_DATA);
  }
  return (await getDoc(ref)).data();
}

/** Fetch gpp/data. */
export async function fetchData() {
  const snap = await getDoc(DATA_REF());
  return snap.exists() ? snap.data() : null;
}

/** Patch gpp/data (shallow merge at top level). */
export async function patchData(partial) {
  await updateDoc(DATA_REF(), partial);
}

/** Fetch all docs from a subcollection, ordered by createdAt desc. */
export async function fetchCollection(colRef) {
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Create a new numbered document with auto-incremented counter.
 * Returns { id, docNumber }.
 */
export async function createNumberedDoc(counterKey, colRef, data, buildNumber) {
  let docNumber;
  let newId;

  await runTransaction(db, async (tx) => {
    const dataRef = DATA_REF();
    const dataSnap = await tx.get(dataRef);
    const counters = dataSnap.data().counters || {};
    const seq = (counters[counterKey] || 0) + 1;
    docNumber = buildNumber(seq);

    const newRef = doc(colRef);
    newId = newRef.id;

    tx.update(dataRef, { [`counters.${counterKey}`]: seq });
    tx.set(newRef, {
      ...data,
      docNumber,
      seq,
      createdAt: Date.now(),
    });
  });

  return { id: newId, docNumber };
}

/** Update a subcollection document. */
export async function updateSubDoc(colRef, id, data) {
  const ref = doc(colRef, id);
  await updateDoc(ref, { ...data, updatedAt: Date.now() });
}

/** Delete a subcollection document. */
export async function deleteSubDoc(colRef, id) {
  await deleteDoc(doc(colRef, id));
}
