import mongoose from 'mongoose';
const c = await mongoose.createConnection('mongodb://127.0.0.1:27317/reliancebank?replicaSet=rs0&directConnection=true', { dbName: 'reliancebank_audit_itest', serverSelectionTimeoutMS: 5000 }).asPromise();
await c.db.dropDatabase();
console.log('dropped stale itest db');
await c.close();
process.exit(0);
