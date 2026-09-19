#!/usr/bin/env node
/**
 * Creates (or resets the password for) the admin login. Never a hardcoded
 * default — always prompted, so no throwaway password survives into production.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { getDb, closeDb } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth.js';

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

const db = await getDb();
await db.collection('users').createIndex({ email: 1 }, { unique: true });

const passwordHash = await hashPassword(password);
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

await closeDb();
console.log('\nSign in at /admin/login once the site is deployed (or at http://localhost:4321/admin/login locally).');
