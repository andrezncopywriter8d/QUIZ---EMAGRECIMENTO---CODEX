const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "style.css",
  "script.js",
  "quiz-data.json",
  "quiz-data.js",
  "supabase-config.js",
  "supabase-tracking.js",
  "dashboard.html",
  "dashboard.css",
  "dashboard.js",
  "sw.js",
  "README.md"
];

function copyRecursive(source, target) {
  const stats = fs.statSync(source);

  if (stats.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) {
    copyRecursive(source, path.join(dist, file));
  }
}

copyRecursive(path.join(root, "assets"), path.join(dist, "assets"));

console.log("Cloudflare build ready in dist/");
