// app.js v4 — router with all new routes

function parseHash() {
  const hash = location.hash || '#/';
  const path = hash.slice(1) || '/';
  const [route, qs] = path.split('?');
  const segments = route.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { segments, params };
}

function navigateTo(hash) {
  if (location.hash === hash) router();
  else location.hash = hash;
}

async function router() {
  const { segments, params } = parseHash();
  const s = segments[0];

  // Stop any active tracking poll when navigating away
  if (window._trackingPoll) { clearInterval(window._trackingPoll); window._trackingPoll = null; }

  if (!s) return Views.renderShop(params);
  switch (s) {
    case 'product':       return Views.renderProduct({ id: segments[1] });
    case 'cart':          return Views.renderCart();
    case 'checkout':      return Views.renderCheckout();
    case 'login':         return Views.renderLogin();
    case 'register':      return Views.renderRegister();
    case 'verify-email':  return Views.renderVerifyEmail();
    case 'messages':      return Views.renderMessages();
    case 'orders':        return segments[1] ? Views.renderOrderDetail({ id: segments[1] }) : Views.renderOrders();
    case 'notifications': return Views.renderNotifications();
    case 'support':       return Views.renderSupport();
    case 'admin':         return Admin.render();
    default:              return Views.renderNotFound();
  }
}

// Intercept [data-link] clicks for SPA navigation
document.addEventListener('click', e => {
  const link = e.target.closest('[data-link]');
  if (!link) return;
  e.preventDefault();
  navigateTo(link.getAttribute('href'));
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a === link));
});

window.addEventListener('hashchange', router);

async function init() {
  Store.updateCartBadge();
  await Maps.init();

  if (API.hasToken()) {
    try {
      const { user } = await API.me();
      Store.setUser(user);
      // Show verify email banner if not verified
      if (user && !user.emailVerified && user.role === 'customer') {
        showVerifyBanner();
      }
    } catch {
      API.clearToken();
      Store.renderAuthNav();
    }
  } else {
    Store.renderAuthNav();
  }

  await router();
  Views.updateNotifBadge();
  Store.updateMsgBadge();
  setInterval(() => { Views.updateNotifBadge(); Store.updateMsgBadge(); }, 15000);
}

function showVerifyBanner() {
  const existing = document.getElementById('verify-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'verify-banner';
  banner.style.cssText = 'background:var(--gold);color:#fff;font-family:var(--font-mono);font-size:0.78rem;text-align:center;padding:8px 16px;position:sticky;top:72px;z-index:150;';
  banner.innerHTML = `⚠ Please verify your email address. <a href="#/verify-email" data-link style="color:#fff;font-weight:bold;text-decoration:underline;">Verify now →</a> <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;margin-left:10px;font-size:1rem;">×</button>`;
  document.querySelector('.site-header').after(banner);
}

init();
