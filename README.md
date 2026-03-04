# AVAGAMYA

**Don't Sign What You Don't Understand** — AI-driven verification for accessible governance, analytics, and management of yield accuracy.

## Stack

- **Vite** + **React** (TypeScript)
- **Tailwind CSS** (brand colors, Playfair Display + Inter)
- **React Router** + **Lucide React** icons

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
npm run preview   # preview production build
```

## Logo

The header uses an inline SVG logo. To use your own image instead, place it at `public/logo.png` and update `src/components/Navbar.tsx` to render `<img src="/logo.png" alt="AVAGAMYA" />` in place of the `<Logo />` component.

## Pages

- **Home** — Hero, “Start Free Analysis” CTA, Risk Heatmap / Native Translation / Impact Simulator cards
- **About** — Mission (“Decoding the fine print”), The Why (Problem / Solution / Impact)
- **How it Works** — 4-step stepper + browser mockup with “Scanning Document…” at 16%
- **FAQs** — Accordion (incl. “Is my personal data safe?” Fail-Fast PII Gate), Contact Support CTA
## Backend: Symbolic Analysis Engine

The backend now includes a **deterministic rule-based Symbolic Analysis Engine** for intelligent document analysis:

### Features
- 📊 4-phase processing pipeline (Segmentation → Jargon Detection → Complexity Scoring → Risk Classification)
- 🔐 PII security gate (fails fast before analysis)
- 💡 Deterministic scoring (no AI/ML, fully explainable)
- 🎯 Risk classification (Low/Medium/High)
- 📋 Clause-by-clause analysis with detected jargon

### Quick Start
```bash
# Install dependency
pip install textstat

# Verify installation
python verify_symbolic_engine.py

# Start backend
python -m uvicorn main:app --reload
```

### API Endpoint
```
POST /analyze/upload?language=en
Content-Type: multipart/form-data
Body: file=@policy.pdf

Response:
{
  "status": "ANALYSIS_COMPLETE",
  "total_clauses": 48,
  "high_risk_count": 12,
  "average_complexity": 58.3,
  "analysis": [...]
}
```

### Documentation
- 📖 **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** — Start here for navigation
- 🚀 **[DELIVERY_SUMMARY.md](DELIVERY_SUMMARY.md)** — Executive overview
- 🔌 **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** — API specs & code examples
- 🏗️ **[ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md)** — System design
- 📚 **[SYMBOLIC_ENGINE_DOCUMENTATION.md](SYMBOLIC_ENGINE_DOCUMENTATION.md)** — Technical reference
- 🚢 **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** — How to deploy

### Status
✅ **Production Ready** (v1.0)

For more details: See [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)
## Brand

- **#022549** Deep Blue  
- **#FC5923** Vibrant Orange  
- **#394A53** Slate Grey  
- **#FFFFFF** Pure White  

Typography: **Playfair Display** (headings), **Inter** (body).
