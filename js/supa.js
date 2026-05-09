// ============================================================
// SUPABASE CLIENT + STORAGE HELPERS
//
// Initialises a single Supabase client used by auth.js and the
// photo-upload helpers. Loads after the @supabase/supabase-js UMD
// bundle and the local config.js. Exposes:
//   • window.supabaseClient  — the client instance
//   • window.Photos          — { upload(file) → publicUrl }
// ============================================================

(function () {
  const cfg = window.CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY ||
      cfg.SUPABASE_URL.startsWith('PASTE_') ||
      cfg.SUPABASE_ANON_KEY.startsWith('PASTE_')) {
    // Silently disable — the public landing page works without Supabase
    // (it uses a hardcoded demo for the hero). User-account pages will
    // throw "Supabase not configured" if reached directly, which is fine
    // since they're not linked from the landing in coming-soon mode.
    console.info('[supa] Supabase not configured — multi-user features disabled.');
    window.supabaseClient = null;
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase JS SDK not loaded. Ensure the @supabase/supabase-js script tag comes before supa.js.');
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  // ============================================================
  // PHOTOS — upload to the "photos" storage bucket, return URL.
  //   Resizes client-side (max 480 × 600, JPEG q=0.85) so we don't
  //   blow through the 1 GB free-tier storage budget. A 3 MB DSLR
  //   shot becomes ~50 KB after this.
  // ============================================================
  function resizeImage(file, maxW = 480, maxH = 600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const scale = Math.min(maxW / width, maxH / height, 1);
        width  = Math.max(1, Math.round(width  * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // gentle cover background so transparent PNGs don't go black on JPEG
        ctx.fillStyle = '#1c1812';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          b => b ? resolve(b) : reject(new Error('Could not encode image')),
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not load image'));
      };
      img.src = url;
    });
  }

  window.Photos = {
    /** Upload a File from an <input type="file"> and return its public URL. */
    async upload(file) {
      if (!file) throw new Error('No file given');
      const supa = window.supabaseClient;
      if (!supa) throw new Error('Supabase not configured');
      const { data: { user } } = await supa.auth.getUser();
      if (!user) throw new Error('You must be signed in to upload photos.');

      const blob = await resizeImage(file);
      const stem = Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
      const path = user.id + '/' + stem + '.jpg';

      const { error } = await supa.storage.from('photos').upload(path, blob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',     // 1 year — uploaded photos never change
        upsert: false,
      });
      if (error) throw error;

      const { data: { publicUrl } } = supa.storage.from('photos').getPublicUrl(path);
      return publicUrl;
    },

    /** Delete a previously-uploaded photo by URL. Best-effort — failures are non-fatal. */
    async deleteByUrl(url) {
      try {
        if (!url || typeof url !== 'string') return;
        const supa = window.supabaseClient;
        if (!supa) return;
        const marker = '/storage/v1/object/public/photos/';
        const idx = url.indexOf(marker);
        if (idx === -1) return;
        const path = url.slice(idx + marker.length);
        await supa.storage.from('photos').remove([path]);
      } catch (e) { /* ignore */ }
    },
  };
})();
