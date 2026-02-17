import http from 'http';
import { Session } from './util/session';
import {
  resolveTemplate,
  determineNextNode,
  executeWebNode,
  executeConditionalNode,
  executeSendEmailNode,
  executeOutputNode,
} from './activities';
import { evaluateBranch } from './util/llm';
import type { WorkflowEdge } from './types';

// --- Test server fixture ---

let server: http.Server;
let baseUrl: string;

const FIXTURE_HTML = `
<html><body>
  <h1>Test Page</h1>
  <table><tbody>
    <tr>
      <td class="invoice">INV-001</td>
      <td class="customer">Acme Corp.</td>
      <td class="email">billing@acmecorp.com</td>
      <td class="amount">12450.00</td>
      <td class="overdue">75</td>
    </tr>
    <tr>
      <td class="invoice">INV-002</td>
      <td class="customer">Globex Inc.</td>
      <td class="email">ap@globex.com</td>
      <td class="amount">3200.00</td>
      <td class="overdue">30</td>
    </tr>
    <tr>
      <td class="invoice">INV-003</td>
      <td class="customer">Initech LLC</td>
      <td class="email">billing@initech.com</td>
      <td class="amount">8750.00</td>
      <td class="overdue">90</td>
    </tr>
  </tbody></table>
  <a href="/other" id="link1">Go somewhere</a>
</body></html>
`;

const OTHER_HTML = `<html><body><h1>Other Page</h1></body></html>`;

