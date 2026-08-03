import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const today = () => new Date().toISOString().split('T')[0];

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ── PDF ───────────────────────────────────────────────────────────────────────
export const exportPDF = (rows, reportLabel, reportKey) => {
  const headers = Object.keys(rows[0]);
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });

  doc.setFontSize(15);
  doc.setTextColor(30, 58, 95);
  doc.text(`Skillzza — ${reportLabel}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}  |  ${rows.length} records`, 14, 22);

  autoTable(doc, {
    startY: 27,
    head: [headers],
    body: rows.map(r => headers.map(h => r[h] ?? '—')),
    styles:     { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${reportKey}_report_${today()}.pdf`);
};

// ── Excel ─────────────────────────────────────────────────────────────────────
export const exportExcel = (rows, reportLabel, reportKey) => {
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-size columns based on content
  const headers = Object.keys(rows[0]);
  ws['!cols'] = headers.map(h => ({
    wch: Math.min(40, Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)) + 2),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportLabel.slice(0, 31));
  XLSX.writeFile(wb, `${reportKey}_report_${today()}.xlsx`);
};

// ── CSV ───────────────────────────────────────────────────────────────────────
export const exportCSV = (rows, reportLabel, reportKey) => {
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const str = String(v ?? '');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `${reportKey}_report_${today()}.csv`);
};

// ── Word ──────────────────────────────────────────────────────────────────────
export const exportWord = (rows, reportLabel, reportKey) => {
  const headers = Object.keys(rows[0]);
  const esc = (v) => String(v ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="utf-8"><title>${esc(reportLabel)}</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; }
      h1 { color: #1e3a5f; font-size: 16pt; margin-bottom: 2pt; }
      .meta { color: #64748b; font-size: 9pt; margin-bottom: 12pt; }
      table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
      th { background: #1e3a5f; color: #fff; padding: 5px 7px; text-align: left; border: 1px solid #cbd5e1; }
      td { padding: 4px 7px; border: 1px solid #cbd5e1; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style></head>
    <body>
      <h1>Skillzza — ${esc(reportLabel)}</h1>
      <div class="meta">Generated: ${new Date().toLocaleString('en-IN')} &nbsp;|&nbsp; ${rows.length} records</div>
      <table>
        <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </body></html>`;

  downloadBlob(new Blob(['﻿', html], { type: 'application/msword' }), `${reportKey}_report_${today()}.doc`);
};
