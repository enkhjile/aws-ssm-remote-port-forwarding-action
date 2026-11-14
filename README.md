# AWS SSM Remote Port Forwarding Action

This action allows you to forward a port from a remote machine to your local machine using AWS SSM. For example, you can forward a port from an RDS instance to your local machine.

[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

## Inputs

| Name | Required | Description |
| --- | --- | --- |
| target | true | The target instance ID |
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

## IAM permissions

Your pipeline needs the following permissions.

This example uses Resource: `"*" `for the SSM session actions to keep the policy simple and because the AWS-owned SSM document ARN has an empty account field. 
If stricter least-privilege access is required, `ssm:StartSession` can be scoped to the target EC2 instance ARN and the AWS-owned document ARN, 
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
