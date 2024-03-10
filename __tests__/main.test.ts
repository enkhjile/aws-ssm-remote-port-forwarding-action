import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as core from "@actions/core";
import { ErrorMessage, StateName } from "../src/const";
import { SCRIPT_PATH, getSessionId, run } from "../src/main";

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

    mockCore.getInput.mockImplementation((name: string) => "test-input");

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

    mockCore.getInput.mockImplementation((name: string) => "test-input");

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(errorMessage);
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
  it("should extract the session ID from the output", async () => {
    const output = "Session established with ID: test-id";
    const sessionId = await getSessionId(output);
    expect(sessionId).toBe("test-id");
  });

  it("should throw an error if the session ID is not found", async () => {
    const output = "Session not established";
    await expect(getSessionId(output)).rejects.toThrow(
      "Failed to extract session ID",
    );
  });
});
