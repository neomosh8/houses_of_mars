export async function preloadAssets(urls, onProgress = () => {}, onStatus = () => {}) {
  let cache = null;
  let useCache = true;

  try {
    cache = await caches.open('asset-cache');
  } catch (e) {
    console.warn('Cache API not available, falling back to direct loading:', e);
    useCache = false;
  }

  const totalFiles = urls.length;
  let loadedFiles = 0;
  const failedFiles = [];
  const successFiles = [];

  console.log(`Starting preload of ${totalFiles} assets...`);
  onStatus('Starting asset preload...');
  onProgress(0);

  const detailsEl = document.getElementById('loading-details');
  const updateDetails = (filename, loaded, total) => {
    if (detailsEl) {
      const loadedMB = (loaded / 1024 / 1024).toFixed(2);
      const totalMB = (total / 1024 / 1024).toFixed(2);
      detailsEl.textContent = `${filename}: ${loadedMB} MB / ${totalMB} MB`;
    }
  };

  const absoluteUrls = urls.map(url => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return new URL(url, window.location.href).href;
  });

  for (let i = 0; i < absoluteUrls.length; i++) {
    const url = absoluteUrls[i];
    const originalUrl = urls[i];
    const display = originalUrl.split('/').pop() || 'file';

    try {
      onStatus(`Loading ${display}... (${i + 1}/${totalFiles})`);
      console.log(`Attempting to load: ${display} from ${url}`);

      if (useCache) {
        try {
          const cached = await cache.match(url);
          if (cached) {
            console.log(`✓ Using cached: ${display}`);
            const blob = await cached.blob();
            updateDetails(display, blob.size, blob.size);
            successFiles.push(originalUrl);
            loadedFiles++;
            onProgress(loadedFiles / totalFiles);
            continue;
          }
        } catch (e) {
          console.warn('Cache check failed for:', display, e);
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const blob = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'blob';

          xhr.onprogress = (event) => {
            if (event.lengthComputable) {
              updateDetails(display, event.loaded, event.total);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(xhr.response);
            } else {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error'));
          xhr.ontimeout = () => reject(new Error('Timeout'));
          xhr.timeout = 30000;

          xhr.send();
        });

        clearTimeout(timeoutId);
        console.log(`✓ Downloaded: ${display} (${(blob.size / 1024).toFixed(1)} KB)`);

        if (useCache) {
          try {
            await cache.put(url, new Response(blob.slice()));
          } catch (e) {
            console.warn('Failed to cache:', display, e);
          }
        }

        successFiles.push(originalUrl);
        loadedFiles++;
        onProgress(loadedFiles / totalFiles);

      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

    } catch (error) {
      console.error(`❌ Failed to load ${display}:`, error.message);
      failedFiles.push({ url: originalUrl, error: error.message });
      loadedFiles++;
      onProgress(loadedFiles / totalFiles);
      onStatus(`Failed: ${display} - ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (detailsEl) {
    detailsEl.textContent = '';
  }

  console.log('=== Preload Summary ===');
  console.log(`Successfully loaded: ${successFiles.length}/${totalFiles} files`);
  if (successFiles.length > 0) {
    console.log('Loaded:', successFiles.join(', '));
  }
  if (failedFiles.length > 0) {
    console.log('Failed files:', failedFiles);
  }

  if (failedFiles.length > 0) {
    console.error('Failed to load assets:', failedFiles);
    onStatus(`Loaded ${successFiles.length}/${totalFiles} files - continuing...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  } else {
    onStatus('All assets loaded successfully!');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  onProgress(1);
}

export async function assetsInCache(urls) {
  try {
    const cache = await caches.open('asset-cache');
    for (const url of urls) {
      const absolute =
        url.startsWith('http://') || url.startsWith('https://')
          ? url
          : new URL(url, window.location.href).href;
      const match = await cache.match(absolute);
      if (!match) return false;
    }
    return true;
  } catch (e) {
    console.warn('Asset cache check failed:', e);
    return false;
  }
}