beforeAll((done) => {
  server = http.createServer((req, res) => {
    if (req.url === '/other') {
      res.end(OTHER_HTML);
    } else {
      res.end(FIXTURE_HTML);
    }
  });
  server.listen(0, () => {
    baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

// --- Session tests ---

describe('Session', () => {
  it('navigates to a URL and scrapes text with XPath', async () => {
    const session = new Session();
    await session.navigate(baseUrl);
    expect(session.scrape('//h1')).toBe('Test Page');
  });

  it('scrapes table cell text with XPath', async () => {
    const session = new Session();
    await session.navigate(baseUrl);
    expect(session.scrape('//tbody/tr[1]/td[@class="invoice"]')).toBe('INV-001');
    expect(session.scrape('//tbody/tr[2]/td[@class="customer"]')).toBe('Globex Inc.');
  });

  it('clicks a link by extracting href and navigating', async () => {
    const session = new Session();
    await session.navigate(baseUrl);
    await session.click('//a[@id="link1"]');
    expect(session.scrape('//h1')).toBe('Other Page');
  });

  it('throws on scrape before navigate', () => {
    const session = new Session();
    expect(() => session.scrape('//h1')).toThrow('No page loaded');
  });

  it('scrapeAll returns all matching elements', async () => {
    const session = new Session();
    await session.navigate(baseUrl);
    const invoices = session.scrapeAll('//tbody/tr/td[@class="invoice"]');
    expect(invoices).toEqual(['INV-001', 'INV-002', 'INV-003']);
  });

  it('scrapeAll returns empty array when no matches', async () => {
    const session = new Session();
    await session.navigate(baseUrl);
    const result = session.scrapeAll('//tbody/tr/td[@class="nonexistent"]');
    expect(result).toEqual([]);
  });
});

// --- resolveTemplate tests ---

describe('resolveTemplate', () => {
  it('replaces {{variable}} placeholders', () => {
    expect(resolveTemplate('http://{{host}}:{{port}}/invoices', { host: 'localhost', port: '3000' }))
      .toBe('http://localhost:3000/invoices');
  });

  it('resolves unknown variables to empty string', () => {
    expect(resolveTemplate('hello {{unknown}}', {})).toBe('hello ');
  });

  it('resolves arrays by joining with comma', () => {
    expect(resolveTemplate('values: {{items}}', { items: ['a', 'b', 'c'] })).toBe('values: a,b,c');
  });

  it('resolves numbers to string', () => {
    expect(resolveTemplate('count: {{n}}', { n: 42 })).toBe('count: 42');
  });
});

// --- determineNextNode tests ---

describe('determineNextNode', () => {
  const edges: WorkflowEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c', branchHandle: 'yes' },
    { id: 'e3', source: 'b', target: 'd', branchHandle: 'no' },
  ];

  it('follows unconditional edge', () => {
    expect(determineNextNode(edges, 'a')).toBe('b');
  });

  it('follows branch edge', () => {
    expect(determineNextNode(edges, 'b', 'yes')).toBe('c');
    expect(determineNextNode(edges, 'b', 'no')).toBe('d');
  });

  it('returns null when no edge exists', () => {
    expect(determineNextNode(edges, 'c')).toBeNull();
  });
});

// --- LLM mock tests ---

describe('evaluateBranch', () => {
  it('returns yes for critical invoices (>$5k)', () => {
    const result = evaluateBranch('Is this critical?', { invoiceAmount: '12450.00', daysOverdue: '40' });
    expect(result.branchHandle).toBe('yes');
  });

  it('returns yes for very overdue invoices (>60 days)', () => {
    const result = evaluateBranch('Is this critical?', { invoiceAmount: '850.00', daysOverdue: '75' });
    expect(result.branchHandle).toBe('yes');
  });

  it('returns no for non-critical invoices', () => {
    const result = evaluateBranch('Is this critical?', { invoiceAmount: '3200.00', daysOverdue: '40' });
    expect(result.branchHandle).toBe('no');
  });
});

describe('executeConditionalNode', () => {
  const edges: WorkflowEdge[] = [
    { id: 'e1', source: 'n1', target: 'yes-node', branchHandle: 'yes' },
    { id: 'e2', source: 'n1', target: 'no-node', branchHandle: 'no' },
  ];

  it('returns yes branch for critical invoices (>$5k)', async () => {
    const result = await executeConditionalNode(
      { prompt: 'Is this critical? Amount is ${{invoiceAmount}}, {{daysOverdue}} days overdue.' },
      { invoiceAmount: '12450.00', daysOverdue: '40' },
      edges,
      'n1'
    );
    expect(result.nextNodeId).toBe('yes-node');
  });

  it('returns yes branch for very overdue invoices (>60 days)', async () => {
    const result = await executeConditionalNode(
      { prompt: 'Is this critical? Amount is ${{invoiceAmount}}, {{daysOverdue}} days overdue.' },
      { invoiceAmount: '850.00', daysOverdue: '75' },
      edges,
      'n1'
    );
    expect(result.nextNodeId).toBe('yes-node');
  });

  it('returns no branch for non-critical invoices', async () => {
    const result = await executeConditionalNode(
      { prompt: 'Is this critical? Amount is ${{invoiceAmount}}, {{daysOverdue}} days overdue.' },
      { invoiceAmount: '3200.00', daysOverdue: '40' },
      edges,
      'n1'
    );
    expect(result.nextNodeId).toBe('no-node');
  });
});

// --- Node executor tests ---

describe('executeImageNode', () => {
  it('navigates and scrapes variables, returns full state', async () => {
    const edges: WorkflowEdge[] = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const result = await executeWebNode(
      [
        { id: 'a1', type: 'Open', url: '{{baseUrl}}' },
        { id: 'a2', type: 'Scrape', xpath: '//td[@class="invoice"]', variable: 'invoiceNumber' },
        { id: 'a3', type: 'Scrape', xpath: '//td[@class="email"]', variable: 'contactEmail' },
        { id: 'a4', type: 'Scrape', xpath: '//td[@class="amount"]', variable: 'invoiceAmount' },
      ],
      { baseUrl },
      edges,
      'n1'
    );
    expect(result.variables.invoiceNumber).toBe('INV-001');
    expect(result.variables.contactEmail).toBe('billing@acmecorp.com');
    expect(result.variables.invoiceAmount).toBe('12450.00');
    expect(result.variables.baseUrl).toBe(baseUrl);
    expect(result.nextNodeId).toBe('n2');
  });

  it('handles ScrapeAll action, stores string array', async () => {
    const edges: WorkflowEdge[] = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const result = await executeWebNode(
      [
        { id: 'a1', type: 'Open', url: '{{baseUrl}}' },
        { id: 'a2', type: 'ScrapeAll', xpath: '//tbody/tr/td[@class="invoice"]', variable: 'invoiceNumbers' },
        { id: 'a3', type: 'ScrapeAll', xpath: '//tbody/tr/td[@class="amount"]', variable: 'amounts' },
      ],
      { baseUrl },
      edges,
      'n1'
    );
    expect(result.variables.invoiceNumbers).toEqual(['INV-001', 'INV-002', 'INV-003']);
    expect(result.variables.amounts).toEqual(['12450.00', '3200.00', '8750.00']);
    expect(result.nextNodeId).toBe('n2');
  });
});

describe('executeSendEmailNode', () => {
  it('resolves email templates and logs email', async () => {
    const edges: WorkflowEdge[] = [];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await executeSendEmailNode(
      {
        to: '{{contactEmail}}',
        subject: 'Invoice {{invoiceNumber}}',
        body: 'Dear {{customerName}}, please pay ${{invoiceAmount}}'
      },
      { invoiceNumber: 'INV-001', customerName: 'Acme Corp.', invoiceAmount: '12450.00', contactEmail: 'billing@acmecorp.com' },
      edges,
      'n1'
    );

    expect(consoleSpy).toHaveBeenCalledWith('[EMAIL] To: billing@acmecorp.com, Subject: Invoice INV-001, Body: Dear Acme Corp., please pay $12450.00');
    expect(result.nextNodeId).toBeNull();
    expect(result.variables).toEqual({ invoiceNumber: 'INV-001', customerName: 'Acme Corp.', invoiceAmount: '12450.00', contactEmail: 'billing@acmecorp.com' });

    consoleSpy.mockRestore();
  });

  it('handles missing variables in template', async () => {
    const edges: WorkflowEdge[] = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await executeSendEmailNode(
      { to: '{{existing}}', subject: 'Test', body: '{{missing}}' },
      { existing: 'test@example.com' },
      edges,
      'n1'
    );

    expect(consoleSpy).toHaveBeenCalledWith('[EMAIL] To: test@example.com, Subject: Test, Body: ');
    expect(result.nextNodeId).toBe('n2');

    consoleSpy.mockRestore();
  });
});

describe('executeOutputNode', () => {
  it('builds CSV string with scalar variables and stores it', async () => {
    const edges: WorkflowEdge[] = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await executeOutputNode(
      {
        format: 'csv',
        columns: ['Invoice Number', 'Customer', 'Amount'],
        rowVariables: ['invoiceNumber', 'customerName', 'invoiceAmount'],
        output: 'csvOutput',
      },
      { invoiceNumber: 'INV-001', customerName: 'Acme Corp.', invoiceAmount: '12450.00' },
      edges,
      'n1'
    );

    const expectedCsv = 'Invoice Number,Customer,Amount\nINV-001,Acme Corp.,12450.00';
    expect(result.variables.csvOutput).toBe(expectedCsv);
    expect(consoleSpy).toHaveBeenCalledWith(`[OUTPUT] ${expectedCsv}`);
    expect(result.nextNodeId).toBe('n2');
    // Original variables are preserved
    expect(result.variables.invoiceNumber).toBe('INV-001');
    expect(result.variables.customerName).toBe('Acme Corp.');
    expect(result.variables.invoiceAmount).toBe('12450.00');

    consoleSpy.mockRestore();
  });

  it('builds multi-row CSV when variables are arrays', async () => {
    const edges: WorkflowEdge[] = [];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await executeOutputNode(
      {
        format: 'csv',
        columns: ['Invoice Number', 'Amount', 'Days Overdue'],
        rowVariables: ['invoiceNumbers', 'amounts', 'daysOverdues'],
        output: 'csvOutput',
      },
      {
        invoiceNumbers: ['INV-001', 'INV-002', 'INV-003'],
        amounts: ['12450.00', '3200.00', '8750.00'],
        daysOverdues: ['75', '30', '90'],
      },
      edges,
      'n1'
    );

    const expectedCsv = [
      'Invoice Number,Amount,Days Overdue',
      'INV-001,12450.00,75',
      'INV-002,3200.00,30',
      'INV-003,8750.00,90',
    ].join('\n');
    expect(result.variables.csvOutput).toBe(expectedCsv);
    expect(consoleSpy).toHaveBeenCalledWith(`[OUTPUT] ${expectedCsv}`);
    expect(result.nextNodeId).toBeNull();

    consoleSpy.mockRestore();
  });

  it('shows scalar variables only in the first row when mixed with arrays', async () => {
    const edges: WorkflowEdge[] = [];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await executeOutputNode(
      {
        format: 'csv',
        columns: ['Name', 'Score', 'Class'],
        rowVariables: ['names', 'scores', 'className'],
        output: 'report',
      },
      {
        names: ['Alice', 'Bob'],
        scores: ['95', '87'],
        className: 'Math 101',
      },
      edges,
      'n1'
    );

    const expectedCsv = 'Name,Score,Class\nAlice,95,Math 101\nBob,87,';
    expect(result.variables.report).toBe(expectedCsv);

    consoleSpy.mockRestore();
  });

  it('returns null nextNodeId when no outgoing edge exists', async () => {
    const edges: WorkflowEdge[] = [];
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const result = await executeOutputNode(
      {
        format: 'csv',
        columns: ['Name', 'Score'],
        rowVariables: ['name', 'score'],
        output: 'report',
      },
      { name: 'Alice', score: '95' },
      edges,
      'n1'
    );

    expect(result.variables.report).toBe('Name,Score\nAlice,95');
    expect(result.nextNodeId).toBeNull();

    consoleSpy.mockRestore();
  });
});
