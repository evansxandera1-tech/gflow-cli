const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const WIDTH = 576;
const HEIGHT = 1024;

const STYLE_LOCK = [
  'Premium stylized 3D educational animal animation.',
  'Semi-realistic animal with clean cinematic anatomy visualization.',
  'Species-appropriate anatomy and proportions.',
  'Consistent organ materials and colors across the whole series.',
  'Polished clean anatomical cutaways, family-friendly, non-gory.',
  'Soft studio lighting.',
  'Solid teal background #2A9D8F.',
  'Vertical 9:16 mobile-first composition.',
  'Keep the lower third visually clean for subtitles.',
  'IMAGE ONLY. NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS, NO LABELS, NO CAPTIONS, NO TITLES, NO LOGOS, NO WATERMARKS, NO ARROWS, NO CALLOUT LINES, NO INFOGRAPHIC BOXES, NO UI ELEMENTS.'
].join(' ');

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function cleanText(value, max = 6000) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] & 0x7fffffff;
}

function safeErrorMessage(error) {
  const raw = String(error?.message || error || 'Error desconocido');
  if (/3040|capacity|out of capacity/i.test(raw)) {
    return 'El modelo esta temporalmente sin capacidad. Reintenta en unos segundos.';
  }
  if (/429|rate/i.test(raw)) {
    return 'Se alcanzo un limite temporal de solicitudes. Espera un momento y reintenta.';
  }
  if (/403|paid|billing/i.test(raw)) {
    return 'Cloudflare rechazo el modelo para esta cuenta. Revisa Workers AI en tu panel.';
  }
  return raw.slice(0, 500);
}

async function generateImage(request, env) {
  if (!env.AI) return json({ ok: false, error: 'Falta el binding AI de Cloudflare.' }, 500);

  let formIn;
  try {
    formIn = await request.formData();
  } catch {
    return json({ ok: false, error: 'Solicitud invalida.' }, 400);
  }

  const prompt = cleanText(formIn.get('prompt'));
  const useStyle = String(formIn.get('useStyle') ?? 'true') !== 'false';
  const seedRaw = Number(formIn.get('seed'));
  const seed = Number.isFinite(seedRaw) && seedRaw >= 0 ? Math.floor(seedRaw) : randomSeed();
  const reference = formIn.get('reference');

  if (!prompt) return json({ ok: false, error: 'Escribe un prompt.' }, 400);

  const finalPrompt = useStyle ? `${prompt}\n\nMervox visual style: ${STYLE_LOCK}` : prompt;

  const aiForm = new FormData();
  aiForm.append('prompt', finalPrompt);
  aiForm.append('width', String(WIDTH));
  aiForm.append('height', String(HEIGHT));
  aiForm.append('seed', String(seed));
  aiForm.append('guidance', '3.5');

  if (reference instanceof File && reference.size > 0) {
    if (reference.size > 3_000_000) {
      return json({ ok: false, error: 'La referencia es demasiado grande. Usa una imagen menor de 3 MB.' }, 413);
    }
    aiForm.append('input_image_0', reference, reference.name || 'reference.jpg');
  }

  try {
    const packed = new Response(aiForm);
    const result = await env.AI.run(MODEL, {
      multipart: {
        body: packed.body,
        contentType: packed.headers.get('content-type'),
      },
    });

    if (!result?.image) throw new Error('El modelo no devolvio una imagen.');

    return json({
      ok: true,
      model: MODEL,
      seed,
      width: WIDTH,
      height: HEIGHT,
      image: `data:image/jpeg;base64,${result.image}`,
    });
  } catch (error) {
    return json({ ok: false, error: safeErrorMessage(error) }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ ok: true, name: 'Mervox Cloud Free', model: MODEL, size: `${WIDTH}x${HEIGHT}` });
    }

    if (url.pathname === '/api/generate') {
      if (request.method !== 'POST') return json({ ok: false, error: 'Metodo no permitido.' }, 405);
      return generateImage(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
