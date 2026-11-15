import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(process.cwd());
const outputRoot = resolve(projectRoot, "dist");

if (outputRoot !== resolve(projectRoot, "dist")) {
  throw new Error("Refusing to build outside the project dist directory.");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const entries = [
  "index.html",
  "404.html",
  "favicon.svg",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "CNAME",
  ".nojekyll",
  "assets",
];

for (const entry of entries) {
  await cp(resolve(projectRoot, entry), resolve(outputRoot, entry), {
    recursive: true,
  });
}

const outputs = await readdir(outputRoot);
console.log(`Built ${outputs.length} top-level entries into dist/.`);
