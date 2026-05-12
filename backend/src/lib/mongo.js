import { MongoClient } from 'mongodb';

let client;
let db;

export async function connectMongo() {
  if (db) return db;
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db('nobi');
  return db;
}

export function getDb() {
  if (!db) throw new Error('MongoDB not connected. Call connectMongo() first.');
  return db;
}
