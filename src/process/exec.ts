import { spawn } from "node:child_process";

export type CommandResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  termination: "exit" | "signal" | "timeout";
};

export async function runCommandWithTimeout(
  argv: string[],
  options?: {
    timeoutMs?: number;
    env?: Record<string, string>;
  },
): Promise<CommandResult> {
  if (argv.length === 0) {
    throw new Error("runCommandWithTimeout requires at least one argv entry.");
  }
  const [command, ...args] = argv;
  const timeoutMs = options?.timeoutMs ?? 60_000;

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(options?.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        code,
        signal,
        termination: timedOut ? "timeout" : signal ? "signal" : "exit",
      });
    });
  });
}
