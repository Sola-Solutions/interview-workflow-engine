import asyncio
import os

from temporalio.client import Client
from temporalio.worker import Worker

from src.activities import (
    execute_conditional_node,
    execute_output_node,
    execute_send_email_node,
    execute_web_node,
    make_http_request,
)
from src.workflow import ExecuteWorkflow, HelloWorld


async def run() -> None:
    address = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
    client = await Client.connect(address)

    worker = Worker(
        client,
        task_queue="workflow-engine-py",
        workflows=[HelloWorld, ExecuteWorkflow],
        activities=[
            make_http_request,
            execute_web_node,
            execute_conditional_node,
            execute_send_email_node,
            execute_output_node,
        ],
    )

    print("Worker started, listening on task queue: workflow-engine-py")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(run())
