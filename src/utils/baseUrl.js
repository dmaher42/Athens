export function resolveBaseUrl() {
  // Vite base: "./" => use relative paths (works in dev and on Pages).
  return "";
}
export function joinPath(...parts) {
  return parts
    .filter(Boolean)
    .map((p) => String(p).replace(/(^\/+/|\/+$)/g, ""))
    .join("/");
}
