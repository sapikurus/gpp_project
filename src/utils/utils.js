// ─── Formatters ──────────────────────────────────────────────────────────────
export const formatIDR = (n) => {
  if (n == null || n === '') return '-';
  return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0, maximumFractionDigits:0 }).format(Number(n));
};
export const formatNum = (n, dec = 2) => {
  if (n == null || n === '') return '-';
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits:dec, maximumFractionDigits:dec }).format(Number(n));
};
export const parseNum = (s) => parseFloat(String(s||0).replace(/\./g,'').replace(',','.')) || 0;

// ─── Terbilang ────────────────────────────────────────────────────────────────
export const terbilang = (num) => {
  num = Math.round(Math.abs(num));
  if (!num) return 'nol rupiah';
  const s = ['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
  const h = (n) => {
    if (n < 12)   return s[n];
    if (n < 20)   return s[n-10]+' belas';
    if (n < 100)  return s[Math.floor(n/10)]+' puluh'+(n%10?' '+s[n%10]:'');
    if (n < 200)  return 'seratus'+(n%100?' '+h(n%100):'');
    if (n < 1000) return s[Math.floor(n/100)]+' ratus'+(n%100?' '+h(n%100):'');
    if (n < 2000) return 'seribu'+(n%1000?' '+h(n%1000):'');
    if (n < 1e6)  return h(Math.floor(n/1000))+' ribu'+(n%1000?' '+h(n%1000):'');
    if (n < 1e9)  return h(Math.floor(n/1e6))+' juta'+(n%1e6?' '+h(n%1e6):'');
    if (n < 1e12) return h(Math.floor(n/1e9))+' milyar'+(n%1e9?' '+h(n%1e9):'');
    return h(Math.floor(n/1e12))+' triliun'+(n%1e12?' '+h(n%1e12):'');
  };
  const w = h(num); return w[0].toUpperCase()+w.slice(1)+' rupiah';
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
const ROM = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
export const INDO_MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
export const toRoman       = (m) => ROM[m] || String(m);
export const today         = () => new Date().toISOString().slice(0,10);
export const daysBetween   = (a,b) => !a||!b ? 0 : Math.max(0, Math.round((new Date(b)-new Date(a))/86400000));
export const formatDateID   = (s) => !s ? '' : new Date(s+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
export const formatDateShort= (s) => !s ? '' : new Date(s+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
// DD/MM/YYYY — used for all front-end date displays (tables, cards, badges)
export const fmtDate = (s) => {
  if (!s) return '–';
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d)) return s;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

// Auto-fill bi-monthly Pertamina period based on today's date
export const autoPeriod = () => {
  const d = new Date();
  const day   = d.getDate();
  const month = INDO_MONTHS[d.getMonth()];
  const year  = d.getFullYear();
  const daysInMonth = new Date(year, d.getMonth() + 1, 0).getDate();
  return day <= 14 ? `1 - 14 ${month} ${year}` : `15 - ${daysInMonth} ${month} ${year}`;
};

// ─── Doc number builders ──────────────────────────────────────────────────────
export const buildPONumber  = (seq,m,y) => `${String(seq).padStart(2,'0')}/PO-GPP/${toRoman(m)}/${y}`;
export const buildDONumber  = (seq,m,y) => `${String(seq).padStart(3,'0')}/DO-GPP/${toRoman(m)}/${y}`;
export const buildBDRNumber = (seq,m,y) => `${String(seq).padStart(3,'0')}/BDR-GPP/${toRoman(m)}/${y}`;
export const buildOLNumber  = (seq,m,y) => `${String(seq).padStart(3,'0')}/SP-GPP/${toRoman(m)}/${y}`;
// New SPH format: 001/SPH/GPP/CLIENTCODE/V/2026
export const buildSPHNumber = (seq, clientCode, m, y) =>
  `${String(seq).padStart(3,'0')}/SPH/GPP/${clientCode || 'XXX'}/${toRoman(m)}/${y}`;

// ─── Core calculation engine ──────────────────────────────────────────────────
export const runCalculation = (form) => {
  const { rates={}, pbbkbProvinces=[], tranches=[] } = form;
  const ppnRate  = (parseFloat(rates.ppn)      || 0) / 100;
  const pphRate  = (parseFloat(rates.pph)       || 0) / 100;
  const bphRate  = (parseFloat(rates.bphMigas)  || 0) / 100;
  const bankRate = (parseFloat(rates.bankRate)   || 0) / 100;

  const provRate = (name) => {
    const p = pbbkbProvinces.find(x => x.name === name);
    return p ? (parseFloat(p.rate) || 0) / 100 : 0;
  };

  let totalVol=0, totalValue=0, totalCoM=0, totalBase=0;

  const trancheDetails = tranches.map(t => {
    const vol   = parseFloat(t.vol)       || 0;
    const base  = parseFloat(t.basePrice) || 0;
    const top   = daysBetween(t.loadDate, t.payDate);
    const pbbkbR = t.applyPBBKB && !t.noPbbkb ? provRate(t.pbbkbProvince) : 0;
    // PPN excluded from cost — pass-through tax (input credit claimed against output VAT)
    const pbbkbAmt = base * pbbkbR;
    const bphAmt   = t.applyBPHBuy ? base * bphRate  : 0;
    const ppnAmt   = t.applyPPN    ? base * ppnRate  : 0; // kept for reference only
    const eff      = base + pbbkbAmt + bphAmt;            // PPN not in cost
    const value    = eff * vol;
    // Compound CoM: value × ((1+r)^(TOP/365) − 1)
    const com = top > 0 ? value * (Math.pow(1 + bankRate, top / 365) - 1) : 0;
    totalVol   += vol;
    totalValue += value;
    totalCoM   += com;
    totalBase  += base * vol;
    return { ...t, vol, base, top, pbbkbR, ppnAmt, pbbkbAmt, bphAmt, effectiveCostPerL:eff, trancheValue:value, com, warning:top>365 };
  });

  if (totalVol === 0) return null;

  const blendedBuyPerL  = totalValue / totalVol;
  const blendedBasePerL = totalBase  / totalVol;
  const comPerL         = totalCoM   / totalVol;

  // PPH on blended base price (buy side cost)
  const pphPerL = form.applyPPH ? blendedBasePerL * pphRate : 0;

  // Direct costs
  const freight      = parseFloat(form.freight)          || 0;
  const portPerL     = parseFloat(form.portChargesPerL)   || 0;
  const portFlatPerL = totalVol > 0 ? (parseFloat(form.portChargesFlat)||0) / totalVol : 0;
  const surveyorPerL = totalVol > 0 ? (parseFloat(form.surveyorFlat)   ||0) / totalVol : 0;
  const otherPerL    = parseFloat(form.otherPerL)        || 0;
  const totalDirectPerL = freight + portPerL + portFlatPerL + surveyorPerL + otherPerL;

  // Sell price
  let sellPrice = 0;
  if (form.sellMode === 'formula') {
    const mopsUSD    = parseFloat(form.mopsUSD)    || 0;
    const jisdor     = parseFloat(form.jisdor)     || 0;
    const premium    = parseFloat(form.premium)    || 0;
    const mopsWeight = (parseFloat(form.mopsWeight)||60) / 100;
    const hipBBN     = parseFloat(form.hipBBN)     || 0;
    sellPrice = mopsWeight * ((mopsUSD * jisdor / 158.987) + premium) + (1-mopsWeight) * hipBBN;
  } else {
    sellPrice = parseFloat(form.sellPrice) || 0;
  }

  // BPH Migas sell side
  const bphSellPerL = form.applyBPHSell ? sellPrice * bphRate : 0;

  // Sell-side PBBKB (pass-through)
  const delivProv       = pbbkbProvinces.find(p => p.name === form.deliveryProvince);
  const pbbkbRegistered = delivProv?.registered || false;
  const pbbkbSellRate   = pbbkbRegistered ? (parseFloat(delivProv.rate)||0)/100 : 0;
  const pbbkbSellPerL   = pbbkbRegistered ? sellPrice * pbbkbSellRate : 0;

  const totalCostPerL = blendedBuyPerL + comPerL + totalDirectPerL + pphPerL + bphSellPerL;
  const marginPerL    = sellPrice - totalCostPerL;
  const marginPct     = sellPrice > 0 ? (marginPerL/sellPrice)*100 : 0;
  const totalProfit   = marginPerL * totalVol;
  const totalCost     = totalCostPerL * totalVol;

  return {
    totalVol, trancheDetails, blendedBuyPerL, blendedBasePerL,
    totalCoM, comPerL, pphPerL,
    freight, portPerL, portFlatPerL, surveyorPerL, otherPerL, totalDirectPerL,
    bphSellPerL, pbbkbRegistered, pbbkbSellRate, pbbkbSellPerL,
    sellPrice, totalCostPerL, totalCost, marginPerL, marginPct, totalProfit,
  };
};

// ─── Signatory helpers ────────────────────────────────────────────────────────
// Pick a signatory from the list that matches a given role.
// Falls back to any director/superadmin, then first entry.
export const getSignatoryByRole = (signatories, role) => {
  if (!Array.isArray(signatories) || signatories.length === 0) return null;
  return (
    signatories.find(s => s.role === role) ||
    signatories.find(s => s.role === 'director' || s.role === 'superadmin') ||
    signatories[0]
  );
};

// Returns { preparedBy: {name, jabatan}, approvedBy: {name, jabatan} }
// preparedByRole = role of the current user (who prepared the document)
export const getSignatureBlock = (signatories, preparedByRole = 'staff') => {
  const sigs = Array.isArray(signatories) ? signatories : [];
  const prepared = getSignatoryByRole(sigs, preparedByRole) || { name: '', jabatan: '' };
  const approved = sigs.find(s => s.role === 'director' || s.role === 'superadmin') || { name: '', jabatan: 'Direktur' };
  return {
    preparedBy: { name: prepared.name || '', jabatan: prepared.jabatan || '' },
    approvedBy: { name: approved.name || '', jabatan: approved.jabatan || 'Direktur' },
  };
};
