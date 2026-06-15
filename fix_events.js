const fs = require('fs');
let content = fs.readFileSync('admin.html', 'utf8');

// Replace the event listener for load-btn to not throw a null error
content = content.replace(/document\.getElementById\("load-btn"\)\.addEventListener\("click", loadConfig\);/g, 'window.addEventListener("DOMContentLoaded", loadConfig);');

fs.writeFileSync('admin.html', content);
