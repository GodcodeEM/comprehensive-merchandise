// views.js v5 — all customer pages

const Views = (() => {
  const app = () => document.getElementById('app');
  const esc = s => Store.escapeHtml(s);
  const fmt = n => `$${Number(n).toFixed(2)}`;
  const fmtDate = iso => new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  const fmtMin  = m => m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m} min`;
  function statusClass(s){ return (s||'').toLowerCase().replace(/\s+/g,'-'); }

  // ── SHOP ──────────────────────────────────────────────────────────────────
  async function renderShop(params) {
    const section = params.section || 'all';
    await Store.renderSectionNav(section);
    app().innerHTML = `
      <div class="flex-between" style="margin-bottom:16px;">
        <div>
          <h1 class="page-title" id="sec-title">Shop</h1>
          <p class="page-sub" id="sec-desc" style="margin-bottom:0;"></p>
        </div>
        <div style="width:260px;">
          <input type="text" id="search-input" placeholder="Search products…"
            value="${esc(params.search||'')}" style="width:100%;padding:10px 12px;border:1px solid var(--ink);">
        </div>
      </div>
      <div class="product-grid" id="product-grid"></div>`;

    try {
      const { sections } = await API.getSections();
      const sec = sections.find(s=>s.slug===section) || sections.find(s=>s.isDefault);
      if (sec) {
        document.getElementById('sec-title').textContent = sec.name;
        document.getElementById('sec-desc').textContent  = sec.description || '';
      }
    } catch {}

    const grid = document.getElementById('product-grid');
    async function load(search='') {
      grid.innerHTML = `<div class="empty-state">Loading…</div>`;
      try {
        const params2 = {};
        if (section && section!=='all') params2.section = section;
        if (search) params2.search = search;
        const { products } = await API.getProducts(params2);
        if (!products.length) { grid.innerHTML=`<div class="empty-state">No products found.</div>`; return; }
        grid.innerHTML = products.map(p => {
          const imgs = p.images||[p.image||'/images/placeholder-generic.svg'];
          return `<a class="product-card" href="#/product/${p.id}" data-link>
            <div class="img-wrap">
              <img src="${imgs[0]}" alt="${esc(p.name)}" class="pm-img" data-imgs='${JSON.stringify(imgs).replace(/'/g,"&#39;")}'>
              ${imgs.length>1?`<div class="img-dots">${imgs.map((_,i)=>`<span class="img-dot${i===0?' active':''}"></span>`).join('')}</div>`:''}
            </div>
            <div class="body">
              <span class="category-tag">${esc(p.category||'')}</span>
              <span class="name">${esc(p.name)}</span>
              <span class="price">${fmt(p.price)}</span>
            </div>
          </a>`;
        }).join('');
        // Image cycling on hover
        grid.querySelectorAll('.product-card').forEach(card => {
          const img = card.querySelector('.pm-img'); if (!img) return;
          let imgs2; try { imgs2=JSON.parse(img.dataset.imgs); } catch { return; }
          if (imgs2.length<2) return;
          let idx=0, t;
          card.addEventListener('mouseenter',()=>{ t=setInterval(()=>{ idx=(idx+1)%imgs2.length; img.src=imgs2[idx]; card.querySelectorAll('.img-dot').forEach((d,i)=>d.classList.toggle('active',i===idx)); },800); });
          card.addEventListener('mouseleave',()=>{ clearInterval(t); idx=0; img.src=imgs2[0]; card.querySelectorAll('.img-dot').forEach((d,i)=>d.classList.toggle('active',i===0)); });
        });
      } catch(e) { grid.innerHTML=`<div class="error-text">${esc(e.message)}</div>`; }
    }
    let dt;
    document.getElementById('search-input').addEventListener('input', e => { clearTimeout(dt); dt=setTimeout(()=>load(e.target.value.trim()),300); });
    load(params.search||'');
  }

  // ── PRODUCT DETAIL ─────────────────────────────────────────────────────────
  async function renderProduct(params) {
    app().innerHTML=`<div class="empty-state">Loading…</div>`;
    try {
      const { product, reviews, avgRating } = await API.getProduct(params.id);
      const imgs = product.images||[product.image||'/images/placeholder-generic.svg'];
      app().innerHTML = `
        <div class="product-detail">
          <div class="img-gallery">
            <img id="main-img" class="main-img" src="${imgs[0]}" alt="${esc(product.name)}">
            ${imgs.length>1?`<div class="thumbs">${imgs.map((url,i)=>`<img class="thumb${i===0?' active':''}" src="${url}" data-url="${url}">`).join('')}</div>`:''}
          </div>
          <div>
            <span class="category-tag">${esc(product.category||'')}</span>
            <h1 class="page-title">${esc(product.name)}</h1>
            <p style="margin:10px 0;line-height:1.6;">${esc(product.description)}</p>
            <div class="product-price">${fmt(product.price)}</div>
            <div class="product-stock">${product.stock>0?`${product.stock} in stock`:'Out of stock'}</div>
            ${avgRating?`<div class="stars" style="margin:8px 0;">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5-Math.round(avgRating))} <span class="muted">(${avgRating.toFixed(1)}, ${reviews.length} review${reviews.length===1?'':'s'})</span></div>`:'<div class="muted" style="margin:8px 0;">No reviews yet</div>'}
            <div class="btn-group" style="margin-top:18px;">
              <input type="number" id="qty-input" min="1" max="${product.stock}" value="1"
                style="width:70px;padding:10px;border:1px solid var(--ink);" ${product.stock===0?'disabled':''}>
              <button class="btn large" id="add-cart-btn" ${product.stock===0?'disabled':''}>Add to Cart</button>
            </div>
          </div>
        </div>
        <div class="section" style="margin-top:32px;">
          <h2 class="section-head">Customer Reviews</h2>
          ${reviews.length===0?'<div class="empty-state" style="padding:20px 0;">No reviews yet — be the first!</div>':
            reviews.map(r=>`<div class="review">
              <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
              <div>${esc(r.comment)}</div>
              <div class="meta">${esc(r.userName)} · ${fmtDate(r.createdAt)}${r.verifiedPurchase?' · ✓ Verified':''}</div>
            </div>`).join('')}
          <div style="margin-top:20px;" id="review-form-area"></div>
        </div>`;

      app().querySelectorAll('.thumb').forEach(th=>th.addEventListener('click',()=>{
        document.getElementById('main-img').src=th.dataset.url;
        app().querySelectorAll('.thumb').forEach(t=>t.classList.remove('active')); th.classList.add('active');
      }));
      document.getElementById('add-cart-btn')?.addEventListener('click',()=>{
        Store.addToCart(product, Math.max(1,Math.min(product.stock,Number(document.getElementById('qty-input').value)||1)));
      });
      renderReviewForm(product.id);
    } catch(e) { app().innerHTML=`<div class="error-text">${esc(e.message)}</div>`; }
  }

  function renderReviewForm(productId) {
    const area=document.getElementById('review-form-area'); if (!area) return;
    if (!Store.getUser()) { area.innerHTML=`<p class="muted"><a href="#/login" data-link>Log in</a> to leave a review.</p>`; return; }
    area.innerHTML=`<h3 style="font-family:var(--font-display);text-transform:uppercase;margin-bottom:12px;">Leave a Review</h3>
      <form id="rev-form" class="form-card">
        <div class="field"><label>Rating</label>
          <select id="rev-rating"><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Good</option><option value="3">★★★ Average</option><option value="2">★★ Poor</option><option value="1">★ Terrible</option></select></div>
        <div class="field"><label>Comment</label><textarea id="rev-comment" placeholder="Share your experience…"></textarea></div>
        <div id="rev-err" class="error-text"></div>
        <button class="btn" type="submit">Submit Review</button>
      </form>`;
    document.getElementById('rev-form').addEventListener('submit',async e=>{
      e.preventDefault();
      try { await API.submitReview({productId,rating:Number(document.getElementById('rev-rating').value),comment:document.getElementById('rev-comment').value.trim()}); Store.toast('Review submitted — pending approval'); document.getElementById('rev-comment').value=''; }
      catch(e){ document.getElementById('rev-err').textContent=e.message; }
    });
  }

  // ── CART ──────────────────────────────────────────────────────────────────
  function renderCart() {
    const cart=Store.getCart();
    app().innerHTML=`
      <h1 class="page-title">Your Cart</h1>
      <p class="page-sub">Review before checkout</p>
      <div id="cart-items"></div>
      ${cart.length?`<div class="cart-total"><span>Total</span><span>${fmt(Store.cartTotal())}</span></div>
        <div class="btn-group" style="margin-top:16px;">
          <button class="btn large" id="checkout-btn">Proceed to Checkout →</button>
          <a href="#/" data-link class="btn secondary">Continue Shopping</a>
        </div>`:'' }`;
    const el=document.getElementById('cart-items');
    if (!cart.length) { el.innerHTML=`<div class="empty-state">Cart is empty.<br><a href="#/" data-link>Browse the shop</a></div>`; return; }
    el.innerHTML=cart.map(i=>`<div class="cart-row">
      <img src="${i.image}" alt="${esc(i.name)}">
      <div class="info"><div class="name">${esc(i.name)}</div><div class="price">${fmt(i.price)} each</div></div>
      <input type="number" min="0" value="${i.quantity}" data-id="${i.productId}" class="qty-input"
        style="width:60px;padding:8px;border:1px solid var(--ink);">
      <div class="price">${fmt(i.price*i.quantity)}</div>
    </div>`).join('');
    el.querySelectorAll('.qty-input').forEach(inp=>inp.addEventListener('change',()=>{Store.updateCartQty(inp.dataset.id,Number(inp.value));renderCart();}));
    document.getElementById('checkout-btn')?.addEventListener('click',()=>{ if (!Store.getUser()){navigateTo('#/login');return;} navigateTo('#/checkout'); });
  }

  // ── CHECKOUT ──────────────────────────────────────────────────────────────
  async function renderCheckout() {
    if (!Store.getUser()) { navigateTo('#/login'); return; }
    const cart=Store.getCart();
    if (!cart.length) { navigateTo('#/cart'); return; }

    let methods=[];
    try { const r=await API.getPaymentMethods(); methods=r.methods||[]; } catch {}

    const vehicleOptions=[
      {value:'van',  label:'🚐 Delivery Van',  desc:'~60 km/h local roads'},
      {value:'truck',label:'🚛 Freight Truck', desc:'~80 km/h highway'},
      {value:'car',  label:'🚗 Courier Car',   desc:'~90 km/h fast local'},
      {value:'bus',  label:'🚌 Bus Freight',   desc:'~55 km/h scheduled'},
      {value:'ship', label:'🚢 Cargo Ship',    desc:'~30 km/h ocean'},
      {value:'plane',label:'✈️ Air Freight',   desc:'~800 km/h express'},
    ];

    app().innerHTML=`
      <h1 class="page-title">Checkout</h1>
      <p class="page-sub">3 steps to complete your order</p>
      <div class="grid-2">
        <div>
          <!-- STEP 1: ADDRESS -->
          <div class="section">
            <h2 class="section-head">Step 1 — Delivery Address</h2>
            <div style="background:var(--paper);border:1px solid var(--line);padding:16px;border-radius:var(--radius);margin-bottom:10px;">
              <div class="grid-2">
                <div class="field"><label>House / Unit number ⭐</label><input id="a-house" placeholder="e.g. 42 or Apt 3B"></div>
                <div class="field"><label>Street name ⭐</label><input id="a-street" placeholder="e.g. Main Street"></div>
              </div>
              <div class="grid-2">
                <div class="field"><label>Town / City ⭐</label><input id="a-city" placeholder="e.g. Miami"></div>
                <div class="field"><label>State / Province ⭐</label><input id="a-state" placeholder="e.g. FL"></div>
              </div>
              <div class="grid-2">
                <div class="field"><label>ZIP / Postal code ⭐</label><input id="a-zip" placeholder="e.g. 33101"></div>
                <div class="field"><label>Country ⭐</label><input id="a-country" placeholder="e.g. United States"></div>
              </div>
            </div>
            <div class="btn-group" style="margin-bottom:8px;">
              <button class="btn secondary small" id="use-gps-btn">📍 Use GPS location</button>
              <button class="btn secondary small" id="validate-btn">✓ Validate address</button>
            </div>
            <div id="addr-status" style="font-family:var(--font-mono);font-size:0.75rem;min-height:18px;"></div>
            <div class="field" style="margin-top:10px;"><label>Delivery notes (optional)</label>
              <input id="a-notes" placeholder="e.g. Ring doorbell, leave at gate"></div>
          </div>

          <!-- STEP 2: PAYMENT -->
          <div class="section">
            <h2 class="section-head">Step 2 — Payment</h2>
            ${methods.length===0?`<div class="label-card"><div class="success-text">✓ No payment gateway configured — order will be placed directly.</div></div>`:`
              <div id="pm-list">
                ${methods.map(m=>`<div class="payment-card" data-id="${m.id}" data-type="${m.type}">
                  <div class="pm-name">${{card:'💳',crypto:'₿',paypal:'🅿',bank:'🏦',manual:'✍️'}[m.type]||'💰'} ${esc(m.name)}</div>
                  <div class="pm-type">${m.type}</div>
                  ${m.config?.walletAddress?`<div style="font-family:var(--font-mono);font-size:0.78rem;margin-top:8px;background:var(--kraft);padding:8px;border-radius:3px;word-break:break-all;">
                    📬 Send to: <strong>${esc(m.config.walletAddress)}</strong>
                    ${m.config?.coins?`<br><span style="color:var(--ink-soft);">Accepted: ${esc(m.config.coins)}</span>`:''}
                  </div>`:''}
                  ${m.qrImages&&m.qrImages.length?`<div style="margin-top:10px;">
                    <div style="font-family:var(--font-mono);font-size:0.68rem;color:var(--ink-soft);margin-bottom:6px;">SCAN TO PAY</div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">${m.qrImages.map(url=>`<img class="qr-img" src="${url}" alt="QR Code">`).join('')}</div>
                  </div>`:''}
                  ${m.config?.instructions?`<div style="font-family:var(--font-mono);font-size:0.78rem;margin-top:8px;background:var(--kraft);padding:8px;border-radius:3px;">${esc(m.config.instructions)}</div>`:''}
                </div>`).join('')}
              </div>
              <div id="pay-fields" style="margin-top:12px;"></div>

              <!-- PAYMENT PROOF UPLOAD -->
              <div style="margin-top:16px;background:var(--paper);border:1px solid var(--line);padding:16px;border-radius:var(--radius);">
                <div style="font-family:var(--font-display);text-transform:uppercase;font-size:0.9rem;margin-bottom:6px;">Upload Payment Proof</div>
                <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--ink-soft);margin-bottom:10px;">
                  Upload a screenshot, photo, or PDF of your payment confirmation. Admin will review it.
                </div>
                <div id="proof-uploader"></div>
                <div id="proof-status" style="font-family:var(--font-mono);font-size:0.75rem;margin-top:6px;"></div>
              </div>

              <div id="pay-status" style="margin-top:10px;"></div>
              <button class="btn success" id="pay-btn" style="margin-top:10px;" disabled>
                Pay ${fmt(Store.cartTotal())}
              </button>
            `}
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div>
          <div class="section">
            <h2 class="section-head">Order Summary</h2>
            ${cart.map(i=>`<div class="cart-row" style="gap:10px;padding:8px 0;">
              <img src="${i.image}" alt="${esc(i.name)}" style="width:50px;height:50px;object-fit:cover;border:1px solid var(--line);">
              <div class="info"><div class="name" style="font-size:0.9rem;">${esc(i.name)}</div><div class="muted">×${i.quantity}</div></div>
              <div class="price">${fmt(i.price*i.quantity)}</div>
            </div>`).join('')}
            <div class="cart-total"><span>Total</span><span>${fmt(Store.cartTotal())}</span></div>
          </div>

          <div class="section">
            <h2 class="section-head">Delivery Vehicle</h2>
            <div class="field"><select id="vehicle-select">
              ${vehicleOptions.map(v=>`<option value="${v.value}">${v.label} — ${v.desc}</option>`).join('')}
            </select></div>
          </div>

          <div id="place-order-area">
            ${methods.length===0?`<button class="btn large success" id="place-order-btn" style="width:100%;">Place Order →</button>`:`
              <div class="muted" style="font-family:var(--font-mono);font-size:0.8rem;">Complete payment above to place order.</div>`}
          </div>
          <div id="co-error" class="error-text" style="margin-top:10px;"></div>
        </div>
      </div>`;

    // Setup proof uploader
    let proofUrls = [];
    if (document.getElementById('proof-uploader')) {
      const proofUploader = Uploader.create(document.getElementById('proof-uploader'), { multiple:true, folder:'payment-proof', adminOnly:false });
      // Override getUrls to track
      const origGet = proofUploader.getUrls.bind(proofUploader);
      proofUploader.getUrls = () => { proofUrls = origGet(); return proofUrls; };
    }

    let validLat=null, validLng=null, paymentToken=null;

    function buildAddress() {
      const g=id=>document.getElementById(id)?.value?.trim()||'';
      return [g('a-house'),g('a-street'),g('a-city'),g('a-state'),g('a-zip'),g('a-country')].filter(Boolean).join(', ');
    }

    // GPS
    document.getElementById('use-gps-btn').addEventListener('click',()=>{
      const s=document.getElementById('addr-status'); s.style.color=''; s.textContent='Getting GPS location…';
      if (!navigator.geolocation){s.textContent='Geolocation not supported';return;}
      navigator.geolocation.getCurrentPosition(pos=>{
        validLat=pos.coords.latitude; validLng=pos.coords.longitude;
        s.textContent=`📍 GPS captured: ${validLat.toFixed(5)}, ${validLng.toFixed(5)}`; s.style.color='var(--ok-green)';
      },err=>{s.textContent='Could not get location: '+err.message; s.style.color='var(--stamp-red)';});
    });

    // Validate address
    document.getElementById('validate-btn').addEventListener('click',async()=>{
      const s=document.getElementById('addr-status'); const addr=buildAddress();
      if (!addr){s.textContent='Please fill in at least Street, City, and Country.';s.style.color='var(--stamp-red)';return;}
      s.textContent='Validating…'; s.style.color='';
      try {
        const r=await API.geocode(addr);
        if (r.valid){
          validLat=r.lat; validLng=r.lng;
          s.textContent=`✓ Validated: ${r.displayName.slice(0,90)}`; s.style.color='var(--ok-green)';
          if (r.components){
            const fill=(id,val)=>{ if(!document.getElementById(id)?.value?.trim()&&val) document.getElementById(id).value=val; };
            fill('a-street',r.components.street); fill('a-city',r.components.city);
            fill('a-state',r.components.state); fill('a-zip',r.components.zip); fill('a-country',r.components.country);
          }
        } else { s.textContent='⚠ '+r.error; s.style.color='var(--stamp-red)'; }
      } catch { s.textContent='Validation unavailable — you can still proceed'; s.style.color='var(--gold)'; }
    });

    // Payment method selection
    let selMethodId=null, selMethodType=null;
    document.querySelectorAll('.payment-card').forEach(card=>{
      card.addEventListener('click',()=>{
        document.querySelectorAll('.payment-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        selMethodId=card.dataset.id; selMethodType=card.dataset.type;
        renderPayFields(selMethodType);
        document.getElementById('pay-btn').disabled=false;
      });
    });

    function renderPayFields(type){
      const el=document.getElementById('pay-fields'); if(!el) return;
      const fields={
        card:`<div class="field"><label>Card number</label><input id="pf-num" placeholder="1234 5678 9012 3456"></div>
              <div class="grid-2"><div class="field"><label>Expiry MM/YY</label><input id="pf-exp" placeholder="MM/YY"></div>
              <div class="field"><label>CVV</label><input id="pf-cvv" type="password" placeholder="•••" maxlength="4"></div></div>`,
        crypto:`<div class="field"><label>Your sending wallet address</label><input id="pf-wallet" placeholder="bc1q… or 0x…"></div>
                <div class="field"><label>Transaction hash (paste after sending)</label><input id="pf-tx" placeholder="Tx hash / ID"></div>`,
        paypal:`<div class="field"><label>Your PayPal email</label><input id="pf-pp" type="email" placeholder="you@paypal.com"></div>`,
        bank:`<div class="field"><label>Your account name</label><input id="pf-bname" placeholder="Full name on account"></div>`,
        manual:`<div style="font-family:var(--font-mono);font-size:0.8rem;padding:12px;background:var(--kraft);border-radius:3px;">
                  Follow the payment instructions above, then click Pay to confirm.</div>`
      };
      el.innerHTML=fields[type]||'';
    }

    function getPayDetails(type){
      const g=id=>document.getElementById(id)?.value?.trim()||'';
      if(type==='card')   return {cardNumber:g('pf-num').replace(/\s/g,''),expiry:g('pf-exp'),cvv:g('pf-cvv')};
      if(type==='crypto') return {walletAddress:g('pf-wallet'),txHash:g('pf-tx')};
      if(type==='paypal') return {paypalEmail:g('pf-pp')};
      if(type==='bank')   return {accountName:g('pf-bname')};
      return {};
    }

    document.getElementById('pay-btn')?.addEventListener('click',async()=>{
      if(!selMethodId) return;
      const s=document.getElementById('pay-status');
      s.innerHTML=`<div class="muted" style="font-family:var(--font-mono);">Processing payment…</div>`;
      document.getElementById('pay-btn').disabled=true;
      try {
        const r=await API.processPayment({gatewayId:selMethodId,amount:Store.cartTotal(),details:getPayDetails(selMethodType)});
        paymentToken=r.paymentToken;
        s.innerHTML=`<div class="success-text">✓ ${esc(r.message)}<br><span style="font-family:var(--font-mono);font-size:0.75rem;">Ref: ${esc(r.reference)}</span></div>`;
        document.getElementById('place-order-area').innerHTML=`<button class="btn large success" id="place-order-btn" style="width:100%;">Place Order →</button>`;
        wirePlaceOrder();
      } catch(e){
        s.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;
        document.getElementById('pay-btn').disabled=false;
      }
    });

    if (methods.length===0) wirePlaceOrder();

    function wirePlaceOrder(){
      document.getElementById('place-order-btn')?.addEventListener('click',async()=>{
        const errEl=document.getElementById('co-error'); errEl.textContent='';
        if (!document.getElementById('a-street')?.value?.trim()){errEl.textContent='Please enter your street name.';return;}
        if (!document.getElementById('a-city')?.value?.trim()){errEl.textContent='Please enter your city/town.';return;}
        if (!document.getElementById('a-country')?.value?.trim()){errEl.textContent='Please enter your country.';return;}
        const addr=buildAddress();
        const btn=document.getElementById('place-order-btn'); btn.disabled=true; btn.textContent='Placing order…';
        try {
          // Collect proof URLs from uploader if it exists
          let pProofs=[];
          try { pProofs=document.getElementById('proof-uploader')?Uploader.create._instances?.[0]?.getUrls()||[]:proofUrls; } catch {}
          const {order}=await API.createOrder({
            items:cart.map(i=>({productId:i.productId,quantity:i.quantity})),
            shippingAddress:addr,
            deliveryLat:validLat, deliveryLng:validLng,
            deliveryNotes:document.getElementById('a-notes')?.value?.trim()||'',
            paymentToken, vehicleType:document.getElementById('vehicle-select')?.value||'van',
            paymentProofs:proofUrls
          });
          Store.clearCart();
          Store.toast(`Order confirmed! Tracking: ${order.tracking.number}`);
          navigateTo(`#/orders/${order.id}`);
        } catch(e){ errEl.textContent=e.message; btn.disabled=false; btn.textContent='Place Order →'; }
      });
    }
  }

  // ── AUTH ───────────────────────────────────────────────────────────────────
  function renderLogin() {
    app().innerHTML=`
      <div style="max-width:420px;margin:40px auto;">
        <h1 class="page-title">Sign In</h1>
        <p class="page-sub">Welcome back</p>
        <div class="form-card">
          <form id="login-form">
            <div class="field"><label>Email address</label><input id="l-email" type="email" required autocomplete="email"></div>
            <div class="field"><label>Password</label><input id="l-pass" type="password" required autocomplete="current-password"></div>
            <div id="l-err" class="error-text"></div>
            <button class="btn large" style="width:100%;" type="submit">Sign In</button>
          </form>
          <p style="margin-top:14px;text-align:center;">New here? <a href="#/register" data-link>Create account</a></p>
        </div>
      </div>`;
    document.getElementById('login-form').addEventListener('submit',async e=>{
      e.preventDefault();
      const errEl=document.getElementById('l-err'); errEl.textContent='';
      try {
        const {token,user}=await API.login(document.getElementById('l-email').value,document.getElementById('l-pass').value);
        API.setToken(token); Store.setUser(user);
        Store.toast(`Welcome back, ${user.name}!`);
        navigateTo(user.role==='admin'?'#/admin':'#/');
      } catch(e){ errEl.textContent=e.message; }
    });
  }

  function renderRegister() {
    app().innerHTML=`
      <div style="max-width:420px;margin:40px auto;">
        <h1 class="page-title">Create Account</h1>
        <p class="page-sub">Join Comprehensive Merchandise</p>
        <div class="form-card">
          <form id="reg-form">
            <div class="field"><label>Full name</label><input id="r-name" required autocomplete="name"></div>
            <div class="field"><label>Email address</label><input id="r-email" type="email" required autocomplete="email"></div>
            <div class="field"><label>Password</label><input id="r-pass" type="password" required autocomplete="new-password">
              <span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--ink-soft);">Min 8 chars, one uppercase letter, one number</span></div>
            <div id="r-err" class="error-text"></div>
            <button class="btn large" style="width:100%;" type="submit">Create Account</button>
          </form>
          <p style="margin-top:14px;text-align:center;">Already have an account? <a href="#/login" data-link>Sign in</a></p>
        </div>
      </div>`;
    document.getElementById('reg-form').addEventListener('submit',async e=>{
      e.preventDefault();
      const errEl=document.getElementById('r-err'); errEl.textContent='';
      try {
        const {token,user,devCode,smtpConfigured,message}=await API.register(
          document.getElementById('r-name').value,
          document.getElementById('r-email').value,
          document.getElementById('r-pass').value
        );
        API.setToken(token); Store.setUser(user);
        Store.toast(`Welcome, ${user.name}!`);
        // Navigate to verify page, pass devCode if SMTP not configured
        window._devVerifyCode = devCode || null;
        window._smtpConfigured = smtpConfigured;
        navigateTo('#/verify-email');
      } catch(e){ errEl.textContent=e.message; }
    });
  }

  // ── EMAIL VERIFICATION ─────────────────────────────────────────────────────
  function renderVerifyEmail() {
    const devCode = window._devVerifyCode;
    const smtpOk  = window._smtpConfigured;
    app().innerHTML=`
      <div style="max-width:460px;margin:40px auto;">
        <h1 class="page-title">Verify Your Email</h1>
        <p class="page-sub">One more step</p>
        <div class="form-card">
          ${!smtpOk && devCode?`
            <div style="background:#FFF8E1;border:2px solid var(--gold);border-radius:var(--radius);padding:16px;margin-bottom:16px;">
              <div style="font-family:var(--font-display);text-transform:uppercase;font-size:0.9rem;color:var(--gold);margin-bottom:8px;">⚠ SMTP Not Configured — Dev Mode</div>
              <div style="font-family:var(--font-mono);font-size:0.82rem;color:var(--ink-soft);margin-bottom:10px;">Email could not be sent. Your verification code is shown here instead. Set up SMTP in Admin → Settings to send real emails.</div>
              <div style="font-size:2rem;font-weight:bold;letter-spacing:0.35em;text-align:center;background:var(--paper);padding:14px;border-radius:3px;font-family:var(--font-mono);">${devCode}</div>
            </div>
          `:`<p style="margin-bottom:16px;line-height:1.6;">We sent a 6-digit verification code to your email. Enter it below.</p>`}
          <div class="field">
            <label>Verification code</label>
            <input id="v-code" type="text" placeholder="000000" maxlength="6"
              style="font-size:1.8rem;letter-spacing:0.3em;text-align:center;font-family:var(--font-mono);"
              ${devCode?`value="${devCode}"`:''}  required>
          </div>
          <div id="v-err" class="error-text"></div>
          <div id="v-ok" class="success-text" style="display:none;"></div>
          <button class="btn large success" id="v-btn" style="width:100%;margin-top:8px;">Verify Email</button>
          <div style="margin-top:14px;text-align:center;">
            <button class="btn secondary small" id="v-resend">Resend code</button>
            <div id="v-resend-status" style="font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-soft);margin-top:6px;"></div>
          </div>
          <p style="margin-top:14px;text-align:center;"><a href="#/" data-link style="color:var(--ink-soft);font-size:0.85rem;">Skip for now →</a></p>
        </div>
      </div>`;

    document.getElementById('v-btn').addEventListener('click',async()=>{
      const code=document.getElementById('v-code').value.trim();
      const errEl=document.getElementById('v-err'); const okEl=document.getElementById('v-ok');
      errEl.textContent=''; okEl.style.display='none';
      if (!code||code.length!==6){errEl.textContent='Please enter the 6-digit code.';return;}
      try {
        await API.verifyEmail(code);
        okEl.textContent='✓ Email verified! Redirecting…'; okEl.style.display='block';
        window._devVerifyCode=null;
        setTimeout(()=>navigateTo('#/'),1500);
      } catch(e){errEl.textContent=e.message;}
    });

    document.getElementById('v-resend').addEventListener('click',async()=>{
      const s=document.getElementById('v-resend-status'); s.textContent='Sending…';
      try {
        const r=await API.resendVerification();
        if (r.devCode){
          window._devVerifyCode=r.devCode;
          document.getElementById('v-code').value=r.devCode;
          s.textContent=`Code shown above (SMTP not configured).`;
        } else {
          s.textContent='✓ Code sent to your email!';
        }
      } catch(e){s.textContent=e.message;}
    });
  }

  // ── ORDERS LIST ────────────────────────────────────────────────────────────
  async function renderOrders() {
    if (!Store.getUser()){navigateTo('#/login');return;}
    app().innerHTML=`<h1 class="page-title">My Orders</h1><p class="page-sub">Order history and live tracking</p><div id="ol"></div>`;
    try {
      const {orders}=await API.getOrders();
      const el=document.getElementById('ol');
      if (!orders.length){el.innerHTML=`<div class="empty-state">No orders yet.<br><a href="#/" data-link>Start shopping</a></div>`;return;}
      el.innerHTML=orders.slice().reverse().map(o=>`
        <a href="#/orders/${o.id}" data-link style="text-decoration:none;color:inherit;">
          <div class="label-card">
            <div class="label-row"><span class="label-key">Order ID</span><span>${o.id}</span></div>
            <div class="label-row"><span class="label-key">Date</span><span>${fmtDate(o.createdAt)}</span></div>
            <div class="label-row"><span class="label-key">Total</span><span>${fmt(o.total)}</span></div>
            <div class="label-row"><span class="label-key">Tracking</span><span style="font-family:var(--font-mono);">${o.tracking?.number||'—'}</span></div>
            <div class="label-row"><span class="label-key">Status</span><span class="status-badge ${statusClass(o.tracking?.status||'')}">${o.tracking?.status||o.status}</span></div>
            ${o.tracking?.vehicle?`<div class="label-row"><span class="label-key">Vehicle</span><span>${o.tracking.vehicle.icon} ${esc(o.tracking.vehicle.label)}</span></div>`:''}
            ${o.invoiceNumber?`<div class="label-row"><span class="label-key">Invoice</span><span>${o.invoiceNumber}</span></div>`:''}
          </div>
        </a>`).join('');
    } catch(e){document.getElementById('ol').innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  // ── ORDER DETAIL + LIVE MAP ────────────────────────────────────────────────
  let _poll=null;
  async function renderOrderDetail(params) {
    if (!Store.getUser()){navigateTo('#/login');return;}
    if (_poll){clearInterval(_poll);_poll=null;}
    app().innerHTML=`<div class="empty-state">Loading order…</div>`;
    try {
      const {order}=await API.getOrder(params.id);
      drawOrder(order);
      _poll=setInterval(async()=>{
        try{const{order:u}=await API.getOrder(params.id);drawOrder(u);if(u.tracking?.state==='completed'){clearInterval(_poll);_poll=null;}}catch{clearInterval(_poll);_poll=null;}
      },8000);
    } catch(e){app().innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  function drawOrder(order) {
    const tr=order.tracking||{};
    const steps=['Processing','Shipped','In Transit','Out for Delivery','Delivered'];
    const pct=Math.round((tr.progress||0)*100);
    const curr=tr.currentPosition||tr.origin||{lat:0,lng:0};
    app().innerHTML=`
      <div class="flex-between" style="margin-bottom:4px;">
        <h1 class="page-title">Order Tracking</h1>
        <div class="btn-group">
          ${order.invoiceNumber?`<button class="btn small" id="view-inv">📄 Invoice</button>`:''}
          <a href="#/messages" data-link class="btn secondary small">💬 Message Support</a>
        </div>
      </div>
      <p class="page-sub">Placed ${fmtDate(order.createdAt)}</p>
      <div class="label-card">
        <div class="label-row"><span class="label-key">Tracking #</span><span style="font-family:var(--font-mono);font-weight:600;">${tr.number||'—'}</span></div>
        <div class="label-row"><span class="label-key">Status</span><span class="status-badge ${statusClass(tr.status||'')}">${tr.status||'—'}</span></div>
        ${tr.vehicle?`<div class="label-row"><span class="label-key">Vehicle</span><span>${tr.vehicle.icon} ${esc(tr.vehicle.label)} (${tr.vehicle.speedKmh} km/h)</span></div>`:''}
        ${tr.distanceKm?`<div class="label-row"><span class="label-key">Distance</span><span>${tr.distanceKm} km</span></div>`:''}
        ${tr.etaMinutesRemaining!==undefined?`<div class="label-row"><span class="label-key">ETA</span><span style="color:var(--stamp-red);font-weight:600;">${fmtMin(tr.etaMinutesRemaining)} remaining</span></div>`:''}
        ${tr.estimatedArrival?`<div class="label-row"><span class="label-key">Est. Arrival</span><span>${fmtDate(tr.estimatedArrival)}</span></div>`:''}
        <div class="label-row"><span class="label-key">Position</span><span style="font-family:var(--font-mono);">${curr.lat?.toFixed(4)||'—'}, ${curr.lng?.toFixed(4)||'—'}</span></div>
        ${order.shippingAddress?`<div class="label-row"><span class="label-key">Deliver to</span><span>${esc(order.shippingAddress)}</span></div>`:''}
        ${order.payment?`<div class="label-row"><span class="label-key">Payment</span><span>${esc(order.payment.method)} — ${esc(order.payment.reference)}</span></div>`:''}
        ${order.paymentProofs&&order.paymentProofs.length?`<div class="label-row"><span class="label-key">Proof files</span><span>${order.paymentProofs.length} uploaded</span></div>`:''}
      </div>
      <div class="section">
        <h2 class="section-head">${tr.vehicle?.icon||'📍'} Live Tracking Map</h2>
        <div class="map-container" id="tracking-map" style="height:340px;"></div>
        ${!Maps.isGoogleLoaded()?`<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--ink-soft);margin-top:4px;">💡 Add a Google Maps key in Admin → Settings for interactive maps.</div>`:''}
      </div>
      <div class="route-track">
        <div class="route-line">
          <div class="route-fill" style="width:${pct}%;"></div>
          <div class="route-dot" style="left:${pct}%;">${tr.vehicle?.icon||'📦'}</div>
        </div>
        <div class="route-points">
          <span>Origin<br>${tr.origin?.lat?.toFixed(3)||'—'}, ${tr.origin?.lng?.toFixed(3)||'—'}</span>
          <span style="text-align:right;">Destination<br>${order.deliveryLocation?.lat?.toFixed(3)||'—'}, ${order.deliveryLocation?.lng?.toFixed(3)||'—'}</span>
        </div>
        <div class="status-steps">${steps.map((s,i)=>`<div class="step ${i<(tr.statusIndex||0)?'done':''} ${i===(tr.statusIndex||0)?'current':''}">${s}</div>`).join('')}</div>
      </div>
      <div class="section">
        <h2 class="section-head">Items</h2>
        ${order.items.map(i=>`<div class="cart-row"><img src="${i.image||'/images/placeholder-generic.svg'}" alt="${esc(i.name)}" style="width:50px;height:50px;object-fit:cover;"><div class="info"><div class="name">${esc(i.name)}</div><div class="muted">×${i.quantity}</div></div><div class="price">${fmt(i.price*i.quantity)}</div></div>`).join('')}
        <div class="cart-total"><span>Total</span><span>${fmt(order.total)}</span></div>
      </div>`;

    if (tr.route&&tr.currentPosition) {
      setTimeout(()=>Maps.renderTrackingMap('tracking-map',{route:tr.route,currentPosition:curr,deliveryLocation:order.deliveryLocation,progress:tr.progress||0,vehicleIcon:tr.vehicle?.icon||'📦'}),100);
    }
    document.getElementById('view-inv')?.addEventListener('click',async()=>{
      try{const{invoiceUrl}=await API.getInvoice(order.id);window.open(invoiceUrl,'_blank');}catch(e){Store.toast(e.message);}
    });
  }

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  async function renderNotifications() {
    if (!Store.getUser()){navigateTo('#/login');return;}
    app().innerHTML=`<h1 class="page-title">Notifications</h1><p class="page-sub">Updates about your account</p><div id="nl"></div>`;
    try {
      const {notifications}=await API.getNotifications();
      const el=document.getElementById('nl');
      if (!notifications.length){el.innerHTML=`<div class="empty-state">No notifications yet.</div>`;return;}
      el.innerHTML=notifications.map(n=>`<div class="notification ${n.read?'':'unread'}">
        <div class="title">${esc(n.title)}</div>
        <div>${esc(n.message)}</div>
        <div class="meta">${fmtDate(n.createdAt)} · ${n.type==='manual'?'From admin':'Automatic'}</div>
      </div>`).join('');
      notifications.filter(n=>!n.read).forEach(n=>API.markRead(n.id).catch(()=>{}));
      updateNotifBadge(0);
    } catch(e){document.getElementById('nl').innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  async function updateNotifBadge() {
    const b=document.getElementById('notif-badge');
    if (!b||!Store.getUser()){if(b)b.classList.remove('show');return;}
    try{const{notifications}=await API.getNotifications();const u=notifications.filter(n=>!n.read).length;b.textContent=u;b.classList.toggle('show',u>0);}catch{}
  }

  // ── CUSTOMER MESSAGES ──────────────────────────────────────────────────────
  async function renderMessages() {
    if (!Store.getUser()){navigateTo('#/login');return;}
    app().innerHTML=`
      <h1 class="page-title">Messages</h1>
      <p class="page-sub">Chat with our support team</p>
      <div id="msg-list" style="max-height:400px;overflow-y:auto;border:1px solid var(--line);background:var(--paper);padding:16px;border-radius:var(--radius);margin-bottom:16px;"></div>
      <div class="form-card" style="max-width:100%;">
        <div class="field"><label>Message</label><textarea id="msg-txt" placeholder="Type your message…" style="min-height:80px;"></textarea></div>
        <div class="field"><label>Attach image or file (optional)</label><div id="msg-upl"></div></div>
        <div id="msg-err" class="error-text"></div>
        <button class="btn success" id="msg-send">Send Message</button>
      </div>`;

    const upl=Uploader.create(document.getElementById('msg-upl'),{multiple:false,folder:'messages',adminOnly:false});

    async function loadMsgs(){
      const el=document.getElementById('msg-list');
      try{
        const{messages}=await API.getMessages();
        if (!messages.length){el.innerHTML=`<div class="empty-state" style="padding:20px 0;">No messages yet. Send one below.</div>`;return;}
        el.innerHTML=messages.map(m=>{
          const isMe=m.fromRole==='customer';
          return `<div style="margin-bottom:12px;display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'};">
            <div style="max-width:80%;background:${isMe?'var(--ink)':'var(--kraft-dark)'};color:${isMe?'var(--paper)':'var(--ink)'};padding:10px 14px;border-radius:${isMe?'12px 12px 3px 12px':'12px 12px 12px 3px'};">
              ${m.text?`<div>${esc(m.text)}</div>`:''}
              ${(m.attachments||[]).map(url=>{
                const isImg=/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
                return isImg?`<img src="${url}" style="max-width:200px;border-radius:4px;margin-top:6px;display:block;">`:
                  `<a href="${url}" target="_blank" style="color:${isMe?'#adf':'var(--utility-blue)'};">📎 ${url.split('/').pop()}</a>`;
              }).join('')}
            </div>
            <div style="font-family:var(--font-mono);font-size:0.63rem;color:var(--ink-soft);margin-top:3px;">${isMe?'You':'Support'} · ${new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>`;
        }).join('');
        el.scrollTop=el.scrollHeight;
      }catch(e){el.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }

    document.getElementById('msg-send').addEventListener('click',async()=>{
      const text=document.getElementById('msg-txt').value.trim();
      const attachments=upl.getUrls();
      const errEl=document.getElementById('msg-err'); errEl.textContent='';
      if (!text&&!attachments.length){errEl.textContent='Enter a message or attach a file.';return;}
      try{await API.sendMessage({text,attachments});document.getElementById('msg-txt').value='';upl.reset();loadMsgs();}
      catch(e){errEl.textContent=e.message;}
    });
    loadMsgs();
  }

  // ── SUPPORT ────────────────────────────────────────────────────────────────
  async function renderSupport() {
    if (!Store.getUser()){navigateTo('#/login');return;}
    app().innerHTML=`
      <h1 class="page-title">Customer Support</h1>
      <p class="page-sub">We're here to help</p>
      <div class="grid-2">
        <div>
          <div class="section">
            <h2 class="section-head">FAQ</h2>
            ${[['How does tracking work?','Each order gets a tracking number and simulated route from our warehouse to your address. Your package position updates based on the delivery vehicle speed.'],
               ['Where is my invoice?','Open your order detail page and click the Invoice button — it auto-generates when you place an order.'],
               ['How do I upload payment proof?','On the checkout page, after selecting a payment method, there is an upload area for screenshots or PDFs.'],
               ['How do I contact support?','Use the Messages page for direct chat with our team, or open a ticket below.']
              ].map(([q,a])=>`<div class="review"><strong>${q}</strong><p style="margin-top:4px;">${a}</p></div>`).join('')}
          </div>
        </div>
        <div>
          <div class="section">
            <h2 class="section-head">Open a Ticket</h2>
            <form id="t-form" class="form-card">
              <div class="field"><label>Subject</label><input id="t-sub" required></div>
              <div class="field"><label>Order ID (optional)</label><input id="t-oid" placeholder="order-xxxxxx"></div>
              <div class="field"><label>Message</label><textarea id="t-msg" required></textarea></div>
              <div id="t-err" class="error-text"></div>
              <button class="btn" type="submit">Submit Ticket</button>
            </form>
          </div>
          <div class="section"><h2 class="section-head">My Tickets</h2><div id="t-list"></div></div>
        </div>
      </div>`;
    document.getElementById('t-form').addEventListener('submit',async e=>{
      e.preventDefault();
      try{await API.createTicket({subject:document.getElementById('t-sub').value.trim(),message:document.getElementById('t-msg').value.trim(),orderId:document.getElementById('t-oid').value.trim()||null});
        Store.toast('Ticket submitted');document.getElementById('t-form').reset();loadTickets();}
      catch(e){document.getElementById('t-err').textContent=e.message;}
    });
    async function loadTickets(){
      const el=document.getElementById('t-list');
      try{const{tickets}=await API.getTickets();
        if (!tickets.length){el.innerHTML=`<div class="empty-state" style="padding:10px 0;">No tickets yet.</div>`;return;}
        el.innerHTML=tickets.map(t=>`<div class="label-card">
          <div class="label-row"><span class="label-key">Subject</span><span>${esc(t.subject)}</span></div>
          <div class="label-row"><span class="label-key">Status</span><span class="status-badge">${t.status}</span></div>
          <div style="margin-top:8px;">${esc(t.message)}</div>
          ${t.replies.map(r=>`<div style="margin-top:8px;padding-left:12px;border-left:2px solid var(--ink);"><div class="meta">${r.from==='admin'?'Support team':esc(r.authorName)} · ${fmtDate(r.at)}</div><div>${esc(r.message)}</div></div>`).join('')}
          ${t.status!=='closed'?`<form class="rf" data-id="${t.id}" style="margin-top:10px;display:flex;gap:8px;">
            <input type="text" placeholder="Reply…" style="flex:1;padding:8px;border:1px solid var(--ink);" required>
            <button class="btn small" type="submit">Send</button>
          </form>`:'' }
        </div>`).join('');
        el.querySelectorAll('.rf').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const i=f.querySelector('input');try{await API.replyTicket(f.dataset.id,i.value.trim());loadTickets();}catch(e){Store.toast(e.message);}}));
      }catch(e){el.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }
    loadTickets();
  }

  function renderNotFound(){app().innerHTML=`<div class="empty-state">Page not found. <a href="#/" data-link>Return to shop</a>.</div>`;}

  return {
    renderShop, renderProduct, renderCart, renderCheckout,
    renderLogin, renderRegister, renderVerifyEmail,
    renderOrders, renderOrderDetail,
    renderNotifications, renderMessages, renderSupport,
    renderNotFound, updateNotifBadge
  };
})();
