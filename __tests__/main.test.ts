import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as core from "@actions/core";
import { ErrorMessage, StateName } from "../src/const";
import { getSessionId, run, SCRIPT_PATH } from "../src/main";

jest.mock("@actions/core");
jest.mock("node:child_process");

const mockStream = (data: string) => ({
  on: jest.fn((event, callback) => {
    if (event === "data") {
      callback(data);
    }
  }),
});

describe("run", () => {
  it("should run the script and save the session ID", async () => {
    const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    const mockCore = core as jest.Mocked<typeof core>;

    const sessionId = "test-id";
    const target = "test-target";
    const host = "test-host";
    const port = "test-port";
    const localPort = "test-local-port";
    const timeout = "30";

    const mockStdout = mockStream(`Session established with ID: ${sessionId}`);
    const mockStderr = mockStream("");

    mockSpawn.mockReturnValue({
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    } as unknown as ChildProcessWithoutNullStreams);

    mockCore.getInput.mockImplementation((name: string) => {
      switch (name) {
        case "target":
          return target;
        case "host":
          return host;
        case "port":
          return port;
        case "local-port":
          return localPort;
        case "timeout":
          return timeout;
        default:
          return "test-input";
      }
    });

    await run();

    expect(mockSpawn).toHaveBeenCalledWith(SCRIPT_PATH, [
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
    expect(mockCore.saveState).toHaveBeenCalledWith(
      StateName.SessionId,
      sessionId,
    );
  });
  it("should set the workflow as failed if an error occurs", async () => {
    const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    const mockCore = core as jest.Mocked<typeof core>;

    const mockStdout = mockStream("");
    const mockStderr = mockStream("");
    const mockError = new Error("Spawn error");

    mockSpawn.mockReturnValue({
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn((event, callback) => {
        if (event === "error") {
          callback(mockError);
        }
      }),
    } as unknown as ChildProcessWithoutNullStreams);

    mockCore.getInput.mockImplementation((_name: string) => "test-input");

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(mockError.message);
  });
  it("should set the workflow as failed if the script exits with a non-zero code", async () => {
    const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    const mockCore = core as jest.Mocked<typeof core>;

    const errorMessage =
      "Usage: $0 [-t target] [-h host] [-p port] [-l local_port]";

    const mockStdout = mockStream("");
    const mockStderr = mockStream(errorMessage);

    mockSpawn.mockReturnValue({
      stdout: mockStdout,
      stderr: mockStderr,
      on: jest.fn((event, callback) => {
        if (event === "close") {
          callback(1);
        }
      }),
    } as unknown as ChildProcessWithoutNullStreams);

    mockCore.getInput.mockImplementation((_name: string) => "test-input");

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(errorMessage);
  });

  it("should default the timeout to 60 seconds", async () => {
    const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    const mockCore = core as jest.Mocked<typeof core>;

    mockSpawn.mockReturnValue({
      stdout: mockStream("Session established with ID: test-id"),
      stderr: mockStream(""),
      on: jest.fn((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    } as unknown as ChildProcessWithoutNullStreams);
    mockCore.getInput.mockImplementation((name: string) =>
      name === "timeout" ? "" : "test-input",
    );

    await run();

    expect(mockSpawn).toHaveBeenLastCalledWith(
      SCRIPT_PATH,
      expect.arrayContaining(["-w", "60"]),
    );
  });

  it("should succeed when the script exits 0 even if it wrote to stderr", async () => {
    const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    const mockCore = core as jest.Mocked<typeof core>;
    mockCore.setFailed.mockClear();
    mockCore.saveState.mockClear();

    mockSpawn.mockReturnValue({
      stdout: mockStream("Session established with ID: test-id"),
      stderr: mockStream("some warning"),
      on: jest.fn((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    } as unknown as ChildProcessWithoutNullStreams);
    mockCore.getInput.mockImplementation(() => "test-input");

    await run();

    expect(mockCore.setFailed).not.toHaveBeenCalled();
    expect(mockCore.saveState).toHaveBeenCalledWith(
      StateName.SessionId,
      "test-id",
    );
  });

  it("should report the exit code when the script fails without stderr", async () => {
    const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    const mockCore = core as jest.Mocked<typeof core>;

    mockSpawn.mockReturnValue({
      stdout: mockStream(""),
      stderr: mockStream(""),
      on: jest.fn((event, callback) => {
        if (event === "close") {
          callback(2);
        }
      }),
    } as unknown as ChildProcessWithoutNullStreams);
    mockCore.getInput.mockImplementation(() => "test-input");

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      "Port forwarding script exited with code 2",
    );
  });

  it("should set the workflow as failed if an unexpected error occurs", async () => {
    const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    const mockCore = core as jest.Mocked<typeof core>;

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
    const output = "Session established with ID: test-id";
    expect(getSessionId(output)).toBe("test-id");
  });

  it("should throw an error if the session ID is not found", () => {
    const output = "Session not established";
    expect(() => getSessionId(output)).toThrow("Failed to extract session ID");
  });
});
