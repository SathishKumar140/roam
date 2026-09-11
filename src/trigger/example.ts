import { task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",
  run: async (payload: { message?: string } = {}) => {
    const message = payload.message ?? "Hello from Trigger.dev!";
    console.log(message);

    return {
      message,
      timestamp: new Date().toISOString(),
    };
  },
});
