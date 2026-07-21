#!/bin/sh
set -eu
umask 077

incomplete_exit=3
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
script_hub_dir="$(dirname -- "$script_dir")"
script_repo_dir="$(dirname -- "$script_hub_dir")"
checks_file=""
temporary_body=""
temporary_response=""
temporary_hello=""
hub_instance_id=""
signing_key_fingerprint=""
granted_capabilities=""
actor_mode="${SKILLLOOM_ACCEPTANCE_ACTOR:-}"
output_ready=0

cleanup() {
  [ -z "$checks_file" ] || rm -f "$checks_file"
  [ -z "$temporary_body" ] || rm -f "$temporary_body"
  [ -z "$temporary_response" ] || rm -f "$temporary_response"
  [ -z "$temporary_hello" ] || rm -f "$temporary_hello"
}
trap cleanup EXIT HUP INT TERM

die() {
  echo "FAIL: $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "tool:$1" "$1 is required"
}

outside_source() {
  candidate="$1"
  [ -z "$source_root" ] && return 0
  case "$candidate" in
    "$source_root"|"$source_root"/*) return 1 ;;
    *) return 0 ;;
  esac
}

prepare_evidence() {
  evidence_input="${SKILLLOOM_ACCEPTANCE_EVIDENCE_DIR:-/tmp/skillloom-live-acceptance-$run_nonce}"
  case "$evidence_input" in
    /|.|..|*/.|*/..|*/) die "evidence output must name a dedicated directory without a trailing slash" ;;
  esac
  evidence_parent_input="$(dirname -- "$evidence_input")"
  [ -d "$evidence_parent_input" ] || die "evidence directory parent must exist"
  [ ! -L "$evidence_input" ] || die "evidence directory must not be a symlink"
  evidence_parent="$(CDPATH= cd -- "$evidence_parent_input" && pwd -P)" || die "evidence directory parent is unavailable"
  evidence_dir="$evidence_parent/$(basename -- "$evidence_input")"
  outside_source "$evidence_dir" || die "evidence directory must be outside tracked source"
  if [ ! -d "$evidence_dir" ]; then
    mkdir -m 700 "$evidence_dir" || die "could not create evidence directory"
  fi
  [ ! -L "$evidence_dir" ] || die "evidence directory must not be a symlink"
  chmod 700 "$evidence_dir" || die "could not secure evidence directory"
  evidence_dir="$(CDPATH= cd -- "$evidence_dir" && pwd -P)" || die "evidence directory is unavailable"
  outside_source "$evidence_dir" || die "evidence directory must be outside tracked source"

  case "$phase" in
    server) evidence_name="server.json" ;;
    actor) evidence_name="actor-$actor_mode.json" ;;
    aggregate) evidence_name="aggregate.json" ;;
  esac
  evidence_file="$evidence_dir/$evidence_name"
  [ ! -L "$evidence_file" ] || die "evidence output must not be a symlink"
  checks_file="$(mktemp "$evidence_dir/.checks.XXXXXX")" || die "could not create evidence staging file"
  chmod 600 "$checks_file"
  output_ready=1
}

record_check() {
  printf '%s\n' "$1" >> "$checks_file"
}

