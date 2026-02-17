// Variable value types: string, number, string[], number[]
export type VariableValue = string | number | string[] | number[];

// --- Actions (within Image nodes) ---
// Action types: Open, Click, Scrape, ScrapeAll, Input

export interface OpenAction {
  id: string;
  type: 'Open';
  url: string; // supports {{variable}} templates
}

export interface ClickAction {
  id: string;
  type: 'Click';
  xpath: string;
}

export interface ScrapeAction {
  id: string;
  type: 'Scrape';
  xpath: string;
  variable: string; // variable name to store scraped value
}

export interface ScrapeAllAction {
  id: string;
  type: 'ScrapeAll';
  xpath: string;
  variable: string; // variable name to store scraped values as string[]
}

export interface InputAction {
  id: string;
  type: 'Input';
  xpath: string;
  value: string; // supports {{variable}} templates
}

export type Action = OpenAction | ClickAction | ScrapeAction | ScrapeAllAction | InputAction;

// --- Nodes ---
// An Image node contains ordered actions executed against a browser session.
// Here we use HTTP + jsdom instead of Selenium.

export interface WebNode {
  id: string;
  type: 'web';
  data: {
    actions: Action[];
  };
}

export interface ConditionalNode {
  id: string;
  type: 'conditional';
  data: {
    prompt: string; // natural language instruction for LLM, supports {{variable}} templates
    outputVariable?: string; // variable name to store the decision ("yes" or "no")
  };
}

export interface SendEmailNode {
  id: string;
  type: 'sendEmail';
  data: {
    to: string; // supports {{variable}} templates
    subject: string; // supports {{variable}} templates
    body: string; // supports {{variable}} templates
  };
}

export interface OutputNode {
  id: string;
  type: 'output';
  data: {
    format: 'csv';
    columns: string[]; // CSV header column names
    rowVariables: string[]; // variable names whose values populate each CSV row
    output: string; // variable name to store the CSV output in
  };
}

export type WorkflowNode = WebNode | ConditionalNode | SendEmailNode | OutputNode;

// --- Edges ---

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  branchHandle?: 'yes' | 'no'; // for conditional branches
}

// --- Workflow Definition ---

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, string | string[]>; // variable name → default value
}

// --- Workflow I/O ---

export interface WorkflowInput {
  definition: WorkflowDefinition;
  inputs: Record<string, VariableValue>; // runtime input variables (e.g., search terms)
}

export interface NodeResult {
  nextNodeId: string | null; // null = workflow complete
  variables: Record<string, VariableValue>; // the full updated variable state
}

export interface WorkflowResult {
  finalVariables: Record<string, VariableValue>;
}
