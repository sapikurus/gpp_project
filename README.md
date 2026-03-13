# FuelOps GPP

Operational document management system for **PT Global Petro Pasifik (GPP)**.

## Features

| Module | Description |
|---|---|
| 📊 Dashboard | Overview of PO/DO counts and recent activity |
| 🧮 Calculator | Cargo profit calculator with CoM tranche system and snapshot saves |
| 📄 Surat Penawaran | Offering letter generation with print view |
| 📋 Purchase Order | GPP-format PO generation with auto-numbered doc numbers |
| 🚢 Delivery Order | Surat Jalan + Bunker Delivery Receipt, optional PO link |
| ⚙️ Master Data | Company profile, customers, vendors, vessels, products |

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Firebase Firestore
- **Hosting:** Vercel (recommended)

## Setup

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/fuelops-gpp.git
cd fuelops-gpp
npm install
```

### 2. Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database** (start in production mode)
3. Copy your config into `.env`:

```
cp .env.example .env
```

Fill in all `VITE_FIREBASE_*` values from your Firebase project settings.

### 3. Firestore Rules (recommended)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /gpp/{document=**} {
      allow read, write: if true; // tighten for production
    }
  }
}
```

### 4. Run

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
npm run build
# Push to GitHub, connect repo on vercel.com
# Add VITE_FIREBASE_* env vars in Vercel project settings
```

## Document Numbering

| Document | Format | Example |
|---|---|---|
| Purchase Order | `XX/PO-GPP/[ROM]/[YYYY]` | `02/PO-GPP/III/2026` |
| Surat Jalan | `XXX/DO-GPP/[ROM]/[YYYY]` | `078/DO-GPP/III/2026` |
| Bunker Delivery Receipt | `XXX/BDR-GPP/[ROM]/[YYYY]` | `025/BDR-GPP/III/2026` |
| Surat Penawaran | `XXX/SP-GPP/[ROM]/[YYYY]` | `001/SP-GPP/III/2026` |

## Firestore Structure

```
gpp/
  data                  ← company config, rates, master lists, counters
  data/purchaseOrders/  ← PO documents
  data/deliveryOrders/  ← Surat Jalan + BDR documents
  data/offeringLetters/ ← Offering letter documents
  data/calculations/    ← Calculator snapshots
```
