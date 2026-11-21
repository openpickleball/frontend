#!/usr/bin/env bash
# Starts the whole stack for local development:
#   Postgres and Valkey (the backend's compose.yaml), the Django dev server,
#   a Celery worker (prints account emails), and the app's dev server.
#
# Usage (from app/): pnpm dev:stack [--seed N]
#                    pnpm dev:stack --stop
#   --seed N   add N made-up players and mark example.* accounts verified.
#   --stop     stop a stack started in another terminal, the same as Ctrl+C.
#
# BACKEND_DIR is a backend checkout. A relative path resolves from the
# frontend repo root. The default is ../backend, next to this repo.
# Ctrl+C stops everything. Postgres and Valkey stop too, unless they were
# already running before the script started. Local data is kept.

set -euo pipefail

seed=""
stop=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--seed)
			seed="${2:-}"
			[[ "$seed" =~ ^[1-9][0-9]*$ ]] || { echo "--seed needs a positive number" >&2; exit 2; }
			shift 2
			;;
		--stop)
			stop=1
			shift
			;;
		-h | --help)
			sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "Unknown option: $1 (try --help)" >&2
			exit 2
			;;
	esac
done

# The running stack records its PID here, so --stop can find it.
pid_file="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/openpb-dev-stack.pid"
stack_pid() {
	local pid
	pid="$(cat "$pid_file" 2>/dev/null)" || return 1
	[[ "$pid" =~ ^[0-9]+$ ]] && ps -p "$pid" -o args= 2>/dev/null | grep -q 'dev-stack\.sh' && echo "$pid"
}

if [[ $stop -eq 1 ]]; then
	if ! pid="$(stack_pid)"; then
		rm -f "$pid_file"
		echo "No stack is running."
		exit 0
	fi
	echo "Stopping the stack (PID $pid)"
	kill -TERM "$pid"
	for _ in $(seq 60); do
		kill -0 "$pid" 2>/dev/null || { echo "Stopped."; exit 0; }
		sleep 0.5
	done
	echo "The stack did not stop within 30 seconds. Press Ctrl+C in its terminal." >&2
	exit 1
fi

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(dirname "$app_dir")"
backend_dir="${BACKEND_DIR:-../backend}"
[[ "$backend_dir" = /* ]] || backend_dir="$repo_root/$backend_dir"

say() { printf '\033[1m[stack]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[stack]\033[0m %s\n' "$*" >&2; exit 1; }

# Checks before anything starts.
if pid="$(stack_pid)"; then
	fail "A stack is already running (PID $pid). Stop it with: pnpm dev:stack --stop"
fi
[[ -f "$backend_dir/manage.py" ]] ||
	fail "No backend at $backend_dir. Clone it next to this repo, or set BACKEND_DIR to its path."
# Resolve symlinks, so Compose names the project after the real checkout,
# the same as running docker compose there.
backend_dir="$(cd "$backend_dir" && pwd -P)"
for tool in uv docker pnpm; do
	command -v "$tool" >/dev/null || fail "$tool is not installed. See app/README.md, Prerequisites."
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is missing (docker compose)."

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
for port in 8000 5173; do
	port_busy "$port" && fail "Port $port is already in use. Stop whatever is running there first."
done

# Backend settings: create .env on first run, pointed at this app.
if [[ ! -f "$backend_dir/.env" ]]; then
	say "Creating $backend_dir/.env from .env.example"
	sed 's|^FRONTEND_URL=.*|FRONTEND_URL=http://localhost:5173|' "$backend_dir/.env.example" >"$backend_dir/.env"
elif ! grep -qx 'FRONTEND_URL=http://localhost:5173' "$backend_dir/.env"; then
	say "Note: FRONTEND_URL in the backend .env is not http://localhost:5173, so email links open elsewhere."
fi

compose() { docker compose --project-directory "$backend_dir" "$@"; }

# Only stop the services on exit if this script started them.
stop_services=1
if [[ -n "$(compose ps -q --status running db cache 2>/dev/null)" ]]; then
	stop_services=0
else
	for port in 5432 6379; do
		if port_busy "$port"; then
			holder="$(docker ps --filter "publish=$port" --format '{{.Names}}' | head -n 1)"
			fail "Port $port is already in use${holder:+ by container $holder}. Stop it first (docker compose down in its checkout)."
		fi
	done
fi

pids=()
cleanup() {
	trap - EXIT INT TERM
	say "Stopping"
	for pid in "${pids[@]}"; do
		kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
	done
	wait 2>/dev/null || true
	if [[ $stop_services -eq 1 ]]; then
		say "Stopping Postgres and Valkey (data is kept)"
		compose stop db cache >/dev/null 2>&1 || true
	fi
	[[ "$(cat "$pid_file" 2>/dev/null)" == "$$" ]] && rm -f "$pid_file"
	say "Stopped"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
echo "$$" >"$pid_file"

say "Installing backend dependencies"
(cd "$backend_dir" && uv sync --quiet)

say "Starting Postgres and Valkey"
compose up -d --wait db cache

say "Running migrations"
(cd "$backend_dir" && uv run python manage.py migrate --no-input)

if [[ -n "$seed" ]]; then
	say "Adding $seed made-up players"
	(cd "$backend_dir" && uv run python manage.py seed_dev_data --players "$seed")
	say "Verifying example.* accounts (email, OPEN code, name; password made-up-test-password)"
	(cd "$backend_dir" && uv run python manage.py shell -c "
from allauth.account.models import EmailAddress
from apps.players.models import Player
for p in Player.objects.select_related('account').order_by('pk'):
    a = p.account
    if a.email.rsplit('@', 1)[-1] in ('example.com', 'example.org', 'example.net'):
        EmailAddress.objects.update_or_create(user=a, email=a.email, defaults={'verified': True, 'primary': True})
        print(a.email, p.public_code, p.display_name)
")
fi

if [[ ! -d "$app_dir/node_modules" ]]; then
	say "Installing app dependencies"
	(cd "$app_dir" && pnpm install)
fi

# Runs a command in its own process group, with each line prefixed.
start() {
	local name="$1" dir="$2"
	shift 2
	(
		cd "$dir"
		exec "$@" 2>&1 | while IFS= read -r line; do printf '\033[2m%-7s|\033[0m %s\n' "$name" "$line"; done
	) &
	pids+=("$!")
}

set -m # give each background job its own process group, so cleanup gets them all
start backend "$backend_dir" uv run python manage.py runserver 127.0.0.1:8000
start worker "$backend_dir" uv run celery -A config worker -Q ratings,email,webhooks,default -l info
start app "$app_dir" env PUBLIC_API_MOCK=off pnpm dev --port 5173 --strictPort
set +m

say "App:     http://localhost:5173"
say "Backend: http://127.0.0.1:8000/api/v1/health/live"
say "Press Ctrl+C to stop."

# Stop everything as soon as one process exits.
wait -n "${pids[@]}" || true
say "A process exited, shutting down"
