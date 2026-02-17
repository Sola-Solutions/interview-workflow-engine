from src.types import VariableValue


def evaluate_branch(
    prompt: str, variables: dict[str, VariableValue]
) -> dict[str, str]:
    """
    Evaluate a conditional branch using LLM reasoning.
    In production, this sends the prompt and variables to an LLM which decides
    which branch to take based on natural language instructions.
    """
    if "critical" in prompt:
        invoice_amount = float(str(variables.get("invoiceAmount", "0")))
        days_overdue = int(str(variables.get("daysOverdue", "0")))

        branch_handle = "yes" if (invoice_amount > 5000 or days_overdue > 60) else "no"
        return {"branch_handle": branch_handle}
    else:
        raise RuntimeError(f"Unsupported prompt: {prompt}")


def generate_xpath(description: str, html: str) -> str:
    """
    Generate an XPath selector from a natural language description and page HTML.
    In production, this powers self-healing XPath.
    """
    lower = description.lower()
    if "invoice" in lower:
        return '//td[@class="invoice"]'
    if "email" in lower:
        return '//td[@class="email"]'
    if "amount" in lower:
        return '//td[@class="amount"]'
    return "//body"


def transform_data(prompt: str, data: str) -> str:
    """
    Transform raw data using LLM-powered instructions.
    In production, this sends the prompt and data to an LLM.
    """
    return data.strip()
