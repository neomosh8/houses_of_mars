export async function preloadAssets(urls, onProgress = () => {}, onStatus = () => {}) {
  const cache = await caches.open('asset-cache');
  let total = 0;
  const sizes = {};

  onStatus('Fetching files list...');

  // Attempt to obtain file sizes using HEAD requests
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

  // If we couldn't determine any sizes, fall back to counting files
  if (!total) {
    total = urls.length;
    for (const url of urls) sizes[url] = 1;
  }

  let loaded = 0;
  for (const url of urls) {
    const display = url.split('/').pop();
    onStatus(`Downloading ${display}...`);

    const match = await cache.match(url);
    if (match) {
      loaded += sizes[url] || 1;
      onProgress(Math.min(loaded / total, 1));
      continue;
    }

    const response = await fetch(url);

    if (sizes[url]) {
      const reader = response.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
    } else {
      const blob = await response.blob();
      await cache.put(url, new Response(blob));
      loaded += 1; // approximate
      onProgress(Math.min(loaded / total, 1));
    }
  }

  onStatus('Loading complete');
}
