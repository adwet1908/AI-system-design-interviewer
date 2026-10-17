import { connectDb } from '../db.js';
import { Problem } from '../models/Problem.js';
import { problems } from './problems.js';

await connectDb();

let upserted = 0;
for (const problem of problems) {
  await Problem.findOneAndUpdate({ slug: problem.slug }, problem, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
  upserted += 1;
  console.log(`Upserted problem: ${problem.slug}`);
}

const count = await Problem.countDocuments({
  slug: { $in: problems.map((p) => p.slug) },
});

console.log(`Seed complete. Upserted ${upserted} briefs. Matching slug count: ${count}.`);
process.exit(0);
