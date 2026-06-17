import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../App.jsx';
import {
  fetchCollection, createNumberedDoc, updateSubDoc, deleteSubDoc, INVS_REF,
} from '../../firebase.js';
import {
  today, toRoman, buildINVNumber, terbilang, fmtDate, formatDateID, getSignatureBlock,
} from '../../utils/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtIDR = (v) => Number(v || 0).toLocaleString('id-ID');
const fmtMoney = (v) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(Number(v) || 0);

const STATUS_META = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600' },
  issued:    { label: 'Issued',    color: 'bg-blue-100 text-blue-700' },
  paid:      { label: 'Paid',      color: 'bg-green-100 text-green-700' },
  overdue:   { label: 'Overdue',   color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', color: 'bg-orange-100 text-orange-600' },
};

const BLANK_ITEM = () => ({ id: Date.now().toString() + Math.random(), description: '', qty: '', unitPrice: '', amount: 0 });

const INIT_FORM = () => ({
  invoiceDate:  today(),
  soId:         '',
  soNumber:     '',
  clientId:     '',
  clientName:   '',
  clientAddress:'',
  clientNPWP:   '',
  shipTo:       '',
  terms:        'C.O.D',
  destination:  'FOB',
  shipVia:      'Bunker Service',
  shipDate:     today(),
  poNo:         '',
  currency:     'IDR',
  category:     'BBM',    // BBM | GEN
  items:        [BLANK_ITEM()],
  discount:     0,
  applyPPN:     true,
  ppnRate:      11,
  notes:        '',
  status:       'draft',
});

// ─── Calculation ──────────────────────────────────────────────────────────────
function calcTotals(items, discount, applyPPN, ppnRate) {
  const subtotal = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const disc     = parseFloat(discount) || 0;
  const taxable  = subtotal - disc;
  const tax      = applyPPN ? Math.round(taxable * (parseFloat(ppnRate) || 11) / 100) : 0;
  const total    = taxable + tax;
  return { subtotal, disc, tax, total };
}

