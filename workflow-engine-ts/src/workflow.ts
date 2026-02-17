import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from './activities';
import type { WorkflowInput, WorkflowResult, VariableValue } from './types';

const {
  executeWebNode: executeWebNode,
  executeConditionalNode,
  executeSendEmailNode,
  executeOutputNode,
  makeHTTPRequest,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 seconds',
  retry: {
    initialInterval: '1 second',
    maximumAttempts: 2,
  },
});

/**
 * Hello-world workflow to verify Temporal setup.
 * Makes an HTTP request and returns "The answer is 42".
 */
export async function helloWorld(): Promise<string> {
  const answer = await makeHTTPRequest();
  return `The answer is ${answer}`;
}

export async function executeWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const { definition, inputs } = input;
  let variables: Record<string, VariableValue> = { ...definition.variables, ...inputs };

  // Find root node: the node with no incoming edges
  const targetIds = new Set(definition.edges.map((e) => e.target));
  const rootNode = definition.nodes.find((n) => !targetIds.has(n.id));
  if (!rootNode) throw new Error('No root node found (node with no incoming edges)');

  let currentNodeId: string | null = rootNode.id;

  while (currentNodeId) {
    const node = definition.nodes.find((n) => n.id === currentNodeId);
    if (!node) throw new Error(`Node not found: ${currentNodeId}`);

    log.info(`Executing node ${node.id} (${node.type})`);

    let result;
    switch (node.type) {
      case 'web':
        result = await executeWebNode(node.data.actions, variables, definition.edges, node.id);
        break;
      case 'conditional':
        result = await executeConditionalNode(node.data, variables, definition.edges, node.id);
        break;
      case 'sendEmail':
        result = await executeSendEmailNode(node.data, variables, definition.edges, node.id);
        break;
      case 'output':
        result = await executeOutputNode(node.data, variables, definition.edges, node.id);
        break;
      default:
        throw new Error(`Unknown node type: ${(node as any).type}`);
    }

    variables = result.variables;
    currentNodeId = result.nextNodeId;
  }

  log.info('Workflow complete', { finalVariables: variables });
  return { finalVariables: variables };
}
