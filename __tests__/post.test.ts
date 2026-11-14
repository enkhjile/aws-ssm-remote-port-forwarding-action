import * as core from "@actions/core";
import { SSMClient, TerminateSessionCommand } from "@aws-sdk/client-ssm";
import { ErrorMessage, StateName } from "../src/const";
import { run } from "../src/post";

jest.mock("@aws-sdk/client-ssm");
jest.mock("@actions/core");

describe("post", () => {
  const mockCore = core as jest.Mocked<typeof core>;
  const mockSSMClient = SSMClient as jest.MockedClass<typeof SSMClient>;
  const sessionId = "test-session";
  let send: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_DEFAULT_REGION = "us-east-1";
    mockCore.getState.mockReturnValue(sessionId);
    send = jest.fn().mockResolvedValue({});
    mockSSMClient.mockImplementation(() => ({ send }) as unknown as SSMClient);
  });

  it("terminates the saved session", async () => {
    await run();

    expect(mockCore.getState).toHaveBeenCalledWith(StateName.SessionId);
    expect(TerminateSessionCommand).toHaveBeenCalledWith({
      SessionId: sessionId,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockCore.warning).not.toHaveBeenCalled();
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it("does nothing when no session was saved", async () => {
    mockCore.getState.mockReturnValue("");

    await run();

    expect(send).not.toHaveBeenCalled();
    expect(mockCore.info).toHaveBeenCalledWith("No SSM session to terminate.");
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it("warns instead of failing the job when termination fails", async () => {
    send.mockRejectedValueOnce(new Error("ExpiredTokenException"));

    await run();

    expect(mockCore.warning).toHaveBeenCalledWith(
      "Could not terminate the SSM session: ExpiredTokenException",
    );
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  it("warns with a generic message for non-Error failures", async () => {
    send.mockRejectedValueOnce("Not an error object");

    await run();

    expect(mockCore.warning).toHaveBeenCalledWith(
      `Could not terminate the SSM session: ${ErrorMessage.UnexpectedError}`,
    );
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });
});
