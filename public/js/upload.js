// upload.js v6 — reusable image/file upload widget
// Supports both admin routes (/api/admin/upload/:folder)
// and customer routes (/api/upload/:folder) based on the 'adminOnly' option.

const Uploader = (() => {
  function create(container, { multiple = true, folder = 'general', adminOnly = true } = {}) {
    let uploadedUrls = [];

    container.innerHTML = `
      <div class="upload-zone" id="${container.id}-zone">
        <input type="file" accept="image/*,.pdf,.txt" ${multiple ? 'multiple' : ''} id="${container.id}-input">
        <div>📷 ${multiple ? 'Tap to upload photos / files' : 'Tap to upload image or file'}</div>
        <div style="font-size:0.65rem;margin-top:4px;">JPEG · PNG · GIF · WebP · PDF · TXT — max 10MB</div>
      </div>
      <div class="upload-preview" id="${container.id}-preview"></div>
      <div class="error-text" id="${container.id}-error"></div>
    `;

    const zone     = container.querySelector('.upload-zone');
    const fileInput = container.querySelector('input[type=file]');
    const preview  = container.querySelector('.upload-preview');
    const errEl    = container.querySelector('.error-text');

    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragging'); handleFiles(e.dataTransfer.files); });
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));

    async function handleFiles(files) {
      errEl.textContent = '';
      zone.innerHTML = '<div>Uploading…</div>';

      const formData = new FormData();
      let count = 0;
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { errEl.textContent = `${file.name} is too large (max 10MB)`; continue; }
        formData.append('images', file, file.name);
        count++;
      }
      if (!count) {
        zone.innerHTML = `<div>📷 ${multiple ? 'Tap to upload photos / files' : 'Tap to upload'}</div>`;
        return;
      }

      try {
        const token = localStorage.getItem('cm_token');
        const headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;

        // KEY FIX: customers use /api/upload/:folder, admins use /api/admin/upload/:folder
        const apiPath = adminOnly
          ? `/api/admin/upload/${folder}`
          : `/api/upload/${folder}`;

        const res  = await fetch(apiPath, { method: 'POST', headers, body: formData });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Upload failed');

        data.urls.forEach(url => {
          uploadedUrls.push(url);
          addPreview(url);
        });

        zone.innerHTML = `<div>📷 ${multiple ? 'Add more' : 'Change file'}</div>`;
      } catch (err) {
        errEl.textContent = err.message;
        zone.innerHTML = `<div>📷 Tap to try again</div>`;
      }

      fileInput.value = '';
    }

    function addPreview(url) {
      const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
      const div   = document.createElement('div');
      div.className = 'prev-img';
      div.innerHTML = isImg
        ? `<img src="${url}" alt=""><button class="remove" title="Remove">×</button>`
        : `<div style="font-family:var(--font-mono);font-size:0.7rem;padding:6px;background:var(--kraft);border:1px solid var(--line);border-radius:3px;position:relative;">📎 ${url.split('/').pop()}<button class="remove" title="Remove" style="position:absolute;top:-6px;right:-6px;background:var(--stamp-red);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;">×</button></div>`;
      div.querySelector('.remove').addEventListener('click', () => {
        uploadedUrls = uploadedUrls.filter(u => u !== url);
        div.remove();
      });
      preview.appendChild(div);
    }

    return {
      getUrls: () => uploadedUrls,
      reset:   () => {
        uploadedUrls = [];
        preview.innerHTML = '';
        zone.innerHTML = `<div>📷 ${multiple ? 'Tap to upload photos / files' : 'Tap to upload'}</div>`;
        errEl.textContent = '';
      }
    };
  }

  return { create };
})();
