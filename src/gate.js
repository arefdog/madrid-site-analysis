// Client-side access gate (obfuscation, not real security — this is a static
// site; the data is reachable by a determined viewer). Mirrors the byld
// collaborator portal: compares SHA-256 of the entered password to a stored
// hash. Unlock persists for the browser session.
//
// Same password as the portal, so collaborators use one credential. When the
// map is embedded in the portal iframe it auto-passes (the portal already
// gated access) — only the direct map.gobyld.com link prompts.

const PASSWORD_HASH = '9981790be1bc452fcf8e68c5f855498a0b14f3ef3bd933b48be188626e0c4751';
const KEY = 'byld-map-' + PASSWORD_HASH.slice(0, 8);

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function overlay() {
  const el = document.createElement('div');
  el.className = 'gate';
  el.innerHTML = `
    <form class="gate-box" autocomplete="off" novalidate>
      <div class="gate-brand">BYLD</div>
      <h1>Madrid Site Analysis</h1>
      <p>This tool is for BYLD collaborators. Enter the access password to continue.</p>
      <input type="password" name="password" placeholder="Access password" required autocomplete="off" autofocus>
      <button type="submit">Unlock</button>
      <p class="gate-error" hidden>That password isn’t right.</p>
    </form>`;
  return el;
}

// Resolves once access is granted (immediately if embedded or already unlocked).
export function requireAccess() {
  return new Promise((resolve) => {
    const embedded = window.self !== window.top; // shown inside the gated portal
    let unlocked = false;
    try { unlocked = sessionStorage.getItem(KEY) === '1'; } catch { /* ignore */ }
    if (embedded || unlocked) return resolve();

    const el = overlay();
    document.body.appendChild(el);
    const form = el.querySelector('form');
    const err = el.querySelector('.gate-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (await sha256(form.password.value) === PASSWORD_HASH) {
        try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
        el.remove();
        resolve();
      } else {
        err.hidden = false;
        form.password.value = '';
        form.password.focus();
      }
    });
  });
}
