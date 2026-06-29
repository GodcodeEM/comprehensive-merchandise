// db.js v5 — persistent JSON database
// Every user gets a unique publicId (e.g. CM-USR-A3F2B1) for manual recovery.

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR   = path.join(__dirname, '..', 'data');
const DB_FILE    = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

function ensureDirs() {
  [ DATA_DIR,
    UPLOADS_DIR,
    path.join(DATA_DIR, 'invoices'),
    path.join(UPLOADS_DIR, 'product'),
    path.join(UPLOADS_DIR, 'payment'),
    path.join(UPLOADS_DIR, 'messages'),
    path.join(UPLOADS_DIR, 'payment-proof'),
    path.join(UPLOADS_DIR, 'general')
  ].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return check === hash;
}

// Generate a unique 6-char hex public identifier e.g. CM-USR-A3F2B1
function generatePublicId() {
  return 'CM-USR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function defaultData() {
  return {
    users: [
      {
        id: 'admin-1',
        publicId: 'CM-USR-ADMIN1',
        name: 'Store Admin',
        email: '677584190mark@gmail.com',
        passwordHash: hashPassword('Agmi1'),
        role: 'admin',
        emailVerified: true,
        createdAt: new Date().toISOString()
      }
    ],
    products: [
      { id:'prod-1', name:'Classic Logo Hoodie',      description:'Heavyweight cotton-blend hoodie.',     price:54.99, category:'Apparel',      sectionId:null, stock:24,  images:['/images/placeholder-hoodie.svg'],  image:'/images/placeholder-hoodie.svg',  createdAt:new Date().toISOString() },
      { id:'prod-2', name:'Insulated Steel Tumbler',  description:'20oz double-wall tumbler.',            price:22.50, category:'Drinkware',     sectionId:null, stock:60,  images:['/images/placeholder-tumbler.svg'], image:'/images/placeholder-tumbler.svg', createdAt:new Date().toISOString() },
      { id:'prod-3', name:'Canvas Tote Bag',          description:'Durable 12oz canvas tote.',            price:15.00, category:'Bags',          sectionId:null, stock:100, images:['/images/placeholder-tote.svg'],    image:'/images/placeholder-tote.svg',    createdAt:new Date().toISOString() },
      { id:'prod-4', name:'Embroidered Snapback Cap', description:'Adjustable snapback cap.',             price:19.99, category:'Accessories',   sectionId:null, stock:45,  images:['/images/placeholder-cap.svg'],     image:'/images/placeholder-cap.svg',     createdAt:new Date().toISOString() }
    ],
    shopSections: [
      { id:'sec-1', name:'All Products',        slug:'all',          icon:'🏪', description:'Browse everything',             order:0, isDefault:true },
      { id:'sec-2', name:'Liquidation Pallets', slug:'liquidation',  icon:'📦', description:'Bulk liquidation deals',        order:1 },
      { id:'sec-3', name:'Local Listings',      slug:'local',        icon:'📍', description:'Available for local pickup',    order:2 },
      { id:'sec-4', name:'Automobiles',         slug:'automobiles',  icon:'🚗', description:'Cars, trucks, vehicle parts',   order:3 },
      { id:'sec-5', name:'Apparel',             slug:'apparel',      icon:'👕', description:'Clothing and accessories',      order:4 },
      { id:'sec-6', name:'Electronics',         slug:'electronics',  icon:'💻', description:'Gadgets and tech',              order:5 }
    ],
    orders:             [],
    reviews:            [],
    notifications:      [],
    supportTickets:     [],
    messages:           [],
    emailVerifications: [],
    paymentGateways:    [],
    pendingPayments:    [],
    invoiceCounter:     1000,
    defaultOrigin:      { address:'1 Warehouse Blvd, Miami FL 33101', lat:25.7617, lng:-80.1918 },
    googleMapsKey:      '',
    smtpHost:'', smtpPort:587, smtpUser:'', smtpPass:'', smtpFrom:'', smtpSecure:false
  };
}

function loadDB() {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    const d = defaultData();
    fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
    return d;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  // ── Migrations ────────────────────────────────────────────────────────────
  if (!db.shopSections)      db.shopSections      = defaultData().shopSections;
  if (!db.defaultOrigin)     db.defaultOrigin     = defaultData().defaultOrigin;
  if (!db.googleMapsKey)     db.googleMapsKey     = '';
  if (!db.pendingPayments)   db.pendingPayments   = [];
  if (!db.paymentGateways)   db.paymentGateways   = [];
  if (!db.messages)          db.messages          = [];
  if (!db.emailVerifications) db.emailVerifications = [];
  if (!db.smtpHost)          db.smtpHost          = '';
  // Ensure every user has publicId and emailVerified
  db.users.forEach(u => {
    if (!u.publicId)      u.publicId      = generatePublicId();
    if (u.emailVerified === undefined) u.emailVerified = u.role === 'admin';
  });
  // Ensure products have images array
  db.products.forEach(p => { if (!p.images) p.images = [p.image].filter(Boolean); });
  return db;
}

function saveDB(db) {
  ensureDirs();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

module.exports = { loadDB, saveDB, hashPassword, verifyPassword, generatePublicId, UPLOADS_DIR };
