import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query, withTransaction } from './index';
import { config } from '../config';
import { hashPassword } from '../auth/argon2';

export async function runMigrations() {
  console.log('Running database migrations...');
  let schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(__dirname, '../../src/db/schema.sql');
  }
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
  }
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.join(process.cwd(), 'dist/db/schema.sql');
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');


  await withTransaction(async (client) => {
    await client.query(schemaSql);
  });
  console.log('Database schema successfully migrated.');

  // Check if admin user exists
  const res = await query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
  if (res.rows.length === 0) {
    console.log('No administrator found. Creating initial administrator account...');
    let adminPass = config.ADMIN_DEFAULT_PASSWORD;
    let generated = false;

    if (!adminPass || adminPass.trim() === '') {
      adminPass = crypto.randomBytes(16).toString('base64url');
      generated = true;
    }

    const hashed = await hashPassword(adminPass);
    await query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')`,
      [config.ADMIN_LOGIN, hashed]
    );

    const credsDir = config.DATA_DIR;
    if (fs.existsSync(credsDir)) {
      const credsPath = path.join(credsDir, 'admin_credentials.txt');
      fs.writeFileSync(credsPath, `ADMIN_LOGIN=${config.ADMIN_LOGIN}\nADMIN_PASSWORD=${adminPass}\n`, {
        mode: 0o600
      });
      console.log(`Administrator credentials saved securely to ${credsPath}`);
    }

    if (generated) {
      console.log(`Generated Initial Admin Password: ${adminPass}`);
    } else {
      console.log(`Initial Admin initialized with configured password.`);
    }
  } else {
    console.log('Administrator account already exists. Skipping bootstrap.');
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
