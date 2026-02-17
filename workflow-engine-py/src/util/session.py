import httpx
from lxml import html as lxml_html
from lxml.html import HtmlElement


class Session:
    """
    In production, a Session would wrap a Selenium browser instance. Here we use
    HTTP + lxml for the same functionality without a real browser.
    """

    def __init__(self) -> None:
        self._doc: HtmlElement | None = None
        self._base_url: str | None = None

    async def navigate(self, url: str) -> None:
        """Navigate to the given URL, fetching the page HTML and parsing it
        with lxml for subsequent scraping and interaction."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
        self._doc = lxml_html.fromstring(response.text)
        parsed = httpx.URL(url)
        self._base_url = f"{parsed.scheme}://{parsed.host}:{parsed.port}"

    def scrape(self, xpath: str) -> str:
        """Scrape the text content of the first element matching the given
        XPath expression. Returns an empty string if no match is found."""
        doc = self._get_document()
        results = doc.xpath(xpath)
        if not results:
            return ""
        node = results[0]
        if isinstance(node, str):
            return node.strip()
        return (node.text_content() or "").strip()

    def scrape_all(self, xpath: str) -> list[str]:
        """Scrape the text content of all elements matching the given XPath
        expression. Returns a list of trimmed strings."""
        doc = self._get_document()
        results = doc.xpath(xpath)
        values: list[str] = []
        for node in results:
            if isinstance(node, str):
                values.append(node.strip())
            else:
                values.append((node.text_content() or "").strip())
        return values

    async def click(self, xpath: str) -> None:
        """Simulate clicking the element matching the given XPath. If the
        element is a link, follows the href. If it's a submit button inside a
        form, navigates to the form's action URL. Raises if the target cannot
        be clicked."""
        doc = self._get_document()
        results = doc.xpath(xpath)
        if not results:
            raise RuntimeError(f"No element found for xpath: {xpath}")
        node = results[0]

        # If clicking a link, follow the href
        href = node.get("href")
        if href:
            url = href if href.startswith("http") else f"{self._base_url}{href}"
            await self.navigate(url)
            return

        # If clicking a submit button, navigate to the form's action URL
        form = node.getparent()
        while form is not None and form.tag != "form":
            form = form.getparent()
        if form is not None:
            action = form.get("action") or "/"
            url = action if action.startswith("http") else f"{self._base_url}{action}"
            await self.navigate(url)
            return

        raise RuntimeError(f"Click target has no href and is not in a form: {xpath}")

    def _get_document(self) -> HtmlElement:
        """Return the current lxml document, raising if no page has been loaded."""
        if self._doc is None:
            raise RuntimeError("No page loaded — call navigate() first")
        return self._doc
