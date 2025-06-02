export async function preloadAssets(urls, onProgress = () => {}, onStatus = () => {}) {
  let cache = null;
  let useCache = true;

  // Check if Cache API is available
  try {
    cache = await caches.open('asset-cache');
  } catch (e) {
    console.warn('Cache API not available, falling back to direct loading:', e);
    useCache = false;
  }

  let totalFiles = urls.length;
  let loadedFiles = 0;
  let failedFiles = [];
  let successFiles = [];

  console.log(`Starting preload of ${totalFiles} assets...`);
  onStatus('Starting asset preload...');
  onProgress(0);

  // Convert relative URLs to absolute
  const absoluteUrls = urls.map(url => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Create absolute URL from relative path
    return new URL(url, window.location.href).href;
  });

  // Load files sequentially to avoid overwhelming the server
  for (let i = 0; i < absoluteUrls.length; i++) {
    const url = absoluteUrls[i];
    const originalUrl = urls[i];
    const display = originalUrl.split('/').pop() || 'file';

    try {
      onStatus(`Loading ${display}... (${i + 1}/${totalFiles})`);
      console.log(`Attempting to load: ${display} from ${url}`);

      // Check cache first if available
      if (useCache) {
        try {
          const cached = await cache.match(url);
          if (cached) {
            console.log(`✓ Using cached: ${display}`);
            successFiles.push(originalUrl);
            loadedFiles++;
            onProgress(loadedFiles / totalFiles);
            continue;
          }
        } catch (e) {
          console.warn('Cache check failed for:', display, e);
        }
      }

      // Set a timeout for fetch operations
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          mode: 'cors', // Explicitly set CORS mode
          credentials: 'same-origin' // Don't send cookies cross-origin
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Load the full response
        const blob = await response.blob();
        console.log(`✓ Downloaded: ${display} (${(blob.size / 1024).toFixed(1)} KB)`);

        // Try to cache if available
        if (useCache) {
          try {
            await cache.put(url, new Response(blob.slice())); // Use slice() to create a new blob
          } catch (e) {
            console.warn('Failed to cache:', display, e);
          }
        }

        successFiles.push(originalUrl);
        loadedFiles++;
        onProgress(loadedFiles / totalFiles);

      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError.name === 'AbortError') {
          throw new Error('Timeout - server took too long to respond');
        }
        throw fetchError;
      }

    } catch (error) {
      console.error(`❌ Failed to load ${display}:`, error.message);
      failedFiles.push({ url: originalUrl, error: error.message });

      // Still update progress for failed files
      loadedFiles++;
      onProgress(loadedFiles / totalFiles);

      // Show error briefly
      onStatus(`Failed: ${display} - ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Log summary
  console.log('=== Preload Summary ===');
  console.log(`Successfully loaded: ${successFiles.length}/${totalFiles} files`);
  if (successFiles.length > 0) {
    console.log('Loaded:', successFiles.join(', '));
  }
  if (failedFiles.length > 0) {
    console.log('Failed files:', failedFiles);
  }

  // Final status
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