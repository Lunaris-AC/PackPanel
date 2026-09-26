"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const index_1 = require("./index");
const config_1 = require("../config");
const argon2_1 = require("../auth/argon2");
async function runMigrations() {
    console.log('Running database migrations...');
    let schemaPath = path_1.default.join(__dirname, 'schema.sql');
    if (!fs_1.default.existsSync(schemaPath)) {
        schemaPath = path_1.default.join(__dirname, '../../src/db/schema.sql');
    }
    if (!fs_1.default.existsSync(schemaPath)) {
        schemaPath = path_1.default.join(process.cwd(), 'src/db/schema.sql');
    }
    if (!fs_1.default.existsSync(schemaPath)) {
        schemaPath = path_1.default.join(process.cwd(), 'dist/db/schema.sql');
    }
    const schemaSql = fs_1.default.readFileSync(schemaPath, 'utf8');
    await (0, index_1.withTransaction)(async (client) => {
        await client.query(schemaSql);
    });
    console.log('Database schema successfully migrated.');
    // Check if admin user exists
    const res = await (0, index_1.query)('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (res.rows.length === 0) {
        console.log('No administrator found. Creating initial administrator account...');
        let adminPass = config_1.config.ADMIN_DEFAULT_PASSWORD;
        let generated = false;
        if (!adminPass || adminPass.trim() === '') {
            adminPass = crypto_1.default.randomBytes(16).toString('base64url');
            generated = true;
        }
        const hashed = await (0, argon2_1.hashPassword)(adminPass);
        await (0, index_1.query)(`INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')`, [config_1.config.ADMIN_LOGIN, hashed]);
        const credsDir = config_1.config.DATA_DIR;
        if (fs_1.default.existsSync(credsDir)) {
            const credsPath = path_1.default.join(credsDir, 'admin_credentials.txt');
            fs_1.default.writeFileSync(credsPath, `ADMIN_LOGIN=${config_1.config.ADMIN_LOGIN}\nADMIN_PASSWORD=${adminPass}\n`, {
                mode: 0o600
            });
            console.log(`Administrator credentials saved securely to ${credsPath}`);
        }
        if (generated) {
            console.log(`Generated Initial Admin Password: ${adminPass}`);
        }
        else {
            console.log(`Initial Admin initialized with configured password.`);
        }
    }
    else {
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
//# sourceMappingURL=migrate.js.map