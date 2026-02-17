import http.server
import threading

import pytest

from src.activities import (
    determine_next_node,
    execute_conditional_node,
    execute_output_node,
    execute_send_email_node,
    execute_web_node,
    resolve_template,
)
from src.types import (
    ConditionalNodeData,
    OpenAction,
    OutputNodeData,
    ScrapeAction,
    ScrapeAllAction,
    SendEmailNodeData,
    WorkflowEdge,
)
from src.util.llm import evaluate_branch
from src.util.session import Session

# --- Test server fixture ---

FIXTURE_HTML = """
<html><body>
  <h1>Test Page</h1>
  <table><tbody>
    <tr>
      <td class="invoice">INV-001</td>
      <td class="customer">Acme Corp.</td>
      <td class="email">billing@acmecorp.com</td>
      <td class="amount">12450.00</td>
      <td class="overdue">75</td>
    </tr>
    <tr>
      <td class="invoice">INV-002</td>
      <td class="customer">Globex Inc.</td>
      <td class="email">ap@globex.com</td>
      <td class="amount">3200.00</td>
      <td class="overdue">30</td>
    </tr>
    <tr>
      <td class="invoice">INV-003</td>
      <td class="customer">Initech LLC</td>
      <td class="email">billing@initech.com</td>
      <td class="amount">8750.00</td>
      <td class="overdue">90</td>
    </tr>
  </tbody></table>
  <a href="/other" id="link1">Go somewhere</a>
</body></html>
"""

OTHER_HTML = "<html><body><h1>Other Page</h1></body></html>"


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        if self.path == "/other":
            self.wfile.write(OTHER_HTML.encode())
        else:
            self.wfile.write(FIXTURE_HTML.encode())

    def log_message(self, format, *args):
        pass  # suppress logs


@pytest.fixture(scope="module")
def base_url():
    server = http.server.HTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


# --- Session tests ---


class TestSession:
    @pytest.mark.asyncio
    async def test_navigates_and_scrapes_text(self, base_url):
        session = Session()
        await session.navigate(base_url)
        assert session.scrape("//h1") == "Test Page"

    @pytest.mark.asyncio
    async def test_scrapes_table_cell_text(self, base_url):
        session = Session()
        await session.navigate(base_url)
        assert session.scrape('//tbody/tr[1]/td[@class="invoice"]') == "INV-001"
        assert session.scrape('//tbody/tr[2]/td[@class="customer"]') == "Globex Inc."

    @pytest.mark.asyncio
    async def test_clicks_link_by_href(self, base_url):
        session = Session()
        await session.navigate(base_url)
        await session.click('//a[@id="link1"]')
        assert session.scrape("//h1") == "Other Page"

    def test_throws_on_scrape_before_navigate(self):
        session = Session()
        with pytest.raises(RuntimeError, match="No page loaded"):
            session.scrape("//h1")

    @pytest.mark.asyncio
    async def test_scrape_all_returns_all_matching(self, base_url):
        session = Session()
        await session.navigate(base_url)
        invoices = session.scrape_all('//tbody/tr/td[@class="invoice"]')
        assert invoices == ["INV-001", "INV-002", "INV-003"]

    @pytest.mark.asyncio
    async def test_scrape_all_returns_empty_for_no_matches(self, base_url):
        session = Session()
        await session.navigate(base_url)
        result = session.scrape_all('//tbody/tr/td[@class="nonexistent"]')
        assert result == []


# --- resolveTemplate tests ---


class TestResolveTemplate:
    def test_replaces_variable_placeholders(self):
        assert (
            resolve_template("http://{{host}}:{{port}}/invoices", {"host": "localhost", "port": "3000"})
            == "http://localhost:3000/invoices"
        )

    def test_resolves_unknown_variables_to_empty(self):
        assert resolve_template("hello {{unknown}}", {}) == "hello "

    def test_resolves_arrays_by_joining_with_comma(self):
        assert resolve_template("values: {{items}}", {"items": ["a", "b", "c"]}) == "values: a,b,c"

    def test_resolves_numbers_to_string(self):
        assert resolve_template("count: {{n}}", {"n": 42}) == "count: 42"


# --- determineNextNode tests ---


class TestDetermineNextNode:
    edges = [
        WorkflowEdge(id="e1", source="a", target="b"),
        WorkflowEdge(id="e2", source="b", target="c", branch_handle="yes"),
        WorkflowEdge(id="e3", source="b", target="d", branch_handle="no"),
    ]

    def test_follows_unconditional_edge(self):
        assert determine_next_node(self.edges, "a") == "b"

    def test_follows_branch_edge(self):
        assert determine_next_node(self.edges, "b", "yes") == "c"
        assert determine_next_node(self.edges, "b", "no") == "d"

    def test_returns_none_when_no_edge(self):
        assert determine_next_node(self.edges, "c") is None


