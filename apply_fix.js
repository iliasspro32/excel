const fs = require('fs');
let content = fs.readFileSync('admin.html', 'utf8');

// 1. Remove Auth Row
content = content.replace(/<!-- Auth row \(siempre visible\) -->[\s\S]*?<!-- DASHBOARD WRAP \(Hidden until auth\) -->/g, '<!-- DASHBOARD WRAP (Hidden until auth) -->');

// 2. Remove dashboard wrap div and closing div
content = content.replace(/<div id="dashboard-wrap" style="display:none">/g, '');
content = content.replace(/<\/div> <!-- end dashboard-wrap -->/g, '');

// 3. Make getPassword return "ok" to satisfy all JS checks
content = content.replace(/function getPassword\(\) \{ return passwordEl\.value\.trim\(\); \}/g, 'function getPassword() { return "ok"; }');

// 4. Remove DOM elements that no longer exist
content = content.replace(/const passwordEl = document\.getElementById\("admin-password"\);/g, '');
content = content.replace(/const authStatus = document\.getElementById\("auth-status"\);/g, '');

// 5. Fix savePassword to not use history.replaceState or DOM elements that don't exist
content = content.replace(/function savePassword\(\) \{[\s\S]*?setDebug\("contraseña guardada en: " \+ \(saved\.length \? saved\.join\("\+"\) : "¡ninguno!"\)\);\s*\}/g, 'function savePassword() {}');

// 6. Fix setAuthStatus to not use authStatus
content = content.replace(/function setAuthStatus\(msg, type = ""\) \{\s*authStatus\.className = "status " \+ type;\s*authStatus\.textContent = msg;\s*\}/g, 'function setAuthStatus(msg, type = "") {}');

// 7. Simplify loadConfig to not hide/show missing DOM elements
content = content.replace(/document\.getElementById\("dashboard-wrap"\)\.style\.display = "block";/g, '');
content = content.replace(/document\.getElementById\("auth-row"\)\.style\.display = "none";/g, '');
content = content.replace(/document\.getElementById\("dashboard-wrap"\)\.style\.display = "none";/g, '');
content = content.replace(/document\.getElementById\("auth-row"\)\.style\.display = "block";/g, '');

// 8. Auto loadConfig on load instead of waiting for button
content = content.replace(/document\.getElementById\("load-btn"\)\.addEventListener\("click", \(\) => loadConfig\(\)\);[\s\S]*?window\.addEventListener\("DOMContentLoaded", \(\) => \{[\s\S]*?\}\);/g, 'window.addEventListener("DOMContentLoaded", () => { loadConfig(); });');

fs.writeFileSync('admin.html', content);
