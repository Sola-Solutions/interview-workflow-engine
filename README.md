# Workflow Engine

A Temporal-based workflow engine for automating web scraping and data processing tasks. There are two implementations — **TypeScript** and **Python** — and you only need to run one.

## Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/)

Pick one of:
- **TypeScript:** [Node.js 20+](https://nodejs.org/en/download)
- **Python:** [Python 3.12+](https://www.python.org/downloads/) (`brew install python@3.12`)

## Quick Start

### 1. Start infrastructure (shared)

Start Temporal and InvoiceHub from the repo root:

```bash
docker-compose up -d
```

### 2. Choose your language and follow the steps below

<details>
<summary><strong>TypeScript</strong></summary>

#### Install dependencies

```bash
cd workflow-engine-ts
npm install
```

#### Start the workflow worker (in another terminal)

```bash
cd workflow-engine-ts
npm start
```

#### Run a workflow (in another terminal)

```bash
cd workflow-engine-ts

# Verify Temporal setup
npm run hello

# Run the invoice export workflow
npm run workflow
```

</details>

<details>
<summary><strong>Python</strong></summary>

#### Set up the Python environment

```bash
cd workflow-engine-py
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

#### Start the workflow worker (in another terminal)

```bash
cd workflow-engine-py
source .venv/bin/activate
python -m src.run.worker
```

#### Run a workflow (in another terminal)

```bash
cd workflow-engine-py
source .venv/bin/activate

# Verify Temporal setup
python -m src.run.client --hello

# Run the invoice export workflow
python -m src.run.client
```

</details>

## What You'll See

The hello/verify command runs a simple test workflow that makes an HTTP request and returns "The answer is 42". This verifies your Temporal setup is working correctly.

The main workflow scrapes overdue invoices from InvoiceHub (running at http://localhost:3000), evaluates whether they're critical (>$5k or >60 days overdue), sends notification emails for critical ones, and outputs a CSV summary.

## Useful Links

- http://localhost:3000 — InvoiceHub (the mock billing app)
- http://localhost:8080 — Temporal Web UI
