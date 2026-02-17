# Workflow Engine (Python)

A Temporal-based workflow engine for automating web scraping and data processing tasks — Python implementation.

## Prerequisites

- [Python 3.12+](https://www.python.org/downloads/) (`brew install python@3.12`)
- [Docker Engine](https://docs.docker.com/engine/install/)

## Quick Start

1. Start infrastructure (Temporal + InvoiceHub) from the repo root:
```bash
docker-compose up -d
```

2. Set up the Python environment:
```bash
cd workflow-engine-py
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

3. Run the tests:
```bash
pytest src/test_activities.py -v
```

4. Start the workflow worker (in another terminal):
```bash
cd workflow-engine-py
source .venv/bin/activate
python -m src.run.worker
```

5. Run a workflow (in another terminal):
```bash
cd workflow-engine-py
source .venv/bin/activate

# Verify Temporal setup
python -m src.run.client --hello

# Run the invoice export workflow
python -m src.run.client
```

## What You'll See

The `--hello` command runs a simple test workflow that makes an HTTP request and returns "The answer is 42". This verifies your Temporal setup is working correctly.

The main workflow scrapes overdue invoices from InvoiceHub (running at http://localhost:3000), evaluates whether they're critical (>$5k or >60 days overdue), sends notification emails for critical ones, and outputs a CSV summary.

## Useful Links

- http://localhost:3000 — InvoiceHub (the mock billing app)
- http://localhost:8080 — Temporal Web UI
