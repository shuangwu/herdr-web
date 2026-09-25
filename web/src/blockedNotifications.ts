const BLOCKED_CLAIM_PREFIX = "herdrWeb.blockedAlert.v1.";

export function blockedClaimStorageKey(paneKey: string) {
  return `${BLOCKED_CLAIM_PREFIX}${paneKey}`;
}

export function claimBlockedAlert(storage: Pick<Storage, "getItem" | "setItem">, paneKey: string) {
  const key = blockedClaimStorageKey(paneKey);
  if (storage.getItem(key) !== null) return false;
  storage.setItem(key, String(Date.now()));
  return true;
}

export async function claimBlockedAlertAcrossTabs(paneKey: string) {
  const claim = () => claimBlockedAlert(window.localStorage, paneKey);
  try {
    if (navigator.locks) {
      return await navigator.locks.request(blockedClaimStorageKey(paneKey), claim);
    }
    return claim();
  } catch {
    return false;
  }
}

export function clearBlockedAlertClaim(paneKey: string) {
  try {
    window.localStorage.removeItem(blockedClaimStorageKey(paneKey));
  } catch {
    // Storage may be unavailable in a private browser context.
  }
}

let audioContext: AudioContext | null = null;

export function armBlockedAlertSound() {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
  } catch {
    // Audio is optional; browsers may restrict it until a user gesture.
  }
}

export function playBlockedAlertSound() {
  const context = audioContext;
  if (!context || context.state !== "running") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.36);
}
