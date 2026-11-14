import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as core from "@actions/core";
import { ErrorMessage, StateName } from "../src/const";
import { getSessionId, run, SCRIPT_PATH } from "../src/main";

jest.mock("@actions/core");
jest.mock("node:child_process");

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockCore = core as jest.Mocked<typeof core>;

const mockStream = (data: string) => ({
  on: jest.fn((event, callback) => {
    if (event === "data") {
      callback(data);
    }
  }),
});

// A fake script process that writes stdout/stderr, then either closes with
// `code` or emits `error`.
function mockChild({
  stdout = "",
  stderr = "",
  code = 0,
  error,
}: {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: Error;
}): void {
  mockSpawn.mockReturnValue({
    stdout: mockStream(stdout),
    stderr: mockStream(stderr),
    on: jest.fn((event, callback) => {
      if (error && event === "error") {
        callback(error);
      } else if (!error && event === "close") {
        callback(code);
      }
    }),
  } as unknown as ChildProcessWithoutNullStreams);
}

const SESSION_OUTPUT = "Session established with ID: test-id";

describe("run", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockCore.getInput.mockReturnValue("test-input");
  });

  it("should run the script and save the session ID", async () => {
    const inputs: Record<string, string> = {
      target: "test-target",
      host: "test-host",
      port: "test-port",
      "local-port": "test-local-port",
      timeout: "30",
    };
    mockCore.getInput.mockImplementation((name: string) => inputs[name]);
    mockChild({ stdout: SESSION_OUTPUT });

    await run();

    expect(mockSpawn).toHaveBeenCalledWith(SCRIPT_PATH, [
      "-t",
      "test-target",
      "-h",
      "test-host",
      "-p",
      "test-port",
      "-l",
      "test-local-port",
      "-w",
      "30",
    ]);
    expect(mockCore.saveState).toHaveBeenCalledWith(
      StateName.SessionId,
      "test-id",
    );
  });

  it("should leave the timeout to the script when the input is empty", async () => {
    mockCore.getInput.mockImplementation((name: string) =>
      name === "timeout" ? "" : "test-input",
    );
    mockChild({ stdout: SESSION_OUTPUT });

    await run();

    expect(mockSpawn).toHaveBeenCalledWith(
      SCRIPT_PATH,
      expect.not.arrayContaining(["-w"]),
    );
  });

  it("should succeed when the script exits 0 even if it wrote to stderr", async () => {
    mockChild({ stdout: SESSION_OUTPUT, stderr: "some warning" });

    await run();

    expect(mockCore.setFailed).not.toHaveBeenCalled();
    expect(mockCore.saveState).toHaveBeenCalledWith(
      StateName.SessionId,
      "test-id",
    );
  });

  it("should set the workflow as failed if an error occurs", async () => {
    mockChild({ error: new Error("Spawn error") });

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith("Spawn error");
  });

  it("should set the workflow as failed if the script exits with a non-zero code", async () => {
    const errorMessage = "Usage: $0 -t <target_instance_id> ...";
    mockChild({ stderr: errorMessage, code: 1 });

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(errorMessage);
  });

  it("should report the exit code when the script fails without stderr", async () => {
    mockChild({ code: 2 });

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      "Port forwarding script exited with code 2",
    );
  });

  it("should set the workflow as failed if an unexpected error occurs", async () => {
    mockSpawn.mockImplementation(() => {
      throw "Not an error object";
    });

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      ErrorMessage.UnexpectedError,
    );
  });
});

describe("getSessionId", () => {
  it("should extract the session ID from the output", () => {
    expect(getSessionId(SESSION_OUTPUT)).toBe("test-id");
  });

  it("should throw an error if the session ID is not found", () => {
    expect(() => getSessionId("Session not established")).toThrow(
      "Failed to extract session ID",
    );
  });
});
