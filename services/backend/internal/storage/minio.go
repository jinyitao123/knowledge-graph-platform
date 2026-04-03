package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/zerolog/log"
)

type MinIO struct {
	Client *minio.Client
	Bucket string
}

func NewMinIO(ctx context.Context, endpoint, accessKey, secretKey, bucket string) (*MinIO, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		return nil, fmt.Errorf("storage.NewMinIO: %w", err)
	}

	log.Info().Str("bucket", bucket).Msg("minio connected")
	return &MinIO{Client: client, Bucket: bucket}, nil
}

func (m *MinIO) Upload(ctx context.Context, objectName string, reader io.Reader, size int64, contentType string) error {
	_, err := m.Client.PutObject(ctx, m.Bucket, objectName, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("storage.MinIO.Upload: %w", err)
	}
	return nil
}

func (m *MinIO) Download(ctx context.Context, objectName string) (io.ReadCloser, error) {
	obj, err := m.Client.GetObject(ctx, m.Bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("storage.MinIO.Download: %w", err)
	}
	return obj, nil
}
