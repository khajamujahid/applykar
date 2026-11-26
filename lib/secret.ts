import { createHash, timingSafeEqual } from "node:crypto";

export function safeEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
