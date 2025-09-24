
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer');
const assessments = require('./data');
const config = require('./config.json'); 

const app = express();
app.use(cors());
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));
app.use(express.json());

const USERS = []; 
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email & password required' });
  if (USERS.find(u => u.email === email)) return res.status(400).json({ error: 'user exists' });
  const hash = await bcrypt.hash(password, 8);
  const user = { id: Date.now(), email, passwordHash: hash };
  USERS.push(user);
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '6h' });
  res.json({ token });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = USERS.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '6h' });
  res.json({ token });
});

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'no token' });
  const token = h.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function getValue(obj, mapping) {
  if (!mapping) return '';
  if (mapping.type === 'path') {
    const parts = mapping.path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur === undefined || cur === null) return '';
      if (/^\d+$/.test(p)) cur = cur[Number(p)];
      else cur = cur[p];
    }
    return cur === undefined ? '' : cur;
  }
  if (mapping.type === 'find') {
    const arr = obj[mapping.array];
    if (!Array.isArray(arr)) return '';
    const found = arr.find(item => String(item[mapping.matchKey]) === String(mapping.matchValue));
    if (!found) return '';
    if (!mapping.path) return found;
    const parts = mapping.path.split('.');
    let cur = found;
    for (const p of parts) {
      if (cur === undefined || cur === null) return '';
      if (/^\d+$/.test(p)) cur = cur[Number(p)];
      else cur = cur[p];
    }
    return cur === undefined ? '' : cur;
  }
  return '';
}

function renderHTML(record, assessmentConfig) {
  let html = `
  <!doctype html>
  <html><head><meta charset="utf-8"><title>Report ${record.session_id}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;padding:20px}
    h1{margin-bottom:6px}
    h2{margin-top:18px;border-bottom:1px solid #eee;padding-bottom:6px}
    .field{margin:6px 0}
    .label{font-weight:600}
  </style>
  </head><body>
  <h1>Report - ${record.assessment_id}</h1>
  <div>Session ID: ${record.session_id}</div>
  <div>Generated: ${new Date().toLocaleString()}</div>
  `;

  for (const section of (assessmentConfig.sections || [])) {
    html += `<h2>${section.title}</h2><div>`;
    for (const field of (section.fields || [])) {
      const rawValue = getValue(record, field.mapping);
      let display = (rawValue === null || rawValue === undefined) ? '' : rawValue;
      if (field.classifyKey && assessmentConfig.classifications && assessmentConfig.classifications[field.classifyKey]) {
        const ranges = assessmentConfig.classifications[field.classifyKey];
        const n = parseFloat(rawValue);
        if (!isNaN(n)) {
          const matched = ranges.find(r => n >= r.min && n < r.max);
          if (matched) display = `${rawValue} (${matched.label})`;
        }
      }
      html += `<div class="field"><span class="label">${field.label}:</span> <span class="value">${display}</span></div>`;
    }
    html += `</div>`;
  }

  html += `</body></html>`;
  return html;
}

app.get('/api/generate-report', authMiddleware, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id required' });
  const record = assessments.find(a => a.session_id === sessionId);
  if (!record) return res.status(404).json({ error: 'session not found' });

  const assessmentId = record.assessment_id;
  const assessmentConfig = config[assessmentId] || config['default'] || { sections: [] };
  const html = renderHTML(record, assessmentConfig);

  const pdfDir = path.join(__dirname, 'pdfs');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir);
  const filename = `${sessionId}_${Date.now()}.pdf`;
  const filepath = path.join(pdfDir, filename);

  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: filepath, format: 'A4', printBackground: true });
    await browser.close();
    return res.json({ success: true, path: filepath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'pdf generation failed', details: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
