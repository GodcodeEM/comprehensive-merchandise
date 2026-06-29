// maps.js — Google Maps integration with SVG fallback

const Maps = (() => {
  let gmapsLoaded = false;
  let gmapsKey = '';
  let pendingMaps = [];

  // Load Google Maps API with the stored key
  async function init() {
    try {
      const { key } = await API.getMapsKey();
      gmapsKey = key;
      if (key && key.length > 10) {
        await loadGoogleMaps(key);
      }
    } catch {}
  }

  function loadGoogleMaps(key) {
    return new Promise((resolve) => {
      if (window.google && window.google.maps) { gmapsLoaded = true; resolve(); return; }
      window._gmapsReady = () => { gmapsLoaded = true; resolve(); pendingMaps.forEach(fn => fn()); pendingMaps = []; };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=_gmapsReady`;
      script.async = true; script.defer = true;
      document.head.appendChild(script);
      // Timeout fallback
      setTimeout(() => { if (!gmapsLoaded) { gmapsLoaded = false; resolve(); } }, 5000);
    });
  }

  // Render a tracking map into a container div
  // If Google Maps is loaded, uses real map. Otherwise uses SVG fallback.
  function renderTrackingMap(containerId, { route, currentPosition, deliveryLocation, progress, vehicleIcon = '📦' }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (gmapsLoaded && window.google) {
      renderGoogleMap(container, { route, currentPosition, deliveryLocation, progress, vehicleIcon });
    } else {
      renderSVGMap(container, { route, currentPosition, deliveryLocation, progress, vehicleIcon });
    }
  }

  function renderGoogleMap(container, { route, currentPosition, deliveryLocation, progress, vehicleIcon }) {
    container.innerHTML = '<div id="gmap" style="width:100%;height:100%;"></div>';
    const center = { lat: currentPosition.lat, lng: currentPosition.lng };
    const map = new google.maps.Map(container.querySelector('#gmap'), {
      center, zoom: 9,
      mapTypeControl: false, streetViewControl: false,
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
    });

    // Draw route polyline
    const routePath = new google.maps.Polyline({
      path: route.map(p => ({ lat: p.lat, lng: p.lng })),
      geodesic: true, strokeColor: '#C8C0B4', strokeOpacity: 0.8, strokeWeight: 3
    });
    routePath.setMap(map);

    // Draw progress polyline
    const progressIdx = Math.floor(progress * (route.length - 1));
    const progressPath = new google.maps.Polyline({
      path: route.slice(0, progressIdx + 2).map(p => ({ lat: p.lat, lng: p.lng })),
      geodesic: true, strokeColor: '#C1432D', strokeOpacity: 1, strokeWeight: 4
    });
    progressPath.setMap(map);

    // Origin marker
    new google.maps.Marker({ position: route[0], map, label: { text: 'A', color: 'white' }, title: 'Origin', icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#3D5A6C', fillOpacity: 1, strokeColor: '#FAF7F0', strokeWeight: 2 } });

    // Destination marker
    const dest = deliveryLocation || route[route.length - 1];
    new google.maps.Marker({ position: dest, map, title: 'Destination', icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 24 16 24s16-12 16-24C32 7.2 24.8 0 16 0z" fill="#4F7A4A"/><circle cx="16" cy="16" r="6" fill="white"/></svg>')}`, scaledSize: new google.maps.Size(28, 36) } });

    // Moving package marker
    new google.maps.Marker({
      position: { lat: currentPosition.lat, lng: currentPosition.lng }, map, title: 'Package',
      icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#23262B" stroke="white" stroke-width="3"/><text x="20" y="26" text-anchor="middle" font-size="16">${vehicleIcon}</text></svg>`)}`, scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) }
    });

    // Fit bounds
    const bounds = new google.maps.LatLngBounds();
    route.forEach(p => bounds.extend(p));
    if (deliveryLocation) bounds.extend(deliveryLocation);
    map.fitBounds(bounds, 40);
  }

  function renderSVGMap(container, { route, currentPosition, deliveryLocation, progress, vehicleIcon }) {
    const W = container.clientWidth || 600, H = container.clientHeight || 360;
    const allPts = [...route, ...(deliveryLocation ? [deliveryLocation] : [])];
    const lats = allPts.map(p => p.lat), lngs = allPts.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const pad = 0.15;
    const latR = (maxLat - minLat) || 1, lngR = (maxLng - minLng) || 1;
    const pLat = latR * pad, pLng = lngR * pad;

    function project(lat, lng) {
      return {
        x: Math.round(((lng - minLng + pLng) / (lngR + 2*pLng)) * W),
        y: Math.round(H - ((lat - minLat + pLat) / (latR + 2*pLat)) * H)
      };
    }

    const pts = route.map(p => project(p.lat, p.lng));
    const pathD = pts.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
    const filled = Math.max(2, Math.floor(progress * (pts.length - 1)) + 2);
    const filledD = pts.slice(0, filled).map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
    const dotPt = project(currentPosition.lat, currentPosition.lng);
    const destPt = deliveryLocation ? project(deliveryLocation.lat, deliveryLocation.lng) : pts[pts.length-1];
    const origPt = pts[0];

    container.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="#EBE5D8"/>
        <defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0L0 0 0 50" fill="none" stroke="#DDD5C5" stroke-width="0.6"/></pattern></defs>
        <rect width="${W}" height="${H}" fill="url(#grid)"/>
        <path d="${pathD}" fill="none" stroke="#C0B8A8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        ${filledD.length>1?`<path d="${filledD}" fill="none" stroke="#C1432D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`:''}
        ${pts.slice(1,-1).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#AAA" opacity="0.6"/>`).join('')}
        <circle cx="${origPt.x}" cy="${origPt.y}" r="11" fill="#3D5A6C" stroke="#FAF7F0" stroke-width="2.5"/>
        <text x="${origPt.x}" y="${origPt.y+4}" text-anchor="middle" font-size="10" fill="white" font-family="monospace" font-weight="bold">A</text>
        <polygon points="${destPt.x},${destPt.y-22} ${destPt.x-10},${destPt.y-4} ${destPt.x+10},${destPt.y-4}" fill="${deliveryLocation?'#4F7A4A':'#C1432D'}" stroke="#FAF7F0" stroke-width="1.5"/>
        <circle cx="${destPt.x}" cy="${destPt.y-2}" r="5" fill="${deliveryLocation?'#4F7A4A':'#C1432D'}"/>
        ${deliveryLocation?`<text x="${destPt.x+13}" y="${destPt.y-10}" font-size="11" fill="#4F7A4A" font-family="monospace" font-weight="bold">YOU</text>`:''}
        <circle cx="${dotPt.x}" cy="${dotPt.y}" r="16" fill="#23262B" stroke="#FAF7F0" stroke-width="3" opacity="0.95"/>
        <text x="${dotPt.x}" y="${dotPt.y+5}" text-anchor="middle" font-size="13">${vehicleIcon}</text>
        <rect x="8" y="${H-58}" width="185" height="52" fill="rgba(250,247,240,0.9)" rx="3"/>
        <circle cx="22" cy="${H-44}" r="7" fill="#23262B"/>
        <text x="34" y="${H-40}" font-size="10" fill="#23262B" font-family="monospace">Package</text>
        <circle cx="22" cy="${H-26}" r="7" fill="#3D5A6C"/>
        <text x="34" y="${H-22}" font-size="10" fill="#3D5A6C" font-family="monospace">Origin</text>
        <polygon points="178,${H-50} 168,${H-34} 188,${H-34}" fill="${deliveryLocation?'#4F7A4A':'#C1432D'}"/>
        <text x="155" y="${H-22}" font-size="10" fill="${deliveryLocation?'#4F7A4A':'#C1432D'}" font-family="monospace">${deliveryLocation?'You':'Dest'}</text>
        <text x="${W-8}" y="${H-8}" text-anchor="end" font-size="9" fill="#999" font-family="monospace">Map data: OpenStreetMap</text>
      </svg>`;
  }

  return { init, renderTrackingMap, isGoogleLoaded: () => gmapsLoaded };
})();
