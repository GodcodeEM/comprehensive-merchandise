// invoice.js — generates HTML invoices for orders (no external deps)
// Invoices are saved as HTML files and can be opened/printed as PDF from browser.

const fs = require('fs');
const path = require('path');

const INVOICE_DIR = path.join(__dirname, '..', 'data', 'invoices');

function ensureDir() {
  if (!fs.existsSync(INVOICE_DIR)) fs.mkdirSync(INVOICE_DIR, { recursive: true });
}

function generateInvoiceHTML(order) {
  const date = new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const itemRows = order.items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td style="text-align:center;">${i.quantity}</td>
      <td style="text-align:right;">$${Number(i.price).toFixed(2)}</td>
      <td style="text-align:right;">$${(i.price * i.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const paymentInfo = order.payment ? `
    <div class="info-block">
      <div class="label">Payment Method</div>
      <div>${order.payment.method || 'N/A'}</div>
      ${order.payment.reference ? `<div style="font-family:monospace;font-size:0.8rem;color:#666;">Ref: ${order.payment.reference}</div>` : ''}
      <div class="paid-stamp">PAID</div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice ${order.invoiceNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #23262B; background: #fff; padding: 40px 20px; max-width: 760px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #23262B; padding-bottom: 20px; margin-bottom: 28px; }
  .brand { font-size: 1.6rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
  .brand span { color: #C1432D; }
  .invoice-meta { text-align: right; }
  .invoice-num { font-size: 1.1rem; font-weight: 700; font-family: monospace; }
  .label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 3px; margin-top: 10px; }
  .info-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 28px; }
  .info-block { background: #f9f7f3; border: 1px solid #e0d8cc; padding: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #23262B; color: #fff; padding: 10px 12px; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }
  td { padding: 10px 12px; border-bottom: 1px solid #e8e0d1; font-size: 0.9rem; }
  tr:nth-child(even) td { background: #faf7f0; }
  .totals { margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e8e0d1; font-size: 0.9rem; }
  .total-row.grand { font-weight: 700; font-size: 1.1rem; border-top: 2px solid #23262B; border-bottom: none; padding-top: 10px; margin-top: 4px; }
  .paid-stamp { display: inline-block; border: 3px solid #4F7A4A; color: #4F7A4A; font-weight: 800; font-size: 1.2rem; letter-spacing: 0.15em; padding: 4px 12px; transform: rotate(-5deg); margin-top: 10px; text-transform: uppercase; }
  .tracking-box { background: #f0f4f8; border: 1px solid #c8d8e8; padding: 14px; margin-top: 28px; }
  .tracking-box .num { font-family: monospace; font-size: 1.1rem; font-weight: 700; color: #3D5A6C; }
  .footer { margin-top: 40px; border-top: 1px solid #e8e0d1; padding-top: 16px; font-size: 0.75rem; color: #888; text-align: center; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Comprehensive<span>•</span>Merchandise</div>
      <div style="font-size:0.8rem;color:#888;margin-top:4px;">All tracking data is simulated</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-num">INVOICE #${order.invoiceNumber}</div>
      <div class="label">Date</div>
      <div>${date}</div>
    </div>
  </div>

  <div class="info-row">
    <div class="info-block">
      <div class="label">Bill To</div>
      <div style="font-weight:600;">${order.userName}</div>
      ${order.shippingAddress ? `<div style="margin-top:6px;font-size:0.85rem;">${order.shippingAddress.replace(/\n/g, '<br>')}</div>` : ''}
    </div>
    <div class="info-block">
      <div class="label">Order ID</div>
      <div style="font-family:monospace;font-size:0.85rem;">${order.id}</div>
      <div class="label">Order Date</div>
      <div>${date}</div>
      <div class="label">Status</div>
      <div>${order.tracking ? order.tracking.status : order.status}</div>
    </div>
    ${paymentInfo || `<div class="info-block"><div class="label">Payment</div><div style="color:#888;">Pending</div></div>`}
  </div>

  <table>
    <thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Subtotal</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>$${Number(order.total).toFixed(2)}</span></div>
    <div class="total-row"><span>Shipping</span><span>Free</span></div>
    <div class="total-row grand"><span>Total</span><span>$${Number(order.total).toFixed(2)}</span></div>
  </div>

  ${order.tracking ? `
  <div class="tracking-box">
    <div class="label">Tracking Number</div>
    <div class="num">${order.tracking.number}</div>
    <div style="font-size:0.8rem;color:#666;margin-top:4px;">Track your order at <strong>http://localhost:3000/#/orders/${order.id}</strong></div>
  </div>` : ''}

  <div style="margin-top:20px;" class="no-print">
    <button onclick="window.print()" style="background:#23262B;color:#fff;border:none;padding:10px 20px;font-size:0.85rem;cursor:pointer;text-transform:uppercase;letter-spacing:0.08em;">Print / Save as PDF</button>
  </div>

  <div class="footer">
    Thank you for your order! &nbsp;·&nbsp; Comprehensive Merchandise &nbsp;·&nbsp; support@comprehensivemerchandise.com
  </div>
</body>
</html>`;
}

function createInvoice(order) {
  ensureDir();
  const html = generateInvoiceHTML(order);
  const filename = `invoice-${order.invoiceNumber}.html`;
  fs.writeFileSync(path.join(INVOICE_DIR, filename), html);
  return filename;
}

function getInvoicePath(invoiceNumber) {
  return path.join(INVOICE_DIR, `invoice-${invoiceNumber}.html`);
}

module.exports = { createInvoice, getInvoicePath };
