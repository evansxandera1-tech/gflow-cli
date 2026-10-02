const $ = (id) => document.getElementById(id);
const els = {
  animal: $('animal'), prompts: $('prompts'), style: $('style'), sameSeed: $('sameSeed'),
  reference: $('reference'), referencePreview: $('referencePreview'), clearReference: $('clearReference'),
  generate: $('generate'), example: $('example'), clear: $('clear'), status: $('status'), gallery: $('gallery'),
  empty: $('empty'), counter: $('counter'), template: $('cardTemplate'), progressWrap: $('progressWrap'),
  progressText: $('progressText'), progressBar: $('progressBar'), cancel: $('cancel'), downloadApproved: $('downloadApproved')
};

let cancelled = false;
let running = false;
let items = [];
let referenceBlob = null;

function splitPrompts(text) {
  return text
    .split(/\n\s*\n|\n(?=\s*(?:Escena|Scene)\s*\d+\s*[:.-])/i)
    .map(s => s.replace(/^\s*(?:Escena|Scene)\s*\d+\s*[:.-]?\s*/i, '').trim())
    .filter(Boolean);
}

function setStatus(text, kind='') {
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
}

function updateCounter() {
  const approved = items.filter(x => x.approved).length;
  els.counter.textContent = `${items.length} imagen${items.length === 1 ? '' : 'es'} · ${approved} aprobada${approved === 1 ? '' : 's'}`;
  els.downloadApproved.disabled = approved === 0;
}

async function health() {
  try {
    const r = await fetch('/api/health', {cache:'no-store'});
    const d = await r.json();
    if (!d.ok) throw new Error();
    setStatus('Cloud listo · 9:16', 'ok');
  } catch {
    setStatus('Sin conexión al motor', 'bad');
  }
}

function filenameFor(item) {
  const animal = (els.animal.value || 'mervox').trim().toLowerCase().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'') || 'mervox';
  return `${animal}_escena_${String(item.index + 1).padStart(2,'0')}_seed_${item.seed || 'x'}.jpg`;
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function makeCard(item) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  item.el = node;
  node.querySelector('.sceneBadge').textContent = `Escena ${item.index + 1}`;
  node.querySelector('.promptText').textContent = item.prompt;
  node.querySelector('.meta').textContent = 'En cola';

  const approve = node.querySelector('.approveBtn');
  const retry = node.querySelector('.retryBtn');
  const download = node.querySelector('.downloadBtn');

  approve.addEventListener('click', () => {
    item.approved = !item.approved;
    approve.textContent = item.approved ? 'Aprobada' : 'Aprobar';
    approve.classList.toggle('approved', item.approved);
    node.querySelector('.approvedBadge').hidden = !item.approved;
    updateCounter();
  });

  retry.addEventListener('click', async () => {
    if (running) return;
    item.approved = false;
    node.querySelector('.approvedBadge').hidden = true;
    approve.classList.remove('approved');
    approve.textContent = 'Aprobar';
    await generateOne(item, null);
    updateCounter();
  });

  download.addEventListener('click', () => {
    if (item.image) downloadDataUrl(item.image, filenameFor(item));
  });

  els.gallery.appendChild(node);
}

