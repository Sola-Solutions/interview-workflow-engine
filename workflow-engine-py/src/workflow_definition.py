"""
Invoice Export Workflow

Logs into InvoiceHub, scrapes ALL overdue invoices from the list page,
then scrapes detail and checks criticality for the first invoice,
sends email if critical, and outputs a CSV of all invoices.

Graph:
  [login] -> [scrape-list] -> [scrape-detail] -> [check-critical] -> (yes) -> [send-email] -> [output-csv]
                                                                   -> (no)  -> [output-csv]
"""

from src.types import (
    ClickAction,
    ConditionalNode,
    ConditionalNodeData,
    InputAction,
    OpenAction,
    OutputNode,
    OutputNodeData,
    ScrapeAction,
    ScrapeAllAction,
    SendEmailNode,
    SendEmailNodeData,
    WebNode,
    WebNodeData,
    WorkflowDefinition,
    WorkflowEdge,
)

INVOICE_EXPORT_WORKFLOW = WorkflowDefinition(
    variables={
        "invoicehubUrl": "http://localhost:3000",
        "username": "admin",
        "password": "admin123",
    },
    nodes=[
        WebNode(
            id="login",
            data=WebNodeData(actions=[
                OpenAction(id="a1", url="{{invoicehubUrl}}/"),
                InputAction(id="a2", xpath="//input[@name='username']", value="{{username}}"),
                InputAction(id="a3", xpath="//input[@name='password']", value="{{password}}"),
                ClickAction(id="a4", xpath="//button[@type='submit']"),
            ]),
        ),
        WebNode(
            id="scrape-list",
            data=WebNodeData(actions=[
                OpenAction(id="a5", url="{{invoicehubUrl}}/invoices?status=overdue"),
                ScrapeAllAction(id="a6", xpath="//tbody/tr/td[1]", variable="invoiceNumbers"),
                ScrapeAllAction(id="a7", xpath="//tbody/tr/td[2]", variable="invoiceAmounts"),
                ScrapeAllAction(id="a8", xpath="//tbody/tr/td[4]", variable="daysOverdues"),
            ]),
        ),
        WebNode(
            id="scrape-detail",
            data=WebNodeData(actions=[
                OpenAction(id="a9", url="{{invoicehubUrl}}/invoices?status=overdue"),
                ScrapeAction(id="a10", xpath="//tbody/tr[1]/td[2]", variable="invoiceAmount"),
                ScrapeAction(id="a11", xpath="//tbody/tr[1]/td[4]", variable="daysOverdue"),
                ClickAction(id="a12", xpath="//tbody/tr[1]/td[1]/a"),
                ScrapeAction(id="a13", xpath="//div[contains(@class,'customer-name')]", variable="customerName"),
                ScrapeAction(id="a14", xpath="//div[contains(@class,'customer-email')]", variable="contactEmail"),
            ]),
        ),
        ConditionalNode(
            id="check-critical",
            data=ConditionalNodeData(
                prompt="Is this invoice critical enough to escalate? The invoice amount is {{invoiceAmount}} and it is {{daysOverdue}} days overdue. Consider it critical if the amount exceeds $5,000 or it is more than 60 days overdue.",
                output_variable="notified",
            ),
        ),
        SendEmailNode(
            id="send-email",
            data=SendEmailNodeData(
                to="{{contactEmail}}",
                subject="Overdue Invoice",
                body="Dear {{customerName}}, your invoice for {{invoiceAmount}} is {{daysOverdue}}. Please remit payment immediately.",
            ),
        ),
        OutputNode(
            id="output-csv",
            data=OutputNodeData(
                format="csv",
                columns=["Invoice Number", "Amount", "Days Overdue"],
                row_variables=["invoiceNumbers", "invoiceAmounts", "daysOverdues"],
                output="output",
            ),
        ),
    ],
    edges=[
        WorkflowEdge(id="e1", source="login", target="scrape-list"),
        WorkflowEdge(id="e2", source="scrape-list", target="scrape-detail"),
        WorkflowEdge(id="e3", source="scrape-detail", target="check-critical"),
        WorkflowEdge(id="e4", source="check-critical", target="send-email", branch_handle="yes"),
        WorkflowEdge(id="e5", source="check-critical", target="output-csv", branch_handle="no"),
        WorkflowEdge(id="e6", source="send-email", target="output-csv"),
    ],
)
