.PHONY: build test clean install

# Build the claudeman-tools binary for the current platform
build:
	@mkdir -p lib/bin
	go build -o lib/bin/claudeman-tools ./cmd/claudeman-tools

# Run all tests
test:
	go test ./... -v

# Run tests with coverage
test-cover:
	go test ./... -cover

# Clean build artifacts
clean:
	rm -rf lib/bin/claudeman-tools

# Build for Linux (for container use)
build-linux-amd64:
	@mkdir -p lib/bin
	GOOS=linux GOARCH=amd64 go build -o lib/bin/claudeman-tools-linux-amd64 ./cmd/claudeman-tools

build-linux-arm64:
	@mkdir -p lib/bin
	GOOS=linux GOARCH=arm64 go build -o lib/bin/claudeman-tools-linux-arm64 ./cmd/claudeman-tools

# Build for macOS (for host listener, future use)
build-darwin-amd64:
	@mkdir -p lib/bin
	GOOS=darwin GOARCH=amd64 go build -o lib/bin/claudeman-tools-darwin-amd64 ./cmd/claudeman-tools

build-darwin-arm64:
	@mkdir -p lib/bin
	GOOS=darwin GOARCH=arm64 go build -o lib/bin/claudeman-tools-darwin-arm64 ./cmd/claudeman-tools

# Build all platforms
build-all: build-linux-amd64 build-linux-arm64 build-darwin-amd64 build-darwin-arm64
