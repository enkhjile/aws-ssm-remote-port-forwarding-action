import { spawn } from "node:child_process";
import path from "node:path";
import * as core from "@actions/core";
import { ErrorMessage, StateName } from "./const";

const SCRIPT_NAME = "connect-with-port-forwarding.sh";
export const SCRIPT_PATH = path.join(__dirname, SCRIPT_NAME);

export function getSessionId(output: string): string {
  const regex = /Session established with ID: (\S+)/;
  const match = output.match(regex);

  if (match === null) {
    throw new Error("Failed to extract session ID");
  }

  return match[1];
}

export async function run(): Promise<void> {
  try {
    const target = core.getInput("target", { required: true });
    const host = core.getInput("host", { required: true });
    const port = core.getInput("port", { required: true });
    const localPort = core.getInput("local-port", { required: true });
    const timeout = core.getInput("timeout") || "60";

    core.info(
      `Establishing a session with target ${target} and forwarding ${host}:${port} to localhost:${localPort}`,
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
      "-w",
      timeout,
    ]);

    let stdout = "";
    let stderr = "";

    command.stdout.on("data", (data) => {
      core.info(data.toString());
      stdout += data;
    });

    command.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const exitCode = await new Promise((resolve, reject) => {
      command.on("close", resolve);
      command.on("error", reject);
    });

    if (exitCode !== 0) {
      throw new Error(
        stderr.trim() || `Port forwarding script exited with code ${exitCode}`,
      );
    }
    const sessionId = getSessionId(stdout);

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
