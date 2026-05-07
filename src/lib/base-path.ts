function withLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function normalizeBasePath(path?: string): string {
  if (!path || path === "/") {
    return "/";
  }

  return withLeadingSlash(path).replace(/\/+$/, "") + "/";
}

export function getAppBasePath(): string {
  return normalizeBasePath(import.meta.env.BASE_URL);
}
