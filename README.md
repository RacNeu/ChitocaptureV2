# ChitoCapture V2

**A factory decarbonisation platform that puts engineers and sustainability teams on one shared plan: measure emissions per asset, choose reductions by cost per tonne, deliver them, and verify the result.**

> Built on the original [ChitoCapture](https://github.com/lovenialaw/chitocapture) prototype. That repository is unchanged; this repository continues the work.

> **Prototype notice:** No live plant sensors or production database are connected. Demo assets, factors, prices and measure estimates are illustrative assumptions, not verified company data or engineering advice.

## The problem we solve

In most factories, the people who **report** carbon and the people who can **reduce** it work in different tools:

| Sustainability team | Engineering team |
|---|---|
| Knows the emissions inventory, targets and reporting rules | Knows the equipment, operating data and what can actually change |
| Works in spreadsheets and annual reports | Works in maintenance systems, SCADA and project lists |
| Needs tonnes of CO₂e that will survive an audit | Needs a business case: capex, payback and downtime |

Reduction ideas fall through the gap between them. ChitoCapture V2 gives both teams **one shared object, the reduction project**, and a workflow that turns a hotspot into verified tonnes.

## How it works: Measure → Find → Decide → Deliver → Verify

1. **Measure.** In the *Carbon Footprint Calculator*, sustainability builds an auditable inventory (scopes, factors, sources). In the *Action Hub*, engineering registers the **assets** that cause those emissions (kilns, boilers, fans, compressors, chillers…), with an owner and a data-quality flag for each.
2. **Find.** *Emission Hotspots* ranks the largest sources. The Action Hub's **Opportunities** tab matches every asset against a library of reduction measures and ranks them by estimated net abatement.
3. **Decide.** The **marginal abatement cost curve (MACC)** orders projects from the cheapest to the most expensive per tonne and shows how far they go toward the target. This gives management, finance, engineering and sustainability a common language.
4. **Deliver.** A project board moves each project through *Idea → Assessed → Approved → In progress → Verifying → Verified*. Each role can only take the steps it owns: engineering assesses and delivers, sustainability approves and verifies, and management approves. Every project has a discussion thread, an engineering checklist and a target date.
5. **Verify.** A project only counts as *Verified* once a **measured** net result and its measurement basis are recorded. Verified tonnes replace the estimate in the progress-to-target figures.

### Net, not gross

Every project is calculated as **net abatement = savings − the measure's own energy penalty**, using the site's grid and fuel factors. A measure that uses more energy-related CO₂e than it removes is flagged instead of being counted. This matters most for carbon capture, which is why capture now appears as **one option in the MACC**, compared fairly against efficiency, heat recovery, fuel switching and process change.

## Pages

| Area | Page | Who it's for |
|---|---|---|
| Organisation carbon | Carbon Dashboard, Carbon Footprint Calculator, Emission Hotspots | Sustainability |
| **Reduce & verify** | **Action Hub**: plan and target, MACC, project board, opportunities, asset register, factors and prices | **Sustainability, engineering and management** |
| Capture technology | Scenario Analysis, Process Monitoring (3D plant), Carbon Flow, Capture Summary | Process engineering |
| Data & reporting | Data & Sources, Reports (with MRV-oriented PDF) | Sustainability and auditors |

## Roadmap: from prototype to an app every factory can use

- **Connect real data:** import meter readings from CSV, then add connectors for Modbus/OPC UA meters, an MQTT gateway or the utility bill, so asset baselines are metered rather than estimated.
- **Automatic measurement and verification:** compare post-project meter data against a production-normalised baseline (IPMVP-style regression) and suggest the verified tonnes.
- **Live capture rig:** a benchtop sorbent column with CO₂ sensors on an ESP32, streaming a breakthrough curve so sorbent capacity is *measured* rather than assumed. See [`docs/REVIEW_AND_PLAN.md`](docs/REVIEW_AND_PLAN.md).
- **Multi-user backend:** accounts, roles and a shared database to replace browser `localStorage`, plus notifications when a project needs your action.
- **Sector packs:** measure libraries for cement, palm-oil mills, food and beverage, electronics and textiles, with sourced default factors per country.
- **Reporting outputs:** map verified projects into common disclosure frameworks and the national reporting formats that apply to the user.

## How the numbers work

```text
Asset baseline (t/yr) = electricity MWh × grid factor + fuel GJ × fuel factor ÷ 1,000 + process CO₂
Gross abatement       = electricity saved × grid factor + fuel saved × fuel factor ÷ 1,000 + direct CO₂ avoided
Energy penalty        = added electricity × grid factor + added fuel × fuel factor ÷ 1,000
Net abatement         = gross − penalty
Annual net cost       = capex × CRF(discount rate, lifetime) + opex change − energy cost saving
Cost per tonne        = annual net cost ÷ net abatement   (negative = the project saves money)
```

Inventory calculations are unchanged from the original: `kg CO₂e = normalised activity × factor`, with GWP applied only to non-CO₂e gas factors.

Measure-library percentages, paybacks and costs are **indicative planning assumptions** for ranking first ideas. Every project shows the engineering checks needed before its estimate can be trusted.

## Run locally

Requirements: Node.js 22 and npm.

```bash
cd viewer
npm ci
npm test
npm run dev
```

Open the local URL Vite prints, usually `http://127.0.0.1:5173/`. The Action Hub is at `?page=action-hub`.

## Deployment

GitHub Actions tests and builds `viewer/` and deploys it to GitHub Pages on every push to `main` (see `.github/workflows/deploy-pages.yml`). In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The site is served under `/ChitecaptureV2/`.

## Project structure

```text
viewer/src/
├── components/   Shared UI and the 3D plant viewer
├── data/         Registries, demo data, the measure library and the Action Hub store
├── pages/        Dashboard pages, including ActionHubPage
├── simulation/   Inventory, capture and abatement calculations, with tests
└── types/        Shared TypeScript models
src/              Parametric CAD script for the capture-unit model
```

## Data and privacy

All edits are stored in the visitor's browser (`localStorage`) and are never sent anywhere. The bundled demo data is public with the repository, so do not commit confidential company information.

## Limitations

- Demo values, factors and prices are unverified placeholders. Replace them with site data and sourced factors before using any result.
- The capture model and CAD layout are not engineering design, safety review or a performance guarantee.
- Role permissions in the Action Hub are a workflow guide in a single-user browser app, not access control.
