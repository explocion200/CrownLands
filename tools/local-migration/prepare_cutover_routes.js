"use strict";
// Pure preparation: this never writes /etc, changes a symlink or starts services.
function replaceHandle(source, matcher, replacement) {
  const escaped = matcher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^\\t\\thandle " + escaped + " \\{\\n[\\s\\S]*?^\\t\\t\\}\\n", "gm");
  if ([...source.matchAll(pattern)].length !== 1) throw Error("Review changed protected route layout");
  return source.replace(pattern, replacement);
}
function proxy(matcher, port, bytes) {
  return `\t\thandle ${matcher} {\n\t\t\trequest_body {\n\t\t\t\tmax_size ${bytes}\n\t\t\t}\n\t\t\treverse_proxy 127.0.0.1:${port} {\n\t\t\t\theader_up X-Crownlands-Client-IP {remote_host}\n\t\t\t}\n\t\t}\n`;
}
function prepare(before) {
  if (!before.includes("(crownlands_routes) {") || !before.includes("/srv/crownlands/current/game")
    || !before.includes("reverse_proxy 127.0.0.1:9294")) throw Error("Expected reviewed server routes required");
  if (!before.includes("reverse_proxy 127.0.0.1:9190") || !before.includes("reverse_proxy 127.0.0.1:9191")) throw Error("Existing preview routing changed");
  let active = replaceHandle(before, "/local-auth/*", proxy("/local-auth/*", 9290, 16384));
  active = replaceHandle(active, "/api/local-game/*", proxy("/api/local-game/*", 9291, 2097152));
  active = replaceHandle(active, "@rankings", proxy("@rankings", 9291, 16384));
  if (active.includes("us-central1-crown-land-b15e0.cloudfunctions.net")) throw Error("Unmigrated Firebase website route remains");
  const marker = "\troute {\n";
  const start = before.indexOf("(crownlands_routes) {"), end = before.indexOf("\n}", start) + 2;
  const scope = before.slice(start, end);
  if (end <= start || scope.split(marker).length !== 2) throw Error("Review route insertion point");
  const paused = scope.replace(marker, marker + `\t\t@gameTransfer path /play /play/* /local-auth/* /api/local-game/* /api/season-rankings\n\t\theader @gameTransfer {\n\t\t\tCache-Control \"no-store\"\n\t\t\tRetry-After 300\n\t\t}\n\t\trespond @gameTransfer \"Crownlands is moving to its new server. Your progress is being preserved. Please try again shortly.\" 503\n`);
  const maintenance = before.slice(0, start) + paused + before.slice(end);
  return { active, maintenance };
}
module.exports = { prepare };