// ─── Print HTML generator (bilingual EN / ID) ─────────────────────────────────
function generateInvoiceHtml(inv, company, banks, lang = 'id') {
  const isEN = lang === 'en';

  const T = {
    docTitle:   isEN ? 'Sales Invoice'                  : 'Faktur Penjualan',
    invoiceDate:isEN ? 'Invoice Date'                   : 'Tanggal Invoice',
    invoiceNo:  isEN ? 'Invoice No.'                    : 'No. Invoice',
    terms:      isEN ? 'Terms'                          : 'Syarat Pembayaran',
    destination:isEN ? 'Destination'                    : 'Tujuan',
    shipVia:    isEN ? 'Ship Via'                       : 'Dikirim Via',
    shipDate:   isEN ? 'Ship Date'                      : 'Tanggal Kirim',
    poNo:       isEN ? 'PO No.'                         : 'No. PO',
    currency:   isEN ? 'Currency'                       : 'Mata Uang',
    billTo:     isEN ? 'Bill To'                        : 'Tagih Kepada',
    shipTo:     isEN ? 'Ship To'                        : 'Kirim Ke',
    colNo:      isEN ? 'No.'                            : 'No.',
    colDesc:    isEN ? 'Item Description'               : 'Uraian / Keterangan',
    colQty:     isEN ? 'Qty'                            : 'Kuantitas',
    colPrice:   isEN ? 'Unit Price'                     : 'Harga Satuan',
    colAmount:  isEN ? 'Amount'                         : 'Jumlah',
    say:        isEN ? 'Say :'                          : 'Terbilang :',
    subTotal:   isEN ? 'Sub Total :'                    : 'Sub Total :',
    discount:   isEN ? 'Discount :'                     : 'Diskon :',
    tax:        isEN ? `Tax (PPN ${inv.ppnRate||11}%) :`  : `Pajak (PPN ${inv.ppnRate||11}%) :`,
    totalInv:   isEN ? 'Total Invoice :'                : 'Total Invoice :',
    payIntro:   isEN ? 'Kindly remit payment via TT to our bank account:'
                     : 'Mohon pembayaran dikirim via TT ke rekening berikut:',
    bankName:   isEN ? 'Name'                           : 'Nama',
    bankLabel:  isEN ? 'Bank'                           : 'Bank',
    acNo:       isEN ? 'A/C No.'                        : 'No. Rekening',
    closing:    isEN ? 'Thank you and we look forward to your next order.'
                     : 'Terima kasih dan kami tunggu pesanan selanjutnya.',
    regards:    isEN ? 'Best Regard,'                   : 'Hormat Kami,',
    finance:    isEN ? 'Finance Dept.'                  : 'Bagian Keuangan',
    headOffice: isEN ? 'Head Office'                    : 'Kantor Pusat',
  };

  const bank = inv.bankId
    ? (banks || []).find(b => String(b.id) === String(inv.bankId)) || (banks || [])[0] || {}
    : (banks || []).find(b => b.isPrimary) || (banks || [])[0] || {};

  const { subtotal, disc, tax, total } = calcTotals(inv.items || [], inv.discount, inv.applyPPN, inv.ppnRate);
  const sayText = terbilang(total);

  const addr = (company.address || '').split('\n').filter(Boolean).join('<br>');
  const fmtDatePrint = (s) => {
    if (!s) return '';
    const d = new Date(s + 'T12:00:00');
    const M_id = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const M_en = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${d.getDate()} ${(isEN ? M_en : M_id)[d.getMonth()]} ${d.getFullYear()}`;
  };

  // Language toggle bar (calls opener to re-render with new lang)
  const toggleBar = `
    <div id="lang-bar" style="position:fixed;top:0;left:0;right:0;background:#1a3a6b;color:white;padding:8px 20px;display:flex;align-items:center;gap:16px;z-index:999;font-family:sans-serif;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
      <span style="font-weight:700">GPP Portal — ${T.docTitle}</span>
      <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <span>Language:</span>
        <button onclick="switchLang('id')" style="padding:3px 12px;border-radius:99px;border:none;cursor:pointer;font-weight:700;background:${!isEN?'white':'rgba(255,255,255,0.2)'};color:${!isEN?'#1a3a6b':'white'}">🇮🇩 ID</button>
        <button onclick="switchLang('en')" style="padding:3px 12px;border-radius:99px;border:none;cursor:pointer;font-weight:700;background:${isEN?'white':'rgba(255,255,255,0.2)'};color:${isEN?'#1a3a6b':'white'}">🇬🇧 EN</button>
        <button onclick="window.print()" style="padding:4px 16px;border-radius:6px;border:none;cursor:pointer;background:#f59e0b;color:white;font-weight:700;margin-left:8px">🖨️ Print / Save PDF</button>
      </span>
    </div>
    <script>
      window._invDoc = ${JSON.stringify(inv)};
      function switchLang(l) {
        const opener = window.opener;
        if (opener && typeof opener._gppGenerateInvoice === 'function') {
          const html = opener._gppGenerateInvoice(window._invDoc, l);
          document.open(); document.write(html); document.close();
        } else {
          alert('Please re-open the preview from the app to switch language.');
        }
      }
    <\/script>`;

  return `<!DOCTYPE html><html lang="${lang}"><head>
<meta charset="UTF-8"/><title>${inv.invoiceNumber || 'Invoice'} — ${T.docTitle}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#222; background:white; }
  .page { max-width:210mm; margin:0 auto; padding:56px 16mm 12mm; }
  table { width:100%; border-collapse:collapse; }
  th,td { padding:5px 8px; border:1px solid #aaa; }
  th { background:#1a3a6b; color:white; text-align:left; font-size:10px; }
  .nb td { border:none; padding:2px 0; }
  .tot td { border:1px solid #bbb; padding:4px 10px; }
  @media print {
    #lang-bar { display:none !important; }
    .page { padding:15mm; }
    @page { size:A4; margin:0; }
  }
</style></head><body>
${toggleBar}
<div class="page">

  <!-- Letterhead -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="background:#1a3a6b;color:white;font-weight:900;font-size:18px;padding:8px 14px;border-radius:4px">GPP</div>
      <div>
        <p style="font-size:15px;font-weight:800;color:#1a3a6b">${company.name || 'PT GLOBAL PETRO PASIFIK'}</p>
        <p style="font-size:9px;color:#555">${addr}</p>
        ${company.phone ? `<p style="font-size:9px;color:#555">Telp: ${company.phone}</p>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <p style="font-size:26px;font-weight:300;color:#1a3a6b;letter-spacing:2px">${T.docTitle}</p>
    </div>
  </div>

  <!-- Bill To + Ship To + Meta box -->
  <div style="display:flex;gap:14px;margin-bottom:14px">
    <div style="flex:1">
      <table style="font-size:10px">
        <tr style="background:none">
          <td style="border:1px solid #aaa;padding:3px 6px;background:#f3f4f6;font-weight:700;width:70px;color:#333">${T.billTo}</td>
          <td style="border:1px solid #aaa;padding:3px 6px">
            <b>${inv.clientName || ''}</b><br>
            ${(inv.clientAddress||'').split('\n').filter(Boolean).join('<br>')}
            ${inv.clientNPWP ? `<br><span style="color:#777;font-size:9px">NPWP: ${inv.clientNPWP}</span>` : ''}
          </td>
        </tr>
        <tr style="background:none">
          <td style="border:1px solid #aaa;padding:3px 6px;background:#f3f4f6;font-weight:700;color:#333">${T.shipTo}</td>
          <td style="border:1px solid #aaa;padding:3px 6px">${(inv.shipTo||'').split('\n').join('<br>')}</td>
        </tr>
      </table>
    </div>
    <div style="min-width:260px">
      <table style="font-size:10px">
        ${[
          [T.invoiceDate, fmtDatePrint(inv.invoiceDate), T.invoiceNo, `<b style="color:#1a3a6b">${inv.invoiceNumber||''}</b>`],
          [T.terms, inv.terms||'', T.destination, inv.destination||''],
          [T.shipVia, inv.shipVia||'', T.shipDate, fmtDatePrint(inv.shipDate)],
          [T.poNo, inv.poNo||'', T.currency, inv.currency||'IDR'],
        ].map(([k1,v1,k2,v2]) => `
          <tr>
            <td style="background:#f3f4f6;font-weight:600;border:1px solid #aaa;padding:3px 8px;width:80px">${k1}</td>
            <td style="border:1px solid #aaa;padding:3px 8px">${v1}</td>
            <td style="background:#f3f4f6;font-weight:600;border:1px solid #aaa;padding:3px 8px">${k2}</td>
            <td style="border:1px solid #aaa;padding:3px 8px">${v2}</td>
          </tr>`).join('')}
      </table>
    </div>
  </div>

  <!-- Line items -->
  <table style="margin-bottom:6px;font-size:11px">
    <thead><tr>
      <th style="width:30px;text-align:center">${T.colNo}</th>
      <th>${T.colDesc}</th>
      <th style="width:90px;text-align:right">${T.colQty}</th>
      <th style="width:110px;text-align:right">${T.colPrice}</th>
      <th style="width:130px;text-align:right">${T.colAmount}</th>
    </tr></thead>
    <tbody>
      ${(inv.items||[]).map((it,i) => `
        <tr>
          <td style="text-align:center">${i+1}</td>
          <td>${it.description||''}</td>
          <td style="text-align:right;font-family:monospace">${fmtMoney(it.qty)}</td>
          <td style="text-align:right;font-family:monospace">${fmtMoney(it.unitPrice)}</td>
          <td style="text-align:right;font-family:monospace">${fmtMoney(it.amount)}</td>
        </tr>`).join('')}
      ${Array.from({ length: Math.max(0, 6-(inv.items||[]).length) }, () =>
        `<tr><td style="height:18px">&nbsp;</td><td></td><td></td><td></td><td></td></tr>`
      ).join('')}
    </tbody>
  </table>

  <!-- Say + Totals -->
  <div style="display:flex;gap:16px;margin-bottom:14px;align-items:flex-start">
    <div style="flex:1">
      <table class="nb" style="font-size:10px;margin-bottom:4px">
        <tr><td style="font-weight:600;width:80px">${T.say}</td>
            <td style="font-style:italic;border-bottom:1px solid #aaa">${sayText}</td></tr>
      </table>
      ${inv.notes ? `<div style="margin-top:6px;font-size:10px">
        <p style="font-size:9px;font-weight:600;color:#555;margin-bottom:2px">Notes / Keterangan:</p>
        <div style="border:1px solid #aaa;padding:6px 8px;min-height:36px">${inv.notes}</div>
      </div>` : ''}
    </div>
    <div style="min-width:240px">
      <table class="tot" style="font-size:11px">
        <tr><td style="width:120px">${T.subTotal}</td><td style="text-align:right;font-family:monospace">${fmtMoney(subtotal)}</td></tr>
        <tr><td>${T.discount}</td><td style="text-align:right;font-family:monospace">${fmtMoney(disc)}</td></tr>
        <tr><td>${T.tax}</td><td style="text-align:right;font-family:monospace">${fmtMoney(tax)}</td></tr>
        <tr style="background:#f3f4f6">
          <td style="font-weight:800;font-size:12px">${T.totalInv}</td>
          <td style="text-align:right;font-family:monospace;font-weight:800;font-size:12px">${fmtMoney(total)}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- Payment + Signature -->
  <div style="display:flex;gap:16px;align-items:flex-end">
    <div style="flex:1;font-size:10px">
      ${bank.bankName ? `
      <p style="margin-bottom:4px">${T.payIntro}</p>
      <table class="nb" style="font-size:10px">
        <tr><td style="width:70px">${T.bankName}</td><td>: ${bank.accountName || company.name}</td></tr>
        <tr><td>${T.bankLabel}</td><td>: ${bank.bankName}</td></tr>
        <tr><td>${T.acNo}</td><td>: ${bank.accountNo}</td></tr>
      </table>` : ''}
      <p style="margin-top:14px;font-size:10px;color:#555">${T.closing}</p>
    </div>
    <div style="text-align:center;min-width:200px;font-size:10px">
      <p>${T.regards}</p>
      <p style="font-weight:700">${company.name || 'PT Global Petro Pasifik'}</p>
      <div style="height:60px"></div>
      <p style="border-top:1px solid #999;padding-top:4px">${T.finance}</p>
    </div>
  </div>

  <!-- Footer -->
  ${company.address ? `
  <div style="margin-top:18px;border-top:1px solid #aaa;padding-top:6px;text-align:center;font-size:9px;color:#555">
    <p><b>${T.headOffice} :</b> ${(company.address||'').split('\n').filter(Boolean).join(', ')}</p>
  </div>` : ''}

</div></body></html>`;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.draft;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.color}`}>{m.label}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Invoice({ prefillFromSO = null, onCreated = null }) {
  const { appData, reload, user } = useApp();
  const [invs,      setInvs]     = useState([]);
  const [form,      setForm]     = useState(null);       // null=list, obj=edit/create
  const [saving,    setSaving]   = useState(false);
  const [filterStatus, setFilter]= useState('All');

  const co    = appData?.headOffice || {};
  const banks = appData?.banks || [];
  const sigs  = appData?.signatories || [];
  const clients = appData?.clients || [];

  // ── Load invoices ──────────────────────────────────────────────────────────
  const load = async () => setInvs(await fetchCollection(INVS_REF()));
  useEffect(() => { load(); }, []);

  // ── Pre-fill from SO (when called from SO view) ────────────────────────────
  useEffect(() => {
    if (prefillFromSO) openFromSO(prefillFromSO);
  }, [prefillFromSO]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  const openNew = () => setForm({ ...INIT_FORM() });

  const openFromSO = (so) => {
    const vol = parseFloat(so.volume) || 0;
    const price = parseFloat(so.agreedPrice) || 0;
    setForm({
      ...INIT_FORM(),
      soId:          so.id,
      soNumber:      so.docNumber || '',
      clientId:      so.clientId || '',
      clientName:    so.clientName || '',
      clientAddress: so.clientAddress || '',
      clientNPWP:    so.clientNPWP || '',
      shipTo:        so.deliveryLocation || so.jobsite || '',
      poNo:          so.docNumber || '',
      shipDate:      so.soDate || today(),
      category:      'BBM',
      items: [{
        id: '1',
        description: so.product || 'Biosolar Industri (B40)',
        qty: vol,
        unitPrice: price,
        amount: vol * price,
      }],
    });
  };

  const openEdit = (inv) => setForm({ ...inv });

  // ── Recalculate item amounts when qty/price changes ────────────────────────
  const updateItem = (id, k, v) => {
    setForm(p => {
      const items = p.items.map(it => {
        if (it.id !== id) return it;
        const updated = { ...it, [k]: v };
        const qty = parseFloat(k === 'qty' ? v : updated.qty) || 0;
        const up  = parseFloat(k === 'unitPrice' ? v : updated.unitPrice) || 0;
        return { ...updated, amount: qty * up };
      });
      return { ...p, items };
    });
  };

  const addItem    = () => setForm(p => ({ ...p, items: [...p.items, BLANK_ITEM()] }));
  const removeItem = (id) => setForm(p => ({ ...p, items: p.items.filter(it => it.id !== id) }));

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async (statusOverride) => {
    setSaving(true);
    try {
      const d = new Date(form.invoiceDate || today());
      const data = {
        ...form,
        status: statusOverride || form.status || 'draft',
        createdBy: form.createdBy || user?.email,
        updatedAt: Date.now(),
      };
      if (form.id) {
        await updateSubDoc(INVS_REF(), form.id, data);
      } else {
        await createNumberedDoc('invSeq', INVS_REF(), data,
          (seq) => buildINVNumber(seq, form.category, d.getMonth() + 1, d.getFullYear())
        );
      }
      await load();
      setForm(null);
      if (onCreated) onCreated();
    } finally { setSaving(false); }
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const printInvoice = (inv, lang = 'id') => {
    window._gppGenerateInvoice = (doc, l) => generateInvoiceHtml(doc, co, banks, l);
    const html = generateInvoiceHtml(inv, co, banks, lang);
    const win = window.open('', '_blank', 'width=960,height=800,scrollbars=yes');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() =>
    form ? calcTotals(form.items || [], form.discount, form.applyPPN, form.ppnRate) : null,
    [form?.items, form?.discount, form?.applyPPN, form?.ppnRate]
  );

  const INP = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';
  const LBL = 'block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1';

  // ── List view ──────────────────────────────────────────────────────────────
  if (!form) {
    const filtered = filterStatus === 'All' ? invs
      : invs.filter(x => x.status === filterStatus);

    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto pt-14 md:pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Sales Invoice</h1>
            <p className="text-xs text-gray-400 mt-0.5">{invs.length} invoice(s) total</p>
          </div>
          <button onClick={openNew}
            className="bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-800">
            + New Invoice
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap mb-4">
          {['All', ...Object.keys(STATUS_META)].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                filterStatus === s ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}>
              {s === 'All' ? 'All' : STATUS_META[s].label}
              {s !== 'All' && ` (${invs.filter(x => x.status === s).length})`}
            </button>
          ))}
        </div>

        {/* Invoice list */}
        {filtered.length === 0
          ? <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🧾</p>
              <p className="font-semibold">No invoices yet</p>
              <p className="text-xs mt-1">Create one from a completed Sales Order or use + New Invoice</p>
            </div>
          : (
          <div className="space-y-2">
            {[...filtered].sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0)).map(inv => {
              const { total } = calcTotals(inv.items||[], inv.discount, inv.applyPPN, inv.ppnRate);
              return (
                <div key={inv.id}
                  className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:shadow-sm transition-shadow group">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-mono text-sm font-bold text-blue-700">{inv.invoiceNumber}</p>
                      <p className="font-semibold text-gray-800 text-sm">{inv.clientName || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtDate(inv.invoiceDate)}
                        {inv.soNumber && <span className="ml-2 text-blue-500">SO: {inv.soNumber}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono font-bold text-gray-800">Rp {fmtIDR(total)}</p>
                      <StatusBadge status={inv.status} />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(inv)}
                        className="text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-100">✏️</button>
                      <button onClick={() => printInvoice(inv, 'id')}
                        className="text-xs bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100" title="Print Bahasa Indonesia">
                        🖨️ ID
                      </button>
                      <button onClick={() => printInvoice(inv, 'en')}
                        className="text-xs bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100" title="Print English">
                        🖨️ EN
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Form view ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pt-14 md:pt-6">
      {/* Form header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setForm(null)}
            className="text-gray-400 hover:text-gray-700 text-sm">← Back</button>
          <h2 className="text-xl font-bold text-gray-800">
            {form.id ? `Edit ${form.invoiceNumber}` : 'New Invoice'}
          </h2>
          {form.soNumber && (
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
              Linked to SO: {form.soNumber}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => save('draft')} disabled={saving}
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
            {saving ? '⏳' : '💾'} Save Draft
          </button>
          <button onClick={() => save('issued')} disabled={saving}
            className="bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            📤 Issue Invoice
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Invoice meta */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Invoice Details</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={LBL}>Invoice Date</label>
              <input type="date" value={form.invoiceDate} onChange={e => set('invoiceDate')(e.target.value)} className={INP}/>
            </div>
            <div>
              <label className={LBL}>Category</label>
              <select value={form.category||'BBM'} onChange={e => set('category')(e.target.value)} className={INP}>
                <option value="BBM">BBM (Fuel)</option>
                <option value="GEN">General</option>
                <option value="JAS">Jasa / Service</option>
              </select>
            </div>
            <div>
              <label className={LBL}>Terms</label>
              <select value={form.terms} onChange={e => set('terms')(e.target.value)} className={INP}>
                {['C.O.D','Credit','C.B.D','SKBDN/LC','Downpayment','Lainnya'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={LBL}>Destination</label>
              <input type="text" value={form.destination||''} onChange={e => set('destination')(e.target.value)}
                placeholder="FOB" className={INP}/>
            </div>
            <div>
              <label className={LBL}>Ship Via</label>
              <input type="text" value={form.shipVia||''} onChange={e => set('shipVia')(e.target.value)}
                placeholder="Bunker Service" className={INP}/>
            </div>
            <div>
              <label className={LBL}>Ship Date</label>
              <input type="date" value={form.shipDate||''} onChange={e => set('shipDate')(e.target.value)} className={INP}/>
            </div>
            <div>
              <label className={LBL}>PO No (Client's)</label>
              <input type="text" value={form.poNo||''} onChange={e => set('poNo')(e.target.value)}
                placeholder="009/PO/TBO-BTG/V/2026" className={INP}/>
            </div>
            <div>
              <label className={LBL}>Currency</label>
              <select value={form.currency||'IDR'} onChange={e => set('currency')(e.target.value)} className={INP}>
                <option>IDR</option><option>USD</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bill To / Ship To */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Bill To / Ship To</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Client Name (Bill To)</label>
              <input type="text" value={form.clientName||''} onChange={e => set('clientName')(e.target.value)}
                placeholder="PT Tri Batara Oil" list="client-list" className={INP}/>
              <datalist id="client-list">
                {clients.map(c => <option key={c.id} value={c.name}/>)}
              </datalist>
            </div>
            <div>
              <label className={LBL}>Client NPWP</label>
              <input type="text" value={form.clientNPWP||''} onChange={e => set('clientNPWP')(e.target.value)}
                placeholder="21.282.745.5.724.000" className={INP}/>
            </div>
            <div>
              <label className={LBL}>Client Address (Bill To)</label>
              <textarea value={form.clientAddress||''} onChange={e => set('clientAddress')(e.target.value)}
                rows={3} placeholder={'Jl. Diponegoro No.17\nBontang Selatan\nKalimantan Timur'}
                className={INP + ' resize-none'}/>
            </div>
            <div>
              <label className={LBL}>Ship To (vessel / location)</label>
              <textarea value={form.shipTo||''} onChange={e => set('shipTo')(e.target.value)}
                rows={3} placeholder={'MV. Meratus Project Tangguh\nBontang'} className={INP + ' resize-none'}/>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest">Line Items</h3>
            <button onClick={addItem}
              className="text-xs text-blue-700 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-semibold">
              + Add Item
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 min-w-[200px]">Description</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 w-28">Qty (L)</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 w-32">Unit Price (IDR)</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 w-36">Amount</th>
                  <th className="w-8"/>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {form.items.map(it => (
                  <tr key={it.id}>
                    <td className="px-2 py-2">
                      <input type="text" value={it.description||''} onChange={e => updateItem(it.id,'description',e.target.value)}
                        placeholder="Biosolar Industri (B40)" className={INP + ' text-xs'}/>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={it.qty||''} onChange={e => updateItem(it.id,'qty',e.target.value)}
                        placeholder="70000" className={INP + ' text-right font-mono text-xs'}/>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={it.unitPrice||''} onChange={e => updateItem(it.id,'unitPrice',e.target.value)}
                        placeholder="21300" className={INP + ' text-right font-mono text-xs'}/>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                      {fmtIDR(it.amount)}
                    </td>
                    <td className="px-2 py-2">
                      {form.items.length > 1 && (
                        <button onClick={() => removeItem(it.id)} className="text-red-400 hover:text-red-600">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-4">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sub Total</span>
                <span className="font-mono">Rp {fmtIDR(totals?.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-500">Discount</span>
                <input type="number" value={form.discount||''} onChange={e => set('discount')(e.target.value)}
                  placeholder="0" className="w-32 border border-gray-200 rounded px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-blue-300"/>
              </div>
              <div className="flex items-center justify-between text-sm gap-2">
                <label className="flex items-center gap-2 text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={form.applyPPN} onChange={e => set('applyPPN')(e.target.checked)}
                    className="accent-blue-600"/>
                  PPN (%)
                </label>
                <div className="flex items-center gap-1">
                  <input type="number" value={form.ppnRate||11} onChange={e => set('ppnRate')(e.target.value)}
                    disabled={!form.applyPPN}
                    className="w-14 border border-gray-200 rounded px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50"/>
                  <span className="font-mono">{fmtIDR(totals?.tax)}</span>
                </div>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2">
                <span>Total Invoice</span>
                <span className="font-mono text-blue-800">Rp {fmtIDR(totals?.total)}</span>
              </div>
              <div className="text-[10px] text-gray-400 italic">
                {terbilang(totals?.total || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Bank + Notes */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">Payment & Notes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Bank Account (for print)</label>
              <select value={form.bankId||''} onChange={e => set('bankId')(e.target.value)} className={INP}>
                <option value="">— Use primary bank —</option>
                {banks.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} — {b.accountNo} {b.isPrimary ? '(Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LBL}>Status</label>
              <select value={form.status||'draft'} onChange={e => set('status')(e.target.value)} className={INP}>
                {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={LBL}>Notes / Description</label>
              <textarea value={form.notes||''} onChange={e => set('notes')(e.target.value)}
                rows={2} placeholder="Optional notes to appear on the invoice" className={INP + ' resize-none'}/>
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="flex gap-3 justify-end pb-6">
          <button onClick={() => setForm(null)} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-xl text-sm hover:bg-gray-50">
            Cancel
          </button>
          {form.id && (
            <>
              <button onClick={() => printInvoice(form, 'id')}
                className="border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
                🖨️ ID
              </button>
              <button onClick={() => printInvoice(form, 'en')}
                className="border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
                🖨️ EN
              </button>
            </>
          )}
          <button onClick={() => save('draft')} disabled={saving}
            className="border border-blue-200 text-blue-700 bg-blue-50 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-100 disabled:opacity-50">
            {saving ? '⏳' : '💾'} Save Draft
          </button>
          <button onClick={() => save('issued')} disabled={saving}
            className="bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            📤 Issue Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
