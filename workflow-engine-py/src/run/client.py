import asyncio
import json
import re
import sys
import time

from temporalio.client import Client

from src.types import WorkflowInput
from src.workflow import ExecuteWorkflow, HelloWorld
from src.workflow_definition import INVOICE_EXPORT_WORKFLOW


async def main() -> None:
    args = sys.argv[1:]

    client = await Client.connect("localhost:7233")

    # Quick test to verify Temporal is working
    if "--hello" in args:
        workflow_id = f"hello-world-{int(time.time() * 1000)}"
        print(f"Starting hello-world workflow ({workflow_id})")
        result = await client.execute_workflow(
            HelloWorld.run,
            id=workflow_id,
            task_queue="workflow-engine-py",
        )
        print(result)
        return

    # Collect any --key=value input variables from CLI
    inputs: dict[str, str] = {}
    for arg in args:
        match = re.match(r"^--(\w+)=(.+)$", arg)
        if match:
            inputs[match.group(1)] = match.group(2)

    definition = INVOICE_EXPORT_WORKFLOW
    workflow_id = f"invoice-export-{int(time.time() * 1000)}"

    print(f"Starting workflow: invoice-export ({workflow_id})")
    print(f"Inputs: {json.dumps(inputs)}")

    result = await client.execute_workflow(
        ExecuteWorkflow.run,
        WorkflowInput(definition=definition, inputs=inputs),
        id=workflow_id,
        task_queue="workflow-engine-py",
    )

    print("\n=== Workflow Result ===")
    print("Variables:", result.final_variables)
    if result.final_variables.get("output"):
        print(f"\nOutput:\n{result.final_variables['output']}\n")


if __name__ == "__main__":
    asyncio.run(main())
