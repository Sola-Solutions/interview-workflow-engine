from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from src.activities import (
        execute_conditional_node,
        execute_output_node,
        execute_send_email_node,
        execute_web_node,
        make_http_request,
    )
    from src.types import (
        ConditionalNode,
        OutputNode,
        SendEmailNode,
        VariableValue,
        WebNode,
        WorkflowInput,
        WorkflowResult,
    )


@workflow.defn
class HelloWorld:
    """Hello-world workflow to verify Temporal setup."""

    @workflow.run
    async def run(self) -> str:
        answer = await workflow.execute_activity(
            make_http_request,
            start_to_close_timeout=timedelta(seconds=60),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )
        return f"The answer is {answer}"


@workflow.defn
class ExecuteWorkflow:
    @workflow.run
    async def run(self, input: WorkflowInput) -> WorkflowResult:
        definition = input.definition
        variables: dict[str, VariableValue] = {**definition.variables, **input.inputs}

        # Find root node: the node with no incoming edges
        target_ids = {e.target for e in definition.edges}
        root_node = next(
            (n for n in definition.nodes if n.id not in target_ids), None
        )
        if root_node is None:
            raise RuntimeError("No root node found (node with no incoming edges)")

        current_node_id: str | None = root_node.id

        while current_node_id is not None:
            node = next(
                (n for n in definition.nodes if n.id == current_node_id), None
            )
            if node is None:
                raise RuntimeError(f"Node not found: {current_node_id}")

            workflow.logger.info(f"Executing node {node.id} ({node.type})")

            activity_args: dict = {
                "start_to_close_timeout": timedelta(seconds=60),
                "retry_policy": RetryPolicy(
                    initial_interval=timedelta(seconds=1),
                    maximum_attempts=2,
                ),
            }

            match node:
                case WebNode():
                    result = await workflow.execute_activity(
                        execute_web_node,
                        args=[node.data.actions, variables, definition.edges, node.id],
                        **activity_args,
                    )
                case ConditionalNode():
                    result = await workflow.execute_activity(
                        execute_conditional_node,
                        args=[node.data, variables, definition.edges, node.id],
                        **activity_args,
                    )
                case SendEmailNode():
                    result = await workflow.execute_activity(
                        execute_send_email_node,
                        args=[node.data, variables, definition.edges, node.id],
                        **activity_args,
                    )
                case OutputNode():
                    result = await workflow.execute_activity(
                        execute_output_node,
                        args=[node.data, variables, definition.edges, node.id],
                        **activity_args,
                    )
                case _:
                    raise RuntimeError(f"Unknown node type: {node.type}")

            variables = result.variables
            current_node_id = result.next_node_id

        workflow.logger.info("Workflow complete", variables)
        return WorkflowResult(final_variables=variables)
