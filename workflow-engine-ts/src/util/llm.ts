import type { VariableValue } from '../types';

// --- LLM Service ---
// In production, these functions call real LLM APIs (e.g., Claude or GPT).
// Here they're deterministic mocks that simulate the same interface.

/**
 * Evaluate a conditional branch using LLM reasoning.
 * In production, this sends the prompt and variables to an LLM which decides
 * which branch to take based on natural language instructions.
 */
export function evaluateBranch(
  prompt: string,
  variables: Record<string, VariableValue>
): { branchHandle: string } {
  if (prompt.includes('critical')) {
    const invoiceAmount = parseFloat(String(variables.invoiceAmount || '0'));
    const daysOverdue = parseInt(String(variables.daysOverdue || '0'), 10);

    const branchHandle = (invoiceAmount > 5000 || daysOverdue > 60) ? "yes" : "no";
    return { branchHandle };
  } else {
    throw new Error(`Unsupported prompt: ${prompt}`);
  }
}

/**
 * Generate an XPath selector from a natural language description and page HTML.
 * In production, this powers self-healing XPath: when a selector breaks due to
 * a page layout change, the LLM generates a new selector from the description.
 */
export function generateXPath(description: string, html: string): string {
  if (description.toLowerCase().includes('invoice')) {
    return '//td[@class="invoice"]';
  }
  if (description.toLowerCase().includes('email')) {
    return '//td[@class="email"]';
  }
  if (description.toLowerCase().includes('amount')) {
    return '//td[@class="amount"]';
  }
  return '//body';
}

/**
 * Transform raw data using LLM-powered instructions.
 * In production, this sends the prompt and data to an LLM which cleans,
 * formats, or restructures the scraped data as instructed.
 */
export function transformData(prompt: string, data: string): string {
  return data.trim();
}