async function fileToReferenceBlob(file) {
  const bitmap = await createImageBitmap(file);
  const max = 480;
  const scale = Math.min(max / bitmap.width, max / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', {alpha:false});
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
  ctx.drawImage(bitmap,0,0,w,h);
  bitmap.close();
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
}

els.reference.addEventListener('change', async () => {
  const file = els.reference.files?.[0];
  if (!file) return;
  try {
    referenceBlob = await fileToReferenceBlob(file);
    els.referencePreview.src = URL.createObjectURL(referenceBlob);
    els.referencePreview.hidden = false;
    els.clearReference.hidden = false;
  } catch (e) {
    alert('No pude preparar esa imagen de referencia.');
  }
});

els.clearReference.addEventListener('click', () => {
  referenceBlob = null;
  els.reference.value = '';
  els.referencePreview.hidden = true;
  els.referencePreview.removeAttribute('src');
  els.clearReference.hidden = true;
});

async function generateOne(item, forcedSeed) {
  const card = item.el;
  const loader = card.querySelector('.loader');
  const img = card.querySelector('.resultImage');
  const meta = card.querySelector('.meta');
  const error = card.querySelector('.error');
  const approve = card.querySelector('.approveBtn');
  const retry = card.querySelector('.retryBtn');
  const download = card.querySelector('.downloadBtn');

  loader.hidden = false; loader.textContent = 'Generando...';
  img.hidden = true;
  error.hidden = true;
  approve.disabled = retry.disabled = download.disabled = true;
  meta.textContent = 'Generando en Cloudflare...';

  const form = new FormData();
  form.append('prompt', item.prompt);
  form.append('useStyle', els.style.checked ? 'true' : 'false');
  if (forcedSeed !== null && forcedSeed !== undefined) form.append('seed', String(forcedSeed));
  if (referenceBlob) form.append('reference', referenceBlob, 'mervox-reference.jpg');

  try {
    const r = await fetch('/api/generate', {method:'POST', body:form});
    const data = await r.json().catch(() => ({ok:false,error:`HTTP ${r.status}`}));
    if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
    item.image = data.image;
    item.seed = data.seed;
    img.src = data.image;
    img.hidden = false;
    loader.hidden = true;
    meta.textContent = `${data.width}×${data.height} · seed ${data.seed}`;
    approve.disabled = retry.disabled = download.disabled = false;
  } catch (e) {
    item.image = null;
    loader.textContent = 'Falló la generación';
    meta.textContent = 'Error';
    error.textContent = e.message || String(e);
    error.hidden = false;
    retry.disabled = false;
  }
}

async function runBatch() {
  if (running) return;
  const prompts = splitPrompts(els.prompts.value);
  if (!prompts.length) {
    alert('Escribe al menos un prompt. Separa las escenas con una línea en blanco.');
    return;
  }

  running = true; cancelled = false;
  els.generate.disabled = true;
  els.progressWrap.hidden = false;
  els.progressBar.style.width = '0%';
  els.gallery.innerHTML = '';
  els.empty.hidden = true;
  items = prompts.map((prompt,index) => ({prompt,index,image:null,seed:null,approved:false,el:null}));
  items.forEach(makeCard);
  updateCounter();

  const batchSeed = els.sameSeed.checked ? Math.floor(Math.random()*2_000_000_000) : null;

  for (let i=0;i<items.length;i++) {
    if (cancelled) break;
    els.progressText.textContent = `Generando ${i+1} de ${items.length}`;
    await generateOne(items[i], batchSeed);
    els.progressBar.style.width = `${Math.round(((i+1)/items.length)*100)}%`;
  }

  els.progressText.textContent = cancelled ? 'Lote cancelado' : 'Lote terminado';
  running = false;
  els.generate.disabled = false;
  updateCounter();
}

els.generate.addEventListener('click', runBatch);
els.cancel.addEventListener('click', () => { cancelled = true; });

els.downloadApproved.addEventListener('click', async () => {
  const approved = items.filter(x => x.approved && x.image);
  for (const item of approved) {
    downloadDataUrl(item.image, filenameFor(item));
    await new Promise(r => setTimeout(r, 180));
  }
});

els.clear.addEventListener('click', () => {
  if (running) return;
  els.animal.value=''; els.prompts.value='';
  els.gallery.innerHTML=''; els.empty.hidden=false; items=[]; updateCounter();
});

els.example.addEventListener('click', () => {
  els.animal.value = 'llama';
  els.prompts.value = `A friendly stylized 3D llama standing in profile, full body, warm earthy fur, large expressive eyes, centered clean educational character pose.\n\nThe same llama shown in a clean educational anatomical cutaway. Show a camelid digestive system with THREE DISTINCT stomach compartments: C1 as the largest fermentation compartment, C2 smaller and adjacent, C3 elongated and tubular. Avoid cow four-chamber anatomy, horse anatomy, and human anatomy.\n\nThe same llama calmly chewing cud in profile, subtle educational cutaway showing food returning toward the mouth, clear but family-friendly internal anatomy, no gore.`;
});

window.addEventListener('load', () => {
  health();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
});
