# Production deploy on the server (run in /srv/apps/biblestdy)
deploy:
	git pull
	pnpm install --frozen-lockfile
	pnpm --filter @biblestdy/shared build
	pnpm --filter @biblestdy/web build
	docker compose up -d --build
	@# The same build goes to the app over the air, dev channel (#19, docs/MOBILE.md).
	@# If this fails the web deploy above is still live; fix and run `make ota-publish`.
	-node apps/mobile/scripts/ota.mjs publish --channel dev
	@echo "deployed — SPA: apps/web/build/client (served by infra caddy), API: biblestdy-api, app: OTA dev"

# OTA (#19) — operator steps in docs/MOBILE.md "Over-the-air updates"
ota-status:
	node apps/mobile/scripts/ota.mjs status

# Re-publish the current web build to dev (after a failed publish in deploy)
ota-publish:
	node apps/mobile/scripts/ota.mjs publish --channel dev

# dev -> stable (friends). VERSION=<v> promotes an earlier dev bundle
ota-promote:
	node apps/mobile/scripts/ota.mjs promote $(if $(VERSION),--version $(VERSION))

# CHANNEL=dev|stable, back one bundle; TO=<v> picks one it served
ota-rollback:
	@test -n "$(CHANNEL)" || { echo "usage: make ota-rollback CHANNEL=dev|stable [TO=<version>]"; exit 1; }
	node apps/mobile/scripts/ota.mjs rollback --channel $(CHANNEL) $(if $(TO),--to $(TO))

.PHONY: deploy logs ota-status ota-publish ota-promote ota-rollback

logs:
	docker logs -f --tail 100 biblestdy-api
