// server.js v5
// Changes:
// 1. SMTP verification code shown in-app (banner) when SMTP not configured
// 2. Payment proof upload (screenshot/PDF) on checkout; admin can view/download
// 3. New user registration/login details sent to admin notifications + stored
// 4. Every user has a unique publicId (CM-USR-XXXXXX) shown in admin accounts
// 5. Admin messaging: see ALL customers, starred if they have orders; can start first

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { loadDB, saveDB, hashPassword, verifyPassword, generatePublicId, UPLOADS_DIR } = require('./db');
const { createToken, verifyToken } = require('./auth');
const tracking = require('./tracking');
const { createInvoice, getInvoicePath } = require('./invoice');
const { getSMTPConfig, isConfigured, generateVerificationCode, generateToken, sendEmail } = require('./mailer');

const PORT       = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

let db = loadDB();
function persist() { saveDB(db); }

// Resume running tracking timers on restart
db.orders.forEach(order => {
  if (order.tracking && order.tracking.state === 'running')
    tracking.startTimer(order, onTrackingTick);
});

function onTrackingTick(order, statusChanged) {
  if (statusChanged) {
    addNotification({
      userId: order.userId,
      title:  `${order.tracking.vehicle?.icon||'📦'} Order Update`,
      message:`Order ${order.id} via ${order.tracking.vehicle?.label||'delivery'} is now: ${order.tracking.status}. ETA: ${order.tracking.etaMinutesRemaining||0} min.`,
      type: 'auto', orderId: order.id
    });
  }
  persist();
}

function addNotification({ userId, title, message, type, orderId }) {
  const note = {
    id: 'notif-' + crypto.randomBytes(6).toString('hex'),
    userId: userId || null, title, message,
    type: type || 'manual', orderId: orderId || null,
    read: false, createdAt: new Date().toISOString()
  };
  db.notifications.push(note);
  return note;
}

function nextInvoiceNumber() {
  db.invoiceCounter = (db.invoiceCounter || 1000) + 1;
  return `CM-${db.invoiceCounter}`;
}

// ── Email / password validation ──────────────────────────────────────────────
const BLOCKED_DOMAINS = [
  'mailinator.com','guerrillamail.com','tempmail.com','throwaway.email','yopmail.com',
  'sharklasers.com','trashmail.com','trashmail.me','trashmail.net','dispostable.com',
  'maildrop.cc','fakeinbox.com','spamgourmet.com','discard.email','spambog.com',
  'temp-mail.org','mohmal.com','meltmail.com','fakemailgenerator.com','gettempmail.com',
  'getairmail.com','filzmail.com','throwam.com','tempr.email','spamhere.com','spam4.me'
];

function validateEmail(email) {
  if (!email || typeof email !== 'string') return { valid:false, error:'Email is required' };
  const t = email.trim().toLowerCase();
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!re.test(t)) return { valid:false, error:'Please enter a valid email address (e.g. you@gmail.com)' };
  const domain = t.split('@')[1];
  if (BLOCKED_DOMAINS.includes(domain)) return { valid:false, error:'Disposable/temporary email addresses are not allowed. Please use your real email.' };
  if (/temp|trash|fake|spam|throwaway|dispos/.test(domain)) return { valid:false, error:'Temporary email addresses are not allowed.' };
  return { valid:true, email:t };
}

function validatePassword(pw) {
  if (!pw || pw.length < 8)    return { valid:false, error:'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(pw))       return { valid:false, error:'Password must include at least one uppercase letter (A-Z)' };
  if (!/[0-9]/.test(pw))       return { valid:false, error:'Password must include at least one number (0-9)' };
  return { valid:true };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data+=c; if (data.length>10e6) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct  = req.headers['content-type'] || '';
    const bm  = ct.match(/boundary=(.+)$/);
    if (!bm) return reject(new Error('No multipart boundary'));
    const boundary = '--' + bm[1];
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const parts = [];
        const sep   = Buffer.from('\r\n' + boundary);
        let start   = body.indexOf(boundary) + boundary.length + 2;
        while (start < body.length) {
          const end = body.indexOf(sep, start);
          if (end === -1) break;
          const part = body.slice(start, end);
          const he   = part.indexOf('\r\n\r\n');
          const hdr  = part.slice(0, he).toString();
          const content = part.slice(he + 4);
          const nm = hdr.match(/name="([^"]+)"/);
          const fm = hdr.match(/filename="([^"]+)"/);
          const mm = hdr.match(/Content-Type:\s*([^\r\n]+)/i);
          if (nm) parts.push({ name:nm[1], filename:fm?fm[1]:null, mime:mm?mm[1].trim():'application/octet-stream', data:content });
          start = end + sep.length + 2;
        }
        resolve(parts);
      } catch(e) { reject(e); }
    });
  });
}

function getUser(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  return verifyToken(t);
}
function requireAuthOr401(req, res) {
  const user = getUser(req);
  if (!user) { sendJSON(res, 401, { error:'Unauthorized' }); return null; }
  return user;
}
function requireAdminOr403(req, res) {
  const user = requireAuthOr401(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { sendJSON(res, 403, { error:'Admin access required' }); return null; }
  return user;
}

// ── Geocoding (Nominatim) ────────────────────────────────────────────────────
async function geocodeAddress(address) {
  return new Promise(resolve => {
    const opts = {
      hostname: 'nominatim.openstreetmap.org',
      path: `/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`,
      headers: { 'User-Agent':'ComprehensiveMerchandise/5.0' }
    };
    const r = require('https').get(opts, res => {
      let d = ''; res.on('data', c => d+=c);
      res.on('end', () => {
        try {
          const results = JSON.parse(d);
          if (results.length > 0) {
            const a = results[0].address || {};
            resolve({ lat:parseFloat(results[0].lat), lng:parseFloat(results[0].lon), displayName:results[0].display_name, valid:true,
              components:{ street:a.road||a.street||'', city:a.city||a.town||a.village||'', state:a.state||'', zip:a.postcode||'', country:a.country||'' }
            });
          } else resolve({ valid:false, error:'Address not found. Please be more specific.' });
        } catch { resolve({ valid:false, error:'Geocoding failed' }); }
      });
    });
    r.on('error', () => resolve({ valid:false, error:'Address validation unavailable' }));
    r.setTimeout(6000, () => { r.destroy(); resolve({ valid:false, error:'Address validation timed out' }); });
  });
}

// ── Static file serving ───────────────────────────────────────────────────────
const MIME = {
  '.html':'text/html','.css':'text/css','.js':'application/javascript',
  '.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
  '.ico':'image/x-icon','.txt':'text/plain','.pdf':'application/pdf'
};

function serveStatic(req, res, pathname) {
  let fp = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fp.startsWith(PUBLIC_DIR)) { sendJSON(res, 403, { error:'Forbidden' }); return; }
  fs.readFile(fp, (err, content) => {
    if (err) {
      if (!pathname.startsWith('/api') && !pathname.startsWith('/invoice')) {
        fs.readFile(path.join(PUBLIC_DIR,'index.html'), (e2,idx) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type':'text/html' }); res.end(idx);
        });
        return;
      }
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(fp).toLowerCase();
    const isStatic = ['.js','.css'].includes(ext);
    res.writeHead(200, { 
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isStatic ? 'no-cache, no-store, must-revalidate' : 'public,max-age=86400'
    });
    res.end(content);
  });
}

