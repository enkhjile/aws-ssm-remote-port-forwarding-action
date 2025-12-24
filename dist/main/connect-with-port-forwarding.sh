#!/bin/bash

# Parse command-line arguments
while getopts ":t:h:p:l:" opt; do
  case "${opt}" in
    t ) target="${OPTARG}" ;;
    h ) host="${OPTARG}" ;;
    p ) port="${OPTARG}" ;;
    l ) local_port="${OPTARG}" ;;
    \? )
      echo "Unknown argument: -${OPTARG}" >&2
      exit 1
      ;;
  esac
done

# Check if required parameters were provided
if [ -z "${target}" ] || [ -z "${host}" ] || [ -z "${port}" ] || [ -z "${local_port}" ]; then
  echo "Usage: $0 -t <target_instance_id> -h <remote_host> -p <remote_port> -l <local_port>" >&2
  exit 1
fi

# Check if the target instance actually exists
target_exists=$(aws ec2 describe-instances \
  --instance-ids "${target}" \
  --query "Reservations[*].Instances[*].InstanceId" \
  --output text 2>/dev/null)

if [ -z "${target_exists}" ]; then
  echo "Target instance '${target}' does not exist or is not accessible." >&2
  exit 1
fi

OUTPUT_FILE="$(mktemp)"
ERROR_FILE="$(mktemp)"

# Cleanup function to remove temporary files
cleanup() {
  rm -f "$OUTPUT_FILE" "$ERROR_FILE"
}
trap cleanup EXIT

# Start AWS SSM session with port forwarding in background
aws ssm start-session \
  --target "${target}" \
  --document-name "AWS-StartPortForwardingSessionToRemoteHost" \
  --parameters "host=${host},portNumber=${port},localPortNumber=${local_port}" \
  > "$OUTPUT_FILE" 2> "$ERROR_FILE" &

# Store the PID of the background session (to terminate if needed)
session_pid=$!

# Wait for the session to be established
attempt_counter=0
max_attempts=10
session_id_str="sessionId"

echo "Attempting to establish SSM session..."
until grep -q "${session_id_str}" "$OUTPUT_FILE" || [ "${attempt_counter}" -ge "${max_attempts}" ]; do
  attempt_counter=$((attempt_counter + 1))
  echo "Waiting for the session to be established (${attempt_counter}/${max_attempts})..."
  sleep 1
done


# Check if the session was established
if ! grep -q "${session_id_str}" "$OUTPUT_FILE"; then
  echo "Failed to establish the session." >&2
  # Kill the background session process if it's still running
  kill "${session_pid}" 2>/dev/null || true

  if [ -s "$ERROR_FILE" ]; then
    cat "$ERROR_FILE" >&2
  fi

  if [ -s "$OUTPUT_FILE" ]; then
    cat "$OUTPUT_FILE" >&2
  fi

  exit 1
else
  # Extract the session ID from the output
  session_id="$(sed -n -E "s/^.*${session_id_str} (.*)\./\1/p" "$OUTPUT_FILE")"
  echo "Session established with ID: ${session_id}"
fi
