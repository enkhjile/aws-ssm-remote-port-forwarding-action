import * as core from "@actions/core";
import { SSMClient, TerminateSessionCommand } from "@aws-sdk/client-ssm";
import { ErrorMessage, StateName } from "./const";

export async function run(): Promise<void> {
  try {
    const client = new SSMClient({ region: process.env.AWS_DEFAULT_REGION });
    const sessionId = core.getState(StateName.SessionId);

    const command = new TerminateSessionCommand({ SessionId: sessionId });
    await client.send(command);
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : ErrorMessage.UnexpectedError,
    );
  }
}

run();
