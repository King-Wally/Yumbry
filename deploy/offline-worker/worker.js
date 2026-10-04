import template from './offline.html';

const STRINGS = {
  en: {
    title: 'Yumbry is temporarily offline',
    heading: 'Temporarily offline',
    body: 'Yumbry is currently unavailable. Please try again in a few minutes.',
    hint: 'Your recipes are safe. Reload this page to try again.',
  },
  nl: {
    title: 'Yumbry is tijdelijk offline',
    heading: 'Tijdelijk offline',
    body: 'Yumbry is momenteel niet beschikbaar. Probeer het over een paar minuten opnieuw.',
    hint: 'Je recepten zijn veilig. Herlaad deze pagina om opnieuw te proberen.',
  },
  fr: {
    title: 'Yumbry est temporairement hors ligne',
    heading: 'Temporairement hors ligne',
    body: 'Yumbry est actuellement indisponible. Veuillez réessayer dans quelques minutes.',
    hint: 'Vos recettes sont en sécurité. Rechargez cette page pour réessayer.',
  },
  es: {
    title: 'Yumbry está temporalmente fuera de línea',
    heading: 'Temporalmente fuera de línea',
    body: 'Yumbry no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
    hint: 'Tus recetas están a salvo. Recarga esta página para volver a intentarlo.',
  },
};

// 502/504 and Cloudflare's 52x/530 (tunnel down, origin unreachable). 503 is
// deliberately excluded: the app itself returns 503 for AI errors. So is 524: the
// origin answered too slowly (a long AI call), which means it is up.
const isDownStatus = (status) =>
  status === 502 || status === 504 || (status >= 520 && status <= 530 && status !== 524);

function pickLocale(header) {
  for (const part of (header ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().slice(0, 2);
    if (tag in STRINGS) return tag;
  }
  return 'en';
}

function offlineResponse(request) {
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': '300' };
  const wantsHtml = (request.headers.get('Accept') ?? '').includes('text/html');
  if (!wantsHtml) {
    return new Response('Service temporarily unavailable', {
      status: 503,
      headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const lang = pickLocale(request.headers.get('Accept-Language'));
  const values = { lang, ...STRINGS[lang] };
  const html = template.replace(/{{(\w+)}}/g, (_, key) => values[key] ?? '');
  return new Response(html, {
    status: 503,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request) {
    try {
      const response = await fetch(request);
      return isDownStatus(response.status) ? offlineResponse(request) : response;
    } catch {
      return offlineResponse(request);
    }
  },
};
