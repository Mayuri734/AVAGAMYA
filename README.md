# AVAGAMYA 🔍
> **Don't Sign What You Don't Understand** — AI-powered BFSI document compliance analyzer that detects high-risk clauses, translates legal jargon, and highlights them directly on the PDF in 12+ Indian languages.

[![CI/CD](https://github.com/Mayuri734/AVAGAMYA/actions/workflows/main_pipeline.yml/badge.svg)](https://github.com/Mayuri734/AVAGAMYA/actions/workflows/main_pipeline.yml)
[![Live Demo](https://img.shields.io/badge/Live-avagamya.vercel.app-brightgreen)](https://avagamya.vercel.app)
[![Backend](https://img.shields.io/badge/API-avagamya.onrender.com-blue)](https://avagamya.onrender.com/docs)

---

## ✨ Features

- 🔐 **PII Security Gate** — Blocks documents containing sensitive personal info (Credit Card, PAN, Aadhaar) before analysis
- 🧠 **Symbolic Analysis Engine** — Deterministic rule-based risk scoring (no hallucination)
- 🌐 **Multilingual** — Sarvam AI (Primary) + Gemini Flash (Fallback) for 12+ Indian languages
- 📄 **PDF Highlighting** — Pinpoints risky clauses directly on the document with bounding boxes
- 📊 **DPO/Auditor Dashboards** — Real-time compliance audit logs via Supabase
- 🧮 **Compliance Officer Sandbox** — Live risk velocity calculator for draft clauses

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, React Router v7 |
| **Backend** | FastAPI, Python 3.12, Uvicorn |
| **AI/NLP** | Google Gemini 1.5 Flash, Sarvam AI, spaCy, textstat |
| **PDF** | pdfplumber (extraction), PyMuPDF/fitz (coordinate highlighting) |
| **Database** | Supabase (PostgreSQL) |
| **Deployment** | Vercel (frontend) + Render (backend) |
| **CI/CD** | GitHub Actions (lint → test → E2E → deploy) |

---

## 🚀 Local Setup

### Prerequisites
- Python 3.12+
- Node.js 20+
- A `.env` file (see below)

### 1. Clone the repository
```bash
git clone https://github.com/Mayuri734/AVAGAMYA.git
cd AVAGAMYA
```

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# Start the backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
> API docs available at: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```
> App runs at: `http://localhost:5173`

---

## 🔑 Environment Variables

Create a `.env` file in the project root:

```env
# Backend API (change to your Render URL in production)
VITE_API_BASE_URL=http://localhost:8000

# Supabase
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_KEY=your_supabase_anon_key

# Google Gemini AI
GOOGLE_API_KEY=your_gemini_api_key

# Sarvam AI (Indian language translation)
SARVAM_API_KEY=your_sarvam_api_key
```

---

## 🌍 Production Deployment

### Frontend → Vercel
1. Import this repo on [vercel.com](https://vercel.com)
2. Add environment variables in **Settings → Environment Variables**:
   - `VITE_API_BASE_URL` = `https://avagamya.onrender.com`
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`
3. Vercel auto-deploys on every push to `main`

### Backend → Render
1. Create a **Web Service** on [render.com](https://render.com)
2. Build command: `pip install -r requirements.txt && python -m spacy download en_core_web_sm`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables: `GOOGLE_API_KEY`, `SARVAM_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`

---

## 🧪 Running Tests

```bash
# Backend unit tests
python -m pytest tests/test_backend_units.py
python -m pytest tests/backend/test_symbolic_engine.py

# Frontend E2E tests (requires both servers running)
npx playwright test tests/frontend/integration.spec.ts
```

---

## 🔄 CI/CD Pipeline

Every push to `main` runs through 3 quality gates:

```
Lint Python (flake8) → TypeScript Build → Pytest → Playwright E2E
```

Secrets required in GitHub: `GOOGLE_API_KEY`, `SARVAM_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`

---

## 📡 Core API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/analyze/upload?language=en` | Main PDF analysis (high-risk clauses + translation) |
| `POST` | `/analyze/compliance/audit` | Mathematical risk scoring for compliance officers |
| `POST` | `/analyze/compliance/sandbox` | Live risk velocity for draft text |
| `GET` | `/analyze/dpo/logs` | Recent DPO audit log stream |
| `GET` | `/audit/summary` | Real-time compliance dashboard stats |

---

## 🎨 Brand

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Blue | `#022549` | Primary background |
| Vibrant Orange | `#FC5923` | CTA / highlights |
| Slate Grey | `#394A53` | Secondary text |

**Typography**: Playfair Display (headings) · Inter (body)

---

## 📄 License

This project is for educational and demonstration purposes.
