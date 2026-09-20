const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let commit = process.env.GITHUB_SHA || "";
if (!commit) {
  try {
    commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch (_) {
    commit = "";
  }
}
if (!commit) commit = "dev";

const payload = {
  commit,
  builtAt: new Date().toISOString(),
};

const out = path.join(__dirname, "..", "src", "assets", "version.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
console.log("Wrote version.json", payload);
