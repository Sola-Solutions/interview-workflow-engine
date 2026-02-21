# Workflow Engine

A minimal workflow execution engine for automating web scraping and data processing tasks.

## Prerequisites

- [Node.js 20+](https://nodejs.org/en/download)
- [Docker Engine](https://docs.docker.com/engine/install/)

## Quick Start

```bash
# Terminal 1: Start infrastructure (from repo root)
docker compose up -d

# Terminal 2: Start Temporal worker
cd workflow-engine-ts
npm install
npm start

# Terminal 3: Test Temporal setup
cd workflow-engine-ts
npm run hello

# Terminal 4: Run the invoice export workflow
cd workflow-engine-ts
npm run workflow
```

Visit:
- http://localhost:3000 for InvoiceHub (the fake billing app)
- http://localhost:8080 for the Temporal Web UI


## Testing

```bash
# Type checking
npm run build

# Run tests
npm test
```