// api.js v3 — complete API client

const API = (() => {
  function token() { return localStorage.getItem('cm_token'); }

  async function req(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/api${path}`, { ...options, headers });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // Multipart upload (no JSON)
  async function upload(path, formData) {
    const headers = {};
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`/api${path}`, { method: 'POST', headers, body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  }

  return {
    // Auth
    register: (name, email, password) => req('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
    login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me: () => req('/auth/me'),
    setToken: t => localStorage.setItem('cm_token', t),
    clearToken: () => localStorage.removeItem('cm_token'),
    hasToken: () => !!token(),

    // Shop sections
    getSections: () => req('/sections'),
    createSection: d => req('/admin/sections', { method: 'POST', body: JSON.stringify(d) }),
    updateSection: (id, d) => req(`/admin/sections/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteSection: id => req(`/admin/sections/${id}`, { method: 'DELETE' }),

    // Products
    getProducts: (params = {}) => { const qs = new URLSearchParams(params).toString(); return req(`/products${qs?'?'+qs:''}`); },
    getProduct: id => req(`/products/${id}`),
    createProduct: d => req('/admin/products', { method: 'POST', body: JSON.stringify(d) }),
    updateProduct: (id, d) => req(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteProduct: id => req(`/admin/products/${id}`, { method: 'DELETE' }),

    // File uploads
    uploadProductImages: formData => upload('/admin/upload/product', formData),
    uploadPaymentImage: formData => upload('/admin/upload/payment', formData),
    uploadGeneralImage: formData => upload('/admin/upload/general', formData),

    // Payment
    getPaymentMethods: () => req('/payment-methods'),
    processPayment: d => req('/payment/process', { method: 'POST', body: JSON.stringify(d) }),
    getPaymentGateways: () => req('/admin/payment-gateways'),
    createPaymentGateway: d => req('/admin/payment-gateways', { method: 'POST', body: JSON.stringify(d) }),
    updatePaymentGateway: (id, d) => req(`/admin/payment-gateways/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deletePaymentGateway: id => req(`/admin/payment-gateways/${id}`, { method: 'DELETE' }),

    // Geocode
    geocode: address => req('/geocode', { method: 'POST', body: JSON.stringify({ address }) }),

    // Settings
    getSettings: () => req('/admin/settings'),
    updateSettings: d => req('/admin/settings', { method: 'PUT', body: JSON.stringify(d) }),
    getMapsKey: () => req('/maps-key'),

    // Orders
    createOrder: d => req('/orders', { method: 'POST', body: JSON.stringify(d) }),
    getOrders: () => req('/orders'),
    getOrder: id => req(`/orders/${id}`),
    updateOrderStatus: (id, status) => req(`/admin/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

    // Tracking
    getTracking: orderId => req(`/orders/${orderId}/tracking`),
    trackingAction: (orderId, action, body = {}) => req(`/admin/orders/${orderId}/tracking/${action}`, { method: 'POST', body: JSON.stringify(body) }),

    // Invoice
    getInvoice: orderId => req(`/orders/${orderId}/invoice`),

    // Notifications
    getNotifications: () => req('/notifications'),
    markRead: id => req(`/notifications/${id}/read`, { method: 'PUT' }),
    sendNotification: d => req('/admin/notifications', { method: 'POST', body: JSON.stringify(d) }),
    getAllNotifications: () => req('/admin/notifications'),
    getCustomers: () => req('/admin/users'),

    // Reviews
    submitReview: d => req('/reviews', { method: 'POST', body: JSON.stringify(d) }),
    getAllReviews: () => req('/admin/reviews'),
    moderateReview: (id, status) => req(`/admin/reviews/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),

    // Support
    createTicket: d => req('/support/tickets', { method: 'POST', body: JSON.stringify(d) }),
    getTickets: () => req('/support/tickets'),
    replyTicket: (id, message) => req(`/support/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify({ message }) }),
    closeTicket: id => req(`/admin/support/${id}/close`, { method: 'PUT' }),

    // Admin summary
    getSummary: () => req('/admin/summary'),
  };
})();

// v4 additions
Object.assign(API, {
  verifyEmail: (code) => API.processPayment ? fetch('/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem('cm_token')}`},body:JSON.stringify({code})}).then(r=>r.json()) : Promise.reject('N/A'),
  resendVerification: () => fetch('/api/auth/resend-verification',{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('cm_token')}`}}).then(r=>r.json()),
  getMessages: () => fetch('/api/messages',{headers:{'Authorization':`Bearer ${localStorage.getItem('cm_token')}`}}).then(r=>r.json()),
  sendMessage: (data) => fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem('cm_token')}`},body:JSON.stringify(data)}).then(r=>r.json()),
  getAdminConversations: () => fetch('/api/admin/messages',{headers:{'Authorization':`Bearer ${localStorage.getItem('cm_token')}`}}).then(r=>r.json()),
  getAdminMessages: (userId) => fetch(`/api/admin/messages/${userId}`,{headers:{'Authorization':`Bearer ${localStorage.getItem('cm_token')}`}}).then(r=>r.json()),
  sendAdminMessage: (userId, data) => fetch(`/api/admin/messages/${userId}`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem('cm_token')}`},body:JSON.stringify(data)}).then(r=>r.json()),
  getAdminUsers: () => fetch('/api/admin/users',{headers:{'Authorization':`Bearer ${localStorage.getItem('cm_token')}`}}).then(r=>r.json()),
  uploadMessageFile: (formData) => { const h={'Authorization':`Bearer ${localStorage.getItem('cm_token')}`}; return fetch('/api/admin/upload/messages',{method:'POST',headers:h,body:formData}).then(r=>r.json()); }
});
// Fix verifyEmail to use proper fetch
API.verifyEmail = (code) => fetch('/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem('cm_token')}`},body:JSON.stringify({code})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Failed');return d;});
API.resendVerification = () => fetch('/api/auth/resend-verification',{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('cm_token')}`}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Failed');return d;});

// v5 additions
API.uploadPaymentProof = (formData) => {
  const headers = { 'Authorization': `Bearer ${localStorage.getItem('cm_token')}` };
  return fetch('/api/upload/payment-proof', { method:'POST', headers, body:formData })
    .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error||'Upload failed'); return d; });
};
API.getAdminOrderProofs = (orderId) => {
  const headers = { 'Authorization': `Bearer ${localStorage.getItem('cm_token')}` };
  return fetch(`/api/admin/orders/${orderId}/payment-proof`, { headers }).then(r => r.json());
};

// v5 admin profile + account management
API.getAdminProfile    = () => fetch('/api/admin/profile', { headers:{ 'Authorization':`Bearer ${localStorage.getItem('cm_token')}` } }).then(r=>r.json());
API.updateAdminProfile = (data) => fetch('/api/admin/profile', { method:'PUT', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${localStorage.getItem('cm_token')}` }, body:JSON.stringify(data) }).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Failed');return d;});
API.getUserStatus      = (id) => fetch(`/api/admin/users/${id}/status`, { headers:{ 'Authorization':`Bearer ${localStorage.getItem('cm_token')}` } }).then(r=>r.json());
API.userAction         = (id, action, reason, note) => fetch(`/api/admin/users/${id}/action`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${localStorage.getItem('cm_token')}` }, body:JSON.stringify({ action, reason, note }) }).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Failed');return d;});
