import { Client } from '@temporalio/client';
import { executeWorkflow, helloWorld } from '../workflow';
import { INVOICE_EXPORT_WORKFLOW } from '../workflow-definition';

async function main() {
  // Parse command line args
  const args = process.argv.slice(2);

  const client = new Client();

  // Quick test to verify Temporal is working
  if (args.includes('--hello')) {
    const workflowId = `hello-world-${Date.now()}`;
    console.log(`Starting hello-world workflow (${workflowId})`);
    const result = await client.workflow.execute(helloWorld, {
      taskQueue: 'workflow-engine',
      workflowId,
    });
    console.log(result);
    return;
  }

  // Collect any --key=value input variables from CLI
  const inputs: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) inputs[match[1]] = match[2];
  }

  const definition = INVOICE_EXPORT_WORKFLOW;

  const workflowId = `invoice-export-${Date.now()}`;

  console.log(`Starting workflow: invoice-export (${workflowId})`);
  console.log(`Inputs: ${JSON.stringify(inputs)}`);

  const result = await client.workflow.execute(executeWorkflow, {
    taskQueue: 'workflow-engine',
    workflowId,
    args: [{ definition, inputs }],
  });

  console.log('\n=== Workflow Result ===');
  console.log('Variables:', result.finalVariables);
  if (result.finalVariables.output) {
    console.log('\nOutput:\n' + result.finalVariables.output + '\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
