#!/bin/bash

# Parse command-line arguments
while getopts ":t:h:p:l:" opt; do
  case ${opt} in
    t ) target=$OPTARG ;;
    h ) host=$OPTARG ;;
    p ) port=$OPTARG ;;
    l ) local_port=$OPTARG ;;
    \? ) echo "Unknown argument: -$OPTARG" >&2; exit 1 ;;
  esac
done

# Check if required parameters were provided
if [ -z "$target" ] || [ -z "$host" ] || [ -z "$port" ] || [ -z "$local_port" ]; then
    echo "Usage: $0 [-t target] [-h host] [-p port] [-l local_port]" >&2
    exit 1
fi

# Check if the target exists
target_exists=$(aws ec2 describe-instances --instance-ids "$target" \
    --query "Reservations[*].Instances[*].InstanceId" --output text 2> /dev/null)

if [ -z "$target_exists" ]; then
    echo "Target $target does not exist" >&2
    exit 1
fi

# Start AWS SSM session with port forwarding
aws ssm start-session --target "$target" \
    --document-name "AWS-StartPortForwardingSessionToRemoteHost" \
    --parameters "host=$host,portNumber=$port,localPortNumber=$local_port" > output.txt 2> error.txt &

# Wait for the session to be established
attempt_counter=0
max_attempts=10

session_id_str="sessionId"

until grep -q $session_id_str output.txt || [ "$attempt_counter" -eq "$max_attempts" ]; do
    echo "Waiting for the session to be established ($((++attempt_counter))/$max_attempts)..."
    sleep 1
done

# Cleanup function to remove temporary files
cleanup() {
    rm -f output.txt error.txt
}
trap cleanup EXIT

# Check if the session was established
if ! grep -q $session_id_str output.txt; then
    echo "Failed to establish the session"
    if [ -s error.txt ]; then
        cat error.txt >&2
    fi
    if [ -s output.txt ]; then
        cat output.txt >&2
    fi
    exit 1
else
    session_id=$(sed -n -e "s/^.*$session_id_str \(.*\)\./\1/p" output.txt)
    echo "Session established with ID: $session_id"
fi