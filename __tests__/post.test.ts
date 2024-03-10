import * as core from "@actions/core";
import { SSMClient } from "@aws-sdk/client-ssm";
import { ErrorMessage, StateName } from "../src/const";
import { run } from "../src/post";

jest.mock("@aws-sdk/client-ssm");
jest.mock("@actions/core");

describe("run function", () => {
  const mockCore = core as jest.Mocked<typeof core>;
  const mockSSMClient = SSMClient as jest.MockedClass<typeof SSMClient>;
  const sessionId = StateName.SessionId;
  const region = "us-east-1";

  beforeEach(() => {
    process.env.AWS_DEFAULT_REGION = region;
    mockCore.getState.mockReturnValue(sessionId);
  });

  it("should get the session ID from the state", async () => {
    await run();
    expect(mockCore.getState).toHaveBeenCalledWith(sessionId);
  });

  it("should set the workflow as failed if an error occurs", async () => {
    const errorMessage = "Send error";
    mockSSMClient.mockImplementation(
      () =>
        ({
          send: jest.fn().mockRejectedValueOnce(new Error(errorMessage)),
        }) as unknown as SSMClient,
    );

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(errorMessage);
  });

  it("should set the workflow as failed if an unexpected error occurs", async () => {
    mockSSMClient.mockImplementation(
      () =>
        ({
          send: jest.fn().mockRejectedValueOnce("Not an error object"),
        }) as unknown as SSMClient,
    );

    await run();

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      ErrorMessage.UnexpectedError,
    );
  });
});
