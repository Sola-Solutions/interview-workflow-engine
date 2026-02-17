import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Invoice data ---

interface Invoice {
  id: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  customerName: string;
  contactEmail: string;
}

const INVOICES: Invoice[] = [
  { id: "INV-1001", amount: 12450.00,  dueDate: "2024-12-01", daysOverdue: 75,  customerName: "Acme Corp.",         contactEmail: "billing@acmecorp.com" },
  { id: "INV-1002", amount: 3200.00,   dueDate: "2025-01-05", daysOverdue: 40,  customerName: "Globex Industries",  contactEmail: "accounts@globex.com" },
  { id: "INV-1003", amount: 850.00,    dueDate: "2025-01-10", daysOverdue: 35,  customerName: "Initech LLC",        contactEmail: "payables@initech.com" },
  { id: "INV-1004", amount: 24000.00,  dueDate: "2024-11-15", daysOverdue: 91,  customerName: "Umbrella Corp",      contactEmail: "finance@umbrellacorp.com" },
  { id: "INV-1005", amount: 7800.00,   dueDate: "2025-01-20", daysOverdue: 25,  customerName: "Stark Industries",   contactEmail: "accounting@stark.com" },
  { id: "INV-1006", amount: 450.00,    dueDate: "2025-01-25", daysOverdue: 20,  customerName: "Wayne Enterprises",  contactEmail: "ap@wayneenterprises.com" },
  { id: "INV-1007", amount: 18900.50,  dueDate: "2024-10-30", daysOverdue: 107, customerName: "Cyberdyne Systems",  contactEmail: "billing@cyberdyne.com" },
  { id: "INV-1008", amount: 2100.00,   dueDate: "2025-01-15", daysOverdue: 30,  customerName: "Wonka Industries",   contactEmail: "payments@wonka.com" },
  { id: "INV-1009", amount: 6300.00,   dueDate: "2024-12-20", daysOverdue: 56,  customerName: "Oscorp",             contactEmail: "receivables@oscorp.com" },
  { id: "INV-1010", amount: 950.00,    dueDate: "2025-02-01", daysOverdue: 13,  customerName: "Hooli Inc.",         contactEmail: "finance@hooli.com" },
  { id: "INV-1011", amount: 31200.00,  dueDate: "2024-11-01", daysOverdue: 105, customerName: "Massive Dynamic",    contactEmail: "billing@massivedynamic.com" },
  { id: "INV-1012", amount: 1475.50,   dueDate: "2025-01-28", daysOverdue: 17,  customerName: "Prestige Worldwide", contactEmail: "accounts@prestigeww.com" },
];

// --- Shared styles ---

const STYLES = `
  body { font-family: Arial, sans-serif; margin: 20px; }
  h1 { color: #333; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background-color: #f5f5f5; }
  tr:nth-child(even) { background-color: #fafafa; }
  a { color: #1a73e8; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .overdue-high { color: #d32f2f; }
  .overdue-med { color: #f57c00; }
  dl { max-width: 500px; }
  dt { font-weight: bold; color: #555; margin-top: 12px; }
  dd { margin: 4px 0 0 0; }
  .login-box { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 320px; }
  .login-page { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
  label { display: block; margin-bottom: 4px; font-size: 14px; color: #555; }
  input { width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
  button { padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
  button:hover { background: #1557b0; }
`;

function overdueClass(days: number): string {
  if (days > 60) return 'overdue-high';
  if (days > 20) return 'overdue-med';
  return '';
}

// --- Routes ---

// Login page
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>InvoiceHub - Login</title><style>${STYLES}</style></head>
<body class="login-page">
  <div class="login-box">
    <h1>InvoiceHub</h1>
    <form action="/invoices" method="post">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`);
});

// Login redirects here; also accessible directly
app.get('/login', (_req, res) => res.redirect('/'));

// Login form POST — just redirect to invoices list
app.post('/invoices', (_req, res) => res.redirect('/invoices'));

// Invoices list
app.get('/invoices', (_req, res) => {
  const rows = INVOICES.map((inv) => `
      <tr>
        <td><a href="/invoices/${inv.id}">${inv.id}</a></td>
        <td>${inv.amount.toFixed(2)}</td>
        <td>${inv.dueDate}</td>
        <td class="${overdueClass(inv.daysOverdue)}">${inv.daysOverdue}</td>
      </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>InvoiceHub - Overdue Invoices</title><style>${STYLES}</style></head>
<body>
  <h1>Overdue Invoices</h1>
  <p>Showing all invoices with status: <strong>Overdue</strong></p>
  <table>
    <thead>
      <tr><th>Invoice #</th><th>Amount</th><th>Due Date</th><th>Days Overdue</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
</body>
</html>`);
});

// Invoice detail
app.get('/invoices/:id', (req, res) => {
  const invoice = INVOICES.find((inv) => inv.id === req.params.id);
  if (!invoice) { res.status(404).send('Invoice not found'); return; }

  const statusColor = invoice.daysOverdue > 60 ? '#d32f2f' : '#f57c00';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>InvoiceHub - ${invoice.id}</title>
<style>
  ${STYLES}
  .invoice-card { max-width: 700px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
  .invoice-header { background: #1a73e8; color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
  .invoice-header h1 { margin: 0; color: white; font-size: 22px; }
  .invoice-body { padding: 32px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: bold; color: white; }
  .invoice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .field label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
  .field .value { font-size: 16px; color: #333; }
  .amount-section { border-top: 2px solid #eee; padding-top: 24px; text-align: right; }
  .amount-section .label { font-size: 14px; color: #888; }
  .amount-section .amount { font-size: 32px; font-weight: bold; color: #333; }
  .back-link { display: inline-block; margin-bottom: 20px; }
</style>
</head>
<body>
  <div style="max-width: 700px; margin: 0 auto;">
    <a href="/invoices" class="back-link">← Back to invoices</a>
    <div class="invoice-card">
      <div class="invoice-header">
        <h1>${invoice.id}</h1>
        <span class="status-badge" style="background: ${statusColor}">${invoice.daysOverdue} days overdue</span>
      </div>
      <div class="invoice-body">
        <div class="invoice-grid">
          <div class="field">
            <label>Customer</label>
            <div class="value customer-name">${invoice.customerName}</div>
          </div>
          <div class="field">
            <label>Contact Email</label>
            <div class="value customer-email">${invoice.contactEmail}</div>
          </div>
          <div class="field">
            <label>Invoice Number</label>
            <div class="value invoice-number">${invoice.id}</div>
          </div>
          <div class="field">
            <label>Due Date</label>
            <div class="value due-date">${invoice.dueDate}</div>
          </div>
        </div>
        <div class="amount-section">
          <div class="label">Amount Due</div>
          <div class="amount invoice-amount">$${invoice.amount.toFixed(2)}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`InvoiceHub running at http://localhost:${PORT}`);
});
