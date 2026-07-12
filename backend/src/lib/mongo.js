import { MongoClient } from 'mongodb';

const RETRY_INTERVAL_MS = 10_000;

let client;
let db;
let connecting = false;

export function isMongoConnected() {
  return !!db;
}

export async function connectMongo() {
  if (db) return db;
  if (connecting) return null;
  connecting = true;
  try {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db('nobi');
    console.log('MongoDB connected');
    return db;
  } catch (err) {
    console.error('MongoDB connection failed, will retry in the background:', err.message);
    setTimeout(connectMongo, RETRY_INTERVAL_MS);
    return null;
  } finally {
    connecting = false;
  }
}

export function getDb() {
  if (!db) throw new Error('MongoDB not connected. Call connectMongo() first.');
  return db;
}

export function requireMongo(_req, res, next) {
  if (!db) return res.status(503).json({ error: 'Database temporarily unavailable' });
  next();
}
