// state.js v3 — global state: user, cart, toasts, section nav

const Store = (() => {
  let currentUser = null;
  let cart = JSON.parse(localStorage.getItem('cm_cart') || '[]');

  function saveCart() { localStorage.setItem('cm_cart', JSON.stringify(cart)); updateCartBadge(); }

  function addToCart(product, qty = 1) {
    const existing = cart.find(i => i.productId === product.id);
    if (existing) { existing.quantity += qty; }
    else { cart.push({ productId: product.id, name: product.name, price: product.price, image: product.image || (product.images&&product.images[0]) || '/images/placeholder-generic.svg', quantity: qty }); }
    saveCart();
    toast(`Added "${product.name}" to cart`);
  }
  function updateCartQty(productId, qty) {
    if (qty <= 0) { cart = cart.filter(i => i.productId !== productId); }
    else { const item = cart.find(i => i.productId === productId); if (item) item.quantity = qty; }
    saveCart();
  }
  function clearCart() { cart = []; saveCart(); }
  function cartTotal() { return Math.round(cart.reduce((s,i)=>s+i.price*i.quantity,0)*100)/100; }
  function cartCount() { return cart.reduce((s,i)=>s+i.quantity,0); }
  function updateCartBadge() {
    const b = document.getElementById('cart-badge'); if (!b) return;
    const c = cartCount(); b.textContent = c; b.classList.toggle('show', c > 0);
  }

  function setUser(user) { currentUser = user; renderAuthNav(); }
  function getUser() { return currentUser; }
  function logout() { API.clearToken(); currentUser = null; renderAuthNav(); navigateTo('#/'); }

  function renderAuthNav() {
    const el = document.getElementById('auth-nav'); if (!el) return;
    if (currentUser) {
      el.innerHTML = `${currentUser.role==='admin'?'<a href="#/admin" data-link>Admin</a>':''}<span class="muted" style="font-family:var(--font-mono);font-size:0.75rem;padding:6px 4px;">Hi, ${esc(currentUser.name)}</span><button class="link" id="logout-btn">Log out</button>`;
      document.getElementById('logout-btn')?.addEventListener('click', logout);
    } else {
      el.innerHTML = `<a href="#/login" data-link>Log in</a><a href="#/register" data-link>Register</a>`;
    }
  }

  async function renderSectionNav(activeSlug = 'all') {
    const bar = document.getElementById('section-nav-bar'); if (!bar) return;
    try {
      const { sections } = await API.getSections();
      bar.innerHTML = `<nav class="section-nav"><div class="container" style="padding:0 20px;">${sections.map(s=>`<button class="section-tab${s.slug===activeSlug?' active':''}" data-slug="${s.slug}">${s.icon} ${esc(s.name)}</button>`).join('')}</div></nav>`;
      bar.querySelectorAll('.section-tab').forEach(btn => {
        btn.addEventListener('click', () => { navigateTo(`#/?section=${btn.dataset.slug}`); });
      });
    } catch {}
  }

  function toast(msg) {
    const c = document.getElementById('toast-container'); if (!c) return;
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    c.appendChild(el); setTimeout(() => el.remove(), 4000);
  }

  function esc(s) { return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  return { addToCart, updateCartQty, clearCart, cartTotal, cartCount, getCart: () => cart,
    setUser, getUser, logout, renderAuthNav, renderSectionNav, toast, escapeHtml: esc, updateCartBadge };
})();

// Message badge update (v4)
Store.updateMsgBadge = async function() {
  const b = document.getElementById('msg-badge');
  if (!b || !Store.getUser() || Store.getUser().role === 'admin') {
    if (b) b.classList.remove('show'); return;
  }
  try {
    const { messages } = await fetch('/api/messages', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('cm_token')}` }
    }).then(r => r.json());
    const unread = (messages || []).filter(m => m.toId === Store.getUser().id && !m.read).length;
    b.textContent = unread;
    b.classList.toggle('show', unread > 0);
  } catch {}
};
