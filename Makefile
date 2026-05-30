# YouTube Intelligence — Makefile
# Shortcuts that delegate to start.sh

.PHONY: run start stop logs setup reset help

run:       ## First run: install deps + start everything
	@chmod +x start.sh && ./start.sh run

start:     ## Start services (skip install)
	@chmod +x start.sh && ./start.sh start

stop:      ## Stop all services
	@chmod +x start.sh && ./start.sh stop

logs:      ## Tail live logs
	@chmod +x start.sh && ./start.sh logs

setup:     ## Install dependencies only (no start)
	@chmod +x start.sh && ./start.sh setup

reset:     ## Wipe database and restart fresh
	@chmod +x start.sh && ./start.sh reset

help:      ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
