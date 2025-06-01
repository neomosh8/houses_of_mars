export async function preloadAssets(urls, onProgress = () => {}) {
  const cache = await caches.open('asset-cache');
  let total = 0;
  const sizes = {};

  // First, try to get sizes using HEAD requests
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const len = parseInt(res.headers.get('Content-Length'));
      if (!isNaN(len)) {
        sizes[url] = len;
        total += len;
      }
    } catch (e) {
      sizes[url] = 0;
    }
  }

  // Fallback: if total is 0, just approximate by 1 per file
  if (!total) {
    total = urls.length;
    for (const url of urls) sizes[url] = 1;
  }

  let loaded = 0;
  for (const url of urls) {
    const match = await cache.match(url);
    if (match) {
      loaded += sizes[url] || 0;
      onProgress(Math.min(loaded / total, 1));
      continue;
    }

    const response = await fetch(url);
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      loaded += value.length;
      onProgress(Math.min(loaded / total, 1));
      chunks.push(value);
    }

    const blob = new Blob(chunks);
    const resp = new Response(blob, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    await cache.put(url, resp);
  }
}