write_evidence() {
  status="$1"
  failed_check="$2"
  evidence_temp="$(mktemp "$evidence_dir/.evidence.XXXXXX")" || die "could not create evidence record"
  chmod 600 "$evidence_temp"
  node -e '
    const fs = require("node:fs");
    const [phase, actorMode, nonce, hubUrl, hubId, fingerprint, capabilities, status, failedCheck, checksPath] = process.argv.slice(1);
    const checks = fs.readFileSync(checksPath, "utf8").split("\n").filter(Boolean);
    const record = {
      schemaVersion: 1,
      phase,
      actorMode: actorMode || null,
      runNonce: nonce,
      hubUrl,
      hubInstanceId: hubId || null,
      signingKeyFingerprint: fingerprint || null,
      grantedCapabilities: capabilities ? capabilities.split(",") : [],
      status,
      checks,
      failedCheck: failedCheck || null,
      completedAt: new Date().toISOString()
    };
    process.stdout.write(`${JSON.stringify(record)}\n`);
  ' "$phase" "$actor_mode" "$run_nonce" "$hub_url" "$hub_instance_id" "$signing_key_fingerprint" "$granted_capabilities" "$status" "$failed_check" "$checks_file" > "$evidence_temp" \
    || die "could not serialize evidence"
  chmod 600 "$evidence_temp"
  mv -f "$evidence_temp" "$evidence_file"
  chmod 600 "$evidence_file"
}

fail() {
  failed_check="$1"
  echo "FAIL: $failed_check: $2" >&2
  if [ "$output_ready" = "1" ]; then
    write_evidence failed "$failed_check"
    echo "evidence: $evidence_file" >&2
  fi
  exit 1
}

finish_incomplete() {
  write_evidence complete ""
  echo "INCOMPLETE: phase $phase completed; aggregate all required phase evidence"
  echo "evidence: $evidence_file"
  exit "$incomplete_exit"
}

compose() {
  docker compose -f "$compose_file" --env-file "$env_file" "$@"
}

read_tailscale_identity() {
  compose exec -T tailscale tailscale status --json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const j=JSON.parse(s);const id=j.Self&&j.Self.ID;if(typeof id!=="string"||!id)process.exit(1);process.stdout.write(id)})'
}

read_hub_identity() {
  compose exec -T skillloom-hub node -e '
    const fs=require("node:fs");
    const id=fs.readFileSync("/data/runtime/hub-instance-id","utf8").trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))process.exit(1);
    process.stdout.write(id);
  ' 2>/dev/null
}