# --- LLM mock tests ---


class TestEvaluateBranch:
    def test_returns_yes_for_critical_invoices_high_amount(self):
        result = evaluate_branch("Is this critical?", {"invoiceAmount": "12450.00", "daysOverdue": "40"})
        assert result["branch_handle"] == "yes"

    def test_returns_yes_for_very_overdue(self):
        result = evaluate_branch("Is this critical?", {"invoiceAmount": "850.00", "daysOverdue": "75"})
        assert result["branch_handle"] == "yes"

    def test_returns_no_for_non_critical(self):
        result = evaluate_branch("Is this critical?", {"invoiceAmount": "3200.00", "daysOverdue": "40"})
        assert result["branch_handle"] == "no"


# --- Node executor tests ---


class TestExecuteConditionalNode:
    edges = [
        WorkflowEdge(id="e1", source="n1", target="yes-node", branch_handle="yes"),
        WorkflowEdge(id="e2", source="n1", target="no-node", branch_handle="no"),
    ]

    @pytest.mark.asyncio
    async def test_yes_branch_for_critical_high_amount(self):
        result = await execute_conditional_node(
            ConditionalNodeData(prompt="Is this critical? Amount is ${{invoiceAmount}}, {{daysOverdue}} days overdue."),
            {"invoiceAmount": "12450.00", "daysOverdue": "40"},
            self.edges,
            "n1",
        )
        assert result.next_node_id == "yes-node"

    @pytest.mark.asyncio
    async def test_yes_branch_for_very_overdue(self):
        result = await execute_conditional_node(
            ConditionalNodeData(prompt="Is this critical? Amount is ${{invoiceAmount}}, {{daysOverdue}} days overdue."),
            {"invoiceAmount": "850.00", "daysOverdue": "75"},
            self.edges,
            "n1",
        )
        assert result.next_node_id == "yes-node"

    @pytest.mark.asyncio
    async def test_no_branch_for_non_critical(self):
        result = await execute_conditional_node(
            ConditionalNodeData(prompt="Is this critical? Amount is ${{invoiceAmount}}, {{daysOverdue}} days overdue."),
            {"invoiceAmount": "3200.00", "daysOverdue": "40"},
            self.edges,
            "n1",
        )
        assert result.next_node_id == "no-node"


class TestExecuteWebNode:
    @pytest.mark.asyncio
    async def test_navigates_and_scrapes_variables(self, base_url):
        edges = [WorkflowEdge(id="e1", source="n1", target="n2")]
        result = await execute_web_node(
            [
                OpenAction(id="a1", url="{{baseUrl}}"),
                ScrapeAction(id="a2", xpath='//td[@class="invoice"]', variable="invoiceNumber"),
                ScrapeAction(id="a3", xpath='//td[@class="email"]', variable="contactEmail"),
                ScrapeAction(id="a4", xpath='//td[@class="amount"]', variable="invoiceAmount"),
            ],
            {"baseUrl": base_url},
            edges,
            "n1",
        )
        assert result.variables["invoiceNumber"] == "INV-001"
        assert result.variables["contactEmail"] == "billing@acmecorp.com"
        assert result.variables["invoiceAmount"] == "12450.00"
        assert result.variables["baseUrl"] == base_url
        assert result.next_node_id == "n2"

    @pytest.mark.asyncio
    async def test_handles_scrape_all(self, base_url):
        edges = [WorkflowEdge(id="e1", source="n1", target="n2")]
        result = await execute_web_node(
            [
                OpenAction(id="a1", url="{{baseUrl}}"),
                ScrapeAllAction(id="a2", xpath='//tbody/tr/td[@class="invoice"]', variable="invoiceNumbers"),
                ScrapeAllAction(id="a3", xpath='//tbody/tr/td[@class="amount"]', variable="amounts"),
            ],
            {"baseUrl": base_url},
            edges,
            "n1",
        )
        assert result.variables["invoiceNumbers"] == ["INV-001", "INV-002", "INV-003"]
        assert result.variables["amounts"] == ["12450.00", "3200.00", "8750.00"]
        assert result.next_node_id == "n2"


