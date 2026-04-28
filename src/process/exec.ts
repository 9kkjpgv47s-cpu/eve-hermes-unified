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
    /** When aborted, sends SIGTERM to the child (same as wall-clock timeout). */
    signal?: AbortSignal;
  },
): Promise<CommandResult> {
  if (argv.length === 0) {
    throw new Error("runCommandWithTimeout requires at least one argv entry.");
  }
  const [command, ...args] = argv;
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const externalSignal = options?.signal;

  if (externalSignal?.aborted) {
    return {
      stdout: "",
      stderr: "",
      code: null,
      signal: "SIGTERM",
      termination: "signal",
    };
  }

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(options?.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let abortedBySignal = false;

    const killChild = () => {
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGTERM");
      }
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killChild();
    }, timeoutMs);

    const onExternalAbort = () => {
      clearTimeout(timeout);
      abortedBySignal = true;
      killChild();
    };

    if (externalSignal) {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
      const termination = timedOut ? "timeout" : abortedBySignal || signal ? "signal" : "exit";
      resolve({
        stdout,
        stderr,
        code,
        signal,
        termination,
      });
    });
  });
}
