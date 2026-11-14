import * as core from "@actions/core";
import { SSMClient, TerminateSessionCommand } from "@aws-sdk/client-ssm";
import { ErrorMessage, StateName } from "./const";

export async function run(): Promise<void> {
  try {
    // Empty when the main step failed; the script cleans up after itself then.
    const sessionId = core.getState(StateName.SessionId);
    if (!sessionId) {
      core.info("No SSM session to terminate.");
      return;
    }

    const client = new SSMClient({ region: process.env.AWS_DEFAULT_REGION });
    await client.send(new TerminateSessionCommand({ SessionId: sessionId }));
    core.info(`Terminated SSM session ${sessionId}.`);
  } catch (error) {
    // Cleanup must not fail a job whose steps succeeded. SSM also ends idle
    // sessions on its own.
    core.warning(
      `Could not terminate the SSM session: ${
        error instanceof Error ? error.message : ErrorMessage.UnexpectedError
      }`,
    );
  }
}

run();