run_server_phase() {
  require_command docker
  require_command curl
  compose_file="${SKILLLOOM_COMPOSE_FILE:-$script_hub_dir/compose.yaml}"
  env_file="${SKILLLOOM_COMPOSE_ENV:-$script_hub_dir/.env}"
  [ -f "$compose_file" ] || fail "compose-file" "compose file is required on the Hub host"
  [ -f "$env_file" ] || fail "compose-env" "compose environment file is required on the Hub host"

  services="$(compose config --services)" || fail "compose-services" "could not inspect Compose services"
  expected_services="$(printf '%s\n' skillloom-hub tailscale | LC_ALL=C sort)"
  actual_services="$(printf '%s\n' "$services" | LC_ALL=C sort)"
  [ "$actual_services" = "$expected_services" ] || fail "compose-services" "expected only tailscale and skillloom-hub"
  record_check "compose-services"

  compose_config="$(compose config --no-interpolate)" || fail "compose-config" "could not render Compose configuration"
  printf '%s\n' "$compose_config" | grep -q 'network_mode: service:tailscale' \
    || fail "compose-network" "Hub must share the tailscale network namespace"
  record_check "compose-network"
  if printf '%s\n' "$compose_config" | grep -Eq '^[[:space:]]*(ports|expose):|published:'; then
    fail "compose-no-public-ports" "Compose publishes a backend port"
  fi
  record_check "compose-no-public-ports"

  running="$(compose ps --status running --services)" || fail "compose-running" "could not inspect running services"
  actual_running="$(printf '%s\n' "$running" | LC_ALL=C sort)"
  [ "$actual_running" = "$expected_services" ] || fail "compose-running" "both exact Compose services must be running"
  record_check "compose-running"

  serve_status="$(compose exec -T tailscale tailscale serve status)" || fail "serve-private" "could not inspect Tailscale Serve"
  printf '%s\n' "$serve_status" | grep -q 'svc:skillloom' || fail "serve-private" "svc:skillloom is not advertised"
  if printf '%s\n' "$serve_status" | grep -qi 'funnel'; then
    fail "serve-private" "Funnel appears in Tailscale Serve status"
  fi
  record_check "serve-private"

  curl -fsS --connect-timeout 3 --max-time 10 -- "$hub_url/healthz" >/dev/null \
    || fail "magicdns-https" "Hub health is not reachable through MagicDNS HTTPS"
  record_check "magicdns-https"
  if curl -fsS --connect-timeout 1 --max-time 2 -- "http://127.0.0.1:${SKILLLOOM_HUB_PORT:-8787}/healthz" >/dev/null 2>&1; then
    fail "direct-backend-unreachable" "Hub backend is reachable from the Docker host"
  fi
  record_check "direct-backend-unreachable"

  before_tailscale="$(read_tailscale_identity)" || fail "identity-persistence" "could not read Tailscale identity before restart"
  before_hub="$(read_hub_identity)" || fail "identity-persistence" "could not read Hub identity before restart"
  compose restart tailscale skillloom-hub >/dev/null || fail "identity-persistence" "could not restart Hub services"
  attempt=0
  after_tailscale=""
  after_hub=""
  while [ "$attempt" -lt 60 ]; do
    after_tailscale="$(read_tailscale_identity || true)"
    after_hub="$(read_hub_identity || true)"
    if [ -n "$after_tailscale" ] && [ -n "$after_hub" ] \
      && curl -fsS --connect-timeout 3 --max-time 5 -- "$hub_url/healthz" >/dev/null 2>&1; then
      break
    fi
    attempt=$((attempt + 1))
    [ "$attempt" -ge 60 ] || sleep 1
  done
  [ -n "$after_tailscale" ] && [ -n "$after_hub" ] || fail "identity-persistence" "services did not become ready after bounded polling"
  [ "$before_tailscale" = "$after_tailscale" ] || fail "identity-persistence" "Tailscale identity changed across restart"
  [ "$before_hub" = "$after_hub" ] || fail "identity-persistence" "Hub identity changed across restart"
  hub_instance_id="$after_hub"
  record_check "identity-persistence"
  finish_incomplete
}

read_hello_metadata() {
  temporary_hello="$(mktemp "$evidence_dir/.hello.XXXXXX")" || fail "negotiation-capabilities" "could not stage negotiation response"
  chmod 600 "$temporary_hello"
  curl -fsS --connect-timeout 3 --max-time 10 -- "$hub_url/v1/hello" > "$temporary_hello" \
    || fail "negotiation-capabilities" "Hub negotiation failed over MagicDNS HTTPS"
  node -e '
    const fs=require("node:fs"),crypto=require("node:crypto");
    const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    if(!value||typeof value!=="object")process.exit(1);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.hubInstanceId))process.exit(1);
    if(!Array.isArray(value.grantedCapabilities)||!value.grantedCapabilities.every(v=>typeof v==="string"))process.exit(1);
    if(new Set(value.grantedCapabilities).size!==value.grantedCapabilities.length)process.exit(1);
    const key=crypto.createPublicKey(value.releaseSigningPublicKey);
    if(key.asymmetricKeyType!=="ed25519")process.exit(1);
    const fingerprint=`sha256:${crypto.createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("base64url")}`;
    process.stdout.write(`${value.hubInstanceId}|${fingerprint}|${[...value.grantedCapabilities].sort().join(",")}`);
  ' "$temporary_hello"
  rm -f "$temporary_hello"
  temporary_hello=""
}

prepare_request_files() {
  temporary_body="$(mktemp "$evidence_dir/.request.XXXXXX")" || fail "$1" "could not stage request"
  temporary_response="$(mktemp "$evidence_dir/.response.XXXXXX")" || fail "$1" "could not stage response"
  chmod 600 "$temporary_body" "$temporary_response"
}

request_id() {
  node -e 'process.stdout.write(require("node:crypto").randomUUID())'
}

