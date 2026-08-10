.PHONY: up down migrate seed test lint
up:
	docker compose up --build
down:
	docker compose down
migrate:
	docker compose exec api alembic upgrade head
seed:
	docker compose exec api python -m app.seed
test:
	docker compose exec api pytest
lint:
	docker compose exec api ruff check app tests

