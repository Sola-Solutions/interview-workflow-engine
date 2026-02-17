import { JSDOM } from 'jsdom';

// --- Session ---
// In production, a Session would wrap a Selenium browser instance. Here we use HTTP + jsdom
// for the same functionality without a real browser.

export class Session {
  private dom: JSDOM | null = null;
  private baseUrl: string | null = null;

  /**
   * Navigate to the given URL, fetching the page HTML and loading it into a
   * JSDOM instance for subsequent scraping and interaction.
   */
  async navigate(url: string): Promise<void> {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const html = await response.text();
    this.dom = new JSDOM(html, { url });
    this.baseUrl = new URL(url).origin;
  }

  /**
   * Scrape the text content of the first element matching the given XPath
   * expression. Returns an empty string if no match is found.
   */
  scrape(xpath: string): string {
    const doc = this.getDocument();
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      9, // XPathResult.FIRST_ORDERED_NODE_TYPE
      null
    );
    const node = result.singleNodeValue;
    return node?.textContent?.trim() ?? '';
  }

  /**
   * Scrape the text content of all elements matching the given XPath
   * expression. Returns an array of trimmed strings.
   */
  scrapeAll(xpath: string): string[] {
    const doc = this.getDocument();
    const result = doc.evaluate(
      xpath,
      doc,
      null,
      5, // XPathResult.ORDERED_NODE_ITERATOR_TYPE
      null
    );
    const values: string[] = [];
    let node = result.iterateNext();
    while (node) {
      values.push(node.textContent?.trim() ?? '');
      node = result.iterateNext();
    }
    return values;
  }

  /**
   * Simulate clicking the element matching the given XPath. If the element is
   * a link, follows the href. If it's a submit button inside a form, navigates
   * to the form's action URL. Throws if the target cannot be clicked.
   */
  async click(xpath: string): Promise<void> {
    const doc = this.getDocument();
    const result = doc.evaluate(xpath, doc, null, 9, null);
    const node = result.singleNodeValue as Element | null;
    if (!node) throw new Error(`No element found for xpath: ${xpath}`);

    // If clicking a link, follow the href
    const href = node.getAttribute('href');
    if (href) {
      const url = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
      await this.navigate(url);
      return;
    }

    // If clicking a submit button, navigate to the form's action URL
    const form = node.closest('form');
    if (form) {
      const action = form.getAttribute('action') ?? '/';
      const url = action.startsWith('http') ? action : `${this.baseUrl}${action}`;
      await this.navigate(url);
      return;
    }

    throw new Error(`Click target has no href and is not in a form: ${xpath}`);
  }

  /** Return the current JSDOM document, throwing if no page has been loaded. */
  private getDocument(): Document {
    if (!this.dom) throw new Error('No page loaded — call navigate() first');
    return this.dom.window.document;
  }
}
