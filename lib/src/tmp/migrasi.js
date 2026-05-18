
import { MongoClient } from 'mongodb';

const uri = global.url_mongodb || "mongodb://localhost:27017"; 
const dbName = "MannDB"; 

async function runMigration() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✓ Berhasil connect ke MongoDB untuk migrasi.");
    const db = client.db(dbName);

    
    const migrations = [
      
      { collection: 'users', oldField: 'id', newField: 'userId', dropIndex: true, newIndex: { userId: 1 } },
      
      { collection: 'bots', oldField: 'id', newField: 'botId', dropIndex: true, newIndex: { botId: 1 } },
      
      { 
        collection: 'products', 
        oldField: 'id', 
        newField: 'productId',
        dropIndex: true, 
        newIndex: null 
      }
    ];

    for (const mig of migrations) {
      const collection = db.collection(mig.collection);
      console.log("-----------------------------------------");
      console.log(`Mulai Migrasi: Koleksi '${mig.collection}' (id -> ${mig.newField})`);

      
      const result = await collection.updateMany(
        { [mig.oldField]: { $exists: true } }, 
        { $rename: { [mig.oldField]: mig.newField } }
      );

      console.log(`✅ Rename Field: ${result.modifiedCount} dokumen dimodifikasi.`);
      
      
      if (mig.dropIndex) {
        
        try {
            await collection.dropIndexes();
            console.log(`   - Semua index lama (kecuali _id) berhasil dihapus.`);
        } catch (e) {
            
        }
        
        if (mig.collection === 'products') {
          
          await collection.createIndex(
            { botId: 1, productId: 1 }, 
            { unique: true, name: "botId_1_productId_1" }
          );
          console.log(`   - Compound Index Baru: { botId: 1, productId: 1 } berhasil dibuat.`);
        
        } else if (mig.newIndex) {
          
          await collection.createIndex(
            mig.newIndex, 
            { unique: true }
          );
          console.log(`   - Index Unik Baru: { ${mig.newField}: 1 } berhasil dibuat.`);
        }
      }
    }
    
    console.log("-----------------------------------------");
    console.log("✅ MIGRASI SELESAI. Tiga koleksi utama telah diubah: users (userId), bots (botId), products (productId).");
    console.log("-----------------------------------------");

  } catch (e) {
    console.error("❌ ERROR saat menjalankan migrasi:", e);
  } finally {
    await client.close();
    console.log("Sesi koneksi ditutup.");
  }
}


runMigration();