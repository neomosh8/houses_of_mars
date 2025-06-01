export async function preloadAssets(urls, onProgress = () => {}, onStatus = () => {}) {
  const cache = await caches.open('asset-cache');
  let totalFiles = urls.length;
  let loadedFiles = 0;
  let totalBytes = 0;
  let loadedBytes = 0;
  const sizes = {};
  let useByteProgress = false;

  onStatus('Checking cache and file sizes...');
  onProgress(0);

  // First, check cache and attempt to get sizes
  const sizePromises = urls.map(async (url) => {
    try {
      // Check if already cached
      const cached = await cache.match(url);
      if (cached) {
        return { url, size: 0, cached: true };
      }

      // Try to get size via HEAD request
      try {
        const res = await fetch(url, { method: 'HEAD' });
        const len = parseInt(res.headers.get('Content-Length'));
        if (!isNaN(len) && len > 0) {
          return { url, size: len, cached: false };
        }
      } catch (e) {
        // HEAD request failed, will use file counting
      }

      return { url, size: 0, cached: false };
    } catch (e) {
      return { url, size: 0, cached: false, error: e };
    }
  });

  const sizeResults = await Promise.all(sizePromises);

  // Calculate totals and determine progress mode
  for (const result of sizeResults) {
    sizes[result.url] = result.size;
    if (result.size > 0 && !result.cached) {
      totalBytes += result.size;
      useByteProgress = true;
    }
  }

  onStatus('Loading assets...');

  // Load files one by one for better progress tracking
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const display = url.split('/').pop() || 'file';
    const result = sizeResults[i];

    try {
      // Update status
      onStatus(`Loading ${display}... (${i + 1}/${totalFiles})`);

      // Check if already cached
      if (result.cached) {
        loadedFiles++;
        const progress = loadedFiles / totalFiles;
        onProgress(progress);
        continue;
      }

      // Fetch the file
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to load ${display}: ${response.status} ${response.statusText}`);
      }

      if (useByteProgress && sizes[url] > 0) {
        // Read with progress tracking
        const reader = response.body.getReader();
        const chunks = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          receivedBytes += value.length;
          loadedBytes += value.length;

          // Update progress based on bytes
          const fileProgress = receivedBytes / sizes[url];
          const overallProgress = loadedBytes / totalBytes;

          onStatus(`Loading ${display}... ${Math.round(fileProgress * 100)}%`);
          onProgress(Math.min(overallProgress, 1));
        }

        // Cache the complete file
        const blob = new Blob(chunks);
        const cachedResponse = new Response(blob, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        await cache.put(url, cachedResponse);
      } else {
        // No size info, just load and cache
        const blob = await response.blob();
        await cache.put(url, new Response(blob));

        loadedFiles++;
        const progress = loadedFiles / totalFiles;
        onProgress(progress);
      }
    } catch (error) {
      console.error(`Failed to load ${display}:`, error);
      onStatus(`Failed to load ${display} - continuing...`);

      // Still increment progress for failed files
      loadedFiles++;
      if (sizes[url] > 0) {
        loadedBytes += sizes[url];
      }

      const progress = useByteProgress
        ? (totalBytes > 0 ? loadedBytes / totalBytes : 1)
        : loadedFiles / totalFiles;
      onProgress(Math.min(progress, 1));

      // Small delay to show error message
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  onStatus('Loading complete!');
  onProgress(1);

  // Small delay to show completion
  await new Promise(resolve => setTimeout(resolve, 200));
}