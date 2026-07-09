# Production deploy on the server (run in /srv/apps/biblestdy)
deploy:
	git pull
	pnpm install --frozen-lockfile
	pnpm --filter @biblestdy/shared build
	pnpm --filter @biblestdy/web build
	docker compose up -d --build
	@echo "deployed — SPA: apps/web/build/client (served by infra caddy), API: biblestdy-api"

logs:
	docker logs -f --tail 100 biblestdy-api
