#!/usr/bin/env bash
set -euo pipefail

# End-to-end test script for the Knowledge Graph Platform.
# Requires all services running (docker compose up).

BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
GRAPHITI_URL="${GRAPHITI_URL:-http://localhost:8100}"

echo "=== E2E Test Suite ==="

# 1. Health checks
echo ""
echo "--- Step 1: Health Checks ---"
echo -n "  Go Backend: "
curl -sf "${BACKEND_URL}/health" | jq -r .status
echo -n "  Graphiti Service: "
curl -sf "${GRAPHITI_URL}/health" | jq -r .status

# 2. Create ontology
echo ""
echo "--- Step 2: Create Ontology ---"
ONTOLOGY=$(curl -sf -X POST "${BACKEND_URL}/api/v1/ontologies" \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Test Ontology", "description": "Created by e2e test"}')
OID=$(echo "$ONTOLOGY" | jq -r .id)
echo "  Ontology ID: ${OID}"

# 3. Add entity types
echo ""
echo "--- Step 3: Add Entity Types ---"
curl -sf -X POST "${BACKEND_URL}/api/v1/ontologies/${OID}/entity-types" \
  -H "Content-Type: application/json" \
  -d '{"types": [
    {"name": "Person", "description": "A human individual"},
    {"name": "Company", "description": "A business organization"}
  ]}' | jq .
echo "  Entity types added"

# 4. Upload a test document
echo ""
echo "--- Step 4: Upload Document ---"
# Create a simple test document
echo "John Smith founded Acme Corp in 2020. Acme Corp raised \$10M in Series A from Sequoia Capital. Jane Doe joined as CTO in 2021." > /tmp/e2e-test-doc.txt
UPLOAD=$(curl -sf -X POST "${BACKEND_URL}/api/v1/documents/upload" \
  -F "file=@/tmp/e2e-test-doc.txt" \
  -F "ontology_id=${OID}")
DOC_ID=$(echo "$UPLOAD" | jq -r .document_id)
JOB_ID=$(echo "$UPLOAD" | jq -r .job_id)
echo "  Document ID: ${DOC_ID}"
echo "  Job ID: ${JOB_ID}"

# 5. Wait for processing
echo ""
echo "--- Step 5: Wait for Processing ---"
for i in $(seq 1 30); do
  STATUS=$(curl -sf "${BACKEND_URL}/api/v1/documents/${DOC_ID}/status" | jq -r .status)
  echo "  Attempt ${i}: status=${STATUS}"
  if [ "$STATUS" = "completed" ]; then
    echo "  Processing completed!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "  Processing FAILED"
    exit 1
  fi
  sleep 2
done

# 6. Search the graph
echo ""
echo "--- Step 6: Search Graph ---"
curl -sf "${BACKEND_URL}/api/v1/graph/search?q=Acme+Corp&ontology_id=${OID}" | jq .

# 7. Chat / QA
echo ""
echo "--- Step 7: Chat ---"
curl -sf -N -X POST "${BACKEND_URL}/api/v1/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Who founded Acme Corp?\", \"ontology_id\": \"${OID}\"}" &
CHAT_PID=$!
sleep 5
kill $CHAT_PID 2>/dev/null || true

# 8. Cleanup
echo ""
echo "--- Step 8: Cleanup ---"
curl -sf -X DELETE "${BACKEND_URL}/api/v1/ontologies/${OID}" | jq .
rm -f /tmp/e2e-test-doc.txt

echo ""
echo "=== E2E Test Complete ==="
