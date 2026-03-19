import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";

if (!existsSync("build")) mkdirSync("build");

execSync(
  `zip -r build/zotero-price-lookup.xpi manifest.json bootstrap.js prefs.js addon/ locale/`,
  { stdio: "inherit" }
);

console.log("Built: build/zotero-price-lookup.xpi");
