#!/usr/bin/env bash
set -euo pipefail
release_dir="$(realpath "$1")"
work="$(mktemp -d)"
export OCR_STATE="$work/state"
export COMPOSE_PROJECT_NAME=v2ocr_smoke
mkdir -p "$OCR_STATE/local" "$work/runtime"
compose() {
  docker compose --env-file "$OCR_STATE/local/.env" -f "$work/runtime/compose.yml" "$@"
}
cleanup() {
  if [[ -f "$OCR_STATE/local/.env" ]]; then
    compose down -v --remove-orphans || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

python3 - "$release_dir" "$work" <<'PY'
import base64
import hashlib
import json
from pathlib import Path
import shutil
import sys

release, work = map(Path, sys.argv[1:])
manifest = json.loads(base64.b64decode(json.loads((release / "manifest.json").read_text())["payload"]))
for name in ("runtime", "images"):
    with (work / f"{name}.tar.gz").open("wb") as output:
        for part in manifest["archives"][name]["parts"]:
            source = release / part["key"]
            with source.open("rb") as stream:
                assert hashlib.file_digest(stream, "sha256").hexdigest() == part["sha256"]
                stream.seek(0)
                shutil.copyfileobj(stream, output)
PY

tar -xf "$work/runtime.tar.gz" -C "$work/runtime"
docker load -i "$work/images.tar.gz"
helper="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["helper"])' "$work/runtime/images.json")"
docker run --rm --network none --pull never -e OCR_OFFLINE_INSTALL=1 \
  -v "$OCR_STATE:/projet" -v "$work/runtime/assistant:/projet/local/assistant:ro" \
  "$helper" node /projet/local/assistant/assistant.mjs init
compose config --quiet
compose up -d --no-build --pull never --wait --wait-timeout 300
curl --noproxy '*' --fail --silent --show-error --retry 12 --retry-all-errors http://localhost:3000/auth/login > "$work/login.html"
# shellcheck source=/dev/null
source "$OCR_STATE/local/.env"
api() {
  curl --noproxy '*' --fail-with-body --silent --show-error "$@"
}
email=offline-smoke@example.test
password='Smoketest_Password83!'
api -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true}" \
  http://localhost:8000/auth/v1/admin/users > "$work/user.json"
api -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H 'Content-Type: application/json' \
  -d '{"id":"smoke","name":"smoke","public":false}' http://localhost:8000/storage/v1/bucket > /dev/null
api -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H 'Content-Type: application/octet-stream' \
  --data-binary 'test de persistance' http://localhost:8000/storage/v1/object/smoke/fixture.txt > /dev/null
check_auth_and_storage() {
  api -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    'http://localhost:8000/auth/v1/token?grant_type=password' > "$work/session.json"
  python3 - "$work/session.json" <<'PY'
import json
import sys
assert json.load(open(sys.argv[1]))["access_token"]
PY
  test "$(api -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    http://localhost:8000/storage/v1/object/authenticated/smoke/fixture.txt)" = 'test de persistance'
}
check_auth_and_storage
compose stop
compose up -d --no-build --pull never --wait --wait-timeout 300
check_auth_and_storage
