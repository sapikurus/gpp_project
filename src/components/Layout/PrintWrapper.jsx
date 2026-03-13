export default function PrintWrapper({ onClose, children }) {
  return (
    <div className="fixed inset-0 bg-white z-50 overflow-auto">
      {/* Toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 bg-gray-100 border-b px-6 py-3 shadow-sm">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          🖨️ Print / Save PDF
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          ✕ Tutup
        </button>
        <span className="text-gray-400 text-xs ml-2">
          Gunakan browser print dialog · Set margin: Minimal · Paper: A4
        </span>
      </div>

      {/* A4 document area */}
      <div className="mx-auto py-8 px-4" style={{ maxWidth: '210mm' }}>
        {children}
      </div>
    </div>
  );
}
