import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from '../activities';

async function run() {
  const connection = process.env.TEMPORAL_ADDRESS
    ? await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS })
    : undefined;

  const worker = await Worker.create({
    connection,
    workflowsPath: require.resolve('../workflow'),
    activities,
    taskQueue: 'workflow-engine',
  });

  console.log('Worker started, listening on task queue: workflow-engine');
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
