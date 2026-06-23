// DealForge — operator tool to mint an offline license key (e.g. for a lifetime buyer or a
// bundle/giveaway). Keys validate offline against DEALFORGE_LICENSE_SECRET, so set that env var
// to the SAME value here and on the server. Usage:
//   node scripts/make-license.mjs --plan lifetime --email buyer@example.com
import { generateLicenseKey } from "../db/licenses.js";

const args = Object.fromEntries(
  process.argv.slice(2).join(" ").split("--").filter(Boolean).map((s) => {
    const [k, ...v] = s.trim().split(/\s+/); return [k, v.join(" ")];
  })
);
const plan = args.plan || "lifetime";
const email = args.email || "";
console.log(generateLicenseKey({ plan, email }));