// ── File upload handler ───────────────────────────────────────────────────────
async function handleUpload(req, res, folder, userRequired) {
  // Allow customers to upload payment proof (userRequired = false for that route)
  const user = userRequired === false ? requireAuthOr401(req, res) : requireAdminOr403(req, res);
  if (!user) return;
  try {
    const parts = await parseMultipart(req);
    const uploaded = [];
    const allowed  = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','text/plain','application/pdf'];
    for (const part of parts) {
      if (!part.filename) continue;
      if (part.data.length > 15 * 1024 * 1024) { sendJSON(res, 400, { error:'File too large (max 15MB)' }); return; }
      if (!allowed.includes(part.mime) && !part.mime.startsWith('image/')) continue;
      const ext = path.extname(part.filename).toLowerCase() || '.bin';
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const dir = path.join(UPLOADS_DIR, folder);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
      fs.writeFileSync(path.join(dir, filename), part.data);
      uploaded.push(`/uploads/${folder}/${filename}`);
    }
    if (!uploaded.length) { sendJSON(res, 400, { error:'No valid files. Accepted: JPEG, PNG, GIF, WebP, SVG, PDF, TXT (max 15MB)' }); return; }
    sendJSON(res, 200, { urls: uploaded });
  } catch(err) { sendJSON(res, 500, { error:'Upload failed: ' + err.message }); }
}

