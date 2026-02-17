import { Session } from './util/session';
import { evaluateBranch } from './util/llm';
import type { Action, WorkflowEdge, NodeResult, VariableValue } from './types';

/**
 * Simple hello-world activity to verify Temporal is working.
 * Makes an HTTP request to httpbin.org and returns "42".
 */
export async function makeHTTPRequest(): Promise<string> {
  const response = await fetch('https://httpbin.org/get?answer=42');
  const data = await response.json();
  return data.args.answer;
}

/**
 * Execute an Image node's actions sequentially against a web page.
 * In production, this would run actions via Selenium. Here we use HTTP + jsdom.
 */
export async function executeWebNode(
  actions: Action[],
  variables: Record<string, VariableValue>,
  edges: WorkflowEdge[],
  nodeId: string
): Promise<NodeResult> {
  const session = new Session();
  const updates: Record<string, VariableValue> = {};

  for (const action of actions) {
    const merged = { ...variables, ...updates };
    switch (action.type) {
      case 'Open':
        await session.navigate(resolveTemplate(action.url, merged));
        break;
      case 'Click':
        await session.click(resolveTemplate(action.xpath, merged));
        break;
      case 'Scrape': {
        const value = session.scrape(resolveTemplate(action.xpath, merged));
        updates[action.variable] = value;
        break;
      }
      case 'ScrapeAll': {
        const values = session.scrapeAll(resolveTemplate(action.xpath, merged));
        updates[action.variable] = values;
        break;
      }
      case 'Input':
        // Input actions are handled by form submission in the Click action
        break;
    }
  }

  const nextNodeId = determineNextNode(edges, nodeId);
  return { nextNodeId, variables: { ...variables, ...updates } };
}

/**
 * Execute a Conditional node by calling the (mocked) LLM service.
 * In production, this evaluates branches using either rules or LLM instructions.
 */
export async function executeConditionalNode(
  data: { prompt: string; outputVariable?: string },
  variables: Record<string, VariableValue>,
  edges: WorkflowEdge[],
  nodeId: string
): Promise<NodeResult> {
  const resolvedPrompt = resolveTemplate(data.prompt, variables);
  const { branchHandle } = evaluateBranch(resolvedPrompt, variables);
  const nextNodeId = determineNextNode(edges, nodeId, branchHandle);
  const updatedVariables = data.outputVariable
    ? { ...variables, [data.outputVariable]: branchHandle }
    : variables;
  return { nextNodeId, variables: updatedVariables };
}

/**
 * Execute a SendEmail node — resolves templates and logs email (simulates sending email).
 */
export async function executeSendEmailNode(
  data: { to: string; subject: string; body: string },
  variables: Record<string, VariableValue>,
  edges: WorkflowEdge[],
  nodeId: string
): Promise<NodeResult> {
  const to = resolveTemplate(data.to, variables);
  const subject = resolveTemplate(data.subject, variables);
  const body = resolveTemplate(data.body, variables);
  console.log(`[EMAIL] To: ${to}, Subject: ${subject}, Body: ${body}`);
  const nextNodeId = determineNextNode(edges, nodeId);
  return { nextNodeId, variables };
}

/**
 * Execute an Output node — resolves the template, builds CSV, stores it in a variable.
 * If any referenced variable is an array, produces one CSV row per array element.
 * Scalar variables repeat for each row.
 */
export async function executeOutputNode(
  data: { format: 'csv'; columns: string[]; rowVariables: string[]; output: string },
  variables: Record<string, VariableValue>,
  edges: WorkflowEdge[],
  nodeId: string
): Promise<NodeResult> {
  const header = data.columns.join(',');

  // Find the max length among all arrays
  const maxLen = Math.max(...data.rowVariables.map(varName => 
    Array.isArray(variables[varName]) ? variables[varName].length : 1
  ));

  const rows = Array.from({ length: maxLen }, (_, i) =>
    data.rowVariables.map(varName => Array.isArray(variables[varName]) ? String(variables[varName][i] || '') : (i === 0 ? String(variables[varName] || '') : '')).join(',')
  );

  const csv = `${header}\n${rows.join('\n')}`;

  console.log(`[OUTPUT] ${csv}`);
  const updatedVariables = { ...variables, [data.output]: csv };
  const nextNodeId = determineNextNode(edges, nodeId);
  return { nextNodeId, variables: updatedVariables };
}

// --- Helpers ---

export function resolveTemplate(template: string, variables: Record<string, VariableValue>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const val = variables[name];
    if (val === undefined) return '';
    if (Array.isArray(val)) return val.join(',');
    return String(val);
  });
}

export function determineNextNode(
  edges: WorkflowEdge[],
  nodeId: string,
  branch?: string
): string | null {
  const edge = branch
    ? edges.find((e) => e.source === nodeId && e.branchHandle === branch)
    : edges.find((e) => e.source === nodeId);
  return edge?.target ?? null;
}
