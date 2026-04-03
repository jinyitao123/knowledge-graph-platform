# Spare Parts Management Demo

A complete worked example using **Example Smart Factory** spare-parts data.

---

## What's Included

```
demo/
├── ontology/
│   └── spare-parts-ontology.yaml   ← Domain ontology (v2.0)
└── documents/
    ├── inventory-ledger.txt         ← March 2026 inventory snapshot
    ├── maintenance-records.txt      ← Q1 2026 fault & PM records
    └── monthly-report.txt          ← Monthly management report
```

## Domain Overview

The sample dataset represents a real-world **industrial spare-parts management** scenario:

| Concept | Example |
|---------|---------|
| Spare Part | Bearing 6205-2RS, Contactor LC1D25 |
| Equipment | B1 Main Motor (EQ-B1-MOT-001), B2 Fan |
| Warehouse | Main Warehouse (A), B1 Line Store |
| Inventory Position | Part × Warehouse, with qty / safety stock / value |
| Purchase Order | PO-2026-0089, PO-2026-0095 |
| Maintenance Event | Fault repair, preventive maintenance |

## Running the Demo

### 1. Start the platform

```bash
cd ..   # project root
cp .env.example .env
# Fill in OPENAI_API_KEY (or compatible endpoint)
docker compose up -d
```

### 2. Load the ontology

```bash
pip install httpx
python ../scripts/seed-ontology.py --file ontology/spare-parts-ontology.yaml
```

Or use the UI: open **http://localhost:5173** → Ontology Editor → Import YAML.

### 3. Upload documents

Upload all three files in `documents/` via the UI (Document Upload page)  
or via API:

```bash
for f in documents/*.txt; do
  curl -F "file=@$f" http://localhost:8080/api/v1/documents
done
```

The platform will parse each document, extract entities and relationships guided  
by the ontology, and build a temporal knowledge graph in Neo4j.

### 4. Explore and query

Open **http://localhost:5173** and try:

- **Graph Explorer** — visualise the spare-parts knowledge graph
- **Chat** — ask questions in natural language:
  - "哪些备件库存低于安全库存？" (Which parts are below safety stock?)
  - "B2线风机近3个月消耗了哪些备件？" (What parts did the B2 fan consume in Q1?)
  - "有哪些呆滞库存需要处理？" (Which items are flagged as stale inventory?)
  - "变频器ABB ACS580的维修历史？" (Repair history of the ABB ACS580 VFD?)

## Ontology Highlights

The `spare-parts-ontology.yaml` (v2.0) defines:

- **7 entity classes**: `inventory_position` (first citizen), `spare_part`, `equipment`, `warehouse`, `purchase_order`, `supplier`, `maintenance_event`
- **Derived attributes**: `safety_gap`, `available_qty`, `inventory_value`, `stale_age_days`
- **15 relationship types**: `consumes`, `belongs_to`, `supplies`, `triggers`, `records_consumption`, ...
- **12 semantic functions**: `check_safety_stock`, `recommend_reorder`, `identify_stale_inventory`, ...
- **KPI metrics**: turnover rate, stale ratio, warehouse health score, risk position count
