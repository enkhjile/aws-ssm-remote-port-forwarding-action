import { spawn } from "node:child_process";
import path from "node:path";
import * as core from "@actions/core";
import { ErrorMessage, StateName } from "./const";

const SCRIPT_NAME = "connect-with-port-forwarding.sh";
export const SCRIPT_PATH = path.join(__dirname, SCRIPT_NAME);

export async function getSessionId(output: string): Promise<string> {
  const regex = /Session established with ID: (\S+)/;
  const match = output.match(regex);

  if (match === null) {
    throw new Error("Failed to extract session ID");
  }

  return match[1];
}

export async function run(): Promise<void> {
  console.log("Running the action");
  try {
    const target = core.getInput("target", { required: true });
    const host = core.getInput("host", { required: true });
    const port = core.getInput("port", { required: true });
    const localPort = core.getInput("local-port", { required: true });

    core.info(
      `Establishing a session with target ${target} and forwarding port ${port} to ${host}:${localPort}`,
    );

    const command = spawn(SCRIPT_PATH, [
      "-t",
      target,
      "-h",
      host,
      "-p",
      port,
      "-l",
      localPort,
    ]);

    let stdout = "";
    let stderr = "";

    command.stdout.on("data", (data) => {
      console.log(data.toString());
      stdout += data;
    });

    command.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const exitCode = await new Promise((resolve, reject) => {
      command.on("close", resolve);
      command.on("error", reject);
    });

    if (exitCode !== 0 || stderr) {
      throw new Error(stderr);
    }
    const sessionId = await getSessionId(stdout);

    // Save the session ID to the state
    core.saveState(StateName.SessionId, sessionId);
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(
      error instanceof Error ? error.message : ErrorMessage.UnexpectedError,
    );
  }
}

run();