run_contributor_checks() {
  expected="brain:capture,brain:link,brain:read,brain:update,skill:propose,skill:read"
  [ "$granted_capabilities" = "$expected" ] \
    || fail "negotiation-capabilities" "contributor grantedCapabilities do not match the required permission set"
  record_check "negotiation-capabilities"
  prepare_request_files "contributor-capture"
  node -e '
    const fs=require("node:fs");
    const [path,nonce]=process.argv.slice(1);
    fs.writeFileSync(path,JSON.stringify({type:"note",title:`Skillloom live acceptance ${nonce}`,content:"Live acceptance contributor check.",provenance:{source:"skillloom-live-acceptance",runNonce:nonce},sensitivity:"tailnet"}));
  ' "$temporary_body" "$run_nonce"
  status="$(curl -sS --connect-timeout 3 --max-time 15 -o "$temporary_response" -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' -H "Idempotency-Key: $(request_id)" \
    --data-binary "@$temporary_body" -- "$hub_url/v1/brain/captures")" \
    || fail "contributor-capture" "capture request failed"
  [ "$status" = "201" ] || fail "contributor-capture" "expected HTTP 201 from capture, got $status"
  record_check "contributor-capture"
}

run_restricted_checks() {
  expected="brain:read,skill:read"
  [ "$granted_capabilities" = "$expected" ] \
    || fail "negotiation-capabilities" "restricted grantedCapabilities do not match reader permissions"
  record_check "negotiation-capabilities"
  prepare_request_files "restricted-read"
  node -e '
    const fs=require("node:fs");
    const [path,nonce]=process.argv.slice(1);
    fs.writeFileSync(path,JSON.stringify({query:`Skillloom live acceptance ${nonce}`,limit:1}));
  ' "$temporary_body" "$run_nonce"
  status="$(curl -sS --connect-timeout 3 --max-time 10 -o "$temporary_response" -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' --data-binary "@$temporary_body" -- "$hub_url/v1/brain/search")" \
    || fail "restricted-read" "reader search request failed"
  [ "$status" = "200" ] || fail "restricted-read" "expected HTTP 200 from search, got $status"
  record_check "restricted-read"

  node -e '
    const fs=require("node:fs");
    fs.writeFileSync(process.argv[1],JSON.stringify({candidateId:"acceptance-candidate",version:"0.0.0-acceptance",channel:"stable"}));
  ' "$temporary_body"
  status="$(curl -sS --connect-timeout 3 --max-time 10 -o "$temporary_response" -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' -H "Idempotency-Key: $(request_id)" \
    -H 'Tailscale-User-Login: spoof@example.invalid' \
    -H 'Tailscale-App-Capabilities: {"skillloom.io/cap/skillloom":[{"subject":"user:spoof@example.invalid","roles":["reader","contributor","promoter"]}]}' \
    --data-binary "@$temporary_body" -- "$hub_url/v1/registry/releases")" \
    || fail "spoofed-publish-denied" "spoofed publish request failed"
  [ "$status" = "403" ] || fail "spoofed-publish-denied" "expected HTTP 403 from spoofed publish, got $status"
  record_check "spoofed-publish-denied"
}

run_actor_phase() {
  require_command curl
  metadata="$(read_hello_metadata)" || fail "negotiation-capabilities" "hello response was not a valid Skillloom negotiation"
  old_ifs="$IFS"
  IFS='|'
  set -- $metadata
  IFS="$old_ifs"
  [ "$#" -eq 3 ] || fail "negotiation-capabilities" "hello metadata was incomplete"
  hub_instance_id="$1"
  signing_key_fingerprint="$2"
  granted_capabilities="$3"
  if [ "$actor_mode" = "contributor" ]; then
    run_contributor_checks
  else
    run_restricted_checks
  fi
  finish_incomplete
}

