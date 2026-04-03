package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/your-org/knowledge-graph-platform/backend/internal/agent"
	"github.com/your-org/knowledge-graph-platform/backend/internal/config"
	"github.com/your-org/knowledge-graph-platform/backend/internal/graphiti"
	"github.com/your-org/knowledge-graph-platform/backend/internal/handler"
	"github.com/your-org/knowledge-graph-platform/backend/internal/middleware"
	"github.com/your-org/knowledge-graph-platform/backend/internal/ontology"
	"github.com/your-org/knowledge-graph-platform/backend/internal/storage"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg := config.Load()
	ctx := context.Background()

	// Connect to PostgreSQL
	pg, err := storage.NewPostgres(ctx, cfg.PostgresURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to postgresql")
	}
	defer pg.Close()

	// Run migrations
	if err := pg.RunMigrations(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to run migrations")
	}

	// Connect to Redis
	rdb, err := storage.NewRedis(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to redis")
	}
	defer rdb.Close()

	// Connect to MinIO
	mio, err := storage.NewMinIO(ctx, cfg.MinioEndpoint, cfg.MinioAccessKey, cfg.MinioSecretKey, cfg.MinioBucket)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to minio")
	}

	// Graphiti client (Python service)
	graphitiClient := graphiti.NewClient(cfg.GraphitiServiceURL)

	// Agent — try real Eino agent, fall back to stub
	var chatAgent agent.Agent
	if cfg.LLMAPIKey != "" {
		// Ontology context provider for agent
		ontImporter := ontology.NewImporter(pg, graphitiClient)

		einoAgent, err := agent.NewEinoAgent(ctx, agent.EinoAgentConfig{
			APIKey:         cfg.LLMAPIKey,
			BaseURL:        cfg.LLMBaseURL,
			Model:          cfg.LLMModel,
			GraphitiClient: graphitiClient,
			GetOntologyCtx: ontImporter.GetOntologyContext,
		})
		if err != nil {
			log.Error().Err(err).Msg("failed to initialize eino agent, falling back to stub")
			chatAgent = agent.NewStubAgent()
		} else {
			chatAgent = einoAgent
		}
	} else {
		log.Warn().Msg("LLM_API_KEY not set, using stub agent")
		chatAgent = agent.NewStubAgent()
	}

	// Handlers
	ontologyH := handler.NewOntologyHandler(pg, graphitiClient)
	documentH := handler.NewDocumentHandler(pg, mio, rdb)
	chatH := handler.NewChatHandler(chatAgent, pg)
	graphH := handler.NewGraphHandler(graphitiClient)

	// Routes
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"backend"}`))
	})

	// Ontology
	mux.HandleFunc("POST /api/v1/ontologies", ontologyH.Create)
	mux.HandleFunc("GET /api/v1/ontologies", ontologyH.List)
	mux.HandleFunc("GET /api/v1/ontologies/{id}", ontologyH.Get)
	mux.HandleFunc("PUT /api/v1/ontologies/{id}", ontologyH.Update)
	mux.HandleFunc("DELETE /api/v1/ontologies/{id}", ontologyH.Delete)
	mux.HandleFunc("POST /api/v1/ontologies/{id}/import", ontologyH.ImportYAML)
	mux.HandleFunc("POST /api/v1/ontologies/{id}/import-owl", ontologyH.ImportOWL)
	mux.HandleFunc("GET /api/v1/ontologies/{id}/entity-types", ontologyH.ListEntityTypes)
	mux.HandleFunc("GET /api/v1/ontologies/{id}/relation-types", ontologyH.ListRelationTypes)
	mux.HandleFunc("GET /api/v1/ontologies/{id}/context", ontologyH.GetOntologyContext)

	// Documents
	mux.HandleFunc("POST /api/v1/documents/upload", documentH.Upload)
	mux.HandleFunc("GET /api/v1/documents", documentH.List)
	mux.HandleFunc("GET /api/v1/documents/{id}/status", documentH.GetStatus)
	mux.HandleFunc("PUT /api/v1/documents/{id}/status", documentH.UpdateStatus)

	// Chat
	mux.HandleFunc("POST /api/v1/chat", chatH.HandleChat)
	mux.HandleFunc("GET /api/v1/chat/sessions", chatH.ListSessions)
	mux.HandleFunc("GET /api/v1/chat/sessions/{id}/messages", chatH.GetMessages)

	// Graph
	mux.HandleFunc("GET /api/v1/graph/search", graphH.Search)
	mux.HandleFunc("GET /api/v1/graph/subgraph/{entity_id}", graphH.GetSubgraph)
	mux.HandleFunc("GET /api/v1/graph/entity/{id}", graphH.GetEntity)
	mux.HandleFunc("GET /api/v1/graph/stats", graphH.Stats)
	mux.HandleFunc("GET /api/v1/graph/instances", graphH.InstanceGraph)

	// Middleware chain
	var h http.Handler = mux
	h = middleware.Logging(h)
	h = middleware.CORS(h)
	h = middleware.Recovery(h)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      h,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Info().Str("port", cfg.Port).Msg("backend server starting")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down server")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("server shutdown error")
	}
	log.Info().Msg("server stopped")
}
