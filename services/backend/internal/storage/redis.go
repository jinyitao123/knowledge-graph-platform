package storage

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

type Redis struct {
	Client *redis.Client
}

func NewRedis(ctx context.Context, redisURL string) (*Redis, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("storage.NewRedis: %w", err)
	}

	client := redis.NewClient(opts)
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("storage.NewRedis ping: %w", err)
	}

	log.Info().Msg("redis connected")
	return &Redis{Client: client}, nil
}

const IngestQueue = "kg:jobs:ingest"

func (r *Redis) PushJob(ctx context.Context, payload string) error {
	return r.Client.RPush(ctx, IngestQueue, payload).Err()
}

func (r *Redis) SetJobStatus(ctx context.Context, jobID string, status string) error {
	key := fmt.Sprintf("kg:jobs:status:%s", jobID)
	return r.Client.Set(ctx, key, status, 0).Err()
}

func (r *Redis) GetJobStatus(ctx context.Context, jobID string) (string, error) {
	key := fmt.Sprintf("kg:jobs:status:%s", jobID)
	return r.Client.Get(ctx, key).Result()
}

func (r *Redis) Close() error {
	return r.Client.Close()
}
