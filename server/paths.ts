import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type FailureCode = "vault-missing" | "not-found" | "too-large" | "forbidden" | "error";
export type { FailureCode };

export class VaultError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
  }
}

export function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return path.join(homedir(), value.slice(2));
  return value;
}

export function toVaultRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

export function describeFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "err.path-missing";
  if (code === "ENOTDIR") return "err.not-dir";
  if (code === "EACCES" || code === "EPERM") return "err.perm";
  // 兜底绝不回显 error.message：非常见 errno 的 Node fs 错误自带绝对用户路径。
  return `err.fs:${code ?? "unknown"}`;
}

export function failureFrom(error: unknown): { code: FailureCode; message: string } {
  if (error instanceof VaultError) return { code: error.code, message: error.message };
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return { code: "not-found", message: "err.not-found" };
  if (code === "EACCES" || code === "EPERM") return { code: "forbidden", message: "err.perm" };
  return { code: "error", message: describeFsError(error) };
}

/** zod 已挡掉 .. 与绝对路径，这里再用 realpath 前缀比对拦 symlink 逃逸。 */
export async function resolveInVault(root: string, relativePath: string): Promise<string> {
  let real: string;
  try {
    real = await realpath(path.resolve(root, relativePath));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EACCES" || code === "EPERM") throw new VaultError("forbidden", "err.perm");
    throw new VaultError("not-found", "err.not-found");
  }
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new VaultError("forbidden", "err.forbidden-range");
  }
  return real;
}

export async function tryResolveFile(root: string, candidate: string): Promise<string | null> {
  try {
    const real = await resolveInVault(root, candidate);
    const info = await stat(real);
    return info.isFile() ? real : null;
  } catch {
    return null;
  }
}