// tracking.js v3 — real vehicle speeds, address validation, manual origin, auto ETA

const crypto = require('crypto');

// Vehicle types with realistic speeds (km/h) and characteristics
const VEHICLE_TYPES = {
  van:   { label: 'Delivery Van',  speedKmh: 60,  icon: '🚐', description: 'Local delivery, city roads' },
  truck: { label: 'Freight Truck', speedKmh: 80,  icon: '🚛', description: 'Highway freight' },
  car:   { label: 'Courier Car',   speedKmh: 90,  icon: '🚗', description: 'Fast local courier' },
  bus:   { label: 'Bus Freight',   speedKmh: 55,  icon: '🚌', description: 'Scheduled bus route' },
  ship:  { label: 'Cargo Ship',    speedKmh: 30,  icon: '🚢', description: 'Ocean freight (slow)' },
  plane: { label: 'Air Freight',   speedKmh: 800, icon: '✈️', description: 'Express air delivery' },
};

const STATUS_STEPS = ['Processing', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'];

const activeTimers = new Map();

function generateTrackingNumber() {
  return 'CM-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// Calculate distance between two lat/lng points in km (Haversine formula)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) { return deg * Math.PI / 180; }

// Generate intermediate waypoints between origin and destination
function generateWaypoints(originLat, originLng, destLat, destLng, count = 4) {
  const points = [{ lat: originLat, lng: originLng }];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const jitterLat = (Math.random() - 0.5) * 0.3;
    const jitterLng = (Math.random() - 0.5) * 0.3;
    points.push({
      lat: round(originLat + (destLat - originLat) * t + jitterLat),
      lng: round(originLng + (destLng - originLng) * t + jitterLng)
    });
  }
  points.push({ lat: round(destLat), lng: round(destLng) });
  return points;
}

function round(n) { return Math.round(n * 10000) / 10000; }

// Interpolate position along route at progress 0..1
function positionAtProgress(route, progress) {
  if (progress <= 0) return { ...route[0] };
  if (progress >= 1) return { ...route[route.length - 1] };
  const segCount = route.length - 1;
  const segLen = 1 / segCount;
  const segIdx = Math.min(Math.floor(progress / segLen), segCount - 1);
  const segProg = (progress - segIdx * segLen) / segLen;
  const a = route[segIdx], b = route[segIdx + 1];
  return { lat: round(a.lat + (b.lat - a.lat) * segProg), lng: round(a.lng + (b.lng - a.lng) * segProg) };
}

function initTracking(order, originLat, originLng, destLat, destLng, vehicleType = 'van') {
  const vehicle = VEHICLE_TYPES[vehicleType] || VEHICLE_TYPES.van;
  const totalDistKm = distanceKm(originLat, originLng, destLat, destLng);
  const totalHours = totalDistKm / vehicle.speedKmh;
  const totalMinutes = Math.round(totalHours * 60);

  // Simulate updates every 30 seconds real time, moving proportionally
  const UPDATE_INTERVAL_SEC = 30;
  // Each tick advances progress by (30s / totalSeconds)
  const totalSeconds = totalHours * 3600;
  const stepFraction = Math.min(0.05, UPDATE_INTERVAL_SEC / Math.max(totalSeconds, 60));

  const route = generateWaypoints(originLat, originLng, destLat, destLng, 4);

  order.tracking = {
    number: generateTrackingNumber(),
    route,
    progress: 0,
    status: STATUS_STEPS[0],
    statusIndex: 0,
    state: 'idle',
    currentPosition: { lat: originLat, lng: originLng },
    vehicleType,
    vehicle: { label: vehicle.label, icon: vehicle.icon, speedKmh: vehicle.speedKmh },
    distanceKm: Math.round(totalDistKm * 10) / 10,
    estimatedMinutes: totalMinutes,
    estimatedArrival: new Date(Date.now() + totalMinutes * 60000).toISOString(),
    intervalSeconds: UPDATE_INTERVAL_SEC,
    stepFraction,
    history: [{ status: STATUS_STEPS[0], at: new Date().toISOString() }],
    origin: { lat: originLat, lng: originLng },
    destination: { lat: destLat, lng: destLng }
  };
  return order;
}

function tick(order) {
  const tr = order.tracking;
  if (!tr || tr.state !== 'running') return false;
  tr.progress = Math.min(1, tr.progress + tr.stepFraction);
  tr.currentPosition = positionAtProgress(tr.route, tr.progress);
  const newIdx = Math.min(STATUS_STEPS.length - 1, Math.floor(tr.progress * (STATUS_STEPS.length - 1) + 0.0001));
  let changed = false;
  if (newIdx > tr.statusIndex) {
    tr.statusIndex = newIdx;
    tr.status = STATUS_STEPS[newIdx];
    tr.history.push({ status: tr.status, at: new Date().toISOString() });
    changed = true;
  }
  // Recalculate ETA
  const remaining = (1 - tr.progress) * tr.estimatedMinutes;
  tr.etaMinutesRemaining = Math.max(0, Math.round(remaining));
  if (tr.progress >= 1) { tr.state = 'completed'; stopTimer(order.id); }
  return changed;
}

function startTimer(order, onTick) {
  stopTimer(order.id);
  order.tracking.state = 'running';
  const handle = setInterval(() => {
    const changed = tick(order);
    if (onTick) onTick(order, changed);
    if (order.tracking.state !== 'running') stopTimer(order.id);
  }, order.tracking.intervalSeconds * 1000);
  activeTimers.set(order.id, handle);
}

function pauseTimer(order) {
  if (order.tracking.state === 'completed') return;
  order.tracking.state = 'paused';
  stopTimer(order.id);
}

function resumeTimer(order, onTick) {
  if (order.tracking.state === 'completed') return;
  startTimer(order, onTick);
}

function resetTracking(order, originLat, originLng, destLat, destLng, vehicleType) {
  stopTimer(order.id);
  const oLat = originLat || order.tracking?.origin?.lat || 25.7617;
  const oLng = originLng || order.tracking?.origin?.lng || -80.1918;
  const dLat = destLat || order.tracking?.destination?.lat || 25.8;
  const dLng = destLng || order.tracking?.destination?.lng || -80.2;
  const vType = vehicleType || order.tracking?.vehicleType || 'van';
  return initTracking(order, oLat, oLng, dLat, dLng, vType);
}

function stopTimer(orderId) {
  const h = activeTimers.get(orderId);
  if (h) { clearInterval(h); activeTimers.delete(orderId); }
}

module.exports = { VEHICLE_TYPES, STATUS_STEPS, initTracking, startTimer, pauseTimer, resumeTimer, resetTracking, stopTimer, distanceKm, positionAtProgress };
