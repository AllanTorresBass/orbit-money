/**
 * Dev-only impersonation via x-user-id / x-tenant-id.
 * Production must rely on Auth.js cookies; headers are ignored.
 */
export function isDevHeaderAuthEnabled(): boolean {
  return process.env.ALLOW_DEV_HEADER_AUTH === "true";
}

export function isClientDevHeaderAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_DEV_HEADER_AUTH === "true";
}
