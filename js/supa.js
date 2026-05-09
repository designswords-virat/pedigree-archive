// ============================================================
// PHOTOS — local-only, no backend.
//
// Resize an uploaded image to a small JPEG and return a base64 data
// URL. The result is stored inline in the family-tree JSON in
// localStorage. Same public API as the previous Supabase-backed
// version (`window.Photos.upload(file)` returns a string URL).
//
// Why resize: localStorage caps at ~5–10 MB per origin. A 3 MB DSLR
// photo at full size would fill it after a couple of uploads. Resizing
// to 480×600 JPEG q=0.85 brings each photo to ~30–60 KB, comfortably
// fitting many dozens.
// ============================================================

(function () {
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

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read resized image'));
      r.readAsDataURL(blob);
    });
  }

  // Keep window.supabaseClient as null so any leftover guards in old code
  // (`if (!supa) throw`) still behave sensibly.
  window.supabaseClient = null;

  window.Photos = {
    /** Upload a File from an <input type="file"> and return a data-URL. */
    async upload(file) {
      if (!file) throw new Error('No file given');
      const blob = await resizeImage(file);
      return await blobToDataUrl(blob);
    },

    /** No-op: data-URL photos have no remote object to delete. */
    async deleteByUrl() { /* no-op */ },
  };
})();
