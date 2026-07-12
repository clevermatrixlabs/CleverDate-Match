/**
 * Lightweight device fingerprinting — no third-party libraries.
 * Generates a stable, anonymised ID from publicly available browser signals.
 * Stored in localStorage so it persists across sessions on the same device.
 */

const STORAGE_KEY = 'cdm_dfp';

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('CleverMatch🔒', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('CleverMatch🔒', 4, 17);
    return canvas.toDataURL().slice(-60);
  } catch {
    return 'canvas-err';
  }
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

function buildFingerprint(): string {
  const signals = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    String(navigator.hardwareConcurrency ?? 0),
    String(navigator.maxTouchPoints ?? 0),
    canvasFingerprint(),
  ];
  return djb2Hash(signals.join('||'));
}

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length >= 8) return stored;
    const id = buildFingerprint();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return buildFingerprint();
  }
}
