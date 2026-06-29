// admin.js v5 — complete admin dashboard

const Admin = (() => {
  const app   = () => document.getElementById('app');
  const esc   = s  => Store.escapeHtml(s);
  const fmt   = n  => `$${Number(n).toFixed(2)}`;
  const fmtD  = iso => new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  const fmtMin = m => m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m} min`;

  let _tab  = 'overview';
  let _poll = null;
  let _msgTarget = null; // { id, name } — pre-selected messaging target

  async function render() {
    const user = Store.getUser();
    if (!user)              { navigateTo('#/login'); return; }
    if (user.role!=='admin'){ app().innerHTML=`<div class="error-text">Admin access required.</div>`; return; }

    const tabs = [
      { id:'overview',       label:'📊 Overview' },
      { id:'products',       label:'📦 Products' },
      { id:'sections',       label:'🏪 Shop Sections' },
      { id:'orders',         label:'🚚 Orders & Tracking' },
      { id:'payments',       label:'💳 Payment Methods' },
      { id:'accounts',       label:'👥 Customer Accounts' },
      { id:'messaging',      label:'💬 Messaging' },
      { id:'notifications',  label:'🔔 Notifications' },
      { id:'reviews',        label:'⭐ Reviews' },
      { id:'support',        label:'🎧 Support' },
      { id:'settings',       label:'⚙️ Settings' },
      { id:'profile',        label:'👤 My Profile' },
      { id:'account-mgmt',   label:'🛡️ Account Management' },
    ];

    app().innerHTML = `
      <h1 class="page-title">Admin Dashboard</h1>
      <p class="page-sub">Comprehensive Merchandise — v5</p>
      <div class="admin-layout">
        <nav class="admin-nav">
          ${tabs.map(t=>`<button data-tab="${t.id}" class="${_tab===t.id?'active':''}">${t.label}</button>`).join('')}
        </nav>
        <div id="admin-content"></div>
      </div>`;

    document.querySelectorAll('.admin-nav button').forEach(btn=>btn.addEventListener('click',()=>{
      _tab=btn.dataset.tab; if(_poll){clearInterval(_poll);_poll=null;} render();
    }));

    const c = document.getElementById('admin-content');
    switch (_tab) {
      case 'overview':      await tabOverview(c);      break;
      case 'products':      await tabProducts(c);      break;
      case 'sections':      await tabSections(c);      break;
      case 'orders':        await tabOrders(c);        break;
      case 'payments':      await tabPayments(c);      break;
      case 'accounts':      await tabAccounts(c);      break;
      case 'messaging':     await tabMessaging(c);     break;
      case 'notifications': await tabNotifications(c); break;
      case 'reviews':       await tabReviews(c);       break;
      case 'support':       await tabSupport(c);       break;
      case 'settings':      await tabSettings(c);      break;
      case 'profile':       await tabProfile(c);       break;
      case 'account-mgmt':  await tabAccountMgmt(c);   break;
    }
  }

  // ── OVERVIEW ────────────────────────────────────────────────────────────────
  async function tabOverview(c) {
    c.innerHTML=`<div class="empty-state">Loading…</div>`;
    try {
      const s=await API.getSummary();
      c.innerHTML=`
        <div class="stat-grid">
          <div class="stat-box"><div class="num">${s.productCount}</div><div class="label">Products</div></div>
          <div class="stat-box"><div class="num">${s.orderCount}</div><div class="label">Orders</div></div>
          <div class="stat-box"><div class="num">${fmt(s.revenue)}</div><div class="label">Revenue</div></div>
          <div class="stat-box"><div class="num">${s.ordersInTransit}</div><div class="label">Active Deliveries</div></div>
          <div class="stat-box"><div class="num">${s.customerCount}</div><div class="label">Customers</div></div>
          <div class="stat-box"><div class="num">${s.pendingReviews}</div><div class="label">Pending Reviews</div></div>
          <div class="stat-box"><div class="num">${s.openTickets}</div><div class="label">Open Tickets</div></div>
          <div class="stat-box"><div class="num">${s.unreadMessages}</div><div class="label">Unread Messages</div></div>
          <div class="stat-box"><div class="num">${s.gatewayCount}</div><div class="label">Payment Methods</div></div>
          <div class="stat-box"><div class="num">${s.sectionCount}</div><div class="label">Shop Sections</div></div>
        </div>
        <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--ok-green);margin-top:4px;">
          ✓ All data saved automatically to data/db.json — persists across restarts.
        </div>
        <div style="font-family:var(--font-mono);font-size:0.75rem;color:${s.smtpConfigured?'var(--ok-green)':'var(--gold)'};margin-top:6px;">
          ${s.smtpConfigured?'✓ SMTP email is configured — verification emails are sent.':'⚠ SMTP not configured — verification codes shown in-app. Set up SMTP in Settings.'}
        </div>`;
    } catch(e){c.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  // ── PRODUCTS ────────────────────────────────────────────────────────────────
  async function tabProducts(c) {
    let sections=[];
    try{const r=await API.getSections();sections=r.sections||[];}catch{}

    c.innerHTML=`
      <h2 class="section-head">Add New Product</h2>
      <div style="background:var(--paper);border:1px solid var(--line);padding:20px;border-radius:var(--radius);margin-bottom:24px;">
        <div class="grid-2">
          <div>
            <div class="field"><label>Product name *</label><input id="p-name" placeholder="e.g. Classic Hoodie"></div>
            <div class="field"><label>Description</label><textarea id="p-desc" placeholder="Describe the product…"></textarea></div>
            <div class="grid-2">
              <div class="field"><label>Price (USD) *</label><input id="p-price" type="number" min="0" step="0.01" placeholder="0.00"></div>
              <div class="field"><label>Stock</label><input id="p-stock" type="number" min="0" value="0"></div>
            </div>
            <div class="field"><label>Category label</label><input id="p-cat" placeholder="e.g. Apparel"></div>
            <div class="field"><label>Shop Section</label>
              <select id="p-sec"><option value="">— General —</option>
                ${sections.filter(s=>!s.isDefault).map(s=>`<option value="${s.id}">${esc(s.icon)} ${esc(s.name)}</option>`).join('')}
              </select></div>
          </div>
          <div>
            <div class="field"><label>Product Photos (upload multiple)</label>
              <div id="prod-upl"></div></div>
          </div>
        </div>
        <div id="p-err" class="error-text"></div>
        <button class="btn success" id="p-add">Post Listing</button>
      </div>
      <h2 class="section-head">Current Listings</h2>
      <div id="p-table"></div>`;

    const upl=Uploader.create(document.getElementById('prod-upl'),{multiple:true,folder:'product'});

    document.getElementById('p-add').addEventListener('click',async()=>{
      const name=document.getElementById('p-name').value.trim();
      const price=Number(document.getElementById('p-price').value);
      if (!name||!price){document.getElementById('p-err').textContent='Name and price are required.';return;}
      const images=upl.getUrls();
      try{
        await API.createProduct({name,description:document.getElementById('p-desc').value.trim(),price,stock:Number(document.getElementById('p-stock').value),category:document.getElementById('p-cat').value.trim()||'General',sectionId:document.getElementById('p-sec').value||null,images:images.length?images:undefined});
        Store.toast('Product listed');upl.reset();
        document.getElementById('p-name').value='';document.getElementById('p-desc').value='';
        document.getElementById('p-price').value='';document.getElementById('p-stock').value='0';
        loadPTable();
      }catch(e){document.getElementById('p-err').textContent=e.message;}
    });

    async function loadPTable(){
      const el=document.getElementById('p-table');
      try{
        const{products}=await API.getProducts();
        if (!products.length){el.innerHTML=`<div class="empty-state">No products yet.</div>`;return;}
        el.innerHTML=`<table class="data-table"><thead><tr><th>Photo</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Photos</th><th>Actions</th></tr></thead><tbody>
          ${products.map(p=>`<tr data-id="${p.id}">
            <td><img src="${(p.images&&p.images[0])||p.image||'/images/placeholder-generic.svg'}" style="width:48px;height:48px;object-fit:cover;border:1px solid var(--line);border-radius:3px;"></td>
            <td><strong>${esc(p.name)}</strong><br><span class="muted" style="font-size:0.75rem;">${esc((p.description||'').slice(0,50))}</span></td>
            <td>${esc(p.category||'')}</td>
            <td><input type="number" class="ep" min="0" step="0.01" value="${p.price}" style="width:80px;padding:4px;border:1px solid var(--line);"></td>
            <td><input type="number" class="es" min="0" value="${p.stock}" style="width:65px;padding:4px;border:1px solid var(--line);"></td>
            <td style="font-family:var(--font-mono);font-size:0.72rem;">${(p.images||[p.image]).length}</td>
            <td><button class="btn small save-btn">Save</button> <button class="btn small danger del-btn">Delete</button></td>
          </tr>`).join('')}</tbody></table>`;
        el.querySelectorAll('tr[data-id]').forEach(row=>{
          const id=row.dataset.id;
          row.querySelector('.save-btn').addEventListener('click',async()=>{try{await API.updateProduct(id,{price:Number(row.querySelector('.ep').value),stock:Number(row.querySelector('.es').value)});Store.toast('Updated');}catch(e){Store.toast(e.message);}});
          row.querySelector('.del-btn').addEventListener('click',async()=>{if(!confirm('Delete this product?'))return;try{await API.deleteProduct(id);loadPTable();}catch(e){Store.toast(e.message);}});
        });
      }catch(e){el.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }
    loadPTable();
  }

  // ── SECTIONS ────────────────────────────────────────────────────────────────
  async function tabSections(c) {
    c.innerHTML=`
      <h2 class="section-head">Add Shop Section / Page</h2>
      <div class="form-card" style="margin-bottom:24px;">
        <p style="font-family:var(--font-mono);font-size:0.78rem;margin-bottom:14px;color:var(--ink-soft);">Sections appear as browsable tabs at the top of your shop.</p>
        <div class="grid-2">
          <div class="field"><label>Section name *</label><input id="s-name" placeholder="e.g. Liquidation Pallets"></div>
          <div class="field"><label>URL slug *</label><input id="s-slug" placeholder="e.g. liquidation"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Icon (emoji)</label><input id="s-icon" placeholder="📦" maxlength="4"></div>
          <div class="field"><label>Description</label><input id="s-desc" placeholder="Short description for customers"></div>
        </div>
        <div id="s-err" class="error-text"></div>
        <button class="btn success" id="s-add">Add Section</button>
      </div>
      <h2 class="section-head">Current Sections</h2>
      <div id="s-list"></div>`;

    document.getElementById('s-add').addEventListener('click',async()=>{
      const name=document.getElementById('s-name').value.trim();
      const slug=document.getElementById('s-slug').value.trim().toLowerCase().replace(/\s+/g,'-');
      if (!name||!slug){document.getElementById('s-err').textContent='Name and slug required.';return;}
      try{await API.createSection({name,slug,icon:document.getElementById('s-icon').value.trim()||'🏷️',description:document.getElementById('s-desc').value.trim()});
        Store.toast(`Section "${name}" added`);
        ['s-name','s-slug','s-icon','s-desc'].forEach(id=>document.getElementById(id).value='');
        loadSList();Store.renderSectionNav();
      }catch(e){document.getElementById('s-err').textContent=e.message;}
    });

    async function loadSList(){
      const el=document.getElementById('s-list');
      try{const{sections}=await API.getSections();
        el.innerHTML=`<table class="data-table"><thead><tr><th>Icon</th><th>Name</th><th>Slug</th><th>Description</th><th>Actions</th></tr></thead><tbody>
          ${sections.map(s=>`<tr><td style="font-size:1.3rem;">${esc(s.icon)}</td><td><strong>${esc(s.name)}</strong></td>
          <td style="font-family:var(--font-mono);font-size:0.78rem;">/${s.slug}</td><td>${esc(s.description||'')}</td>
          <td>${s.isDefault?'<span class="chip">Default</span>':`<button class="btn small danger del-sec" data-id="${s.id}">Delete</button>`}</td></tr>`).join('')}</tbody></table>`;
        el.querySelectorAll('.del-sec').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('Delete section?'))return;try{await API.deleteSection(btn.dataset.id);loadSList();Store.renderSectionNav();}catch(e){Store.toast(e.message);}}));
      }catch(e){el.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }
    loadSList();
  }

  // ── ORDERS & TRACKING ────────────────────────────────────────────────────────
  async function tabOrders(c) {
    c.innerHTML=`<div class="empty-state">Loading orders…</div>`;
    try{
      const{orders}=await API.getOrders();
      if (!orders.length){c.innerHTML=`<div class="empty-state">No orders placed yet.</div>`;return;}
      c.innerHTML=orders.slice().reverse().map(o=>orderCard(o)).join('');
      wireOrderControls(c);
      _poll=setInterval(async()=>{
        if(_tab!=='orders')return;
        try{const{orders:fresh}=await API.getOrders();c.innerHTML=fresh.slice().reverse().map(o=>orderCard(o)).join('');wireOrderControls(c);}catch{}
      },8000);
    }catch(e){c.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  function orderCard(o){
    const tr=o.tracking||{};
    const vtypes=[{value:'van',label:'🚐 Van'},{value:'truck',label:'🚛 Truck'},{value:'car',label:'🚗 Car'},{value:'bus',label:'🚌 Bus'},{value:'ship',label:'🚢 Ship'},{value:'plane',label:'✈️ Plane'}];
    const proofCount=o.paymentProofs?.length||0;
    return `<div class="label-card" data-oid="${o.id}">
      <div class="label-row"><span class="label-key">Order</span><span style="font-family:var(--font-mono);">${o.id}</span></div>
      <div class="label-row"><span class="label-key">Customer</span><span>${esc(o.userName)}</span></div>
      <div class="label-row"><span class="label-key">Total</span><span>${fmt(o.total)}</span></div>
      <div class="label-row"><span class="label-key">Tracking #</span><span style="font-family:var(--font-mono);font-weight:600;">${tr.number||'—'}</span></div>
      <div class="label-row"><span class="label-key">Status</span><span class="status-badge">${tr.status||o.status}</span></div>
      <div class="label-row"><span class="label-key">Vehicle</span><span>${tr.vehicle?`${tr.vehicle.icon} ${esc(tr.vehicle.label)} (${tr.vehicle.speedKmh} km/h)`:esc(o.vehicleType||'van')}</span></div>
      <div class="label-row"><span class="label-key">Distance / ETA</span><span>${tr.distanceKm||'?'} km — ${tr.estimatedMinutes?fmtMin(tr.estimatedMinutes):'?'}</span></div>
      <div class="label-row"><span class="label-key">Remaining</span><span style="color:var(--stamp-red);">${tr.etaMinutesRemaining!==undefined?fmtMin(tr.etaMinutesRemaining):'—'}</span></div>
      <div class="label-row"><span class="label-key">Progress</span><span>${Math.round((tr.progress||0)*100)}% — ${tr.state||'idle'}</span></div>
      <div class="label-row"><span class="label-key">Deliver to</span><span>${esc(o.shippingAddress||'—')}</span></div>
      <div class="label-row"><span class="label-key">Payment</span><span>${o.payment?esc(o.payment.method)+' — '+esc(o.payment.reference):'None'}</span></div>
      <div class="label-row"><span class="label-key">Payment proof</span><span>${proofCount>0?`<span style="color:var(--ok-green);">✓ ${proofCount} file(s) — <button class="btn small view-proofs-btn" data-oid="${o.id}" style="padding:2px 8px;">View</button></span>`:'None uploaded'}</span></div>
      ${o.invoiceNumber?`<div class="label-row"><span class="label-key">Invoice</span><span><a href="/invoice/${o.invoiceNumber}" target="_blank" style="color:var(--utility-blue);">${o.invoiceNumber}</a></span></div>`:''}
      <div style="margin-top:12px;">
        <div class="btn-group" style="margin-bottom:10px;">
          <button class="btn small success trk-btn" data-a="start"  data-id="${o.id}" ${tr.state==='running'||tr.state==='completed'?'disabled':''}>▶ Start</button>
          <button class="btn small secondary trk-btn" data-a="pause"  data-id="${o.id}" ${tr.state!=='running'?'disabled':''}>⏸ Pause</button>
          <button class="btn small secondary trk-btn" data-a="resume" data-id="${o.id}" ${tr.state!=='paused'?'disabled':''}>▶ Resume</button>
          <button class="btn small danger trk-btn"    data-a="reset"  data-id="${o.id}">↺ Reset</button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div class="field" style="margin:0;min-width:160px;"><label>Vehicle on reset</label>
            <select class="v-sel" data-id="${o.id}">${vtypes.map(v=>`<option value="${v.value}" ${(o.vehicleType||'van')===v.value?'selected':''}>${v.label}</option>`).join('')}</select></div>
          <div class="field" style="margin:0;min-width:130px;"><label>Origin lat</label>
            <input type="number" class="o-lat" data-id="${o.id}" placeholder="${tr.origin?.lat||''}" step="0.0001" style="padding:8px;"></div>
          <div class="field" style="margin:0;min-width:130px;"><label>Origin lng</label>
            <input type="number" class="o-lng" data-id="${o.id}" placeholder="${tr.origin?.lng||''}" step="0.0001" style="padding:8px;"></div>
        </div>
      </div>
      <div class="proof-panel" id="pp-${o.id}" style="display:none;margin-top:12px;"></div>
    </div>`;
  }

  function wireOrderControls(c){
    c.querySelectorAll('.trk-btn').forEach(btn=>btn.addEventListener('click',async()=>{
      const id=btn.dataset.id; const action=btn.dataset.a; const body={};
      if (action==='reset'){
        const card=c.querySelector(`[data-oid="${id}"]`);
        const lat=card?.querySelector('.o-lat')?.value; const lng=card?.querySelector('.o-lng')?.value; const vt=card?.querySelector('.v-sel')?.value;
        if(lat)body.originLat=Number(lat); if(lng)body.originLng=Number(lng); if(vt)body.vehicleType=vt;
      }
      try{await API.trackingAction(id,action,body);Store.toast(`Tracking: ${action}`);tabOrders(c);}catch(e){Store.toast(e.message);}
    }));
    // View payment proofs
    c.querySelectorAll('.view-proofs-btn').forEach(btn=>btn.addEventListener('click',async()=>{
      const oid=btn.dataset.oid;
      const panel=document.getElementById(`pp-${oid}`);
      if (panel.style.display!=='none'){panel.style.display='none';return;}
      panel.innerHTML='<div class="muted" style="font-family:var(--font-mono);font-size:0.78rem;">Loading…</div>';
      panel.style.display='block';
      try{
        const order=(await API.getOrder(oid)).order;
        const proofs=order.paymentProofs||[];
        if (!proofs.length){panel.innerHTML='<div class="muted">No proofs attached.</div>';return;}
        panel.innerHTML=`<div style="font-family:var(--font-mono);font-size:0.72rem;text-transform:uppercase;margin-bottom:8px;">Payment Proof Files</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${proofs.map(url=>{
              const isImg=/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
              const isPdf=/\.pdf$/i.test(url);
              return isImg
                ? `<a href="${url}" target="_blank"><img src="${url}" style="height:120px;border:1px solid var(--line);border-radius:3px;cursor:pointer;" title="Click to open full size"></a>`
                : `<a href="${url}" target="_blank" class="btn secondary small">${isPdf?'📄':'📎'} ${url.split('/').pop()}</a>`;
            }).join('')}
          </div>`;
      }catch(e){panel.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }));
  }

  // ── PAYMENT METHODS ──────────────────────────────────────────────────────────
  async function tabPayments(c) {
    c.innerHTML=`
      <h2 class="section-head">Add Payment Method</h2>
      <div style="background:var(--paper);border:1px solid var(--line);padding:20px;border-radius:var(--radius);margin-bottom:24px;">
        <div class="grid-2">
          <div>
            <div class="field"><label>Payment type</label>
              <select id="gw-type">
                <option value="card">💳 Credit / Debit Card</option>
                <option value="crypto">₿ Cryptocurrency</option>
                <option value="paypal">🅿 PayPal</option>
                <option value="bank">🏦 Bank Transfer</option>
                <option value="manual">✍️ Manual / Cash on Delivery</option>
              </select></div>
            <div class="field"><label>Display name *</label><input id="gw-name" placeholder="e.g. Pay with Bitcoin"></div>
            <div id="gw-cfg"></div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <input type="checkbox" id="gw-en" checked>
              <label for="gw-en" style="font-family:var(--font-mono);font-size:0.78rem;text-transform:uppercase;">Enabled for customers</label></div>
          </div>
          <div>
            <div class="field">
              <label>QR Code / Payment Screenshot</label>
              <p style="font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-soft);margin-bottom:8px;">Upload QR code image so customers can scan to pay (crypto, PayPal, etc.)</p>
              <div id="qr-upl"></div></div>
          </div>
        </div>
        <div id="gw-err" class="error-text"></div>
        <button class="btn success" id="gw-add">Add Payment Method</button>
      </div>
      <h2 class="section-head">Active Payment Methods</h2>
      <div id="gw-list"></div>`;

    const qrUpl=Uploader.create(document.getElementById('qr-upl'),{multiple:true,folder:'payment'});
    const typeCfgs={
      card:`<div class="field"><label>Accepted card types</label><input id="gc-cards" placeholder="Visa, Mastercard, Amex"></div>`,
      crypto:`<div class="field"><label>Store wallet address (shown to customers)</label><input id="gc-wallet" placeholder="bc1q… or 0x…"></div>
              <div class="field"><label>Accepted coins</label><input id="gc-coins" placeholder="BTC, ETH, USDT"></div>`,
      paypal:`<div class="field"><label>PayPal business email</label><input id="gc-pp" type="email" placeholder="business@paypal.com"></div>`,
      bank:`<div class="field"><label>Bank name</label><input id="gc-bank" placeholder="Bank name"></div>
            <div class="field"><label>Account number</label><input id="gc-acc" placeholder="Account number"></div>
            <div class="field"><label>Routing / SWIFT / IBAN</label><input id="gc-routing" placeholder="Routing or SWIFT code"></div>`,
      manual:`<div class="field"><label>Instructions for customers</label><textarea id="gc-instr" placeholder="e.g. Pay cash on delivery."></textarea></div>`
    };
    const typesel=document.getElementById('gw-type');
    const cfgDiv=document.getElementById('gw-cfg');
    const updateCfg=()=>cfgDiv.innerHTML=typeCfgs[typesel.value]||'';
    typesel.addEventListener('change',updateCfg); updateCfg();

    document.getElementById('gw-add').addEventListener('click',async()=>{
      const type=typesel.value; const name=document.getElementById('gw-name').value.trim();
      if (!name){document.getElementById('gw-err').textContent='Display name required.';return;}
      const g=id=>document.getElementById(id)?.value?.trim()||'';
      const cfgs={card:{acceptedCards:g('gc-cards')},crypto:{walletAddress:g('gc-wallet'),coins:g('gc-coins')},paypal:{businessEmail:g('gc-pp')},bank:{bankName:g('gc-bank'),accountNumber:g('gc-acc'),routing:g('gc-routing')},manual:{instructions:g('gc-instr')}};
      try{await API.createPaymentGateway({name,type,config:cfgs[type]||{},qrImages:qrUpl.getUrls(),enabled:document.getElementById('gw-en').checked});
        Store.toast(`"${name}" added`);document.getElementById('gw-name').value='';qrUpl.reset();updateCfg();loadGwList();
      }catch(e){document.getElementById('gw-err').textContent=e.message;}
    });

    async function loadGwList(){
      const el=document.getElementById('gw-list');
      try{const{gateways}=await API.getPaymentGateways();
        if (!gateways.length){el.innerHTML=`<div class="empty-state">No payment methods yet.</div>`;return;}
        const icons={card:'💳',crypto:'₿',paypal:'🅿',bank:'🏦',manual:'✍️'};
        el.innerHTML=gateways.map(g=>`<div class="label-card">
          <div class="label-row"><span class="label-key">${icons[g.type]||'💰'} ${g.type.toUpperCase()}</span><span><strong>${esc(g.name)}</strong></span></div>
          <div class="label-row"><span class="label-key">Status</span><span class="status-badge ${g.enabled?'delivered':''}">${g.enabled?'Enabled':'Disabled'}</span></div>
          ${Object.entries(g.config||{}).filter(([,v])=>v).map(([k,v])=>`<div class="label-row"><span class="label-key">${esc(k)}</span><span style="font-family:var(--font-mono);font-size:0.78rem;word-break:break-all;">${esc(v)}</span></div>`).join('')}
          ${g.qrImages&&g.qrImages.length?`<div style="margin-top:10px;"><div class="label-key" style="margin-bottom:6px;">QR / Payment images</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">${g.qrImages.map(url=>`<a href="${url}" target="_blank"><img src="${url}" class="qr-img" alt="QR"></a>`).join('')}</div></div>`:''}
          <div class="btn-group" style="margin-top:12px;">
            <button class="btn small tog-btn" data-id="${g.id}" data-en="${g.enabled}">${g.enabled?'Disable':'Enable'}</button>
            <button class="btn small danger del-gw-btn" data-id="${g.id}">Delete</button>
          </div>
        </div>`).join('');
        el.querySelectorAll('.tog-btn').forEach(btn=>btn.addEventListener('click',async()=>{try{await API.updatePaymentGateway(btn.dataset.id,{enabled:btn.dataset.en==='true'?false:true});loadGwList();}catch(e){Store.toast(e.message);}}));
        el.querySelectorAll('.del-gw-btn').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('Delete?'))return;try{await API.deletePaymentGateway(btn.dataset.id);loadGwList();}catch(e){Store.toast(e.message);}}));
      }catch(e){el.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }
    loadGwList();
  }

  // ── CUSTOMER ACCOUNTS ────────────────────────────────────────────────────────
  async function tabAccounts(c) {
    c.innerHTML=`<div class="empty-state">Loading accounts…</div>`;
    try{
      const{users}=await API.getAdminUsers();
      if (!users.length){c.innerHTML=`<div class="empty-state">No customer accounts yet.</div>`;return;}
      c.innerHTML=`
        <h2 class="section-head">Customer Accounts (${users.length})</h2>
        <table class="data-table">
          <thead><tr><th>Public ID</th><th>Name</th><th>Email</th><th>Verified</th><th>Orders</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>${users.map(u=>`<tr>
            <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--utility-blue);">${esc(u.publicId||'—')}</td>
            <td><strong>${esc(u.name)}</strong></td>
            <td style="font-family:var(--font-mono);font-size:0.8rem;">${esc(u.email)}</td>
            <td>${u.emailVerified?'<span class="status-badge delivered">✓ Verified</span>':'<span class="status-badge processing">Unverified</span>'}</td>
            <td style="text-align:center;">${u.hasOrders?`⭐ ${u.orderCount}`:`${u.orderCount}`}</td>
            <td style="font-family:var(--font-mono);font-size:0.72rem;">${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>
              <button class="btn small msg-btn" data-id="${u.id}" data-name="${esc(u.name)}">💬 Message</button>
              <button class="btn small secondary notif-btn" data-id="${u.id}" data-name="${esc(u.name)}">🔔 Notify</button>
            </td>
          </tr>`).join('')}
          </tbody>
        </table>
        <div id="quick-panel" style="margin-top:16px;"></div>`;

      c.querySelectorAll('.msg-btn').forEach(btn=>btn.addEventListener('click',()=>{
        _msgTarget={id:btn.dataset.id,name:btn.dataset.name};_tab='messaging';render();
      }));
      c.querySelectorAll('.notif-btn').forEach(btn=>btn.addEventListener('click',()=>{
        const panel=document.getElementById('quick-panel');
        panel.innerHTML=`<div class="form-card">
          <h3 style="font-family:var(--font-display);text-transform:uppercase;margin-bottom:12px;">Notify ${esc(btn.dataset.name)}</h3>
          <div class="field"><label>Title</label><input id="qn-title" placeholder="e.g. Payment issue"></div>
          <div class="field"><label>Message</label><textarea id="qn-msg" placeholder="Your message…"></textarea></div>
          <div class="btn-group">
            <button class="btn success" id="qn-send">Send</button>
            <button class="btn secondary" id="qn-cancel">Cancel</button>
          </div>
        </div>`;
        document.getElementById('qn-send').addEventListener('click',async()=>{
          try{await API.sendNotification({userId:btn.dataset.id,title:document.getElementById('qn-title').value.trim(),message:document.getElementById('qn-msg').value.trim()});Store.toast(`Sent to ${btn.dataset.name}`);panel.innerHTML='';}catch(e){Store.toast(e.message);}
        });
        document.getElementById('qn-cancel').addEventListener('click',()=>panel.innerHTML='');
      }));
    }catch(e){c.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  // ── MESSAGING ────────────────────────────────────────────────────────────────
  async function tabMessaging(c) {
    // Load ALL customers (not just ones who messaged first)
    let customers=[];
    try{const r=await API.getAdminUsers();customers=r.users||[];}catch{}

    // Load existing conversation data
    let convos={};
    try{const r=await API.getAdminConversations();(r.conversations||[]).forEach(cv=>{convos[cv.userId]=cv;});}catch{}

    // Sort: customers with orders first (starred), then alphabetical
    customers.sort((a,b)=>{
      if (a.hasOrders&&!b.hasOrders) return -1;
      if (!a.hasOrders&&b.hasOrders) return 1;
      return a.name.localeCompare(b.name);
    });

    // Determine active customer
    let activeId   = _msgTarget?.id   || customers[0]?.id   || null;
    let activeName = _msgTarget?.name || customers[0]?.name || '';
    _msgTarget = null; // clear after use

    c.innerHTML=`
      <div style="display:grid;grid-template-columns:240px 1fr;border:1px solid var(--line);background:var(--paper);border-radius:var(--radius);min-height:520px;overflow:hidden;">
        <!-- SIDEBAR: all customers -->
        <div style="border-right:1px solid var(--line);display:flex;flex-direction:column;">
          <div style="padding:10px 14px;border-bottom:1px solid var(--line);background:var(--kraft-dark);font-family:var(--font-mono);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;">
            All Customers (${customers.length})
          </div>
          <div id="cust-sidebar" style="flex:1;overflow-y:auto;">
            ${customers.length===0?`<div class="empty-state" style="padding:20px 10px;font-size:0.8rem;">No customers yet</div>`:''}
            ${customers.map(u=>{
              const cv=convos[u.id];
              const unread=cv?.unread||0;
              const isActive=u.id===activeId;
              const lastMsg=cv?.messages?.[cv.messages.length-1];
              return `<button class="cust-btn" data-id="${u.id}" data-name="${esc(u.name)}"
                style="display:block;width:100%;text-align:left;padding:10px 14px;border:none;background:${isActive?'var(--kraft)':'transparent'};border-left:3px solid ${isActive?'var(--stamp-red)':'transparent'};cursor:pointer;border-bottom:1px solid var(--line);">
                <div style="display:flex;justify-content:space-between;align-items:baseline;">
                  <span style="font-weight:600;font-size:0.88rem;">${u.hasOrders?'⭐ ':''}${esc(u.name)}</span>
                  ${unread?`<span class="badge show" style="font-size:0.6rem;">${unread}</span>`:''}
                </div>
                <div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--ink-soft);">${esc(u.email)}</div>
                ${lastMsg?`<div style="font-size:0.72rem;color:var(--ink-soft);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">${esc((lastMsg.text||'📎 file').slice(0,35))}</div>`:''}
              </button>`;
            }).join('')}
          </div>
        </div>

        <!-- CHAT PANEL -->
        <div style="display:flex;flex-direction:column;">
          <div id="chat-hdr" style="padding:12px 16px;border-bottom:1px solid var(--line);background:var(--kraft-dark);font-family:var(--font-mono);font-size:0.82rem;font-weight:600;">
            ${activeName || 'Select a customer from the list'}
          </div>
          <div id="chat-msgs" style="flex:1;padding:16px;overflow-y:auto;max-height:300px;min-height:180px;background:var(--kraft);"></div>
          <div style="padding:14px;border-top:1px solid var(--line);">
            <div class="field" style="margin-bottom:8px;"><textarea id="chat-txt" placeholder="Type a message to ${activeName||'customer'}…" style="min-height:58px;resize:none;"></textarea></div>
            <div class="field" style="margin-bottom:8px;"><label style="font-size:0.65rem;">Attach image, PDF or text file</label><div id="chat-upl"></div></div>
            <div id="chat-err" class="error-text"></div>
            <button class="btn success" id="chat-send" ${!activeId?'disabled':''}>Send →</button>
          </div>
        </div>
      </div>`;

    const chatUpl=Uploader.create(document.getElementById('chat-upl'),{multiple:false,folder:'messages'});

    async function loadChat(userId){
      const el=document.getElementById('chat-msgs');
      if (!userId){el.innerHTML=`<div class="empty-state">Select a customer to start messaging.</div>`;return;}
      try{
        const{messages}=await API.getAdminMessages(userId);
        if (!messages.length){el.innerHTML=`<div class="empty-state" style="padding:20px;">No messages yet. Send the first one!</div>`;return;}
        el.innerHTML=messages.map(m=>{
          const isAdmin=m.fromRole==='admin';
          return `<div style="margin-bottom:12px;display:flex;flex-direction:column;align-items:${isAdmin?'flex-end':'flex-start'};">
            <div style="max-width:78%;background:${isAdmin?'var(--ink)':'var(--paper)'};color:${isAdmin?'var(--paper)':'var(--ink)'};padding:10px 14px;border-radius:${isAdmin?'12px 12px 3px 12px':'12px 12px 12px 3px'};border:1px solid var(--line);">
              ${m.text?`<div>${esc(m.text)}</div>`:''}
              ${(m.attachments||[]).map(url=>{
                const isImg=/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
                return isImg?`<img src="${url}" style="max-width:180px;border-radius:4px;margin-top:6px;display:block;">`:
                  `<a href="${url}" target="_blank" style="color:${isAdmin?'#adf':'var(--utility-blue)'};">📎 ${url.split('/').pop()}</a>`;
              }).join('')}
            </div>
            <div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--ink-soft);margin-top:3px;">${isAdmin?'You (Admin)':esc(m.fromName)} · ${new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>`;
        }).join('');
        el.scrollTop=el.scrollHeight;
      }catch(e){el.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }

    // Wire sidebar buttons
    c.querySelectorAll('.cust-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        activeId=btn.dataset.id; activeName=btn.dataset.name;
        c.querySelectorAll('.cust-btn').forEach(b=>{b.style.background='transparent';b.style.borderLeftColor='transparent';});
        btn.style.background='var(--kraft)'; btn.style.borderLeftColor='var(--stamp-red)';
        document.getElementById('chat-hdr').textContent=activeName;
        document.getElementById('chat-txt').placeholder=`Type a message to ${activeName}…`;
        document.getElementById('chat-send').disabled=false;
        loadChat(activeId);
      });
    });

    // Send
    document.getElementById('chat-send').addEventListener('click',async()=>{
      if (!activeId) return;
      const text=document.getElementById('chat-txt').value.trim();
      const attachments=chatUpl.getUrls();
      const errEl=document.getElementById('chat-err'); errEl.textContent='';
      if (!text&&!attachments.length){errEl.textContent='Enter a message or attach a file.';return;}
      try{
        await API.sendAdminMessage(activeId,{text,attachments});
        document.getElementById('chat-txt').value=''; chatUpl.reset();
        Store.toast(`Sent to ${activeName}`); loadChat(activeId);
      }catch(e){errEl.textContent=e.message;}
    });

    if (activeId) loadChat(activeId);
  }

  // ── NOTIFICATIONS ────────────────────────────────────────────────────────────
  async function tabNotifications(c) {
    c.innerHTML=`
      <h2 class="section-head">Send Notification</h2>
      <div class="form-card" style="margin-bottom:24px;">
        <div class="field"><label>Recipient</label><select id="nt-target"><option value="">📢 All customers (broadcast)</option></select></div>
        <div class="field"><label>Title</label><input id="nt-title" placeholder="e.g. Sale this weekend!"></div>
        <div class="field"><label>Message</label><textarea id="nt-msg" placeholder="Your message…"></textarea></div>
        <div id="nt-err" class="error-text"></div>
        <button class="btn success" id="nt-send">Send Notification</button>
      </div>
      <h2 class="section-head">Notification History</h2>
      <div id="nt-hist"></div>`;

    try{const{users}=await API.getAdminUsers();const sel=document.getElementById('nt-target');users.forEach(u=>{const o=document.createElement('option');o.value=u.id;o.textContent=`${u.name} (${u.email})`;sel.appendChild(o);});}catch{}

    document.getElementById('nt-send').addEventListener('click',async()=>{
      const errEl=document.getElementById('nt-err'); errEl.textContent='';
      try{await API.sendNotification({userId:document.getElementById('nt-target').value||undefined,title:document.getElementById('nt-title').value.trim(),message:document.getElementById('nt-msg').value.trim()});
        Store.toast('Sent');document.getElementById('nt-title').value='';document.getElementById('nt-msg').value='';loadHist();
      }catch(e){errEl.textContent=e.message;}
    });

    async function loadHist(){
      const el=document.getElementById('nt-hist');
      try{const{notifications}=await API.getAllNotifications();
        if (!notifications.length){el.innerHTML=`<div class="empty-state">Nothing sent yet.</div>`;return;}
        el.innerHTML=notifications.map(n=>`<div class="notification">
          <div class="title">${esc(n.title)}</div>
          <div>${esc(n.message)}</div>
          <div class="meta">${fmtD(n.createdAt)} · ${n.userId?'Targeted':'Broadcast'} · ${n.type}</div>
        </div>`).join('');
      }catch(e){el.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
    }
    loadHist();
  }

  // ── REVIEWS ────────────────────────────────────────────────────────────────
  async function tabReviews(c){
    c.innerHTML=`<div class="empty-state">Loading reviews…</div>`;
    try{const{reviews}=await API.getAllReviews();
      if (!reviews.length){c.innerHTML=`<div class="empty-state">No reviews yet.</div>`;return;}
      c.innerHTML=reviews.map(r=>`<div class="review" style="padding:14px 0;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
            <div style="margin-top:4px;">${esc(r.comment)}</div>
            <div class="meta">${esc(r.userName)} · ${fmtD(r.createdAt)} · ${r.verifiedPurchase?'✓ Verified':''} · Status: <strong>${r.status}</strong></div>
          </div>
          <div class="btn-group">
            <button class="btn small success mod-btn" data-id="${r.id}" data-s="approved" ${r.status==='approved'?'disabled':''}>Approve</button>
            <button class="btn small danger mod-btn" data-id="${r.id}" data-s="hidden" ${r.status==='hidden'?'disabled':''}>Hide</button>
          </div>
        </div>
      </div>`).join('');
      c.querySelectorAll('.mod-btn').forEach(btn=>btn.addEventListener('click',async()=>{try{await API.moderateReview(btn.dataset.id,btn.dataset.s);tabReviews(c);}catch(e){Store.toast(e.message);}}));
    }catch(e){c.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  // ── SUPPORT ────────────────────────────────────────────────────────────────
  async function tabSupport(c){
    c.innerHTML=`<div class="empty-state">Loading tickets…</div>`;
    try{const{tickets}=await API.getTickets();
      if (!tickets.length){c.innerHTML=`<div class="empty-state">No support tickets yet.</div>`;return;}
      c.innerHTML=tickets.map(t=>`<div class="label-card">
        <div class="label-row"><span class="label-key">From</span><span>${esc(t.userName)} — ${esc(t.userEmail)}</span></div>
        <div class="label-row"><span class="label-key">Subject</span><span><strong>${esc(t.subject)}</strong></span></div>
        <div class="label-row"><span class="label-key">Status</span><span class="status-badge">${t.status}</span></div>
        ${t.orderId?`<div class="label-row"><span class="label-key">Order</span><span>${t.orderId}</span></div>`:''}
        <div style="margin-top:8px;">${esc(t.message)}</div>
        ${t.replies.map(r=>`<div style="margin-top:10px;padding-left:12px;border-left:2px solid var(--ink);">
          <div class="meta">${r.from==='admin'?'Support team':esc(r.authorName)} · ${fmtD(r.at)}</div>
          <div>${esc(r.message)}</div>
        </div>`).join('')}
        ${t.status!=='closed'?`<div class="btn-group" style="margin-top:12px;">
          <input type="text" class="rep-inp" placeholder="Reply…" style="flex:1;padding:8px;border:1px solid var(--ink);" data-id="${t.id}">
          <button class="btn small success rep-btn" data-id="${t.id}">Reply</button>
          <button class="btn small danger cls-btn" data-id="${t.id}">Close</button>
        </div>`:``}
      </div>`).join('');
      c.querySelectorAll('.rep-btn').forEach(btn=>btn.addEventListener('click',async()=>{
        const inp=c.querySelector(`.rep-inp[data-id="${btn.dataset.id}"]`);
        try{await API.replyTicket(btn.dataset.id,inp.value.trim());tabSupport(c);}catch(e){Store.toast(e.message);}
      }));
      c.querySelectorAll('.cls-btn').forEach(btn=>btn.addEventListener('click',async()=>{try{await API.closeTicket(btn.dataset.id);tabSupport(c);}catch(e){Store.toast(e.message);}}));
    }catch(e){c.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  async function tabSettings(c){
    c.innerHTML=`<div class="empty-state">Loading settings…</div>`;
    try{
      const s=await API.getSettings();
      c.innerHTML=`
        <h2 class="section-head">Google Maps</h2>
        <div class="form-card" style="margin-bottom:24px;">
          <p style="font-family:var(--font-mono);font-size:0.78rem;color:var(--ink-soft);margin-bottom:12px;">Add your Google Maps API key to enable real interactive maps on tracking pages.</p>
          <div class="field"><label>Google Maps API key</label><input id="cfg-maps" type="text" placeholder="AIza…" value="${esc(s.googleMapsKey||'')}"></div>
          <div style="font-family:var(--font-mono);font-size:0.75rem;color:${s.googleMapsKey?'var(--ok-green)':'var(--ink-soft)'};margin-bottom:10px;">${s.googleMapsKey?'✓ Maps key is set — reload to activate':'No key set — using built-in SVG map'}</div>
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="btn secondary small" style="margin-bottom:12px;">Get API key from Google →</a><br>
          <button class="btn" id="save-maps">Save Maps Key</button>
        </div>

        <h2 class="section-head">Default Shipment Origin</h2>
        <div class="form-card" style="margin-bottom:24px;">
          <p style="font-family:var(--font-mono);font-size:0.78rem;color:var(--ink-soft);margin-bottom:12px;">All deliveries start from this location (your warehouse/store address).</p>
          <div class="field"><label>Origin address (for display)</label><input id="cfg-addr" value="${esc(s.defaultOrigin?.address||'')}" placeholder="1 Warehouse Blvd, Miami FL 33101"></div>
          <div class="grid-2">
            <div class="field"><label>Latitude</label><input id="cfg-lat" type="number" step="0.0001" value="${s.defaultOrigin?.lat||25.7617}"></div>
            <div class="field"><label>Longitude</label><input id="cfg-lng" type="number" step="0.0001" value="${s.defaultOrigin?.lng||-80.1918}"></div>
          </div>
          <button class="btn secondary" id="geo-origin" style="margin-bottom:12px;">📍 Geocode address → coordinates</button>
          <div id="geo-status" style="font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-soft);margin-bottom:10px;"></div>
          <button class="btn" id="save-origin">Save Origin</button>
        </div>

        <h2 class="section-head">SMTP Email Settings</h2>
        <div class="form-card" style="margin-bottom:24px;">
          <p style="font-family:var(--font-mono);font-size:0.78rem;color:var(--ink-soft);margin-bottom:12px;">
            Configure SMTP to send real verification emails to customers.
            ${s.smtpConfigured?'<span style="color:var(--ok-green);">✓ SMTP is currently configured.</span>':'<span style="color:var(--gold);">⚠ Not configured — codes shown in-app.</span>'}
          </p>
          <div class="grid-2">
            <div class="field"><label>SMTP Host</label><input id="cfg-shost" placeholder="smtp.gmail.com" value="${esc(s.smtpHost||'')}"></div>
            <div class="field"><label>SMTP Port</label><input id="cfg-sport" type="number" value="${s.smtpPort||587}" placeholder="587"></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>SMTP Username</label><input id="cfg-suser" placeholder="your@email.com" value="${esc(s.smtpUser||'')}" autocomplete="off"></div>
            <div class="field"><label>SMTP Password</label><input id="cfg-spass" type="password" placeholder="••••••••" autocomplete="new-password"></div>
          </div>
          <div class="field"><label>From address</label><input id="cfg-sfrom" placeholder="noreply@yourstore.com" value="${esc(s.smtpFrom||'')}"></div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <input type="checkbox" id="cfg-ssl" ${s.smtpSecure?'checked':''}>
            <label for="cfg-ssl" style="font-family:var(--font-mono);font-size:0.78rem;text-transform:uppercase;">Use TLS/SSL (port 465)</label>
          </div>
          <p style="font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-soft);margin-bottom:12px;">Gmail: host=smtp.gmail.com, port=587, use App Password (not regular password).</p>
          <button class="btn" id="save-smtp">Save SMTP Settings</button>
        </div>`;

      document.getElementById('save-maps').addEventListener('click',async()=>{try{await API.updateSettings({googleMapsKey:document.getElementById('cfg-maps').value.trim()});Store.toast('Maps key saved — reload to activate');}catch(e){Store.toast(e.message);}});
      document.getElementById('geo-origin').addEventListener('click',async()=>{
        const addr=document.getElementById('cfg-addr').value.trim(); const s2=document.getElementById('geo-status'); s2.textContent='Geocoding…';
        try{const r=await API.geocode(addr);if(r.valid){document.getElementById('cfg-lat').value=r.lat;document.getElementById('cfg-lng').value=r.lng;s2.textContent=`✓ ${r.displayName.slice(0,80)}`;}else{s2.textContent='⚠ '+r.error;}}catch{s2.textContent='Geocoding unavailable';}
      });
      document.getElementById('save-origin').addEventListener('click',async()=>{try{await API.updateSettings({defaultOrigin:{address:document.getElementById('cfg-addr').value.trim(),lat:Number(document.getElementById('cfg-lat').value),lng:Number(document.getElementById('cfg-lng').value)}});Store.toast('Origin saved');}catch(e){Store.toast(e.message);}});
      document.getElementById('save-smtp').addEventListener('click',async()=>{
        const data={smtpHost:document.getElementById('cfg-shost').value.trim(),smtpPort:Number(document.getElementById('cfg-sport').value),smtpUser:document.getElementById('cfg-suser').value.trim(),smtpFrom:document.getElementById('cfg-sfrom').value.trim(),smtpSecure:document.getElementById('cfg-ssl').checked};
        const pass=document.getElementById('cfg-spass').value;
        if (pass) data.smtpPass=pass;
        try{await API.updateSettings(data);Store.toast('SMTP settings saved');}catch(e){Store.toast(e.message);}
      });
    }catch(e){c.innerHTML=`<div class="error-text">${esc(e.message)}</div>`;}
  }



  // ── ADMIN PROFILE ──────────────────────────────────────────────────────────
  async function tabProfile(c) {
    c.innerHTML = `<div class="empty-state">Loading profile…</div>`;
    try {
      const { id, publicId, name, email, role, security, createdAt } = await API.getAdminProfile();
      c.innerHTML = `
        <h2 class="section-head">My Admin Profile</h2>

        <!-- Identity card -->
        <div class="label-card" style="margin-bottom:24px;">
          <div class="label-row"><span class="label-key">Public ID</span><span style="font-family:var(--font-mono);color:var(--utility-blue);font-weight:600;">${esc(publicId)}</span></div>
          <div class="label-row"><span class="label-key">Name</span><span>${esc(name)}</span></div>
          <div class="label-row"><span class="label-key">Email</span><span>${esc(email)}</span></div>
          <div class="label-row"><span class="label-key">Role</span><span class="status-badge delivered">Admin</span></div>
          <div class="label-row"><span class="label-key">Account since</span><span style="font-family:var(--font-mono);font-size:0.8rem;">${new Date(createdAt).toLocaleDateString()}</span></div>
        </div>

        <!-- Change name / email -->
        <div class="form-card" style="margin-bottom:24px;">
          <h3 style="font-family:var(--font-display);text-transform:uppercase;font-size:1rem;margin-bottom:16px;">Update Name & Email</h3>
          <div class="field"><label>Display name</label><input id="prof-name" value="${esc(name)}" placeholder="Your name"></div>
          <div class="field"><label>Email address</label><input id="prof-email" type="email" value="${esc(email)}" placeholder="you@email.com"></div>
          <div id="prof-name-err" class="error-text"></div>
          <button class="btn" id="save-identity">Save Name & Email</button>
        </div>

        <!-- Change password -->
        <div class="form-card" style="margin-bottom:24px;">
          <h3 style="font-family:var(--font-display);text-transform:uppercase;font-size:1rem;margin-bottom:16px;">Change Password</h3>
          <div class="field"><label>Current password</label><input id="prof-cur-pw" type="password" placeholder="Enter current password" autocomplete="current-password"></div>
          <div class="field"><label>New password</label><input id="prof-new-pw" type="password" placeholder="Min 8 chars, one uppercase, one number" autocomplete="new-password"></div>
          <div class="field"><label>Confirm new password</label><input id="prof-conf-pw" type="password" placeholder="Repeat new password" autocomplete="new-password"></div>
          <div id="prof-pw-err" class="error-text"></div>
          <div id="prof-pw-ok" class="success-text" style="display:none;"></div>
          <button class="btn" id="save-password">Change Password</button>
        </div>

        <!-- Extended security -->
        <div class="form-card" style="margin-bottom:24px;">
          <h3 style="font-family:var(--font-display);text-transform:uppercase;font-size:1rem;margin-bottom:16px;">Extended Security Settings</h3>

          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;padding:12px;background:var(--kraft);border-radius:var(--radius);">
            <input type="checkbox" id="sec-login-alerts" ${security?.loginAlerts!==false?'checked':''} style="margin-top:3px;">
            <div>
              <label for="sec-login-alerts" style="font-family:var(--font-mono);font-size:0.8rem;text-transform:uppercase;font-weight:600;cursor:pointer;">Login Alerts</label>
              <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-soft);margin-top:3px;">Get a notification every time someone logs into the admin account.</div>
            </div>
          </div>

          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;padding:12px;background:var(--kraft);border-radius:var(--radius);">
            <input type="checkbox" id="sec-require-verified" ${security?.requireVerifiedEmails?'checked':''} style="margin-top:3px;">
            <div>
              <label for="sec-require-verified" style="font-family:var(--font-mono);font-size:0.8rem;text-transform:uppercase;font-weight:600;cursor:pointer;">Require Verified Emails to Order</label>
              <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-soft);margin-top:3px;">Customers must verify their email before they can place orders.</div>
            </div>
          </div>

          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;padding:12px;background:var(--kraft);border-radius:var(--radius);">
            <input type="checkbox" id="sec-2fa" ${security?.twoFactorEnabled?'checked':''} style="margin-top:3px;">
            <div>
              <label for="sec-2fa" style="font-family:var(--font-mono);font-size:0.8rem;text-transform:uppercase;font-weight:600;cursor:pointer;">Two-Factor Authentication (2FA)</label>
              <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--ink-soft);margin-top:3px;">Require a verification code on each admin login (requires SMTP to be configured).</div>
            </div>
          </div>

          <div class="field">
            <label>Session timeout (minutes)</label>
            <input id="sec-timeout" type="number" min="5" max="1440" value="${security?.sessionTimeout||60}" style="max-width:120px;">
            <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--ink-soft);">How long before the admin session expires automatically.</span>
          </div>

          <div class="field">
            <label>Allowed IP addresses (optional)</label>
            <input id="sec-ips" placeholder="e.g. 192.168.1.1, 10.0.0.1" value="${esc(security?.allowedIPs||'')}">
            <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--ink-soft);">Comma-separated list. Leave blank to allow all IPs.</span>
          </div>

          <div id="sec-err" class="error-text"></div>
          <div id="sec-ok" class="success-text" style="display:none;"></div>
          <button class="btn" id="save-security">Save Security Settings</button>
        </div>`;

      // Save name/email
      document.getElementById('save-identity').addEventListener('click', async () => {
        const errEl = document.getElementById('prof-name-err'); errEl.textContent = '';
        try {
          const r = await API.updateAdminProfile({
            name:  document.getElementById('prof-name').value.trim(),
            email: document.getElementById('prof-email').value.trim()
          });
          if (r.token) { API.setToken(r.token); Store.setUser(r.user); Store.renderAuthNav(); }
          Store.toast('Name & email updated');
          errEl.textContent = '';
        } catch(e) { errEl.textContent = e.message; }
      });

      // Change password
      document.getElementById('save-password').addEventListener('click', async () => {
        const errEl = document.getElementById('prof-pw-err');
        const okEl  = document.getElementById('prof-pw-ok');
        errEl.textContent = ''; okEl.style.display = 'none';
        const cur  = document.getElementById('prof-cur-pw').value;
        const nw   = document.getElementById('prof-new-pw').value;
        const conf = document.getElementById('prof-conf-pw').value;
        if (!cur || !nw) { errEl.textContent = 'Please fill in all password fields.'; return; }
        if (nw !== conf) { errEl.textContent = 'New password and confirmation do not match.'; return; }
        try {
          await API.updateAdminProfile({ currentPassword: cur, newPassword: nw });
          okEl.textContent = '✓ Password changed successfully!'; okEl.style.display = 'block';
          document.getElementById('prof-cur-pw').value = '';
          document.getElementById('prof-new-pw').value = '';
          document.getElementById('prof-conf-pw').value = '';
        } catch(e) { errEl.textContent = e.message; }
      });

      // Save security
      document.getElementById('save-security').addEventListener('click', async () => {
        const errEl = document.getElementById('sec-err');
        const okEl  = document.getElementById('sec-ok');
        errEl.textContent = ''; okEl.style.display = 'none';
        try {
          await API.updateAdminProfile({ security: {
            loginAlerts:           document.getElementById('sec-login-alerts').checked,
            requireVerifiedEmails: document.getElementById('sec-require-verified').checked,
            twoFactorEnabled:      document.getElementById('sec-2fa').checked,
            sessionTimeout:        Number(document.getElementById('sec-timeout').value) || 60,
            allowedIPs:            document.getElementById('sec-ips').value.trim()
          }});
          okEl.textContent = '✓ Security settings saved!'; okEl.style.display = 'block';
        } catch(e) { errEl.textContent = e.message; }
      });

    } catch(e) { c.innerHTML = `<div class="error-text">${esc(e.message)}</div>`; }
  }

  // ── ACCOUNT MANAGEMENT (flag / suspend / terminate / delete) ───────────────
  async function tabAccountMgmt(c) {
    c.innerHTML = `<div class="empty-state">Loading accounts…</div>`;
    try {
      const { users } = await API.getAdminUsers();
      if (!users.length) { c.innerHTML = `<div class="empty-state">No customer accounts yet.</div>`; return; }

      c.innerHTML = `
        <h2 class="section-head">Account Management</h2>
        <p style="font-family:var(--font-mono);font-size:0.78rem;color:var(--ink-soft);margin-bottom:16px;">
          Flag, warn, suspend, terminate, or delete customer accounts that violate store policies.
          All actions are logged and notifications are sent to the customer.
        </p>
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;">
          <table class="data-table" style="margin:0;">
            <thead>
              <tr><th>Public ID</th><th>Name</th><th>Email</th><th>Status</th><th>Orders</th><th>Flags</th><th>Actions</th></tr>
            </thead>
            <tbody id="acct-tbody">
              ${users.map(u => `
                <tr data-id="${u.id}">
                  <td style="font-family:var(--font-mono);font-size:0.72rem;color:var(--utility-blue);">${esc(u.publicId||'—')}</td>
                  <td><strong>${esc(u.name)}</strong></td>
                  <td style="font-family:var(--font-mono);font-size:0.78rem;">${esc(u.email)}</td>
                  <td class="status-cell-${u.id}">
                    <span class="status-badge ${statusBadgeClass(u.accountStatus||'active')}">${esc(u.accountStatus||'active')}</span>
                  </td>
                  <td style="text-align:center;">${u.hasOrders?`⭐ ${u.orderCount}`:u.orderCount}</td>
                  <td style="font-family:var(--font-mono);font-size:0.75rem;" class="flag-cell-${u.id}">—</td>
                  <td>
                    <button class="btn small action-btn" data-id="${u.id}" data-name="${esc(u.name)}" data-action="warn" style="margin:2px;">⚠ Warn</button>
                    <button class="btn small action-btn" data-id="${u.id}" data-name="${esc(u.name)}" data-action="flag" style="margin:2px;">🚩 Flag</button>
                    <button class="btn small action-btn secondary" data-id="${u.id}" data-name="${esc(u.name)}" data-action="suspend" style="margin:2px;">🚫 Suspend</button>
                    <button class="btn small danger action-btn" data-id="${u.id}" data-name="${esc(u.name)}" data-action="terminate" style="margin:2px;">❌ Terminate</button>
                    <button class="btn small success action-btn" data-id="${u.id}" data-name="${esc(u.name)}" data-action="restore" style="margin:2px;">✅ Restore</button>
                    <button class="btn small danger action-btn" data-id="${u.id}" data-name="${esc(u.name)}" data-action="delete" style="margin:2px;">🗑 Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <!-- Action panel -->
        <div id="action-panel" style="margin-top:20px;"></div>`;

      // Load flag history for each user
      users.forEach(async u => {
        try {
          const r = await API.getUserStatus(u.id);
          const flagCell = c.querySelector(`.flag-cell-${u.id}`);
          if (flagCell) {
            const flags = r.flags || [];
            flagCell.textContent = flags.length ? `${flags.length} record(s)` : '—';
          }
          const statusCell = c.querySelector(`.status-cell-${u.id}`);
          if (statusCell) {
            statusCell.innerHTML = `<span class="status-badge ${statusBadgeClass(r.status)}">${esc(r.status)}</span>`;
          }
        } catch {}
      });

      // Wire action buttons
      c.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id     = btn.dataset.id;
          const name   = btn.dataset.name;
          const action = btn.dataset.action;
          showActionPanel(id, name, action);
        });
      });

      function showActionPanel(userId, userName, action) {
        const actionLabels = {
          warn:      { label:'Send Warning',    color:'var(--gold)',       icon:'⚠️' },
          flag:      { label:'Flag Account',    color:'var(--gold)',       icon:'🚩' },
          suspend:   { label:'Suspend Account', color:'var(--utility-blue)', icon:'🚫' },
          terminate: { label:'Terminate Account', color:'var(--stamp-red)', icon:'❌' },
          restore:   { label:'Restore Account', color:'var(--ok-green)',   icon:'✅' },
          delete:    { label:'Delete Account',  color:'var(--stamp-red)',  icon:'🗑️' }
        };
        const info = actionLabels[action] || { label:action, color:'var(--ink)', icon:'•' };

        const needsConfirm = ['terminate','delete','suspend'].includes(action);

        document.getElementById('action-panel').innerHTML = `
          <div class="form-card" style="border-left:4px solid ${info.color};">
            <h3 style="font-family:var(--font-display);text-transform:uppercase;font-size:1rem;margin-bottom:6px;color:${info.color};">
              ${info.icon} ${info.label}: ${esc(userName)}
            </h3>
            <div class="field">
              <label>Reason *</label>
              <input id="ap-reason" placeholder="${getReasonsPlaceholder(action)}" required>
            </div>
            <div class="field">
              <label>Internal note (optional, not shown to customer)</label>
              <textarea id="ap-note" placeholder="Admin notes for record keeping…" style="min-height:60px;"></textarea>
            </div>
            ${needsConfirm ? `
              <div style="background:#FFF0F0;border:1px solid var(--stamp-red);padding:12px;border-radius:var(--radius);margin-bottom:12px;font-family:var(--font-mono);font-size:0.78rem;">
                ⚠ This action will ${action === 'delete' ? 'permanently remove' : action} the account for <strong>${esc(userName)}</strong>. The customer will be notified.
              </div>` : ''}
            <div id="ap-err" class="error-text"></div>
            <div class="btn-group">
              <button class="btn ${needsConfirm?'danger':'success'}" id="ap-confirm">Confirm: ${info.label}</button>
              <button class="btn secondary" id="ap-cancel">Cancel</button>
            </div>
          </div>`;

        document.getElementById('ap-cancel').addEventListener('click', () => {
          document.getElementById('action-panel').innerHTML = '';
        });

        document.getElementById('ap-confirm').addEventListener('click', async () => {
          const reason = document.getElementById('ap-reason').value.trim();
          const note   = document.getElementById('ap-note').value.trim();
          const errEl  = document.getElementById('ap-err');
          errEl.textContent = '';
          if (!reason) { errEl.textContent = 'Please enter a reason.'; return; }
          try {
            const r = await API.userAction(userId, action, reason, note);
            Store.toast(r.message || `${action} applied`);
            document.getElementById('action-panel').innerHTML = '';
            // Refresh tab
            tabAccountMgmt(c);
          } catch(e) { errEl.textContent = e.message; }
        });
      }

    } catch(e) { c.innerHTML = `<div class="error-text">${esc(e.message)}</div>`; }
  }

  function statusBadgeClass(status) {
    const map = { active:'delivered', flagged:'processing', suspended:'processing', terminated:'', deleted:'' };
    return map[status] || '';
  }

  function getReasonsPlaceholder(action) {
    const map = {
      warn:      'e.g. Inappropriate messages, suspicious activity',
      flag:      'e.g. Possible fraud, payment dispute',
      suspend:   'e.g. Multiple policy violations, chargebacks',
      terminate: 'e.g. Confirmed fraud, abusive behaviour',
      restore:   'e.g. Appeal accepted, issue resolved',
      delete:    'e.g. Account requested removal, GDPR request'
    };
    return map[action] || 'Enter reason…';
  }

  return { render };
})();
