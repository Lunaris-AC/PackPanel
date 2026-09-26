const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const host = process.env.SSH_HOST || '192.168.1.171';
const port = parseInt(process.env.SSH_PORT || '22', 10);
const username = process.env.SSH_USER || 'root';
const password = process.env.SSH_PASSWORD;

if (!password) {
  console.error('SSH_PASSWORD environment variable is required');
  process.exit(1);
}

const pubKeyPath = path.join(process.env.USERPROFILE || process.env.HOME, '.ssh', 'id_ed25519_packpanel.pub');
if (!fs.existsSync(pubKeyPath)) {
  console.error('Public key not found at', pubKeyPath);
  process.exit(1);
}

const pubKey = fs.readFileSync(pubKeyPath, 'utf8').trim();

console.log(`Connecting to ${username}@${host}:${port}...`);

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection established successfully via password.');
  
  const setupCmd = `
    mkdir -p ~/.ssh && chmod 700 ~/.ssh &&
    touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys &&
    grep -q -F "${pubKey}" ~/.ssh/authorized_keys || echo "${pubKey}" >> ~/.ssh/authorized_keys
  `;

  conn.exec(setupCmd, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      process.exit(1);
    }
    stream.on('close', (code, signal) => {
      console.log(`Key installed with exit code: ${code}`);
      conn.end();
      process.exit(code === 0 ? 0 : 1);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('SSH connection error:', err.message);
  process.exit(1);
}).connect({
  host,
  port,
  username,
  password,
  algorithms: {
    kex: [
      'curve25519-sha256',
      'curve25519-sha256@libssh.org',
      'ecdh-sha2-nistp256',
      'diffie-hellman-group-exchange-sha256'
    ]
  }
});
