# AWS SSM Remote Port Forwarding Action

This action allows you to forward a port from a remote machine to your local machine using AWS SSM. For example, you can forward a port from an RDS instance to your local machine.

[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

## Inputs

| Name | Required | Description |
| --- | --- | --- |
| target | true | The target instance ID or ECS task container |
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
      uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-region: ap-northeast-1
        role-to-assume: arn:aws:iam::123456789012:role/role-name

    - name: Port forward to EC2 instance
      uses: enkhjile/aws-ssm-remote-port-forwarding-action@v1
      with:
        target: i-1234567890abcdef0
        host: my-rds-instance.123456789012.ap-northeast-1.rds.amazonaws.com
        port: 3306
        local-port: 3306

    - name: Port forward to ECS or Fargate task container
      uses: enkhjile/aws-ssm-remote-port-forwarding-action@v1
      with:
        # target for ECS task container is "ecs:<ecs-cluster-name>_<task-id>_<task-container-runtime-id>"
        target: ecs:my-ecs-cluster_1234abcd5678efab9012cdef3456abcd_1234abcd5678efab9012cdef3456abcd-1234567890
        host: my-rds-instance.123456789012.ap-northeast-1.rds.amazonaws.com
        port: 3306
        local-port: 3306
```

## Contributing

Contributions to this project are welcome. Please feel free to open an issue or a pull request.

## License

The code in this project is licensed under [MIT license](LICENSE).
