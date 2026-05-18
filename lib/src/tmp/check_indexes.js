import mongoose from 'mongoose';
import '../../config.js';
import { User, Bot, Product, Category, ProductStock, Transaction, connectDB } from '../../lib/database.js';

async function run() {
  try {
    await connectDB();
    console.log('Connected to DB for index check');

    const models = [
      { name: 'User', model: User },
      { name: 'Bot', model: Bot },
      { name: 'Product', model: Product },
      { name: 'Category', model: Category },
      { name: 'ProductStock', model: ProductStock },
      { name: 'Transaction', model: Transaction },
    ];

    for (const m of models) {
      try {
        const idx = await m.model.collection.indexes();
        console.log(`\nIndexes for ${m.name}:`);
        idx.forEach((i) => console.log(JSON.stringify(i)));
      } catch (e) {
        console.error(`Failed to list indexes for ${m.name}:`, e.message);
      }
    }

    console.log('\nIndex check completed.');
  } catch (e) {
    console.error('Error in check_indexes:', e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run().then(() => process.exit(0));
