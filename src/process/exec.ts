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
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let closed = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const killProcessTree = () => {
      if (child.pid && !closed) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        killProcessTree();
      }, 200);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      reject(error);
    });
    child.on("close", (code, signal) => {
      closed = true;
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }
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