secure_evidence_input() {
  input="$1"
  [ -f "$input" ] || return 1
  [ ! -L "$input" ] || return 1
  input_parent="$(CDPATH= cd -- "$(dirname -- "$input")" && pwd -P)" || return 1
  input="$input_parent/$(basename -- "$input")"
  outside_source "$input" || return 1
  node -e '
    const fs=require("node:fs");
    const file=fs.statSync(process.argv[1]).mode&0o777;
    const parent=fs.statSync(require("node:path").dirname(process.argv[1])).mode&0o777;
    if(file!==0o600||parent!==0o700)process.exit(1);
  ' "$input" || return 1
  printf '%s' "$input"
}

aggregate_metadata() {
  node -e '
    const fs=require("node:fs");
    const [serverPath,contributorPath,restrictedPath,nonce,url]=process.argv.slice(1);
    const read=path=>JSON.parse(fs.readFileSync(path,"utf8"));
    const server=read(serverPath), contributor=read(contributorPath), restricted=read(restrictedPath);
    const required={
      server:["compose-services","compose-network","compose-no-public-ports","compose-running","serve-private","magicdns-https","direct-backend-unreachable","identity-persistence"],
      contributor:["negotiation-capabilities","contributor-capture"],
      restricted:["negotiation-capabilities","restricted-read","spoofed-publish-denied"]
    };
    const validate=(record,phase,mode,checks)=>{
      if(!record||record.schemaVersion!==1||record.phase!==phase||record.actorMode!==mode||record.status!=="complete")throw new Error(`${phase}:${mode||"server"} evidence is incomplete`);
      if(record.runNonce!==nonce||record.hubUrl!==url)throw new Error(`${phase}:${mode||"server"} evidence belongs to another run`);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(record.hubInstanceId))throw new Error(`${phase}:${mode||"server"} Hub identity is invalid`);
      if(!Array.isArray(record.checks)||!checks.every(check=>record.checks.includes(check)))throw new Error(`${phase}:${mode||"server"} required checks are missing`);
    };
    validate(server,"server",null,required.server);
    validate(contributor,"actor","contributor",required.contributor);
    validate(restricted,"actor","restricted",required.restricted);
    if(server.hubInstanceId!==contributor.hubInstanceId||server.hubInstanceId!==restricted.hubInstanceId)throw new Error("Hub identities do not match");
    const fingerprint=/^sha256:[A-Za-z0-9_-]{43}$/;
    if(contributor.signingKeyFingerprint!==restricted.signingKeyFingerprint||!fingerprint.test(contributor.signingKeyFingerprint))throw new Error("release signing key fingerprints do not match or are not canonical");
    const exact=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&actual.every((value,index)=>value===expected[index]);
    if(!exact(contributor.grantedCapabilities,["brain:capture","brain:link","brain:read","brain:update","skill:propose","skill:read"]))throw new Error("contributor capabilities are invalid");
    if(!exact(restricted.grantedCapabilities,["brain:read","skill:read"]))throw new Error("restricted capabilities are invalid");
    process.stdout.write(`${server.hubInstanceId}|${contributor.signingKeyFingerprint}`);
  ' "$1" "$2" "$3" "$run_nonce" "$hub_url"
}

