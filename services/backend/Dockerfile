FROM golang:1.25-alpine AS builder

WORKDIR /app
RUN apk add --no-cache curl git

COPY go.mod go.sum ./
ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /backend ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates curl
COPY --from=builder /backend /backend
EXPOSE 8080
ENTRYPOINT ["/backend"]
