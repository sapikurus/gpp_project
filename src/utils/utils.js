// ─── Number Formatting ───────────────────────────────────────────────────────

export const formatIDR = (num) => {
  if (num === null || num === undefined || num === '') return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(num));
};

export const formatNum = (num, dec = 2) => {
  if (num === null || num === undefined || num === '') return '-';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(Number(num));
};

export const formatQty = (num) => formatNum(num, 0);

export const parseNum = (str) => {
  if (!str) return 0;
  // Remove thousands separators (id-ID uses '.' as separator)
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
};

// ─── Terbilang (number → Indonesian words) ──────────────────────────────────

export const terbilang = (num) => {
  num = Math.round(Math.abs(num));
  if (num === 0) return 'nol rupiah';

  const satuan = [
    '', 'satu', 'dua', 'tiga', 'empat', 'lima',
    'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
  ];

  const helper = (n) => {
    if (n < 12)   return satuan[n];
    if (n < 20)   return satuan[n - 10] + ' belas';
    if (n < 100)  return satuan[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + satuan[n % 10] : '');
    if (n < 200)  return 'seratus' + (n % 100 ? ' ' + helper(n % 100) : '');
    if (n < 1000) return satuan[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + helper(n % 100) : '');
    if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + helper(n % 1000) : '');
    if (n < 1e6)  return helper(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + helper(n % 1000) : '');
    if (n < 1e9)  return helper(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + helper(n % 1e6) : '');
    if (n < 1e12) return helper(Math.floor(n / 1e9)) + ' milyar' + (n % 1e9 ? ' ' + helper(n % 1e9) : '');
    return helper(Math.floor(n / 1e12)) + ' triliun' + (n % 1e12 ? ' ' + helper(n % 1e12) : '');
  };

  const words = helper(num);
  return words.charAt(0).toUpperCase() + words.slice(1) + ' rupiah';
};

// ─── Date & Roman Numeral Helpers ───────────────────────────────────────────

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const toRoman = (month) => ROMAN[month] || String(month);

export const formatDateID = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const today = () => new Date().toISOString().slice(0, 10);

// ─── Document Number Generators ─────────────────────────────────────────────

export const buildPONumber = (seq, month, year) =>
  `${String(seq).padStart(2, '0')}/PO-GPP/${toRoman(month)}/${year}`;

export const buildDONumber = (seq, month, year) =>
  `${String(seq).padStart(3, '0')}/DO-GPP/${toRoman(month)}/${year}`;

export const buildBDRNumber = (seq, month, year) =>
  `${String(seq).padStart(3, '0')}/BDR-GPP/${toRoman(month)}/${year}`;

export const buildOLNumber = (seq, month, year) =>
  `${String(seq).padStart(3, '0')}/SP-GPP/${toRoman(month)}/${year}`;

// ─── Days Between Two Dates ─────────────────────────────────────────────────

export const daysBetween = (dateA, dateB) => {
  if (!dateA || !dateB) return 0;
  const diff = new Date(dateB) - new Date(dateA);
  return Math.max(0, Math.round(diff / 86400000));
};

// ─── Calculator Core Logic ───────────────────────────────────────────────────

/**
 * All monetary values in IDR.
 * All per-liter values in IDR/L.
 * Volume in Liters.
 */
export const runCalculation = (form) => {
  const volume = parseFloat(form.volume) || 0;
  if (volume === 0) return null;

  // ── Buy price per liter
  let buyPrice;
  if (form.buyMode === 'hip') {
    buyPrice = (parseFloat(form.hipBase) || 0) * 1.11;
  } else {
    buyPrice = parseFloat(form.buyPrice) || 0;
  }
  const totalBuyValue = buyPrice * volume;

  // ── Direct costs (per liter)
  const freight      = parseFloat(form.freight)       || 0;
  const portPerL     = parseFloat(form.portChargesPerL) || 0;
  const portFlatPerL = volume > 0 ? (parseFloat(form.portChargesFlat) || 0) / volume : 0;
  const surveyorPerL = volume > 0 ? (parseFloat(form.surveyorFlat)   || 0) / volume : 0;
  const otherPerL    = parseFloat(form.otherPerL)     || 0;
  const totalDirectPerL = freight + portPerL + portFlatPerL + surveyorPerL + otherPerL;

  // ── Cost of Money per tranche
  const annualRate = (parseFloat(form.bankRate) || 0) / 100;
  const trancheDetails = (form.tranches || []).map((t) => {
    const pct      = (parseFloat(t.pct) || 0) / 100;
    const value    = totalBuyValue * pct;
    const days     = daysBetween(t.buyDate, t.payDate);
    const warning  = days > 365;
    const com      = value * annualRate / 365 * days;
    return { ...t, value, days, com, warning };
  });
  const totalCoM   = trancheDetails.reduce((s, t) => s + t.com, 0);
  const comPerL    = volume > 0 ? totalCoM / volume : 0;

  // ── Total cost
  const totalCostPerL = buyPrice + totalDirectPerL + comPerL;
  const totalCost     = totalCostPerL * volume;

  // ── Sell price
  let sellPrice;
  if (form.sellMode === 'formula') {
    const mopsUSD    = parseFloat(form.mopsUSD)    || 0;
    const jisdor     = parseFloat(form.jisdor)     || 0;
    const premium    = parseFloat(form.premium)    || 0;
    const mopsWeight = (parseFloat(form.mopsWeight) || 60) / 100;
    const hipBBN     = parseFloat(form.hipBBN)     || 0;
    const mopsIDRL   = (mopsUSD * jisdor) / 158.987;
    sellPrice = mopsWeight * (mopsIDRL + premium) + (1 - mopsWeight) * hipBBN;
  } else {
    sellPrice = parseFloat(form.sellPrice) || 0;
  }

  // ── Profit
  const marginPerL  = sellPrice - totalCostPerL;
  const marginPct   = sellPrice > 0 ? (marginPerL / sellPrice) * 100 : 0;
  const totalProfit = marginPerL * volume;
  const breakevenL  = totalCostPerL;

  return {
    volume,
    buyPrice,
    totalBuyValue,
    freight,
    portPerL,
    portFlatPerL,
    surveyorPerL,
    otherPerL,
    totalDirectPerL,
    trancheDetails,
    totalCoM,
    comPerL,
    totalCostPerL,
    totalCost,
    sellPrice,
    marginPerL,
    marginPct,
    totalProfit,
    breakevenL,
  };
};
