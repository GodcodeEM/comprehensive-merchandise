// mailer.js v5 — SMTP email with in-app fallback display
// When SMTP is not configured, the code is stored in db and
// returned to the server console AND exposed via a safe dev endpoint.

const crypto = require('crypto');

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getSMTPConfig(db) {
  return {
    host:   db.smtpHost   || process.env.SMTP_HOST   || '',
    port:   Number(db.smtpPort || process.env.SMTP_PORT || 587),
    user:   db.smtpUser   || process.env.SMTP_USER   || '',
    pass:   db.smtpPass   || process.env.SMTP_PASS   || '',
    from:   db.smtpFrom   || process.env.SMTP_FROM   || 'noreply@comprehensivemerchandise.com',
    secure: db.smtpSecure || false
  };
}

function isConfigured(cfg) {
  return !!(cfg.host && cfg.user && cfg.pass);
}

// Real SMTP send using Node.js built-in net/tls
function sendSMTP({ host, port, user, pass, from, to, subject, htmlBody, secure }) {
  return new Promise((resolve, reject) => {
    const net = secure ? require('tls') : require('net');
    const b64 = s => Buffer.from(s).toString('base64');

    const raw = [
      `From: Comprehensive Merchandise <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody
    ].join('\r\n');

    const steps = [
      `EHLO mail.comprehensivemerchandise.com`,
      `AUTH LOGIN`,
      b64(user),
      b64(pass),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      `DATA`,
      raw + '\r\n.',
      `QUIT`
    ];

    let idx = 0;
    const connect = secure
      ? () => require('tls').connect({ host, port, rejectUnauthorized: false })
      : () => { const s = require('net').createConnection(port, host); return s; };

    const socket = connect();
    let buf = '';

    socket.on('data', d => {
      buf += d.toString();
      if (!buf.endsWith('\n')) return;
      const line = buf.trim(); buf = '';
      const code = parseInt(line.slice(0, 3));
      if (code >= 500) { socket.destroy(); return reject(new Error(`SMTP: ${line}`)); }
      if (code === 221) return resolve({ sent: true });
      if (idx < steps.length) socket.write(steps[idx++] + '\r\n');
    });
    socket.on('error', reject);
    socket.setTimeout(8000, () => { socket.destroy(); reject(new Error('SMTP timeout')); });
  });
}

// Main send function — uses SMTP if configured, otherwise logs to console
async function sendEmail({ cfg, to, subject, htmlBody }) {
  if (isConfigured(cfg)) {
    try {
      await sendSMTP({ ...cfg, to, subject, htmlBody });
      console.log(`📧 Email sent to ${to}: ${subject}`);
      return { sent: true };
    } catch (err) {
      console.error(`📧 Email FAILED to ${to}: ${err.message}`);
      return { sent: false, error: err.message };
    }
  } else {
    // Dev mode — print to console clearly
    const text = htmlBody.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📧  EMAIL (SMTP not configured — showing here instead)`);
    console.log(`    To:      ${to}`);
    console.log(`    Subject: ${subject}`);
    console.log(`    Content: ${text.slice(0, 300)}`);
    console.log(`${'─'.repeat(60)}\n`);
    return { sent: false, simulated: true };
  }
}

module.exports = { getSMTPConfig, isConfigured, generateVerificationCode, generateToken, sendEmail };
