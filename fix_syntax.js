const fs = require('fs');
let content = fs.readFileSync('admin.html', 'utf8');

// Fix passwordEl.value
content = content.replace(/passwordEl\.value = readStoredPassword\(\);/g, '');

// Fix function authStatus
content = content.replace(/function\s*\n\s*authStatus\.className = "status " \+ type;\s*\n\s*authStatus\.textContent = msg;\s*\n\s*\}/g, '');

fs.writeFileSync('admin.html', content);
