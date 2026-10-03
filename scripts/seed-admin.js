#!/usr/bin/env node
/**
 * Creates (or resets the password for) the admin login. Never a hardcoded
 * default — always prompted, so no throwaway password survives into production.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

if (!process.env.MONGODB_URI) {
  console.error('✖ MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const rl = readline.createInterface({ input: stdin, output: stdout });
const email = (await rl.question('Admin email: ')).trim().toLowerCase();
const password = await rl.question('Admin password (min 8 chars): ');
rl.close();

if (!email.includes('@')) {
  console.error('✖ That doesn\'t look like an email address.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('✖ Password must be at least 8 characters.');
  process.exit(1);
}

// A one-off connection, not the pooled client from src/lib/db.ts: this script
// runs directly under Node, not bundled by Vite, so it can't resolve a `.ts`
// module through a `.js`-suffixed specifier — that resolution trick is Vite's
// "Bundler" moduleResolution, which doesn't apply to a plain `node` process.
// Same reason hashPassword() isn't imported from src/lib/auth.ts either — it's
// one line, not worth the same problem for.
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
await client.connect();
const db = client.db('giftshop');
await db.collection('users').createIndex({ email: 1 }, { unique: true });

const passwordHash = await bcrypt.hash(password, 12);
const existing = await db.collection('users').findOne({ email });

if (existing) {
  await db.collection('users').updateOne({ email }, { $set: { passwordHash } });
  console.log(`✔ Password updated for ${email}.`);
} else {
  await db.collection('users').insertOne({
    email, passwordHash, role: 'owner', createdAt: new Date(), lastLoginAt: null,
  });
  console.log(`✔ Admin account created for ${email}.`);
}

await client.close();
console.log('\nSign in at /admin/login once the site is deployed (or at http://localhost:4321/admin/login locally).');