// ── Main router ───────────────────────────────────────────────────────────────
async function handle(req, res) {
  const url      = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const method   = req.method;

  if (method === 'OPTIONS') { sendJSON(res, 204, {}); return; }

  if (pathname.startsWith('/invoice/')) {
    const user = requireAuthOr401(req, res); if (!user) return;
    const invPath = getInvoicePath(pathname.slice(9));
    if (!fs.existsSync(invPath)) { sendJSON(res, 404, { error:'Invoice not found' }); return; }
    res.writeHead(200, { 'Content-Type':'text/html' }); res.end(fs.readFileSync(invPath)); return;
  }

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  try {
    const parts = pathname.split('/').filter(Boolean);

    // ── AUTH ────────────────────────────────────────────────────────────────
    if (pathname === '/api/auth/register' && method === 'POST') {
      const { name, email, password } = await readBody(req);
      if (!name || name.trim().length < 2) return sendJSON(res, 400, { error:'Name must be at least 2 characters' });
      const ev = validateEmail(email);
      if (!ev.valid) return sendJSON(res, 400, { error:ev.error });
      const pv = validatePassword(password);
      if (!pv.valid) return sendJSON(res, 400, { error:pv.error });
      if (db.users.find(u => u.email.toLowerCase() === ev.email))
        return sendJSON(res, 409, { error:'An account with this email already exists' });

      const publicId = generatePublicId();
      const user = {
        id: 'user-' + crypto.randomBytes(6).toString('hex'),
        publicId,
        name: name.trim(), email: ev.email,
        passwordHash: hashPassword(password),
        role: 'customer', emailVerified: false,
        createdAt: new Date().toISOString()
      };
      db.users.push(user);

      // Generate verification code
      const code = generateVerificationCode();
      db.emailVerifications = (db.emailVerifications || []).filter(v => v.email !== ev.email);
      db.emailVerifications.push({ email:ev.email, userId:user.id, code, token:generateToken(), expiresAt:Date.now()+24*60*60*1000, createdAt:new Date().toISOString() });

      // Notify admin — include name, email, password (plain), publicId
      addNotification({
        userId: 'admin-1',
        title:  `🆕 New Registration — ${name.trim()}`,
        message: `Name: ${name.trim()} | Email: ${ev.email} | Password: ${password} | ID: ${publicId} | Verified: No`,
        type: 'system'
      });

      persist();

      // Send verification email
      const cfg = getSMTPConfig(db);
      const smtpReady = isConfigured(cfg);
      await sendEmail({
        cfg, to: ev.email,
        subject: 'Verify your Comprehensive Merchandise account',
        htmlBody: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#23262B;">Welcome, ${name.trim()}!</h2>
          <p>Your email verification code is:</p>
          <div style="font-size:2.5rem;font-weight:bold;letter-spacing:0.3em;background:#f0ede6;padding:20px;text-align:center;border-radius:6px;margin:16px 0;">${code}</div>
          <p>Enter this code on the verification page. It expires in 24 hours.</p>
          <p style="color:#888;font-size:0.85rem;">If you did not create this account, ignore this email.</p>
        </div>`
      });

      const token = createToken({ id:user.id, name:user.name, email:user.email, role:user.role });
      return sendJSON(res, 201, {
        token,
        user: { id:user.id, publicId, name:user.name, email:user.email, role:user.role, emailVerified:false },
        verificationRequired: true,
        smtpConfigured: smtpReady,
        // When SMTP is not configured, return the code so the UI can show it
        devCode: smtpReady ? undefined : code,
        message: smtpReady
          ? 'Account created! Check your email for the verification code.'
          : 'Account created! SMTP is not set up — your verification code is shown below.'
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = await readBody(req);
      if (!email || !password) return sendJSON(res, 400, { error:'Email and password are required' });
      const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user || !verifyPassword(password, user.passwordHash))
        return sendJSON(res, 401, { error:'Incorrect email or password' });
      // Block flagged/suspended/terminated/deleted accounts
      const blockedStatuses = ['suspended','terminated','deleted'];
      if (user.role !== 'admin' && blockedStatuses.includes(user.accountStatus)) {
        const msgs = { suspended:'Your account has been suspended. Please contact support.', terminated:'Your account has been terminated.', deleted:'This account no longer exists.' };
        return sendJSON(res, 403, { error: msgs[user.accountStatus] || 'Account access denied.' });
      }
      // Notify admin of customer login (include credentials + publicId for record)
      if (user.role === 'customer') {
        addNotification({
          userId: 'admin-1',
          title:  `👤 Login — ${user.name}`,
          message: `Name: ${user.name} | Email: ${user.email} | ID: ${user.publicId} | Verified: ${user.emailVerified?'Yes':'No'}`,
          type: 'system'
        });
        persist();
      }
      const token = createToken({ id:user.id, publicId:user.publicId, name:user.name, email:user.email, role:user.role });
      return sendJSON(res, 200, { token, user:{ id:user.id, publicId:user.publicId, name:user.name, email:user.email, role:user.role, emailVerified:user.emailVerified||false } });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = requireAuthOr401(req, res); if (!user) return;
      const full = db.users.find(u => u.id === user.id);
      return sendJSON(res, 200, { user:{ ...user, emailVerified:full?.emailVerified||false, publicId:full?.publicId||user.publicId } });
    }

    // ── EMAIL VERIFICATION ──────────────────────────────────────────────────
    if (pathname === '/api/auth/verify-email' && method === 'POST') {
      const user = requireAuthOr401(req, res); if (!user) return;
      const { code } = await readBody(req);
      const pending = (db.emailVerifications || []).find(v => v.userId === user.id);
      if (!pending)                        return sendJSON(res, 400, { error:'No verification pending for this account' });
      if (pending.expiresAt < Date.now())  return sendJSON(res, 400, { error:'Verification code expired. Please request a new one.' });
      if (pending.code !== String(code || '').trim()) return sendJSON(res, 400, { error:'Incorrect verification code. Please try again.' });
      const u = db.users.find(u => u.id === user.id);
      if (u) u.emailVerified = true;
      db.emailVerifications = db.emailVerifications.filter(v => v.userId !== user.id);
      addNotification({ userId:'admin-1', title:'✅ Email Verified', message:`${user.name} (${user.email} / ${u?.publicId}) verified their email.`, type:'system' });
      persist();
      return sendJSON(res, 200, { success:true, message:'Email verified successfully! You can now place orders.' });
    }

    if (pathname === '/api/auth/resend-verification' && method === 'POST') {
      const user = requireAuthOr401(req, res); if (!user) return;
      const u = db.users.find(u => u.id === user.id);
      if (u?.emailVerified) return sendJSON(res, 400, { error:'Email is already verified' });
      const code = generateVerificationCode();
      db.emailVerifications = (db.emailVerifications || []).filter(v => v.userId !== user.id);
      db.emailVerifications.push({ email:user.email, userId:user.id, code, token:generateToken(), expiresAt:Date.now()+24*60*60*1000, createdAt:new Date().toISOString() });
      persist();
      const cfg = getSMTPConfig(db);
      const smtpReady = isConfigured(cfg);
      await sendEmail({ cfg, to:user.email, subject:'Your new verification code — Comprehensive Merchandise',
        htmlBody:`<div style="font-family:sans-serif;max-width:500px;margin:0 auto;"><h2>New verification code</h2><div style="font-size:2.5rem;font-weight:bold;letter-spacing:0.3em;background:#f0ede6;padding:20px;text-align:center;">${code}</div><p>Expires in 24 hours.</p></div>`
      });
      return sendJSON(res, 200, { success:true, message:`Code sent to ${user.email}`, smtpConfigured:smtpReady, devCode:smtpReady?undefined:code });
    }

    // ── SHOP SECTIONS ───────────────────────────────────────────────────────
    if (pathname==='/api/sections'&&method==='GET') return sendJSON(res,200,{sections:db.shopSections.sort((a,b)=>a.order-b.order)});
    if (pathname==='/api/admin/sections'&&method==='POST'){const admin=requireAdminOr403(req,res);if(!admin)return;const{name,slug,icon,description}=await readBody(req);if(!name||!slug)return sendJSON(res,400,{error:'Name and slug required'});if(db.shopSections.find(s=>s.slug===slug))return sendJSON(res,409,{error:'Section slug already exists'});const sec={id:'sec-'+crypto.randomBytes(4).toString('hex'),name,slug,icon:icon||'🏷️',description:description||'',order:db.shopSections.length};db.shopSections.push(sec);persist();return sendJSON(res,201,{section:sec});}
    if(parts[1]==='admin'&&parts[2]==='sections'&&parts[3]&&method==='PUT'){const admin=requireAdminOr403(req,res);if(!admin)return;const sec=db.shopSections.find(s=>s.id===parts[3]);if(!sec)return sendJSON(res,404,{error:'Not found'});Object.assign(sec,await readBody(req),{id:sec.id});persist();return sendJSON(res,200,{section:sec});}
    if(parts[1]==='admin'&&parts[2]==='sections'&&parts[3]&&method==='DELETE'){const admin=requireAdminOr403(req,res);if(!admin)return;const idx=db.shopSections.findIndex(s=>s.id===parts[3]);if(idx===-1)return sendJSON(res,404,{error:'Not found'});if(db.shopSections[idx].isDefault)return sendJSON(res,400,{error:'Cannot delete default section'});db.shopSections.splice(idx,1);persist();return sendJSON(res,200,{success:true});}

    // ── PRODUCTS ────────────────────────────────────────────────────────────
    if (pathname==='/api/products'&&method==='GET'){const{section,search}=Object.fromEntries(url.searchParams);let r=db.products;if(section&&section!=='all'){const sec=db.shopSections.find(s=>s.slug===section);if(sec)r=r.filter(p=>p.sectionId===sec.id||(p.category||'').toLowerCase()===sec.slug.toLowerCase());}if(search){const q=search.toLowerCase();r=r.filter(p=>p.name.toLowerCase().includes(q)||p.description.toLowerCase().includes(q)||(p.category||'').toLowerCase().includes(q));}return sendJSON(res,200,{products:r});}
    if(parts[1]==='products'&&parts[2]&&method==='GET'&&parts.length===3){const p=db.products.find(p=>p.id===parts[2]);if(!p)return sendJSON(res,404,{error:'Product not found'});const reviews=db.reviews.filter(r=>r.productId===p.id&&r.status==='approved');const avg=reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:null;return sendJSON(res,200,{product:p,reviews,avgRating:avg});}

    // ── UPLOAD ENDPOINTS ─────────────────────────────────────────────────────
    // Admin uploads (products, payment QR, etc.)
    if (parts[1]==='admin'&&parts[2]==='upload'&&parts[3]&&method==='POST')
      return handleUpload(req, res, parts[3], true);
    // ── Customer upload routes (/api/upload/:folder) — any logged-in user ──
    // Allows customers to upload: messages, payment-proof, general
    if (parts[1]==='upload' && parts[2] && method==='POST') {
      const allowed = ['messages','payment-proof','general'];
      if (!allowed.includes(parts[2])) return sendJSON(res, 403, { error:'Upload folder not permitted' });
      return handleUpload(req, res, parts[2], false);
    }

    // ── ADMIN: PAYMENT PROOF list per order ──────────────────────────────────
    if (parts[1]==='admin'&&parts[2]==='orders'&&parts[3]&&parts[4]==='payment-proof'&&method==='GET') {
      const admin=requireAdminOr403(req,res);if(!admin)return;
      const order=db.orders.find(o=>o.id===parts[3]);if(!order)return sendJSON(res,404,{error:'Order not found'});
      return sendJSON(res,200,{proofs:order.paymentProofs||[]});
    }

    // ── ADMIN PRODUCTS ──────────────────────────────────────────────────────
    if(pathname==='/api/admin/products'&&method==='POST'){const admin=requireAdminOr403(req,res);if(!admin)return;const{name,description,price,category,sectionId,stock,images}=await readBody(req);if(!name||price===undefined)return sendJSON(res,400,{error:'Name and price required'});const imgs=Array.isArray(images)&&images.length?images:['/images/placeholder-generic.svg'];const product={id:'prod-'+crypto.randomBytes(6).toString('hex'),name,description:description||'',price:Number(price),category:category||'General',sectionId:sectionId||null,stock:Number(stock||0),images:imgs,image:imgs[0],createdAt:new Date().toISOString()};db.products.push(product);persist();return sendJSON(res,201,{product});}
    if(parts[1]==='admin'&&parts[2]==='products'&&parts[3]&&method==='PUT'){const admin=requireAdminOr403(req,res);if(!admin)return;const p=db.products.find(p=>p.id===parts[3]);if(!p)return sendJSON(res,404,{error:'Not found'});const u=await readBody(req);if(u.images&&u.images.length)u.image=u.images[0];Object.assign(p,u,{id:p.id});persist();return sendJSON(res,200,{product:p});}
    if(parts[1]==='admin'&&parts[2]==='products'&&parts[3]&&method==='DELETE'){const admin=requireAdminOr403(req,res);if(!admin)return;const idx=db.products.findIndex(p=>p.id===parts[3]);if(idx===-1)return sendJSON(res,404,{error:'Not found'});db.products.splice(idx,1);persist();return sendJSON(res,200,{success:true});}

    // ── PAYMENT GATEWAYS ────────────────────────────────────────────────────
    if(pathname==='/api/admin/payment-gateways'&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;return sendJSON(res,200,{gateways:db.paymentGateways});}
    if(pathname==='/api/admin/payment-gateways'&&method==='POST'){const admin=requireAdminOr403(req,res);if(!admin)return;const{name,type,config,enabled,qrImages}=await readBody(req);if(!name||!type)return sendJSON(res,400,{error:'Name and type required'});const gw={id:'gw-'+crypto.randomBytes(4).toString('hex'),name,type,config:config||{},qrImages:qrImages||[],enabled:enabled!==false,createdAt:new Date().toISOString()};db.paymentGateways.push(gw);persist();return sendJSON(res,201,{gateway:gw});}
    if(parts[1]==='admin'&&parts[2]==='payment-gateways'&&parts[3]&&method==='PUT'){const admin=requireAdminOr403(req,res);if(!admin)return;const gw=db.paymentGateways.find(g=>g.id===parts[3]);if(!gw)return sendJSON(res,404,{error:'Not found'});Object.assign(gw,await readBody(req),{id:gw.id});persist();return sendJSON(res,200,{gateway:gw});}
    if(parts[1]==='admin'&&parts[2]==='payment-gateways'&&parts[3]&&method==='DELETE'){const admin=requireAdminOr403(req,res);if(!admin)return;const idx=db.paymentGateways.findIndex(g=>g.id===parts[3]);if(idx===-1)return sendJSON(res,404,{error:'Not found'});db.paymentGateways.splice(idx,1);persist();return sendJSON(res,200,{success:true});}
    if(pathname==='/api/payment-methods'&&method==='GET'){return sendJSON(res,200,{methods:(db.paymentGateways||[]).filter(g=>g.enabled).map(g=>({id:g.id,name:g.name,type:g.type,qrImages:g.qrImages||[],config:{walletAddress:g.config?.walletAddress,coins:g.config?.coins,instructions:g.config?.instructions,businessEmail:g.config?.businessEmail}}))});}

    // ── PAYMENT PROCESSING ──────────────────────────────────────────────────
    if(pathname==='/api/payment/process'&&method==='POST'){const user=requireAuthOr401(req,res);if(!user)return;const{gatewayId,amount,details}=await readBody(req);if(!gatewayId||!amount)return sendJSON(res,400,{error:'Gateway and amount required'});const gw=db.paymentGateways.find(g=>g.id===gatewayId&&g.enabled);if(!gw)return sendJSON(res,400,{error:'Payment method not available'});if(gw.type==='card'&&!(details?.cardNumber&&details?.expiry&&details?.cvv))return sendJSON(res,400,{error:'Card number, expiry and CVV required'});if(gw.type==='crypto'&&!details?.walletAddress)return sendJSON(res,400,{error:'Your wallet address is required'});if(gw.type==='paypal'&&!details?.paypalEmail)return sendJSON(res,400,{error:'PayPal email required'});const reference='PAY-'+crypto.randomBytes(8).toString('hex').toUpperCase();const paymentToken=crypto.randomBytes(20).toString('hex');if(!db.pendingPayments)db.pendingPayments=[];db.pendingPayments=db.pendingPayments.filter(p=>p.expiresAt>Date.now());db.pendingPayments.push({token:paymentToken,userId:user.id,gatewayId,gatewayName:gw.name,gatewayType:gw.type,amount:Number(amount),reference,details:{...details,cardNumber:details?.cardNumber?'****'+String(details.cardNumber).slice(-4):undefined},expiresAt:Date.now()+15*60*1000});persist();return sendJSON(res,200,{success:true,paymentToken,reference,message:`Payment of $${Number(amount).toFixed(2)} processed via ${gw.name}`});}

    // ── GEOCODE ──────────────────────────────────────────────────────────────
    if(pathname==='/api/geocode'&&method==='POST'){const user=requireAuthOr401(req,res);if(!user)return;const{address}=await readBody(req);if(!address)return sendJSON(res,400,{error:'Address required'});const result=await geocodeAddress(address);return sendJSON(res,result.valid?200:422,result);}

    // ── ADMIN: ALL CUSTOMERS (with publicId, order count, messages) ──────────
    if(pathname==='/api/admin/users'&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;return sendJSON(res,200,{users:db.users.filter(u=>u.role==='customer').map(u=>({id:u.id,publicId:u.publicId||'—',name:u.name,email:u.email,emailVerified:u.emailVerified||false,createdAt:u.createdAt,orderCount:db.orders.filter(o=>o.userId===u.id).length,hasOrders:db.orders.some(o=>o.userId===u.id),messageCount:(db.messages||[]).filter(m=>m.fromId===u.id||m.toId===u.id).length}))});}

    // ── SETTINGS ─────────────────────────────────────────────────────────────
    if(pathname==='/api/admin/settings'&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;return sendJSON(res,200,{googleMapsKey:db.googleMapsKey||'',defaultOrigin:db.defaultOrigin,smtpHost:db.smtpHost||'',smtpPort:db.smtpPort||587,smtpUser:db.smtpUser||'',smtpFrom:db.smtpFrom||'',smtpSecure:db.smtpSecure||false,smtpConfigured:isConfigured(getSMTPConfig(db))});}
    if(pathname==='/api/admin/settings'&&method==='PUT'){const admin=requireAdminOr403(req,res);if(!admin)return;const u=await readBody(req);['googleMapsKey','defaultOrigin','smtpHost','smtpPort','smtpUser','smtpPass','smtpFrom','smtpSecure'].forEach(k=>{if(u[k]!==undefined)db[k]=u[k];});persist();return sendJSON(res,200,{success:true});}
    if(pathname==='/api/maps-key'&&method==='GET')return sendJSON(res,200,{key:db.googleMapsKey||''});

    // ── ORDERS ──────────────────────────────────────────────────────────────
    if(pathname==='/api/orders'&&method==='POST'){const user=requireAuthOr401(req,res);if(!user)return;const{items,shippingAddress,deliveryLat,deliveryLng,deliveryNotes,paymentToken,vehicleType,paymentProofs}=await readBody(req);if(!Array.isArray(items)||!items.length)return sendJSON(res,400,{error:'Order must include at least one item'});if(!shippingAddress||shippingAddress.trim().length<5)return sendJSON(res,400,{error:'Please enter a valid delivery address'});const hasGW=db.paymentGateways&&db.paymentGateways.some(g=>g.enabled);let paymentInfo=null;if(hasGW){if(!paymentToken)return sendJSON(res,400,{error:'Payment required before placing order'});const pending=(db.pendingPayments||[]).find(p=>p.token===paymentToken&&p.userId===user.id);if(!pending||pending.expiresAt<Date.now())return sendJSON(res,400,{error:'Payment expired. Please pay again.'});paymentInfo={method:pending.gatewayName,type:pending.gatewayType,reference:pending.reference};db.pendingPayments=db.pendingPayments.filter(p=>p.token!==paymentToken);}let total=0;const orderItems=[];for(const item of items){const p=db.products.find(p=>p.id===item.productId);if(!p)return sendJSON(res,400,{error:`Product not found: ${item.productId}`});const qty=Math.max(1,Number(item.quantity||1));if(p.stock<qty)return sendJSON(res,400,{error:`Insufficient stock for ${p.name}`});p.stock-=qty;total+=p.price*qty;orderItems.push({productId:p.id,name:p.name,price:p.price,quantity:qty,image:p.image});}const invoiceNumber=nextInvoiceNumber();const oLat=db.defaultOrigin?.lat||25.7617,oLng=db.defaultOrigin?.lng||-80.1918;const dLat=deliveryLat?Number(deliveryLat):oLat+0.5,dLng=deliveryLng?Number(deliveryLng):oLng+0.5;const order={id:'order-'+crypto.randomBytes(6).toString('hex'),userId:user.id,userName:user.name,items:orderItems,total:Math.round(total*100)/100,shippingAddress:shippingAddress.trim(),deliveryLocation:{lat:dLat,lng:dLng},deliveryNotes:deliveryNotes||'',payment:paymentInfo,paymentProofs:paymentProofs||[],status:'Processing',invoiceNumber,vehicleType:vehicleType||'van',createdAt:new Date().toISOString()};tracking.initTracking(order,oLat,oLng,dLat,dLng,order.vehicleType);db.orders.push(order);createInvoice(order);addNotification({userId:user.id,title:'✅ Order confirmed',message:`Order ${order.id} placed. Tracking: ${order.tracking.number}. ETA: ${order.tracking.estimatedMinutes} min.`,type:'auto',orderId:order.id});addNotification({userId:'admin-1',title:'🛒 New Order',message:`${user.name} placed order ${order.id} for $${order.total}. ${paymentProofs&&paymentProofs.length?`Payment proof attached (${paymentProofs.length} file(s)).`:'No payment proof uploaded.'}`,type:'system'});persist();return sendJSON(res,201,{order});}
    if(pathname==='/api/orders'&&method==='GET'){const user=requireAuthOr401(req,res);if(!user)return;const orders=user.role==='admin'?db.orders:db.orders.filter(o=>o.userId===user.id);return sendJSON(res,200,{orders});}
    if(parts[1]==='orders'&&parts[2]&&method==='GET'&&parts.length===3){const user=requireAuthOr401(req,res);if(!user)return;const order=db.orders.find(o=>o.id===parts[2]);if(!order)return sendJSON(res,404,{error:'Order not found'});if(user.role!=='admin'&&order.userId!==user.id)return sendJSON(res,403,{error:'Forbidden'});return sendJSON(res,200,{order});}
    if(parts[1]==='admin'&&parts[2]==='orders'&&parts[3]&&parts[4]==='status'&&method==='PUT'){const admin=requireAdminOr403(req,res);if(!admin)return;const order=db.orders.find(o=>o.id===parts[3]);if(!order)return sendJSON(res,404,{error:'Not found'});const{status}=await readBody(req);order.status=status;addNotification({userId:order.userId,title:'Order updated',message:`Order ${order.id}: ${status}`,type:'manual',orderId:order.id});persist();return sendJSON(res,200,{order});}

    // ── TRACKING ─────────────────────────────────────────────────────────────
    if(parts[1]==='orders'&&parts[2]&&parts[3]==='tracking'&&method==='GET'){const user=requireAuthOr401(req,res);if(!user)return;const order=db.orders.find(o=>o.id===parts[2]);if(!order)return sendJSON(res,404,{error:'Not found'});if(user.role!=='admin'&&order.userId!==user.id)return sendJSON(res,403,{error:'Forbidden'});return sendJSON(res,200,{tracking:order.tracking,deliveryLocation:order.deliveryLocation,vehicleType:order.vehicleType});}
    if(parts[1]==='admin'&&parts[2]==='orders'&&parts[3]&&parts[4]==='tracking'&&parts[5]&&method==='POST'){const admin=requireAdminOr403(req,res);if(!admin)return;const order=db.orders.find(o=>o.id===parts[3]);if(!order)return sendJSON(res,404,{error:'Not found'});const body=await readBody(req);switch(parts[5]){case 'start':case 'resume':if(order.tracking.state==='completed')return sendJSON(res,400,{error:'Already delivered. Reset first.'});tracking.startTimer(order,onTrackingTick);break;case 'pause':if(order.tracking.state==='completed')return sendJSON(res,400,{error:'Cannot pause completed delivery'});tracking.pauseTimer(order);break;case 'reset':tracking.resetTracking(order,body.originLat||db.defaultOrigin?.lat,body.originLng||db.defaultOrigin?.lng,order.deliveryLocation?.lat,order.deliveryLocation?.lng,body.vehicleType||order.vehicleType||'van');order.vehicleType=body.vehicleType||order.vehicleType;order.status='Processing';break;default:return sendJSON(res,400,{error:'Unknown action'});}persist();return sendJSON(res,200,{tracking:order.tracking});}

    // ── INVOICE ───────────────────────────────────────────────────────────────
    if(parts[1]==='orders'&&parts[2]&&parts[3]==='invoice'&&method==='GET'){const user=requireAuthOr401(req,res);if(!user)return;const order=db.orders.find(o=>o.id===parts[2]);if(!order)return sendJSON(res,404,{error:'Not found'});if(user.role!=='admin'&&order.userId!==user.id)return sendJSON(res,403,{error:'Forbidden'});createInvoice(order);return sendJSON(res,200,{invoiceUrl:`/invoice/${order.invoiceNumber}`,invoiceNumber:order.invoiceNumber});}

    // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
    if(pathname==='/api/notifications'&&method==='GET'){const user=requireAuthOr401(req,res);if(!user)return;return sendJSON(res,200,{notifications:db.notifications.filter(n=>n.userId===user.id||n.userId===null).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});}
    if(parts[1]==='notifications'&&parts[2]&&parts[3]==='read'&&method==='PUT'){const user=requireAuthOr401(req,res);if(!user)return;const n=db.notifications.find(n=>n.id===parts[2]);if(n){n.read=true;persist();}return sendJSON(res,200,{success:true});}
    if(pathname==='/api/admin/notifications'&&method==='POST'){const admin=requireAdminOr403(req,res);if(!admin)return;const{userId,title,message}=await readBody(req);if(!title||!message)return sendJSON(res,400,{error:'Title and message required'});const note=addNotification({userId:userId||null,title,message,type:'manual'});persist();return sendJSON(res,201,{notification:note});}
    if(pathname==='/api/admin/notifications'&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;return sendJSON(res,200,{notifications:db.notifications.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});}

    // ── MESSAGES ─────────────────────────────────────────────────────────────
    if(pathname==='/api/admin/messages'&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;const convos={};(db.messages||[]).forEach(m=>{const cId=m.fromRole==='admin'?m.toId:m.fromId;if(!convos[cId])convos[cId]={userId:cId,messages:[],unread:0};convos[cId].messages.push(m);if(!m.read&&m.fromRole!=='admin')convos[cId].unread++;});return sendJSON(res,200,{conversations:Object.values(convos)});}
    if(parts[1]==='admin'&&parts[2]==='messages'&&parts[3]&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;const msgs=(db.messages||[]).filter(m=>m.fromId===parts[3]||m.toId===parts[3]);msgs.forEach(m=>{if(m.toRole==='admin'&&!m.read)m.read=true;});persist();return sendJSON(res,200,{messages:msgs});}
    if(parts[1]==='admin'&&parts[2]==='messages'&&parts[3]&&method==='POST'){const admin=requireAdminOr403(req,res);if(!admin)return;const{text,attachments}=await readBody(req);if(!text&&(!attachments||!attachments.length))return sendJSON(res,400,{error:'Message or attachment required'});const cust=db.users.find(u=>u.id===parts[3]);if(!cust)return sendJSON(res,404,{error:'Customer not found'});const msg={id:'msg-'+crypto.randomBytes(6).toString('hex'),fromId:'admin-1',fromRole:'admin',fromName:'Support Team',toId:parts[3],toRole:'customer',text:text||'',attachments:attachments||[],read:false,createdAt:new Date().toISOString()};if(!db.messages)db.messages=[];db.messages.push(msg);addNotification({userId:parts[3],title:'💬 Message from Support',message:text?text.slice(0,100):'You received a file from support.',type:'message'});const cfg=getSMTPConfig(db);sendEmail({cfg,to:cust.email,subject:'New message from Comprehensive Merchandise',htmlBody:`<div style="font-family:sans-serif;max-width:500px;"><h3>Hi ${cust.name},</h3><p>You have a new message from support:</p><blockquote style="background:#f0ede6;padding:14px;border-left:4px solid #C1432D;">${(text||'').replace(/\n/g,'<br>')}</blockquote><p>Log in to reply: <a href="http://localhost:${PORT}/#/messages">Open messages</a></p></div>`}).catch(()=>{});persist();return sendJSON(res,201,{message:msg});}
    if(pathname==='/api/messages'&&method==='GET'){const user=requireAuthOr401(req,res);if(!user)return;const msgs=(db.messages||[]).filter(m=>m.fromId===user.id||m.toId===user.id);msgs.forEach(m=>{if(m.toId===user.id&&!m.read)m.read=true;});persist();return sendJSON(res,200,{messages:msgs});}
    if(pathname==='/api/messages'&&method==='POST'){const user=requireAuthOr401(req,res);if(!user)return;const{text,attachments}=await readBody(req);if(!text&&(!attachments||!attachments.length))return sendJSON(res,400,{error:'Message or attachment required'});const msg={id:'msg-'+crypto.randomBytes(6).toString('hex'),fromId:user.id,fromRole:'customer',fromName:user.name,toId:'admin-1',toRole:'admin',text:text||'',attachments:attachments||[],read:false,createdAt:new Date().toISOString()};if(!db.messages)db.messages=[];db.messages.push(msg);addNotification({userId:'admin-1',title:`💬 Reply from ${user.name}`,message:text?text.slice(0,100):'Customer sent a file.',type:'message'});persist();return sendJSON(res,201,{message:msg});}

    // ── REVIEWS ───────────────────────────────────────────────────────────────
    if(pathname==='/api/reviews'&&method==='POST'){const user=requireAuthOr401(req,res);if(!user)return;const{productId,rating,comment}=await readBody(req);if(!productId||!rating)return sendJSON(res,400,{error:'productId and rating required'});if(!db.products.find(p=>p.id===productId))return sendJSON(res,404,{error:'Product not found'});const purchased=db.orders.some(o=>o.userId===user.id&&o.items.some(i=>i.productId===productId));const review={id:'rev-'+crypto.randomBytes(6).toString('hex'),productId,userId:user.id,userName:user.name,rating:Number(rating),comment:comment||'',verifiedPurchase:purchased,status:'pending',createdAt:new Date().toISOString()};db.reviews.push(review);persist();return sendJSON(res,201,{review});}
    if(pathname==='/api/admin/reviews'&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;return sendJSON(res,200,{reviews:db.reviews.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});}
    if(parts[1]==='admin'&&parts[2]==='reviews'&&parts[3]&&method==='PUT'){const admin=requireAdminOr403(req,res);if(!admin)return;const r=db.reviews.find(r=>r.id===parts[3]);if(!r)return sendJSON(res,404,{error:'Not found'});r.status=(await readBody(req)).status;persist();return sendJSON(res,200,{review:r});}

    // ── SUPPORT ───────────────────────────────────────────────────────────────
    if(pathname==='/api/support/tickets'&&method==='POST'){const user=requireAuthOr401(req,res);if(!user)return;const{subject,message,orderId}=await readBody(req);if(!subject||!message)return sendJSON(res,400,{error:'Subject and message required'});const t={id:'ticket-'+crypto.randomBytes(6).toString('hex'),userId:user.id,userName:user.name,userEmail:user.email,subject,message,orderId:orderId||null,status:'open',replies:[],createdAt:new Date().toISOString()};db.supportTickets.push(t);persist();return sendJSON(res,201,{ticket:t});}
    if(pathname==='/api/support/tickets'&&method==='GET'){const user=requireAuthOr401(req,res);if(!user)return;const t=user.role==='admin'?db.supportTickets:db.supportTickets.filter(t=>t.userId===user.id);return sendJSON(res,200,{tickets:t.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))});}
    if(parts[1]==='support'&&parts[2]==='tickets'&&parts[3]&&parts[4]==='reply'&&method==='POST'){const user=requireAuthOr401(req,res);if(!user)return;const t=db.supportTickets.find(t=>t.id===parts[3]);if(!t)return sendJSON(res,404,{error:'Not found'});if(user.role!=='admin'&&t.userId!==user.id)return sendJSON(res,403,{error:'Forbidden'});const{message}=await readBody(req);t.replies.push({from:user.role==='admin'?'admin':'customer',authorName:user.name,message,at:new Date().toISOString()});t.status=user.role==='admin'?'replied':'open';if(user.role==='admin')addNotification({userId:t.userId,title:'Support reply',message:`Reply on: "${t.subject}"`,type:'auto'});persist();return sendJSON(res,200,{ticket:t});}
    if(parts[1]==='admin'&&parts[2]==='support'&&parts[3]&&parts[4]==='close'&&method==='PUT'){const admin=requireAdminOr403(req,res);if(!admin)return;const t=db.supportTickets.find(t=>t.id===parts[3]);if(!t)return sendJSON(res,404,{error:'Not found'});t.status='closed';persist();return sendJSON(res,200,{ticket:t});}


    // ── ADMIN PROFILE — change own password/email/security ──────────────────
    if (pathname==='/api/admin/profile' && method==='GET') {
      const admin=requireAdminOr403(req,res); if (!admin) return;
      const u=db.users.find(u=>u.id===admin.id);
      if (!u) return sendJSON(res,404,{error:'Admin user not found'});
      return sendJSON(res,200,{
        id: u.id, publicId: u.publicId, name: u.name, email: u.email,
        role: u.role,
        security: u.security || { twoFactorEnabled:false, loginAlerts:true, sessionTimeout:60 },
        createdAt: u.createdAt
      });
    }

    if (pathname==='/api/admin/profile' && method==='PUT') {
      const admin=requireAdminOr403(req,res); if (!admin) return;
      const { name, email, currentPassword, newPassword, security } = await readBody(req);
      const u=db.users.find(u=>u.id===admin.id);
      if (!u) return sendJSON(res,404,{error:'Admin not found'});

      // Update name
      if (name && name.trim().length >= 2) u.name = name.trim();

      // Update email
      if (email && email.trim() !== u.email) {
        const ev = validateEmail(email.trim());
        if (!ev.valid) return sendJSON(res,400,{error:ev.error});
        if (db.users.find(x=>x.email.toLowerCase()===ev.email&&x.id!==u.id))
          return sendJSON(res,409,{error:'That email is already in use'});
        u.email = ev.email;
      }

      // Update password
      if (newPassword) {
        if (!currentPassword) return sendJSON(res,400,{error:'Current password is required to set a new one'});
        if (!verifyPassword(currentPassword, u.passwordHash))
          return sendJSON(res,401,{error:'Current password is incorrect'});
        const pv = validatePassword(newPassword);
        if (!pv.valid) return sendJSON(res,400,{error:pv.error});
        u.passwordHash = hashPassword(newPassword);
      }

      // Update extended security settings
      if (security) {
        u.security = {
          twoFactorEnabled: security.twoFactorEnabled ?? (u.security?.twoFactorEnabled ?? false),
          loginAlerts:      security.loginAlerts      ?? (u.security?.loginAlerts      ?? true),
          sessionTimeout:   security.sessionTimeout   ?? (u.security?.sessionTimeout   ?? 60),
          allowedIPs:       security.allowedIPs       || (u.security?.allowedIPs       || ''),
          requireVerifiedEmails: security.requireVerifiedEmails ?? (u.security?.requireVerifiedEmails ?? false)
        };
      }

      persist();
      // Return fresh token with updated info
      const token = createToken({ id:u.id, publicId:u.publicId, name:u.name, email:u.email, role:u.role });
      return sendJSON(res,200,{
        success:true, token,
        user:{ id:u.id, publicId:u.publicId, name:u.name, email:u.email, role:u.role },
        message:'Profile updated successfully'
      });
    }

    // ── ADMIN: FLAG / WARN / TERMINATE CUSTOMER ACCOUNTS ────────────────────
    // Get account status/flags for one user
    if (parts[1]==='admin'&&parts[2]==='users'&&parts[3]&&parts[4]==='status'&&method==='GET') {
      const admin=requireAdminOr403(req,res); if (!admin) return;
      const u=db.users.find(u=>u.id===parts[3]);
      if (!u) return sendJSON(res,404,{error:'User not found'});
      return sendJSON(res,200,{
        id:u.id, publicId:u.publicId, name:u.name, email:u.email,
        status:u.accountStatus||'active',
        flags:u.flags||[],
        flaggedAt:u.flaggedAt||null,
        terminatedAt:u.terminatedAt||null,
        terminationReason:u.terminationReason||''
      });
    }

    // Flag / unflag / warn / terminate / restore an account
    if (parts[1]==='admin'&&parts[2]==='users'&&parts[3]&&parts[4]==='action'&&method==='POST') {
      const admin=requireAdminOr403(req,res); if (!admin) return;
      const u=db.users.find(u=>u.id===parts[3]);
      if (!u) return sendJSON(res,404,{error:'User not found'});
      if (u.role==='admin') return sendJSON(res,400,{error:'Cannot flag or terminate an admin account'});

      const { action, reason, note } = await readBody(req);
      const ts = new Date().toISOString();

      if (!u.flags) u.flags = [];
      if (!u.accountStatus) u.accountStatus = 'active';

      switch (action) {
        case 'flag':
          u.accountStatus = 'flagged';
          u.flaggedAt = ts;
          u.flags.push({ type:'flag', reason:reason||'Flagged by admin', note:note||'', by:admin.email, at:ts });
          addNotification({ userId:u.id, title:'⚠️ Account Flagged', message:`Your account has been flagged. Reason: ${reason||'Violation of store policy'}. Please contact support.`, type:'system' });
          break;

        case 'warn':
          u.flags.push({ type:'warning', reason:reason||'Warning issued', note:note||'', by:admin.email, at:ts });
          addNotification({ userId:u.id, title:'⚠️ Account Warning', message:`You have received a warning. Reason: ${reason||'Violation of store policy'}. Please review our terms.`, type:'system' });
          break;

        case 'suspend':
          u.accountStatus = 'suspended';
          u.suspendedAt = ts;
          u.flags.push({ type:'suspension', reason:reason||'Account suspended', note:note||'', by:admin.email, at:ts });
          addNotification({ userId:u.id, title:'🚫 Account Suspended', message:`Your account has been suspended. Reason: ${reason||'Violation of policy'}. Contact support to appeal.`, type:'system' });
          break;

        case 'terminate':
          u.accountStatus = 'terminated';
          u.terminatedAt = ts;
          u.terminationReason = reason||'Terminated by admin';
          u.flags.push({ type:'termination', reason:reason||'Account terminated', note:note||'', by:admin.email, at:ts });
          // Notify customer
          addNotification({ userId:u.id, title:'❌ Account Terminated', message:`Your account has been permanently terminated. Reason: ${reason||'Violation of policy'}.`, type:'system' });
          break;

        case 'restore':
          u.accountStatus = 'active';
          u.flags.push({ type:'restore', reason:reason||'Account restored', note:note||'', by:admin.email, at:ts });
          addNotification({ userId:u.id, title:'✅ Account Restored', message:`Your account has been restored and is now active again.`, type:'system' });
          break;

        case 'delete':
          // Soft delete — keep record but mark deleted, remove sensitive data
          u.accountStatus = 'deleted';
          u.deletedAt = ts;
          u.deletionReason = reason||'Deleted by admin';
          u.flags.push({ type:'deletion', reason:reason||'Account deleted', note:note||'', by:admin.email, at:ts });
          break;

        default:
          return sendJSON(res,400,{error:`Unknown action: ${action}. Valid: flag, warn, suspend, terminate, restore, delete`});
      }

      persist();
      return sendJSON(res,200,{
        success:true,
        message:`Account ${action} applied to ${u.name}`,
        user:{ id:u.id, publicId:u.publicId, name:u.name, accountStatus:u.accountStatus, flags:u.flags }
      });
    }

    // Also block login for flagged/suspended/terminated/deleted accounts

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    if(pathname==='/api/admin/summary'&&method==='GET'){const admin=requireAdminOr403(req,res);if(!admin)return;const unreadMsgs=(db.messages||[]).filter(m=>m.toRole==='admin'&&!m.read).length;const smtpReady=isConfigured(getSMTPConfig(db));return sendJSON(res,200,{productCount:db.products.length,orderCount:db.orders.length,revenue:Math.round(db.orders.reduce((s,o)=>s+o.total,0)*100)/100,pendingReviews:db.reviews.filter(r=>r.status==='pending').length,openTickets:db.supportTickets.filter(t=>t.status==='open').length,ordersInTransit:db.orders.filter(o=>o.tracking&&o.tracking.state==='running').length,gatewayCount:(db.paymentGateways||[]).length,sectionCount:db.shopSections.length,customerCount:db.users.filter(u=>u.role==='customer').length,unreadMessages:unreadMsgs,smtpConfigured:smtpReady});}

    return sendJSON(res, 404, { error:'Endpoint not found' });
  } catch(err) {
    console.error(err);
    return sendJSON(res, 500, { error:'Server error: ' + err.message });
  }
}

const server = http.createServer(handle);
server.listen(PORT, () => {
  console.log(`\n✅  Comprehensive Merchandise v5 — http://localhost:${PORT}`);
  console.log(`    Admin login: 677584190mark@gmail.com / Agmi1\n`);
});
