#!/bin/bash
#
# Start an SSM port-forwarding session to a remote host through <target>, wait
# until the local port is open, then exit and leave the session running in the
# background. On success prints "Session established with ID: <id>".
#
# On failure (timeout, or the AWS CLI exiting early) it terminates the SSM
# session if one was started, stops the AWS CLI and its session-manager-plugin,
# prints the CLI's output to stderr and exits non-zero.

usage() {
  echo "Usage: $0 -t <target_instance_id> -h <remote_host> -p <remote_port> -l <local_port> [-w <timeout_seconds>]" >&2
  exit 1
}

timeout=60

while getopts ":t:h:p:l:w:" opt; do
  case "${opt}" in
    t ) target="${OPTARG}" ;;
    h ) host="${OPTARG}" ;;
    p ) port="${OPTARG}" ;;
    l ) local_port="${OPTARG}" ;;
    w ) timeout="${OPTARG}" ;;
    \? )
      echo "Unknown argument: -${OPTARG}" >&2
      usage
      ;;
    : )
      echo "Missing value for -${OPTARG}" >&2
      usage
      ;;
  esac
done

if [ -z "${target}" ] || [ -z "${host}" ] || [ -z "${port}" ] || [ -z "${local_port}" ]; then
  usage
fi

if ! [[ "${timeout}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Timeout must be a positive number of seconds, got '${timeout}'." >&2
  exit 1
fi

OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"
trap 'rm -f "$OUTPUT_FILE" "$ERROR_FILE"' EXIT

# Run the AWS CLI in its own process group, so a failed attempt can stop it
# together with the session-manager-plugin it starts.
set -m
aws ssm start-session \
  --target "${target}" \
  --document-name "AWS-StartPortForwardingSessionToRemoteHost" \
  --parameters "host=${host},portNumber=${port},localPortNumber=${local_port}" \
  > "$OUTPUT_FILE" 2> "$ERROR_FILE" &
session_pid=$!
set +m
# Out of the job table, a killed job adds no "Terminated" notice to the error.
disown "${session_pid}"

# The plugin prints "Starting session with SessionId: <id>" once the session
# exists, then "Port <n> opened for sessionId <id>." once the local port is
# listening. Only the second line means the tunnel is usable.
ready_pattern='opened for sessionId '

started_session_id() {
  sed -n -E 's/^Starting session with SessionId: ([^[:space:]]+).*$/\1/p' "$OUTPUT_FILE" | head -n 1
}

fail() {
  echo "$1" >&2

  local session_id
  session_id="$(started_session_id)"
  if [ -n "${session_id}" ]; then
    echo "Terminating SSM session ${session_id}." >&2
    aws ssm terminate-session --session-id "${session_id}" > /dev/null 2>&1 ||
      echo "Could not terminate SSM session ${session_id}." >&2
  fi

  kill -- "-${session_pid}" 2> /dev/null || true
  cat "$ERROR_FILE" "$OUTPUT_FILE" >&2
  exit 1
}

echo "Attempting to establish SSM session (timeout ${timeout}s)..."
deadline=$((SECONDS + timeout))
while :; do
  # Check liveness before reading the output, so a CLI that printed the ready
  # line and then exited still counts as ready.
  kill -0 "${session_pid}" 2> /dev/null
  alive=$?
  grep -q "${ready_pattern}" "$OUTPUT_FILE" && break
  [ "${alive}" -ne 0 ] && fail "The AWS CLI exited before the port was opened."
  [ "${SECONDS}" -ge "${deadline}" ] && fail "Timed out after ${timeout}s waiting for the port to open."
  sleep 0.2
done

echo "Session established with ID: $(started_session_id)"
