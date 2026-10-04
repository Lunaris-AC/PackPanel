const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', 'packages', 'launcher');
fs.cpSync(path.join(root, 'src', 'renderer'), path.join(root, 'dist', 'renderer'), { recursive: true });
