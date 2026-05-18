import mongoose from 'mongoose';
import '../../config.js';
import { connectDB } from '../../lib/database.js';

async function run() {
  try {
    await connectDB();
    const { takeProductAccount } = await import('../../lib/database.js');
    const ref = 'SIMREFTEST';
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(
        takeProductAccount(9999, 'SAMPLE001', 1, ref)
          .then((r) => ({ i, r }))
          .catch((e) => ({ i, e }))
      );
    }

    const results = await Promise.all(tasks);
    console.log('Same ref results:');
    results.forEach((r) => console.log(r));
  } finally {
    await mongoose.disconnect();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
