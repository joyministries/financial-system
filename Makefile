.PHONY: help install lint format typecheck test test-cov run run-worker run-beat db-migrate db-upgrade db-stale docker-up docker-down docker-logs docker-restart docker-ps docker-clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	pip install -e ".[dev]"
	cd frontend && npm install

lint: ## Run linting
	ruff check app/ tests/
	cd frontend && npm run lint

format: ## Format code
	ruff format app/ tests/
	cd frontend && npm run format

typecheck: ## Run type checking
	mypy app/
	cd frontend && npm run typecheck

test: ## Run tests
	pytest tests/ -v

test-cov: ## Run tests with coverage
	pytest tests/ -v --cov=app --cov-report=term-missing

run: ## Run FastAPI server
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

run-worker: ## Run Celery worker
	celery -A app.tasks worker -l info

run-beat: ## Run Celery beat scheduler
	celery -A app.tasks beat -l info

db-migrate: ## Generate migration (usage: make db-migrate msg="description")
	alembic revision --autogenerate -m "$(msg)"

db-upgrade: ## Apply migrations
	alembic upgrade head

db-stale: ## Check for pending model changes
	alembic check

docker-up: ## Start services
	docker compose up -d

docker-down: ## Stop services
	docker compose down

docker-logs: ## View logs
	docker compose logs -f

docker-restart: ## Restart services
	docker compose restart

docker-ps: ## List running services
	docker compose ps

docker-clean: ## Remove all containers, volumes, networks
	docker compose down -v --remove-orphans
