import { MongoClient } from 'mongodb';
export function createDatabase(config) {
  const client = new MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 3000, timeoutMS: 5000 });
  const db = client.db(config.databaseName);
  const history = db.collection('prediction_history');
  return {
    async connect() { await client.connect(); await history.createIndex({ created_at: -1 }); },
    async ping() { await db.command({ ping: 1 }); return true; },
    async savePrediction(document) { await history.insertOne({ ...document, created_at: new Date() }); },
    async listPredictions(limit) {
      return history.find({}, { projection: { _id: 0, features: 0 } }).sort({ created_at: -1 }).limit(limit).toArray();
    },
    close: () => client.close(),
  };
}