run_aggregate_phase() {
  server_input="${SKILLLOOM_SERVER_EVIDENCE:-$evidence_dir/server.json}"
  contributor_input="${SKILLLOOM_CONTRIBUTOR_EVIDENCE:-$evidence_dir/actor-contributor.json}"
  restricted_input="${SKILLLOOM_RESTRICTED_EVIDENCE:-$evidence_dir/actor-restricted.json}"
  if [ ! -f "$server_input" ] || [ ! -f "$contributor_input" ] || [ ! -f "$restricted_input" ]; then
    write_evidence incomplete "missing-phase-evidence"
    echo "INCOMPLETE: server, contributor, and restricted evidence are all required" >&2
    echo "evidence: $evidence_file" >&2
    exit "$incomplete_exit"
  fi
  server_input="$(secure_evidence_input "$server_input")" || fail "server-evidence" "server evidence must be a 0600 regular file in a 0700 directory outside source"
  contributor_input="$(secure_evidence_input "$contributor_input")" || fail "contributor-evidence" "contributor evidence must be a 0600 regular file in a 0700 directory outside source"
  restricted_input="$(secure_evidence_input "$restricted_input")" || fail "restricted-evidence" "restricted evidence must be a 0600 regular file in a 0700 directory outside source"
  metadata="$(aggregate_metadata "$server_input" "$contributor_input" "$restricted_input")" \
    || fail "aggregate-evidence" "phase evidence did not match the required contract"
  old_ifs="$IFS"
  IFS='|'
  set -- $metadata
  IFS="$old_ifs"
  [ "$#" -eq 2 ] || fail "aggregate-evidence" "aggregate metadata was incomplete"
  hub_instance_id="$1"
  signing_key_fingerprint="$2"
  record_check "evidence-matched"
  write_evidence pass ""
  echo "PASS: live tailnet acceptance"
  echo "evidence: $evidence_file"
}

[ "${SKILLLOOM_LIVE_ACCEPTANCE:-}" = "1" ] || {
  echo "SKIP: set SKILLLOOM_LIVE_ACCEPTANCE=1 to run live tailnet acceptance" >&2
  exit 78
}
: "${SKILLLOOM_ACCEPTANCE_PHASE:?set SKILLLOOM_ACCEPTANCE_PHASE=server, actor, or aggregate}"
: "${SKILLLOOM_ACCEPTANCE_RUN_NONCE:?set one shared SKILLLOOM_ACCEPTANCE_RUN_NONCE for all phases}"
: "${SKILLLOOM_HUB_URL:?set SKILLLOOM_HUB_URL to the MagicDNS HTTPS Hub URL}"
phase="$SKILLLOOM_ACCEPTANCE_PHASE"
run_nonce="$SKILLLOOM_ACCEPTANCE_RUN_NONCE"
case "$phase" in
  server|actor|aggregate) ;;
  *) die "phase must be server, actor, or aggregate" ;;
esac
if [ "$phase" = "actor" ]; then
  case "$actor_mode" in
    contributor|restricted) ;;
    *) die "set SKILLLOOM_ACCEPTANCE_ACTOR=contributor or restricted" ;;
  esac
elif [ -n "$actor_mode" ]; then
  die "SKILLLOOM_ACCEPTANCE_ACTOR is valid only for the actor phase"
fi
case "$run_nonce" in
  *[!A-Za-z0-9._-]*) die "run nonce contains unsafe characters" ;;
esac
[ "${#run_nonce}" -ge 16 ] && [ "${#run_nonce}" -le 128 ] \
  || die "run nonce must contain 16 to 128 safe characters"
require_command node
hub_url="$(node -e '
  const value=new URL(process.argv[1]);
  if(value.protocol!=="https:"||value.username||value.password||value.search||value.hash||(value.pathname!=="/"&&value.pathname!==""))process.exit(1);
  process.stdout.write(value.origin);
' "$SKILLLOOM_HUB_URL")" || die "Hub URL must be a bare MagicDNS HTTPS origin"

if [ -n "${SKILLLOOM_SOURCE_ROOT:-}" ]; then
  [ -d "$SKILLLOOM_SOURCE_ROOT" ] || die "SKILLLOOM_SOURCE_ROOT must be an existing directory"
  source_root="$(CDPATH= cd -- "$SKILLLOOM_SOURCE_ROOT" && pwd -P)"
elif [ -f "$script_hub_dir/compose.yaml" ]; then
  source_root="$script_repo_dir"
else
  source_root=""
fi
prepare_evidence

case "$phase" in
  server) run_server_phase ;;
  actor) run_actor_phase ;;
  aggregate) run_aggregate_phase ;;
esac
