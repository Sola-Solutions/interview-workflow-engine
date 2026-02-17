import re

import httpx
from temporalio import activity

from src.types import (
    Action,
    ConditionalNodeData,
    NodeResult,
    OutputNodeData,
    SendEmailNodeData,
    VariableValue,
    WorkflowEdge,
)
from src.util.llm import evaluate_branch
from src.util.session import Session


@activity.defn
async def make_http_request() -> str:
    """
    Simple hello-world activity to verify Temporal is working.
    Makes an HTTP request to httpbin.org and returns "42".
    """
    async with httpx.AsyncClient() as client:
        response = await client.get("https://httpbin.org/get?answer=42")
        data = response.json()
    return data["args"]["answer"]


@activity.defn
async def execute_web_node(
    actions: list[Action],
    variables: dict[str, VariableValue],
    edges: list[WorkflowEdge],
    node_id: str,
) -> NodeResult:
    """
    Execute a Web node's actions sequentially against a web page.
    In production, this would run actions via Selenium. Here we use HTTP + lxml.
    """
    session = Session()
    updates: dict[str, VariableValue] = {}

    for action in actions:
        merged = {**variables, **updates}
        match action.type:
            case "Open":
                await session.navigate(resolve_template(action.url, merged))
            case "Click":
                await session.click(resolve_template(action.xpath, merged))
            case "Scrape":
                value = session.scrape(resolve_template(action.xpath, merged))
                updates[action.variable] = value
            case "ScrapeAll":
                values = session.scrape_all(resolve_template(action.xpath, merged))
                updates[action.variable] = values
            case "Input":
                # Input actions are handled by form submission in the Click action
                pass

    next_node_id = determine_next_node(edges, node_id)
    return NodeResult(
        next_node_id=next_node_id,
        variables={**variables, **updates},
    )


@activity.defn
async def execute_conditional_node(
    data: ConditionalNodeData,
    variables: dict[str, VariableValue],
    edges: list[WorkflowEdge],
    node_id: str,
) -> NodeResult:
    """
    Execute a Conditional node by calling the (mocked) LLM service.
    In production, this evaluates branches using either rules or LLM instructions.
    """
    resolved_prompt = resolve_template(data.prompt, variables)
    result = evaluate_branch(resolved_prompt, variables)
    branch_handle = result["branch_handle"]

    next_node_id = determine_next_node(edges, node_id, branch_handle)

    updated_variables = {**variables}
    if data.output_variable:
        updated_variables[data.output_variable] = branch_handle

    return NodeResult(
        next_node_id=next_node_id,
        variables=updated_variables,
    )


@activity.defn
async def execute_send_email_node(
    data: SendEmailNodeData,
    variables: dict[str, VariableValue],
    edges: list[WorkflowEdge],
    node_id: str,
) -> NodeResult:
    """
    Execute a SendEmail node -- resolves templates and logs email (simulates sending).
    """
    to = resolve_template(data.to, variables)
    subject = resolve_template(data.subject, variables)
    body = resolve_template(data.body, variables)
    activity.logger.info(f"[EMAIL] To: {to}, Subject: {subject}, Body: {body}")

    next_node_id = determine_next_node(edges, node_id)
    return NodeResult(
        next_node_id=next_node_id,
        variables=variables,
    )


@activity.defn
async def execute_output_node(
    data: OutputNodeData,
    variables: dict[str, VariableValue],
    edges: list[WorkflowEdge],
    node_id: str,
) -> NodeResult:
    """
    Execute an Output node -- resolves the template, builds CSV, stores it in a variable.
    If any referenced variable is an array, produces one CSV row per array element.
    Scalar variables only appear on the first row.
    """
    header = ",".join(data.columns)

    # Find the max length among all arrays
    max_len = max(
        len(variables[name]) if isinstance(variables.get(name), list) else 1
        for name in data.row_variables
    )

    rows: list[str] = []
    for i in range(max_len):
        row_values: list[str] = []
        for name in data.row_variables:
            val = variables.get(name)
            if isinstance(val, list):
                row_values.append(str(val[i]) if i < len(val) else "")
            else:
                row_values.append(str(val or "") if i == 0 else "")
        rows.append(",".join(row_values))

    csv_output = header + "\n" + "\n".join(rows)
    activity.logger.info(f"[OUTPUT] {csv_output}")

    updated_variables = {**variables, data.output: csv_output}
    next_node_id = determine_next_node(edges, node_id)
    return NodeResult(
        next_node_id=next_node_id,
        variables=updated_variables,
    )


# --- Helpers ---


def resolve_template(template: str, variables: dict[str, VariableValue]) -> str:
    def replacer(match: re.Match) -> str:
        name = match.group(1)
        val = variables.get(name)
        if val is None:
            return ""
        if isinstance(val, list):
            return ",".join(str(v) for v in val)
        return str(val)

    return re.sub(r"\{\{(\w+)\}\}", replacer, template)


def determine_next_node(
    edges: list[WorkflowEdge],
    node_id: str,
    branch: str | None = None,
) -> str | None:
    if branch:
        edge = next(
            (e for e in edges if e.source == node_id and e.branch_handle == branch),
            None,
        )
    else:
        edge = next((e for e in edges if e.source == node_id), None)
    return edge.target if edge else None
