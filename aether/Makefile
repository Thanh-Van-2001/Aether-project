# ═══════════════════════════════════════
#  Aether ✦ Makefile
# ═══════════════════════════════════════

.PHONY: install setup dev start test doctor clean docker help

# Default
help: ## Show this help
	@echo "✦ Aether — Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

install: ## Install dependencies
	npm install

setup: install ## Run interactive setup wizard
	node bin/aether.js onboard

dev: ## Start in dev mode (auto-reload)
	npm run dev

start: ## Start the gateway server
	node bin/aether.js gateway --verbose

chat: ## Start interactive CLI chat
	node bin/aether.js chat

test: ## Run test suite
	npm test

doctor: ## Check system health
	node bin/aether.js doctor

skills: ## List all skills
	node bin/aether.js skills --list

lint: ## Check JS syntax
	@find src bin -name '*.js' -exec node --check {} \; && echo "✓ All files OK"

clean: ## Remove workspace data and node_modules
	rm -rf node_modules
	rm -rf workspace/memory/*.db
	rm -rf workspace/memory/*.json
	rm -rf workspace/logs/*

reset: ## Factory reset (removes all data)
	rm -rf workspace/memory/*
	rm -rf workspace/skills/*
	rm -f .env
	@echo "✦ Reset complete. Run 'make setup' to reconfigure."

docker-build: ## Build Docker image
	docker build -t aether:latest .

docker-run: ## Run in Docker
	docker compose up -d
	@echo "✦ Aether running at http://localhost:18789"

docker-stop: ## Stop Docker container
	docker compose down

docker-logs: ## View Docker logs
	docker compose logs -f
