import mongoose from 'mongoose';
import '../../config.js';
import { Product, ProductStock, connectDB } from '../../lib/database.js';

async function setupSample(botId = 9999, productId = 'SAMPLE001', stockCount = 5) {
  await connectDB();
  console.log('Connected for setup');
  await Product.updateOne({ botId, productId }, { botId, productId, name: 'Sample', price: 1000 }, { upsert: true });
  const docs = [];
  for (let i = 0; i < stockCount; i++) docs.push({ botId, productId, accountData: `acc${i}`, isSold: false });
  await ProductStock.insertMany(docs);
  console.log(`Inserted ${stockCount} accounts for ${productId}`);
}

async function runConcurrentAllocations(concurrency = 8) {
  const { takeProductAccount } = await import('../../lib/database.js');
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    const trx = `TEST${Date.now()}-${i}`;
    promises.push(takeProductAccount(9999, 'SAMPLE001', 1, trx).then((r) => ({ trx, r })).catch((e) => ({ trx, e })));
  }
  const results = await Promise.all(promises);
  console.log('Results:');
  results.forEach((res) => console.log(res));
}

async function main() {
  try {
    await setupSample();
    await runConcurrentAllocations();
  } finally {
    await mongoose.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
