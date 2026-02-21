import type { WorkflowDefinition } from './types';

/**
 * Invoice Export Workflow
 *
 * Logs into InvoiceHub, scrapes ALL overdue invoices from the list page,
 * then scrapes detail and checks criticality for the first invoice,
 * sends email if critical, and outputs a CSV of all invoices.
 *
 * Graph:
 *   [login] → [scrape-list] → [scrape-detail] → [check-critical] → (yes) → [send-email] → [output-csv]
 *                                                                  → (no)  → [output-csv]
 */
export const INVOICE_EXPORT_WORKFLOW: WorkflowDefinition = {
  variables: {
    invoicehubUrl: "http://localhost:3000",
    username: "admin",
    password: "admin123",
  },
  nodes: [
    {
      id: "login",
      type: "web",
      data: {
        actions: [
          { id: "a1", type: "Open", url: "{{invoicehubUrl}}/" },
          { id: "a2", type: "Input", xpath: "//input[@name='username']", value: "{{username}}" },
          { id: "a3", type: "Input", xpath: "//input[@name='password']", value: "{{password}}" },
          { id: "a4", type: "Click", xpath: "//button[@type='submit']" },
        ],
      },
    },
    {
      id: "scrape-list",
      type: "web",
      data: {
        actions: [
          { id: "a5", type: "Open", url: "{{invoicehubUrl}}/invoices?status=overdue" },
          { id: "a6", type: "ScrapeAll", xpath: "//tbody/tr/td[1]", variable: "invoiceNumbers" },
          { id: "a7", type: "ScrapeAll", xpath: "//tbody/tr/td[2]", variable: "invoiceAmounts" },
          { id: "a8", type: "ScrapeAll", xpath: "//tbody/tr/td[4]", variable: "daysOverdues" },
        ],
      },
    },
    {
      id: "scrape-detail",
      type: "web",
      data: {
        actions: [
          { id: "a9", type: "Open", url: "{{invoicehubUrl}}/invoices?status=overdue" },
          { id: "a10", type: "Scrape", xpath: "//tbody/tr[1]/td[2]", variable: "invoiceAmount" },
          { id: "a11", type: "Scrape", xpath: "//tbody/tr[1]/td[4]", variable: "daysOverdue" },
          { id: "a12", type: "Click", xpath: "//tbody/tr[1]/td[1]/a" },
          { id: "a13", type: "Scrape", xpath: "//div[contains(@class,'customer-name')]", variable: "customerName" },
          { id: "a14", type: "Scrape", xpath: "//div[contains(@class,'customer-email')]", variable: "contactEmail" },
        ],
      },
    },
    {
      id: "check-critical",
      type: "conditional",
      data: {
        prompt: "Is this invoice critical enough to escalate? The invoice amount is {{invoiceAmount}} and it is {{daysOverdue}} days overdue. Consider it critical if the amount exceeds $5,000 or it is more than 60 days overdue.",
        outputVariable: "notified",
      },
    },
    {
      id: "send-email",
      type: "sendEmail",
      data: {
        to: "{{contactEmail}}",
        subject: "Overdue Invoice",
        body: "Dear {{customerName}}, your invoice for {{invoiceAmount}} is {{daysOverdue}}. Please remit payment immediately.",
      },
    },
    {
      id: "output-csv",
      type: "output",
      data: {
        format: "csv",
        columns: ["Invoice Number", "Amount", "Days Overdue"],
        rowVariables: ["invoiceNumbers", "invoiceAmounts", "daysOverdues"],
        output: "output",
      },
    },
  ],
  edges: [
    { id: "e1", source: "login", target: "scrape-list" },
    { id: "e2", source: "scrape-list", target: "scrape-detail" },
    { id: "e3", source: "scrape-detail", target: "check-critical" },
    { id: "e4", source: "check-critical", target: "send-email", branchHandle: "yes" },
    { id: "e5", source: "check-critical", target: "output-csv", branchHandle: "no" },
    { id: "e6", source: "send-email", target: "output-csv" },
  ],
};
