/**
 * Adds the sample data (one record per module and panel) to owners that don't have it yet.
 *
 *   npm run seed:samples -- --dry-run   list the owners that would get samples, change nothing
 *   npm run seed:samples                seed them
 *
 * Owners that already have the sample teacher are skipped, so running it twice is safe.
 * Sample photo links use PUBLIC_BASE_URL (or http://localhost:4000) as the server address.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import AuthModel from "../src/model/Auth/auth.js";
import { SampleDataService } from "../src/services/sample/sampleData.js";

dotenv.config();
const dryRun = process.argv.includes("--dry-run");

await connectDB();
const owners = await AuthModel.find({ role: "admin", isDeleted: false, workType: { $in: ["school", "coaching"] } }).select("fullName email instituteName workType").lean();
console.log(`${owners.length} owner account(s)${dryRun ? " · DRY RUN, nothing is changed" : ""}\n`);
let seeded = 0;
for (const owner of owners) {
  const label = `${owner.instituteName || owner.fullName || "—"} <${owner.email}> (${owner.workType})`;
  if (await SampleDataService.hasSamples(owner._id)) { console.log(`skip    ${label}: already has samples`); continue; }
  if (dryRun) { console.log(`would   ${label}`); continue; }
  const result = await SampleDataService.seed({ _id: owner._id, fullName: owner.fullName, workType: owner.workType as "school" | "coaching" });
  seeded++;
  console.log(`seeded  ${label}: ${result.done.length} added${result.skipped.length ? `, ${result.skipped.length} skipped (${result.skipped.join("; ")})` : ""}`);
}
console.log(`\n${dryRun ? "Dry run finished." : `Done: ${seeded} owner(s) seeded.`}`);
await mongoose.disconnect();
