from dataclasses import dataclass, field
from typing import Literal

# Variable value types: str, int, list[str], list[int]
VariableValue = str | int | list[str] | list[int]


# --- Actions (within Web nodes) ---

@dataclass
class OpenAction:
    id: str
    url: str  # supports {{variable}} templates
    type: Literal["Open"] = "Open"


@dataclass
class ClickAction:
    id: str
    xpath: str
    type: Literal["Click"] = "Click"


@dataclass
class ScrapeAction:
    id: str
    xpath: str
    variable: str  # variable name to store scraped value
    type: Literal["Scrape"] = "Scrape"


@dataclass
class ScrapeAllAction:
    id: str
    xpath: str
    variable: str  # variable name to store scraped values as list[str]
    type: Literal["ScrapeAll"] = "ScrapeAll"


@dataclass
class InputAction:
    id: str
    xpath: str
    value: str  # supports {{variable}} templates
    type: Literal["Input"] = "Input"


Action = OpenAction | ClickAction | ScrapeAction | ScrapeAllAction | InputAction


# --- Nodes ---

@dataclass
class WebNodeData:
    actions: list[Action]


@dataclass
class WebNode:
    id: str
    data: WebNodeData
    type: Literal["web"] = "web"


@dataclass
class ConditionalNodeData:
    prompt: str  # natural language instruction for LLM, supports {{variable}} templates
    output_variable: str | None = None  # variable name to store the decision


@dataclass
class ConditionalNode:
    id: str
    data: ConditionalNodeData
    type: Literal["conditional"] = "conditional"


@dataclass
class SendEmailNodeData:
    to: str  # supports {{variable}} templates
    subject: str  # supports {{variable}} templates
    body: str  # supports {{variable}} templates


@dataclass
class SendEmailNode:
    id: str
    data: SendEmailNodeData
    type: Literal["sendEmail"] = "sendEmail"


@dataclass
class OutputNodeData:
    format: str  # "csv"
    columns: list[str]  # CSV header column names
    row_variables: list[str]  # variable names whose values populate each CSV row
    output: str  # variable name to store the CSV output in


@dataclass
class OutputNode:
    id: str
    data: OutputNodeData
    type: Literal["output"] = "output"


WorkflowNode = WebNode | ConditionalNode | SendEmailNode | OutputNode


# --- Edges ---

@dataclass
class WorkflowEdge:
    id: str
    source: str
    target: str
    branch_handle: str | None = None  # "yes" or "no" for conditional branches


# --- Workflow Definition ---

@dataclass
class WorkflowDefinition:
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
    variables: dict[str, str | list[str]] = field(default_factory=dict)


# --- Workflow I/O ---

@dataclass
class WorkflowInput:
    definition: WorkflowDefinition
    inputs: dict[str, VariableValue] = field(default_factory=dict)


@dataclass
class NodeResult:
    next_node_id: str | None  # None = workflow complete
    variables: dict[str, VariableValue]  # the full updated variable state


@dataclass
class WorkflowResult:
    final_variables: dict[str, VariableValue]