class TestExecuteSendEmailNode:
    @pytest.mark.asyncio
    async def test_resolves_templates_and_logs(self, caplog):
        edges: list[WorkflowEdge] = []
        with caplog.at_level("INFO"):
            result = await execute_send_email_node(
                SendEmailNodeData(
                    to="{{contactEmail}}",
                    subject="Invoice {{invoiceNumber}}",
                    body="Dear {{customerName}}, please pay ${{invoiceAmount}}",
                ),
                {
                    "invoiceNumber": "INV-001",
                    "customerName": "Acme Corp.",
                    "invoiceAmount": "12450.00",
                    "contactEmail": "billing@acmecorp.com",
                },
                edges,
                "n1",
            )
        assert "[EMAIL] To: billing@acmecorp.com, Subject: Invoice INV-001, Body: Dear Acme Corp., please pay $12450.00" in caplog.text
        assert result.next_node_id is None
        assert result.variables == {
            "invoiceNumber": "INV-001",
            "customerName": "Acme Corp.",
            "invoiceAmount": "12450.00",
            "contactEmail": "billing@acmecorp.com",
        }

    @pytest.mark.asyncio
    async def test_handles_missing_variables(self, caplog):
        edges = [WorkflowEdge(id="e1", source="n1", target="n2")]
        with caplog.at_level("INFO"):
            result = await execute_send_email_node(
                SendEmailNodeData(to="{{existing}}", subject="Test", body="{{missing}}"),
                {"existing": "test@example.com"},
                edges,
                "n1",
            )
        assert "[EMAIL] To: test@example.com, Subject: Test, Body: " in caplog.text
        assert result.next_node_id == "n2"


class TestExecuteOutputNode:
    @pytest.mark.asyncio
    async def test_builds_csv_with_scalars(self, caplog):
        edges = [WorkflowEdge(id="e1", source="n1", target="n2")]
        with caplog.at_level("INFO"):
            result = await execute_output_node(
                OutputNodeData(
                    format="csv",
                    columns=["Invoice Number", "Customer", "Amount"],
                    row_variables=["invoiceNumber", "customerName", "invoiceAmount"],
                    output="csvOutput",
                ),
                {"invoiceNumber": "INV-001", "customerName": "Acme Corp.", "invoiceAmount": "12450.00"},
                edges,
                "n1",
            )
        expected_csv = "Invoice Number,Customer,Amount\nINV-001,Acme Corp.,12450.00"
        assert result.variables["csvOutput"] == expected_csv
        assert f"[OUTPUT] {expected_csv}" in caplog.text
        assert result.next_node_id == "n2"
        assert result.variables["invoiceNumber"] == "INV-001"
        assert result.variables["customerName"] == "Acme Corp."
        assert result.variables["invoiceAmount"] == "12450.00"

    @pytest.mark.asyncio
    async def test_builds_multi_row_csv_with_arrays(self, caplog):
        with caplog.at_level("INFO"):
            result = await execute_output_node(
                OutputNodeData(
                    format="csv",
                    columns=["Invoice Number", "Amount", "Days Overdue"],
                    row_variables=["invoiceNumbers", "amounts", "daysOverdues"],
                    output="csvOutput",
                ),
                {
                    "invoiceNumbers": ["INV-001", "INV-002", "INV-003"],
                    "amounts": ["12450.00", "3200.00", "8750.00"],
                    "daysOverdues": ["75", "30", "90"],
                },
                [],
                "n1",
            )
        expected_csv = "Invoice Number,Amount,Days Overdue\nINV-001,12450.00,75\nINV-002,3200.00,30\nINV-003,8750.00,90"
        assert result.variables["csvOutput"] == expected_csv
        assert f"[OUTPUT] {expected_csv}" in caplog.text
        assert result.next_node_id is None

    @pytest.mark.asyncio
    async def test_scalars_only_on_first_row_when_mixed_with_arrays(self, caplog):
        with caplog.at_level("INFO"):
            result = await execute_output_node(
                OutputNodeData(
                    format="csv",
                    columns=["Name", "Score", "Class"],
                    row_variables=["names", "scores", "className"],
                    output="report",
                ),
                {
                    "names": ["Alice", "Bob"],
                    "scores": ["95", "87"],
                    "className": "Math 101",
                },
                [],
                "n1",
            )
        expected_csv = "Name,Score,Class\nAlice,95,Math 101\nBob,87,"
        assert result.variables["report"] == expected_csv

    @pytest.mark.asyncio
    async def test_returns_none_when_no_outgoing_edge(self, caplog):
        with caplog.at_level("INFO"):
            result = await execute_output_node(
                OutputNodeData(
                    format="csv",
                    columns=["Name", "Score"],
                    row_variables=["name", "score"],
                    output="report",
                ),
                {"name": "Alice", "score": "95"},
                [],
                "n1",
            )
        assert result.variables["report"] == "Name,Score\nAlice,95"
        assert result.next_node_id is None
