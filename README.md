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
      uses: enkhjile/aws-ssm-remote-port-forwarding-action@v1
      with:
        target: i-1234567890abcdef0
        host: my-rds-instance.123456789012.ap-northeast-1.rds.amazonaws.com
        port: 3306
        local-port: 3306
```

## IAM permissions

Your pipeline must have these minimal permissions.

`ec2:DescribeInstances` does not support resource-level scoping, so that
statement must use `"Resource": "*"`.

`ssm:StartSession` uses the AWS-owned document
`AWS-StartPortForwardingSessionToRemoteHost`, which has an empty account field
in its ARN. Account-scoped resources do not match, so the SSM statements also
use `"Resource": "*"`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Ec2DescribeBastionTarget",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances"
      ],
      "Resource": "*"
    },
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
