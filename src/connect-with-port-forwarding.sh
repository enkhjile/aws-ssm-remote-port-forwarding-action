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
  echo "Usage: $0 -t <target_instance_id|target_ecs_task_container> -h <remote_host> -p <remote_port> -l <local_port>" >&2
  exit 1
fi

# Check if the target instance or ECS task container actually exists
if [[ "${target}" == ecs* ]]; then
  ecs_target=${target##*:}
  ecs_cluster_name=${ecs_target%%_*}
  ecs_task_container_runtime_id=${ecs_target##*_}
  ecs_task_id=${ecs_task_container_runtime_id%-*}
  target_exists=$(aws ecs describe-tasks \
    --cluster $ecs_cluster_name \
    --tasks $ecs_task_id \
    --query "tasks[*].containers[*].runtimeId" \
    --output text | grep $ecs_task_container_runtime_id)
else
  target_exists=$(aws ec2 describe-instances \
    --instance-ids "${target}" \
    --query "Reservations[*].Instances[*].InstanceId" \
    --output text 2>/dev/null)
fi

if [ -z "${target_exists}" ]; then
  echo "Target '${target}' does not exist or is not accessible." >&2
  exit 1
fi

OUTPUT_LOG="output.txt"
ERROR_LOG="error.txt"

# Start AWS SSM session with port forwarding in background
aws ssm start-session \
  --target "${target}" \
  --document-name "AWS-StartPortForwardingSessionToRemoteHost" \
  --parameters "host=${host},portNumber=${port},localPortNumber=${local_port}" \
  > "$OUTPUT_LOG" 2> "$ERROR_LOG" &

# Store the PID of the background session (to terminate if needed)
session_pid=$!

# Wait for the output file to be created
while [ ! -f "$OUTPUT_LOG" ]; do
  sleep 0.1
done

# Wait for the session to be established
attempt_counter=0
max_attempts=10
session_id_str="sessionId"

echo "Attempting to establish SSM session..."
until grep -q "${session_id_str}" "$OUTPUT_LOG" || [ "${attempt_counter}" -ge "${max_attempts}" ]; do
  attempt_counter=$((attempt_counter + 1))
  echo "Waiting for the session to be established (${attempt_counter}/${max_attempts})..."
  sleep 1
done


# Cleanup function to remove temporary files
cleanup() {
  rm -f "$OUTPUT_LOG" "$ERROR_LOG"
}
trap cleanup EXIT

# Check if the session was established
if ! grep -q "${session_id_str}" "$OUTPUT_LOG"; then
  echo "Failed to establish the session." >&2
  # Kill the background session process if it's still running
  kill "${session_pid}" 2>/dev/null || true

  if [ -s "$ERROR_LOG" ]; then
    cat "$ERROR_LOG" >&2
  fi

  if [ -s "$OUTPUT_LOG" ]; then
    cat "$OUTPUT_LOG" >&2
  fi

  exit 1
else
  # Extract the session ID from the output
  session_id="$(sed -n -E "s/^.*${session_id_str} (.*)\./\1/p" "$OUTPUT_LOG")"
  echo "Session established with ID: ${session_id}"
fi
