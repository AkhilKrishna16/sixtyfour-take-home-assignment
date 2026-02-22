# Sixtyfour Workflow Studio

A visual pipeline builder for lead data enrichment. Upload a CSV of leads, drag-and-drop processing blocks to build a workflow, and run it to enrich your data using the Sixtyfour API.

## Overview

The app lets you build and run multi-step data pipelines:

- **Read** a CSV file of leads
- **Filter** rows by column values
- **Enrich** leads with AI (phone, LinkedIn, job title, location, etc.)
- **Find emails** via Sixtyfour's email discovery API
- **Compute columns** to derive boolean flags or new fields
- **Save** the results to a CSV

Workflows run asynchronously in the background. The UI shows live progress, rows processed, and a data preview while the pipeline executes.

## Project Structure

```
sixtyfour-take-home-assignment/
├── backend/          # FastAPI Python server
│   ├── app.py        # All API logic and pipeline execution
│   └── uploads/      # User-uploaded CSV files
├── frontend/         # Next.js TypeScript app
│   └── src/
│       ├── app/
│       └── components/
│           ├── workflow-studio.tsx          # Main UI component
│           └── workflow-studio/
│               ├── ConfigPanel.tsx          # Block config sidebar
│               ├── LiveDataPreview.tsx      # Data table preview
│               ├── QueueCard.tsx            # Run history cards
│               ├── constants.tsx            # Block definitions & defaults
│               ├── types.ts                 # TypeScript types
│               └── utils.ts                 # CSV parsing & header utils
└── .env              # API key (see Setup)
```

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- A **Sixtyfour API key**

## Setup

1. Clone the repo and create a `.env` file in the project root:

   ```env
   SIXTYFOUR_API_KEY=your_api_key_here
   ```

2. Install backend dependencies:

   ```bash
   cd backend
   python -m venv .venv

   # Windows
   .venv\Scripts\activate
   # macOS/Linux
   source .venv/bin/activate

   pip install fastapi uvicorn pandas requests python-dotenv python-multipart httpx
   ```

3. Install frontend dependencies:

   ```bash
   cd frontend
   npm install
   ```

## Running

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
python app.py
```
Runs on `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```
Runs on `http://localhost:3000`.

## Usage

1. **Upload a CSV** — drag a file onto the upload area or click to browse. The file should have column headers in the first row.
2. **Build a pipeline** — drag blocks from the left library onto the canvas. Every pipeline must start with **Read CSV** and end with **Save CSV**.
3. **Configure blocks** — click a block to open its config panel on the right.
4. **Run** — click **Run Workflow**. Watch live progress and a data preview as the pipeline executes.
5. **Download** — once a **Save CSV** block completes, click its download button to get the output file.

## Pipeline Blocks

| Block | Description |
|---|---|
| **Read CSV** | Load the uploaded CSV into the pipeline |
| **Filter** | Keep only rows matching a condition (equals, contains, gt, lt) |
| **Enrich Lead** | Call the Sixtyfour AI to fill in missing lead data |
| **Find Email** | Discover professional or personal email addresses |
| **Compute Column** | Add a derived boolean or conditional column |
| **Save CSV** | Write the current dataframe to a CSV file |

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `SIXTYFOUR_API_KEY` | `.env` (root) | Required for Enrich Lead and Find Email blocks |
| `NEXT_PUBLIC_API_BASE_URL` | `frontend/.env.local` | Override backend URL (default: `http://127.0.0.1:8000`) |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/workflows/run` | Submit a pipeline, returns `workflow_id` |
| `GET` | `/workflows/{id}/status` | Poll for status and progress |
| `GET` | `/workflows/{id}/preview` | Fetch first 10 rows of current data |
| `GET` | `/workflows/{id}/download` | Download the final output CSV |
| `POST` | `/files/upload` | Upload a CSV file |
| `GET` | `/files/download?path=...` | Download a file by path |
