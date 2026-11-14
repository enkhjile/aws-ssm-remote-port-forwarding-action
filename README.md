# AWS SSM Remote Port Forwarding Action

This action allows you to forward a port from a remote machine to your local machine using AWS SSM. For example, you can forward a port from an RDS instance to your local machine.

[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

## Inputs

| Name | Required | Description |
| --- | --- | --- |
| target | true | The EC2 instance ID (`i-…`), or an ECS task container as `ecs:<cluster>_<task-id>_<container-runtime-id>` (see [ECS tasks](#ecs-tasks)) |
| host | true | The remote host to forward the port from |
| port | true | The remote port to forward |
| local-port | true | The local port to forward to |
| timeout | false | Seconds to wait for the session to open the local port (default `60`) |

The step finishes once the local port is open, and the session stays up for the rest of the job. A post step terminates it when the job ends.

If the port doesn't open within `timeout`, or the AWS CLI exits early, the step fails, terminates the SSM session it started, and stops the AWS CLI and its `session-manager-plugin`.

## Example usage

Port forward from an RDS instance to your local machine.

```yaml
name: Port forward
on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v6

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v6
      with:
        aws-region: ap-northeast-1
        role-to-assume: arn:aws:iam::123456789012:role/role-name

    - name: Port forward
      uses: enkhjile/aws-ssm-remote-port-forwarding-action@v2
      with:
        target: i-1234567890abcdef0
        host: my-rds-instance.123456789012.ap-northeast-1.rds.amazonaws.com
        port: 3306
        local-port: 3306
```

## ECS tasks

You can also forward through a container in an Amazon ECS task, on EC2 or Fargate, instead of an EC2 instance. Set `target` to:

```
ecs:<cluster-name>_<task-id>_<container-runtime-id>
```

AWS's documentation calls the middle part `ECS_container_ID` (see [Starting a session with an Amazon ECS task](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html#sessions-remote-port-forwarding-ecs-task)). It's the ID of the task, and the container's runtime ID starts with it (`<task-id>-<number>`). Look the runtime ID up for the container you want to use, for example:

```sh
aws ecs describe-tasks --cluster my-ecs-cluster --tasks <task-id> \
  --query "tasks[0].containers[?name=='app'].runtimeId" --output text
```

```yaml
    - name: Port forward through an ECS task
      uses: enkhjile/aws-ssm-remote-port-forwarding-action@v2
      with:
        target: ecs:my-ecs-cluster_1234abcd5678efab9012cdef3456abcd_1234abcd5678efab9012cdef3456abcd-1234567890
        host: my-rds-instance.123456789012.ap-northeast-1.rds.amazonaws.com
        port: 3306
        local-port: 3306
```

Requirements, from AWS's documentation:

- **ECS Exec is turned on** for the task (`--enable-execute-command` on the service, or on `run-task` / `start-task`). It can't be turned on for a task that is already running. See [ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html).
- **The task role allows** `ssmmessages:CreateControlChannel`, `ssmmessages:CreateDataChannel`, `ssmmessages:OpenControlChannel` and `ssmmessages:OpenDataChannel`.
- **Your pipeline's `ssm:StartSession`** covers the task, e.g. `arn:aws:ecs:<region>:<account>:task/<cluster-name>/*` if you scope it (see [IAM permissions](#iam-permissions)).

Note that AWS documents sessions started this way (with `ssm start-session` rather than `ecs execute-command`) as not logged by ECS Exec and counted against the Session Manager session quota, and suggests denying `ssm:StartSession` on ECS tasks where that matters. Check your account's policies before relying on it.

## IAM permissions

Your pipeline needs the following permissions.

This example uses Resource: `"*" `for the SSM session actions to keep the policy simple and because the AWS-owned SSM document ARN has an empty account field. 
If stricter least-privilege access is required, `ssm:StartSession` can be scoped to the target EC2 instance ARN (or, for an [ECS task](#ecs-tasks), `arn:aws:ecs:<region>:<account>:task/<cluster-name>/*`) and the AWS-owned document ARN, 
for example `arn:aws:ssm:<region>::document/AWS-StartPortForwardingSessionToRemoteHost`.


```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SsmStartPortForwardingSession",
      "Effect": "Allow",
      "Action": [
        "ssm:StartSession"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SsmManagePortForwardingSession",
      "Effect": "Allow",
      "Action": [
        "ssm:TerminateSession",
        "ssm:ResumeSession"
      ],
      "Resource": "*"
    }
  ]
}
```

## Contributing

Contributions to this project are welcome. Please feel free to open an issue or a pull request.

## License

The code in this project is licensed under [MIT license](LICENSE).
