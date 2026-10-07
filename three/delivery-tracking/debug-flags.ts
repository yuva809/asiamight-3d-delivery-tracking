/**
 * Diagnostics only: `?fx=noao,nosoft,nobloom,nopost,noshadow,dpr1` disables
 * individual rendering features so their cost can be measured in any build.
 */
const raw = typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("fx") ?? "");
const set = new Set(raw.split(",").filter(Boolean));
export const fx = (flag: string) => set.has(flag);
