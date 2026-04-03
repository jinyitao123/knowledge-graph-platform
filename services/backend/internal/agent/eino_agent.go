package agent

import (
	"context"
	"errors"
	"io"

	"github.com/rs/zerolog/log"

	"github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/components/tool"
	toolutils "github.com/cloudwego/eino/components/tool/utils"
	"github.com/cloudwego/eino/compose"
	"github.com/cloudwego/eino/schema"

	openaimodel "github.com/cloudwego/eino-ext/components/model/openai"

	"github.com/your-org/knowledge-graph-platform/backend/internal/graphiti"
)

// OntologyContextFn returns ontology context text for a given ontology ID.
type OntologyContextFn func(ctx context.Context, ontologyID string) (string, error)

// EinoAgent implements the Agent interface using Eino ADK with DeepSeek LLM.
type EinoAgent struct {
	runner         *adk.Runner
	getOntologyCtx OntologyContextFn
}

// EinoAgentConfig holds the configuration for creating an EinoAgent.
type EinoAgentConfig struct {
	APIKey           string
	BaseURL          string
	Model            string
	GraphitiClient   *graphiti.Client
	GetOntologyCtx   OntologyContextFn
}

// NewEinoAgent creates a real Eino-based agent backed by DeepSeek.
func NewEinoAgent(ctx context.Context, cfg EinoAgentConfig) (*EinoAgent, error) {
	// 1. Create DeepSeek ChatModel via Eino's OpenAI-compatible model
	chatModel, err := openaimodel.NewChatModel(ctx, &openaimodel.ChatModelConfig{
		APIKey:  cfg.APIKey,
		BaseURL: cfg.BaseURL,
		Model:   cfg.Model,
	})
	if err != nil {
		return nil, err
	}

	// 2. Create tools
	var tools []tool.BaseTool

	graphSearchTool, err := toolutils.InferTool(
		"graph_search",
		"Search the knowledge graph for entities, relations, and facts. Use this to find information from uploaded documents.",
		NewGraphSearchFunc(cfg.GraphitiClient),
	)
	if err != nil {
		return nil, err
	}
	tools = append(tools, graphSearchTool)

	docStatusTool, err := toolutils.InferTool(
		"document_status",
		"Check the processing status of an uploaded document.",
		NewDocStatusFunc(""),
	)
	if err != nil {
		return nil, err
	}
	tools = append(tools, docStatusTool)

	// 3. Create agent
	agent, err := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
		Name:        "kg-assistant",
		Description: "Knowledge Graph Platform assistant that helps users explore and query their knowledge graphs",
		Instruction: `You are a knowledge graph assistant. Your job is to answer questions ONLY based on facts stored in the knowledge graph.

CRITICAL RULES:
1. You MUST call the graph_search tool FIRST for EVERY user question. NEVER answer from your own knowledge.
2. Search results show entity relationships in format: "EntityA -[RELATION]-> EntityB | evidence"
3. Base your answer ONLY on the search results. Quote specific entities and relations.
4. If search returns no results, say "I couldn't find relevant information in the knowledge graph" and suggest the user upload relevant documents.
5. Be concise. Cite evidence from the graph.

Always respond in the same language as the user's query.`,
		Model: chatModel,
		ToolsConfig: adk.ToolsConfig{
			ToolsNodeConfig: compose.ToolsNodeConfig{
				Tools: tools,
			},
		},
		MaxIterations: 10,
	})
	if err != nil {
		return nil, err
	}

	// 4. Create runner with streaming enabled
	runner := adk.NewRunner(ctx, adk.RunnerConfig{
		Agent:          agent,
		EnableStreaming: true,
	})

	log.Info().Str("model", cfg.Model).Str("base_url", cfg.BaseURL).Msg("eino agent initialized")

	return &EinoAgent{runner: runner, getOntologyCtx: cfg.GetOntologyCtx}, nil
}

// Chat implements the Agent interface — processes a message and returns streaming events.
func (e *EinoAgent) Chat(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error) {
	ch := make(chan ChatEvent, 64)

	go func() {
		defer close(ch)

		// Build messages with ontology context
		var messages []adk.Message
		if e.getOntologyCtx != nil && req.OntologyID != "" {
			ontCtx, err := e.getOntologyCtx(ctx, req.OntologyID)
			if err == nil && ontCtx != "" {
				messages = append(messages, schema.SystemMessage(
					"Here is the current ontology definition for context:\n\n"+ontCtx+
						"\n\nUse this to understand the entity types and relations when searching the knowledge graph.",
				))
			}
		}
		messages = append(messages, schema.UserMessage(req.Message))

		iter := e.runner.Run(ctx, messages)

		for {
			event, ok := iter.Next()
			if !ok {
				break
			}

			if event.Err != nil {
				ch <- ChatEvent{Type: "error", Content: event.Err.Error()}
				continue
			}

			if event.Output != nil && event.Output.MessageOutput != nil {
				msgOut := event.Output.MessageOutput
				if msgOut.IsStreaming && msgOut.MessageStream != nil {
					// Stream chunks
					for {
						chunk, err := msgOut.MessageStream.Recv()
						if errors.Is(err, io.EOF) {
							break
						}
						if err != nil {
							ch <- ChatEvent{Type: "error", Content: err.Error()}
							break
						}
						content := chunk.Content
						if content != "" {
							ch <- ChatEvent{Type: "token", Content: content}
						}
						// Handle tool calls in streamed messages
						for _, tc := range chunk.ToolCalls {
							ch <- ChatEvent{
								Type:    "tool_call",
								Content: tc.Function.Name,
								Data:    tc.Function.Arguments,
							}
						}
					}
				} else if !msgOut.IsStreaming {
					// Non-streaming message
					msg := msgOut.Message
					content := msg.Content
					if content != "" {
						ch <- ChatEvent{Type: "token", Content: content}
					}
					for _, tc := range msg.ToolCalls {
						ch <- ChatEvent{
							Type:    "tool_call",
							Content: tc.Function.Name,
							Data:    tc.Function.Arguments,
						}
					}
				}

				// Handle tool role messages as tool_result
				if msgOut.Role == schema.Tool {
					ch <- ChatEvent{
						Type:    "tool_result",
						Content: msgOut.ToolName,
					}
				}
			}
		}

		ch <- ChatEvent{Type: "done", Content: ""}
	}()

	return ch, nil
}

// StubAgent is a fallback agent when Eino initialization fails.
type StubAgent struct{}

func NewStubAgent() *StubAgent {
	return &StubAgent{}
}

func (s *StubAgent) Chat(ctx context.Context, req ChatRequest) (<-chan ChatEvent, error) {
	ch := make(chan ChatEvent, 4)
	go func() {
		defer close(ch)
		ch <- ChatEvent{
			Type:    "token",
			Content: "Agent initialization failed. Please check LLM_API_KEY configuration.",
		}
		ch <- ChatEvent{Type: "done", Content: ""}
	}()
	return ch, nil
}
