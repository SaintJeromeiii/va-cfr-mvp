const { execSync } = require("child_process");

// Grab commit message from CLI
const msg = process.argv.slice(2).join(" ").trim() || "auto save";

try {
  console.log("📦 Staging files...");
  execSync("git add .", { stdio: "inherit" });

  console.log(`📝 Committing: "${msg}"`);
  execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { stdio: "inherit" });

  console.log("🚀 Pushing to GitHub...");
  execSync("git push", { stdio: "inherit" });

  console.log("✅ Save complete!");
} catch (err) {
  console.log("⚠️ Nothing to commit or push.");
}
