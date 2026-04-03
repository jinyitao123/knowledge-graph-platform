package agent

import (
	"context"
	"fmt"
	"strings"

	"github.com/your-org/knowledge-graph-platform/backend/internal/graphiti"
)

// GraphSearchInput is the input schema for the graph search tool.
type GraphSearchInput struct {
	Query      string `json:"query" jsonschema:"description=The search query to find entities and relations in the knowledge graph. ALWAYS use this tool before answering any factual question."`
	OntologyID string `json:"ontology_id,omitempty" jsonschema:"description=Optional ontology ID to filter results"`
}

// GraphSearchOutput is the output of the graph search tool.
type GraphSearchOutput struct {
	Results string `json:"results"`
	Count   int    `json:"count"`
	Edges   string `json:"edges"`
}

// NewGraphSearchFunc returns a function that searches the knowledge graph via the Graphiti service.
func NewGraphSearchFunc(client *graphiti.Client) func(ctx context.Context, input GraphSearchInput) (GraphSearchOutput, error) {
	return func(ctx context.Context, input GraphSearchInput) (GraphSearchOutput, error) {
		resp, err := client.Search(ctx, &graphiti.SearchRequest{
			Query:      input.Query,
			OntologyID: input.OntologyID,
			TopK:       10,
		})
		if err != nil {
			return GraphSearchOutput{}, fmt.Errorf("graph search failed: %w", err)
		}

		// Human-readable for LLM
		var lines []string
		for i, r := range resp.Results {
			srcName := fmt.Sprint(r.Entity["source_name"])
			tgtName := fmt.Sprint(r.Entity["target_name"])
			relation := fmt.Sprint(r.Entity["relation"])
			evidence := r.Evidence
			line := fmt.Sprintf("%d. %s -[%s]-> %s | %s", i+1, srcName, relation, tgtName, evidence)
			lines = append(lines, line)
		}

		result := "No results found in the knowledge graph."
		if len(lines) > 0 {
			result = strings.Join(lines, "\n")
		}

		// UUID-based edges for graph highlighting (parseable by frontend)
		var edgeParts []string
		for _, r := range resp.Results {
			srcID := fmt.Sprint(r.Entity["source_id"])
			tgtID := fmt.Sprint(r.Entity["target_id"])
			srcName := fmt.Sprint(r.Entity["source_name"])
			tgtName := fmt.Sprint(r.Entity["target_name"])
			relation := fmt.Sprint(r.Entity["relation"])
			edgeParts = append(edgeParts, fmt.Sprintf("%s|%s|%s|%s|%s", srcID, tgtID, relation, srcName, tgtName))
		}
		edgesStr := strings.Join(edgeParts, ";")

		return GraphSearchOutput{
			Results: result,
			Count:   len(resp.Results),
			Edges:   edgesStr,
		}, nil
	}
}

// DocStatusInput is the input schema for checking document processing status.
type DocStatusInput struct {
	DocumentID string `json:"document_id" jsonschema:"description=The document ID to check processing status for"`
}

// DocStatusOutput is the output of the document status tool.
type DocStatusOutput struct {
	Status   string `json:"status"`
	Progress int    `json:"progress"`
}

// NewDocStatusFunc returns a function that checks document processing status.
func NewDocStatusFunc(graphitiURL string) func(ctx context.Context, input DocStatusInput) (DocStatusOutput, error) {
	return func(ctx context.Context, input DocStatusInput) (DocStatusOutput, error) {
		return DocStatusOutput{
			Status:   "unknown",
			Progress: 0,
		}, nil
	}
}
