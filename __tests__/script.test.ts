import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Runs the real connect-with-port-forwarding.sh against a fake AWS CLI
// (__tests__/fixtures/aws) that imitates `aws ssm start-session` and the
// session-manager-plugin it starts.
const SCRIPT = path.join(__dirname, "../src/connect-with-port-forwarding.sh");
const FAKE_AWS_DIR = path.join(__dirname, "fixtures");
const ARGS = ["-t", "i-123", "-h", "db.internal", "-p", "5432", "-l", "5432"];

jest.setTimeout(30_000);

let workDir: string;
let logFile: string;
let pluginPidFile: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "ssm-forward-test-"));
  logFile = path.join(workDir, "aws.log");
  pluginPidFile = path.join(workDir, "plugin.pid");
});

afterEach(() => {
  // A successful run leaves the fake plugin running, like a real tunnel.
  const pid = pluginPid();
  if (pid !== undefined && isAlive(pid)) process.kill(pid);
  rmSync(workDir, { recursive: true, force: true });
});

function readOrEmpty(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function pluginPid(): number | undefined {
  const pid = Number.parseInt(readOrEmpty(pluginPidFile), 10);
  return Number.isNaN(pid) ? undefined : pid;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilDead(pid: number): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function runScript(
  args: string[],
  env: Record<string, string> = {},
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}> {
  const started = Date.now();
  const child = spawn(SCRIPT, args, {
    env: {
      ...process.env,
      PATH: `${FAKE_AWS_DIR}:${process.env.PATH}`,
      FAKE_LOG: logFile,
      FAKE_PLUGIN_PID: pluginPidFile,
      ...env,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const code = await new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  return { code, stdout, stderr, ms: Date.now() - started };
}

describe("connect-with-port-forwarding.sh", () => {
  it("reports the session once the local port is open and keeps the tunnel running", async () => {
    const result = await runScript([...ARGS, "-w", "5"], {
      FAKE_PORT_DELAY: "1",
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Session established with ID: test-session",
    );
    const pid = pluginPid();
    expect(pid).toBeDefined();
    expect(isAlive(pid as number)).toBe(true);
  });

  it("defaults to a 60 second timeout", async () => {
    const result = await runScript(ARGS);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("(timeout 60s)");
  });

  it("waits as long as the timeout allows for a slow session", async () => {
    const result = await runScript([...ARGS, "-w", "6"], {
      FAKE_PORT_DELAY: "3",
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Session established with ID: test-session",
    );
  });

  it("on timeout terminates the started session and stops the plugin", async () => {
    const result = await runScript([...ARGS, "-w", "2"], {
      FAKE_PORT_DELAY: "10",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Timed out after 2s");
    expect(result.stderr).toContain(
      "Starting session with SessionId: test-session",
    );
    expect(readOrEmpty(logFile)).toContain(
      "ssm terminate-session --session-id test-session",
    );
    const pid = pluginPid();
    expect(pid).toBeDefined();
    expect(await waitUntilDead(pid as number)).toBe(true);
  });

  it("fails fast with the CLI's error when it exits early", async () => {
    const result = await runScript([...ARGS, "-w", "30"], { FAKE_FAIL: "1" });

    expect(result.code).toBe(1);
    expect(result.ms).toBeLessThan(5_000);
    expect(result.stderr).toContain("exited before the port was opened");
    expect(result.stderr).toContain("address already in use");
    // No session was started, so there is nothing to terminate.
    expect(readOrEmpty(logFile)).not.toContain("terminate-session");
  });

  it("does not terminate anything after a successful start", async () => {
    await runScript([...ARGS, "-w", "5"]);

    expect(readOrEmpty(logFile)).not.toContain("terminate-session");
  });

  it("extracts session ids that contain dots", async () => {
    const result = await runScript([...ARGS, "-w", "5"], {
      FAKE_SESSION_ID: "someone@example.co.jp-abc123",
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Session established with ID: someone@example.co.jp-abc123",
    );
  });

  it.each([
    ["0"],
    ["-5"],
    ["abc"],
    ["1.5"],
  ])("rejects an invalid timeout (%s)", async (timeout) => {
    const result = await runScript([...ARGS, "-w", timeout]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Timeout must be a positive number");
    expect(readOrEmpty(logFile)).toBe("");
  });

  it("prints usage when a required argument is missing", async () => {
    const result = await runScript(["-t", "i-123", "-h", "db", "-p", "5432"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Usage:");
    expect(readOrEmpty(logFile)).toBe("");
  });
});
