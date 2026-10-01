// LivePhotoBridge Web — Client-side Muxing & Sharing Engine
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const selectFilesBtn = document.getElementById('selectFilesBtn');
  const selectFolderBtn = document.getElementById('selectFolderBtn');
  
  const statsBar = document.getElementById('statsBar');
  const livePhotoCountEl = document.getElementById('livePhotoCount');
  const otherMediaCountEl = document.getElementById('otherMediaCount');
  const totalCountEl = document.getElementById('totalCount');
  const clearBtn = document.getElementById('clearBtn');
  
  const optionsBar = document.getElementById('optionsBar');
  const convertHeicToggle = document.getElementById('convertHeicToggle');
  
  const pairsContainer = document.getElementById('pairsContainer');
  const pairsList = document.getElementById('pairsList');
  const actionBar = document.getElementById('actionBar');
  const convertBtn = document.getElementById('convertBtn');
  
  const progressCard = document.getElementById('progressCard');
  const progressBar = document.getElementById('progressBar');
  const progressPercent = document.getElementById('progressPercent');
  const progressDetails = document.getElementById('progressDetails');
  
  const resultsCard = document.getElementById('resultsCard');
  const successMessage = document.getElementById('successMessage');
  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const showQrBtn = document.getElementById('showQrBtn');
  
  const qrSection = document.getElementById('qrSection');
  const qrCodeBox = document.getElementById('qrCodeBox');
  const qrUrlEl = document.getElementById('qrUrl');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const qrTransferStatus = document.getElementById('qrTransferStatus');
  
  const previewCard = document.getElementById('previewCard');
  const previewImg = document.getElementById('previewImg');
  const previewVid = document.getElementById('previewVid');
  const motionToggle = document.getElementById('motionToggle');
  const previewTitle = document.getElementById('previewTitle');

  // State
  let rawFiles = [];             // all incoming files
  let matchedPairs = [];         // array of { dir, stem, photo: File, video: File, format: 'heic'|'jpeg', relativePhotoPath }
  let passThroughFiles = [];     // array of { file: File, relativePath: string, type: 'image'|'video'|'other' }
  let processedBlobs = [];       // array of { filename, blob, photoBlob, videoBlob }
  let finalZipBlob = null;
  let serverInfo = null;

  // Check if local bridge server is reachable
  fetch('/api/network-ip')
    .then(r => r.json())
    .then(data => {
      serverInfo = data;
      console.log('Bridge Server detected:', serverInfo);
    })
    .catch(() => {
      console.log('Running in static standalone browser mode (no local bridge server).');
    });

  // Toggle HEIC to JPG conversion mode
  if (convertHeicToggle) {
    convertHeicToggle.addEventListener('change', () => {
      renderPairsList();
    });
  }

  // Event Handlers for File Selection
  selectFilesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  selectFolderBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    // Modern File System Access API (Chrome, Edge, Opera)
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const files = [];
        await readDirectoryHandle(dirHandle, files, dirHandle.name);
        if (files.length > 0) {
          handleIncomingFiles(files);
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError') return; // User cancelled dialog
        console.warn('showDirectoryPicker fallback to input:', err);
      }
    }
    // Safari / Firefox fallback
    folderInput.click();
  });

  async function readDirectoryHandle(dirHandle, fileList, currentPath) {
    for await (const entry of dirHandle.values()) {
      if (entry.name.startsWith('.') || entry.name.startsWith('._') || entry.name === '__MACOSX') {
        continue;
      }
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        file.customRelativePath = currentPath ? `${currentPath}/${file.name}` : file.name;
        fileList.push(file);
      } else if (entry.kind === 'directory') {
        const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        await readDirectoryHandle(entry, fileList, nextPath);
      }
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');

    const items = e.dataTransfer.items;
    const files = [];

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) await traverseFileTree(entry, files, "");
        } else {
          const f = item.getAsFile();
          if (f) {
            f.customRelativePath = f.name;
            files.push(f);
          }
        }
      }
    } else if (e.dataTransfer.files) {
      for (const f of e.dataTransfer.files) {
        f.customRelativePath = f.name;
        files.push(f);
      }
    }

    handleIncomingFiles(files);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      for (const f of files) f.customRelativePath = f.name;
      handleIncomingFiles(files);
      fileInput.value = '';
    }
  });

  folderInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      for (const f of files) {
        f.customRelativePath = f.webkitRelativePath || f.name;
      }
      handleIncomingFiles(files);
      folderInput.value = '';
    }
  });

  clearBtn.addEventListener('click', () => {
    rawFiles = [];
    matchedPairs = [];
    passThroughFiles = [];
    processedBlobs = [];
    finalZipBlob = null;
    updateUI();
  });

  // Recursively read all files in directories (handles batches of > 100 entries)
  async function traverseFileTree(item, fileList, currentPath) {
    // Skip hidden files, AppleDouble metadata, and system folders
    if (item.name.startsWith('.') || item.name.startsWith('._') || item.name === '__MACOSX') {
      return;
    }

    if (item.isFile) {
      const file = await new Promise(r => item.file(r));
      file.customRelativePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      fileList.push(file);
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      let entries = [];
      let batch;
      // Loop until all entries in folder are read
      do {
        batch = await new Promise(r => dirReader.readEntries(r));
        if (batch && batch.length > 0) entries.push(...batch);
      } while (batch && batch.length > 0);

      const nextPath = currentPath ? `${currentPath}/${item.name}` : item.name;
      for (const entry of entries) {
        await traverseFileTree(entry, fileList, nextPath);
      }
    }
  }

  function getPathParts(relativePath) {
    const norm = relativePath.replace(/\\/g, '/');
    const lastSlash = norm.lastIndexOf('/');
    const dir = lastSlash === -1 ? '' : norm.substring(0, lastSlash);
    const filename = lastSlash === -1 ? norm : norm.substring(lastSlash + 1);
    
    const lastDot = filename.lastIndexOf('.');
    const stem = lastDot === -1 ? filename : filename.substring(0, lastDot);
    const ext = lastDot === -1 ? '' : filename.substring(lastDot + 1).toLowerCase();
    
    return { dir, filename, stem, ext };
  }

  function isIgnoredSystemFile(parts) {
    const filename = parts.filename;
    // Hidden files, AppleDouble resource forks, thumbs.db, etc.
    if (filename.startsWith('.') || filename.startsWith('._')) return true;

    const lower = filename.toLowerCase();
    if (lower === 'thumbs.db' || lower === 'desktop.ini' || lower === '.ds_store') return true;

    // Check directory path for hidden directories like .Trash, .git, __MACOSX
    if (parts.dir) {
      const segments = parts.dir.split('/');
      if (segments.some(seg => seg.startsWith('.') || seg === '__MACOSX')) return true;
    }

    return false;
  }

  function isSupportedMedia(ext) {
    const MEDIA_EXTS = new Set([
      // Photos & Images
      'jpg', 'jpeg', 'heic', 'heif', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'avif',
      'raw', 'dng', 'cr2', 'nef', 'arw', 'rw2', 'orf', 'pef',
      // Videos
      'mov', 'mp4', 'm4v', 'webm', 'mkv', 'avi', '3gp', 'ts'
    ]);
    return MEDIA_EXTS.has(ext);
  }

  function isLivePhotoEligible(ext) {
    return ['heic', 'heif', 'jpg', 'jpeg'].includes(ext);
  }

  function isLiveVideoEligible(ext) {
    return ['mov', 'mp4'].includes(ext);
  }

  function isExistingMotionPhoto(name) {
    const upper = name.toUpperCase();
    return upper.includes('.MP.') || upper.includes('_MP.');
  }

  function handleIncomingFiles(newFiles) {
    rawFiles.push(...newFiles);

    // Group files by Directory + Base Stem
    const dirGroups = new Map(); // "dir/stem" (uppercase) -> { photos: [], videos: [], others: [] }
    const allFilesWithParts = [];

    for (const file of rawFiles) {
      const relPath = file.customRelativePath || file.webkitRelativePath || file.name;
      const parts = getPathParts(relPath);

      // Skip hidden files, system junk (.DS_Store, Thumbs.db), and non-media files
      if (isIgnoredSystemFile(parts) || !isSupportedMedia(parts.ext)) {
        continue;
      }

      const isExistingMP = isExistingMotionPhoto(parts.filename);
      const key = (parts.dir ? `${parts.dir}/` : '') + parts.stem.toUpperCase();

      if (!dirGroups.has(key)) {
        dirGroups.set(key, { photos: [], videos: [], others: [] });
      }

      const group = dirGroups.get(key);

      if (!isExistingMP && isLivePhotoEligible(parts.ext)) {
        group.photos.push({ file, relPath, parts });
      } else if (!isExistingMP && isLiveVideoEligible(parts.ext)) {
        group.videos.push({ file, relPath, parts });
      } else {
        group.others.push({ file, relPath, parts });
      }

      allFilesWithParts.push({ file, relPath, parts, key, isExistingMP });
    }

    matchedPairs = [];
    passThroughFiles = [];

    // Form pairs and collect unmatched / pass-through files
    for (const [key, group] of dirGroups.entries()) {
      if (group.photos.length > 0 && group.videos.length > 0) {
        // Matched Live Photo Pair!
        const photoItem = group.photos[0];
        const videoItem = group.videos[0];
        const format = (photoItem.parts.ext === 'heic' || photoItem.parts.ext === 'heif') ? 'heic' : 'jpeg';
        const isStarred = photoItem.parts.stem.toLowerCase().includes('_starred');

        matchedPairs.push({
          dir: photoItem.parts.dir,
          stem: photoItem.parts.stem,
          photo: photoItem.file,
          video: videoItem.file,
          format,
          isStarred,
          relativePhotoPath: photoItem.relPath
        });

        // If there were extra photos or videos with identical stem in same dir, pass them through
        for (let i = 1; i < group.photos.length; i++) {
          const item = group.photos[i];
          const fmt = (item.parts.ext === 'heic' || item.parts.ext === 'heif') ? 'heic' : (item.parts.ext === 'jpg' || item.parts.ext === 'jpeg') ? 'jpeg' : 'other';
          passThroughFiles.push({ file: item.file, relativePath: item.relPath, format: fmt, label: 'Photo', isStarred: item.parts.stem.toLowerCase().includes('_starred') });
        }
        for (let i = 1; i < group.videos.length; i++) {
          const item = group.videos[i];
          passThroughFiles.push({ file: item.file, relativePath: item.relPath, format: 'video', label: 'Video', isStarred: item.parts.stem.toLowerCase().includes('_starred') });
        }
      } else {
        // No match: Pass everything in this group through unmodified
        for (const p of group.photos) {
          const fmt = (p.parts.ext === 'heic' || p.parts.ext === 'heif') ? 'heic' : (p.parts.ext === 'jpg' || p.parts.ext === 'jpeg') ? 'jpeg' : 'other';
          passThroughFiles.push({ file: p.file, relativePath: p.relPath, format: fmt, label: 'Photo (Single)', isStarred: p.parts.stem.toLowerCase().includes('_starred') });
        }
        for (const v of group.videos) {
          passThroughFiles.push({ file: v.file, relativePath: v.relPath, format: 'video', label: 'Video (Standalone)', isStarred: v.parts.stem.toLowerCase().includes('_starred') });
        }
      }

      // Add other non-live files (PNGs, GIFs, existing Motion Photos, metadata)
      for (const o of group.others) {
        passThroughFiles.push({ file: o.file, relativePath: o.relPath, format: 'other', label: o.parts.ext.toUpperCase() || 'File', isStarred: o.parts.stem.toLowerCase().includes('_starred') });
      }
    }

    // Update Counts
    livePhotoCountEl.textContent = matchedPairs.length;
    otherMediaCountEl.textContent = passThroughFiles.length;
    totalCountEl.textContent = matchedPairs.length + passThroughFiles.length;

    renderPairsList();
    updateUI();
  }

  function renderPairsList() {
    pairsList.innerHTML = '';
    const convertHeic = convertHeicToggle ? convertHeicToggle.checked : false;

    // 1. Render Matched Live Photos
    if (matchedPairs.length > 0) {
      const header = document.createElement('div');
      header.style.cssText = 'font-size: 12px; font-weight: 700; color: #60a5fa; text-transform: uppercase; margin-top: 4px;';
      header.textContent = `Live Photos to Bridge (${matchedPairs.length})`;
      pairsList.appendChild(header);

      matchedPairs.slice(0, 15).forEach((pair) => {
        const row = document.createElement('div');
        row.className = 'pair-row';
        const photoSize = (pair.photo.size / (1024 * 1024)).toFixed(1);
        const videoSize = (pair.video.size / (1024 * 1024)).toFixed(1);
        const starBadge = pair.isStarred ? '<span class="pair-badge star-badge">⭐ Starred</span>' : '';

        let targetBadge;
        if (pair.format === 'heic') {
          targetBadge = convertHeic ? '➔ .MP.JPG <span style="font-size: 11px; opacity: 0.8;"></span>' : '➔ .MP.HEIC';
        } else {
          targetBadge = '➔ .MP.JPG';
        }

        row.innerHTML = `
          <div class="pair-info">
            <span class="pair-badge ${pair.format}">${pair.format}</span>
            ${starBadge}
            <div>
              <div class="pair-name">${pair.relativePhotoPath}</div>
              <div class="pair-details">Live Photo: ${photoSize} MB + Motion: ${videoSize} MB</div>
            </div>
          </div>
          <div class="pair-status">${targetBadge}</div>
        `;
        pairsList.appendChild(row);
      });

      if (matchedPairs.length > 15) {
        const more = document.createElement('div');
        more.style.cssText = 'font-size: 12px; color: var(--text-dim); text-align: center; padding: 4px;';
        more.textContent = `+ ${matchedPairs.length - 15} more Live Photos...`;
        pairsList.appendChild(more);
      }
    }

    // 2. Render Pass-Through Media (PNGs, videos, standalone photos)
    if (passThroughFiles.length > 0) {
      const header = document.createElement('div');
      header.style.cssText = 'font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 10px;';
      header.textContent = `📁 Other Media to Preserve (${passThroughFiles.length} items: PNG, MOV, etc.)`;
      pairsList.appendChild(header);

      passThroughFiles.slice(0, 8).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'pair-row';
        const sizeMb = (item.file.size / (1024 * 1024)).toFixed(1);
        const isStandaloneHeic = item.format === 'heic';
        const statusText = (isStandaloneHeic && convertHeic) ? '➔ .JPG <span style="font-size: 11px; opacity: 0.8;"></span>' : 'Pass-Through';
        const statusColor = (isStandaloneHeic && convertHeic) ? 'var(--accent)' : 'var(--text-muted)';

        row.innerHTML = `
          <div class="pair-info">
            <span class="pair-badge passthrough">${item.label}</span>
            <div>
              <div class="pair-name">${item.relativePath}</div>
              <div class="pair-details">${sizeMb} MB • Included as-is</div>
            </div>
          </div>
          <div class="pair-status" style="color: ${statusColor};">${statusText}</div>
        `;
        pairsList.appendChild(row);
      });

      if (passThroughFiles.length > 8) {
        const more = document.createElement('div');
        more.style.cssText = 'font-size: 12px; color: var(--text-dim); text-align: center; padding: 4px;';
        more.textContent = `+ ${passThroughFiles.length - 8} more media files included...`;
        pairsList.appendChild(more);
      }
    }
  }

  function updateUI() {
    const totalItems = matchedPairs.length + passThroughFiles.length;
    const hasFiles = totalItems > 0;

    statsBar.classList.toggle('visible', hasFiles);
    if (optionsBar) optionsBar.classList.toggle('visible', hasFiles);
    if (actionBar) actionBar.classList.toggle('visible', hasFiles);
    pairsContainer.classList.toggle('visible', hasFiles);
    convertBtn.disabled = !hasFiles;

    if (matchedPairs.length > 0) {
      convertBtn.innerHTML = `<span>Package for Pixel (${totalItems} items)</span>`;
    } else {
      convertBtn.innerHTML = `<span>Package ${totalItems} items for Pixel</span>`;
    }

    // Reset results on new changes
    resultsCard.classList.remove('visible');
    qrSection.classList.remove('visible');
    previewCard.classList.remove('visible');
  }

  // --- Core Muxing Engine ---
  function buildGCameraXmp(videoOffset, ptsUs = 750000, isStarred = false) {
    const starXml = isStarred ? `
 <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <xmp:Rating>5</xmp:Rating>
  <xmp:Label>Favorite</xmp:Label>
  <dc:subject>
   <rdf:Bag>
    <rdf:li>Favorite</rdf:li>
    <rdf:li>Starred</rdf:li>
   </rdf:Bag>
  </dc:subject>
 </rdf:Description>` : '';

    return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
 <rdf:Description rdf:about="" xmlns:GCamera="http://ns.google.com/photos/1.0/camera/">
  <GCamera:MicroVideo>1</GCamera:MicroVideo>
  <GCamera:MicroVideoOffset>${videoOffset}</GCamera:MicroVideoOffset>
  <GCamera:MicroVideoPresentationTimestampUs>${ptsUs}</GCamera:MicroVideoPresentationTimestampUs>
  <GCamera:MicroVideoVersion>1</GCamera:MicroVideoVersion>
  <GCamera:MotionPhoto>1</GCamera:MotionPhoto>
  <GCamera:MotionPhotoPresentationTimestampUs>${ptsUs}</GCamera:MotionPhotoPresentationTimestampUs>
  <GCamera:MotionPhotoVersion>1</GCamera:MotionPhotoVersion>
 </rdf:Description>${starXml}
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  }

  // --- Extract original EXIF payload from HEIC container ---
  function extractHeicExif(photoBytes) {
    const view = new DataView(photoBytes.buffer, photoBytes.byteOffset, photoBytes.byteLength);
    let pos = 0;
    let meta = null;
    while (pos < photoBytes.length) {
      if (pos + 8 > photoBytes.length) break;
      let sz = view.getUint32(pos);
      const name = String.fromCharCode(photoBytes[pos+4], photoBytes[pos+5], photoBytes[pos+6], photoBytes[pos+7]);
      let hlen = 8;
      if (sz === 1) {
        sz = view.getUint32(pos + 8) * 4294967296 + view.getUint32(pos + 12);
        hlen = 16;
      } else if (sz === 0) sz = photoBytes.length - pos;
      if (name === "meta") meta = { pos, sz, hlen };
      pos += sz;
    }
    if (!meta) return null;

    const boxStart = meta.pos + meta.hlen + 4;
    const boxEnd = meta.pos + meta.sz;
    pos = boxStart;
    const children = {};
    while (pos < boxEnd) {
      if (pos + 8 > boxEnd) break;
      const sz = view.getUint32(pos);
      const name = String.fromCharCode(photoBytes[pos+4], photoBytes[pos+5], photoBytes[pos+6], photoBytes[pos+7]);
      children[name] = { pos, sz };
      pos += sz;
    }
    if (!children["iinf"] || !children["iloc"]) return null;

    const iinf = children["iinf"];
    const iinfVer = photoBytes[iinf.pos + 8];
    let ip = iinf.pos + (iinfVer === 0 ? 14 : 16);
    let exifItemId = null;
    while (ip < iinf.pos + iinf.sz) {
      const isz = view.getUint32(ip);
      if (isz === 0) break;
      const iver = photoBytes[ip + 8];
      const iid = (iver < 2) ? view.getUint16(ip + 12) : view.getUint16(ip + 12);
      const itype = String.fromCharCode(photoBytes[ip+16], photoBytes[ip+17], photoBytes[ip+18], photoBytes[ip+19]);
      if (itype === "Exif") {
        exifItemId = iid;
        break;
      }
      ip += isz;
    }
    if (exifItemId === null) return null;

    const iloc = children["iloc"];
    const ilocVer = photoBytes[iloc.pos + 8];
    const offLen = photoBytes[iloc.pos + 12];
    const offsetSize = (offLen >> 4) & 0xF;
    const lengthSize = offLen & 0xF;
    const baseIdx = photoBytes[iloc.pos + 13];
    const baseSize = (baseIdx >> 4) & 0xF;
    let itemCount = (ilocVer < 2) ? view.getUint16(iloc.pos + 14) : view.getUint32(iloc.pos + 14);
    let p = iloc.pos + (ilocVer < 2 ? 16 : 18);

    for (let i = 0; i < itemCount; i++) {
      const iid = (ilocVer < 2) ? view.getUint16(p) : view.getUint32(p);
      p += (ilocVer < 2 ? 2 : 4);
      if (ilocVer === 1 || ilocVer === 2) p += 2;
      p += 2;
      let baseOffset = 0;
      if (baseSize === 4) { baseOffset = view.getUint32(p); p += 4; }
      else if (baseSize === 8) {
        const hi = view.getUint32(p);
        const lo = view.getUint32(p + 4);
        baseOffset = hi * 4294967296 + lo;
        p += 8;
      } else if (baseSize > 0) p += baseSize;

      const extCount = view.getUint16(p); p += 2;
      for (let j = 0; j < extCount; j++) {
        let extOff = 0;
        if (offsetSize === 4) { extOff = view.getUint32(p); p += 4; }
        else if (offsetSize === 8) {
          const hi = view.getUint32(p);
          const lo = view.getUint32(p + 4);
          extOff = hi * 4294967296 + lo;
          p += 8;
        } else p += offsetSize;

        let extLen = 0;
        if (lengthSize === 4) { extLen = view.getUint32(p); p += 4; }
        else if (lengthSize === 8) {
          const hi = view.getUint32(p);
          const lo = view.getUint32(p + 4);
          extLen = hi * 4294967296 + lo;
          p += 8;
        } else p += lengthSize;

        if (iid === exifItemId && extLen > 4) {
          return photoBytes.subarray(extOff + 4, extOff + extLen);
        }
      }
    }
    return null;
  }

  // --- Convert HEIC to 100% Quality JPEG with full EXIF preservation ---
  async function convertHeicToJpegWithExif(heicBlob, heicBytes) {
    let rawJpgBlob = null;

    // 1. Try native browser decoding first (Safari / iOS) - instant & hardware accelerated
    try {
      const bitmap = await createImageBitmap(heicBlob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      rawJpgBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 1.0));
    } catch {
      // 2. Fallback to heic2any for Chrome / Firefox
      if (window.heic2any) {
        let res = await window.heic2any({
          blob: heicBlob,
          toType: 'image/jpeg',
          quality: 1.0
        });
        if (Array.isArray(res)) res = res[0];
        rawJpgBlob = res;
      } else {
        throw new Error('HEIC decoding is not supported in this browser.');
      }
    }

    // 3. Extract original EXIF payload from the HEIC container
    const exifPayload = extractHeicExif(heicBytes);
    if (!exifPayload) {
      const jpegBuf = new Uint8Array(await rawJpgBlob.arrayBuffer());
      return { jpegBlob: rawJpgBlob, jpegBuf };
    }

    const rawJpg = new Uint8Array(await rawJpgBlob.arrayBuffer());
    const app1Len = 2 + exifPayload.length;
    const app1Segment = new Uint8Array(2 + app1Len);
    app1Segment[0] = 0xFF;
    app1Segment[1] = 0xE1;
    app1Segment[2] = (app1Len >> 8) & 0xFF;
    app1Segment[3] = app1Len & 0xFF;
    app1Segment.set(exifPayload, 4);

    // Insert APP1 right after SOI (offset 2)
    const finalJpg = new Uint8Array(rawJpg.length + app1Segment.length);
    finalJpg.set(rawJpg.subarray(0, 2), 0);
    finalJpg.set(app1Segment, 2);
    finalJpg.set(rawJpg.subarray(2), 2 + app1Segment.length);

    const jpegBlob = new Blob([finalJpg], { type: 'image/jpeg' });
    return { jpegBlob, jpegBuf: finalJpg };
  }

  function muxJpeg(photoBytes, videoBytes, ptsUs = 750000, isStarred = false) {
    const xmpXml = buildGCameraXmp(videoBytes.length, ptsUs, isStarred);
    const encoder = new TextEncoder();
    const headerBytes = encoder.encode("http://ns.adobe.com/xap/1.0/\0");
    const xmlBytes = encoder.encode(xmpXml);

    const app1Length = 2 + headerBytes.length + xmlBytes.length;
    const app1Segment = new Uint8Array(2 + app1Length);
    app1Segment[0] = 0xFF;
    app1Segment[1] = 0xE1;
    app1Segment[2] = (app1Length >> 8) & 0xFF;
    app1Segment[3] = app1Length & 0xFF;
    app1Segment.set(headerBytes, 4);
    app1Segment.set(xmlBytes, 4 + headerBytes.length);

    // Insert APP1 right after SOI (index 2)
    const taggedPhoto = new Uint8Array(photoBytes.length + app1Segment.length);
    taggedPhoto.set(photoBytes.subarray(0, 2), 0);
    taggedPhoto.set(app1Segment, 2);
    taggedPhoto.set(photoBytes.subarray(2), 2 + app1Segment.length);

    // Concatenate [Tagged Photo] + [Video Bytes]
    const finalBytes = new Uint8Array(taggedPhoto.length + videoBytes.length);
    finalBytes.set(taggedPhoto, 0);
    finalBytes.set(videoBytes, taggedPhoto.length);

    return new Blob([finalBytes], { type: 'image/jpeg' });
  }

  function muxHeic(photoBytes, videoBytes, ptsUs = 750000, isStarred = false) {
    const xmpXml = buildGCameraXmp(videoBytes.length, ptsUs, isStarred);
    const encoder = new TextEncoder();
    const xmpBytes = encoder.encode(xmpXml);

    const view = new DataView(photoBytes.buffer, photoBytes.byteOffset, photoBytes.byteLength);

    // 1. Parse top-level boxes
    let pos = 0;
    let meta = null;
    let mdat = null;

    while (pos < photoBytes.length) {
      if (pos + 8 > photoBytes.length) break;
      let sz = view.getUint32(pos);
      const name = String.fromCharCode(photoBytes[pos+4], photoBytes[pos+5], photoBytes[pos+6], photoBytes[pos+7]);
      let hlen = 8;
      if (sz === 1) {
        const hi = view.getUint32(pos + 8);
        const lo = view.getUint32(pos + 12);
        sz = hi * 4294967296 + lo;
        hlen = 16;
      } else if (sz === 0) {
        sz = photoBytes.length - pos;
      }
      if (name === "meta") meta = { pos, sz, hlen };
      else if (name === "mdat") mdat = { pos, sz, hlen };
      pos += sz;
    }

    if (!meta || !mdat) {
      const fallback = new Uint8Array(photoBytes.length + videoBytes.length);
      fallback.set(photoBytes, 0);
      fallback.set(videoBytes, photoBytes.length);
      return new Blob([fallback], { type: 'image/heic' });
    }

    // 2. Parse meta child boxes
    const boxStart = meta.pos + meta.hlen + 4; // 4 bytes version/flags
    const boxEnd = meta.pos + meta.sz;
    pos = boxStart;
    const children = {};

    while (pos < boxEnd) {
      if (pos + 8 > boxEnd) break;
      const sz = view.getUint32(pos);
      const name = String.fromCharCode(photoBytes[pos+4], photoBytes[pos+5], photoBytes[pos+6], photoBytes[pos+7]);
      children[name] = { pos, sz };
      pos += sz;
    }

    if (!children["pitm"] || !children["iinf"] || !children["iloc"]) {
      const fallback = new Uint8Array(photoBytes.length + videoBytes.length);
      fallback.set(photoBytes, 0);
      fallback.set(videoBytes, photoBytes.length);
      return new Blob([fallback], { type: 'image/heic' });
    }

    // 3. Read pitm (primary item ID)
    const pitm = children["pitm"];
    const pitmVer = photoBytes[pitm.pos + 8];
    const primaryItemId = (pitmVer === 0) ? view.getUint16(pitm.pos + 12) : view.getUint32(pitm.pos + 12);

    // 4. Parse iloc items and find max item ID
    const iloc = children["iloc"];
    const ilocVer = photoBytes[iloc.pos + 8];
    const offLenByte = photoBytes[iloc.pos + 12];
    const offsetSize = (offLenByte >> 4) & 0xF;
    const lengthSize = offLenByte & 0xF;
    const baseIdxByte = photoBytes[iloc.pos + 13];
    const baseOffsetSize = (baseIdxByte >> 4) & 0xF;
    const indexSize = baseIdxByte & 0xF;

    let itemCount;
    let p;
    if (ilocVer < 2) {
      itemCount = view.getUint16(iloc.pos + 14);
      p = iloc.pos + 16;
    } else {
      itemCount = view.getUint32(iloc.pos + 14);
      p = iloc.pos + 18;
    }

    let maxItemId = 0;
    const ilocItems = [];

    for (let i = 0; i < itemCount; i++) {
      let iid;
      if (ilocVer < 2) {
        iid = view.getUint16(p);
        p += 2;
      } else {
        iid = view.getUint32(p);
        p += 4;
      }
      if (iid > maxItemId) maxItemId = iid;

      let cm = 0;
      if (ilocVer === 1 || ilocVer === 2) {
        cm = view.getUint16(p) & 0xF;
        p += 2;
      }
      const drefIdx = view.getUint16(p);
      p += 2;

      let baseOffset = 0;
      if (baseOffsetSize === 4) {
        baseOffset = view.getUint32(p);
        p += 4;
      } else if (baseOffsetSize === 8) {
        const hi = view.getUint32(p);
        const lo = view.getUint32(p + 4);
        baseOffset = hi * 4294967296 + lo;
        p += 8;
      } else if (baseOffsetSize > 0) {
        p += baseOffsetSize;
      }

      const extentCount = view.getUint16(p);
      p += 2;
      const extents = [];

      for (let j = 0; j < extentCount; j++) {
        if ((ilocVer === 1 || ilocVer === 2) && indexSize > 0) {
          p += indexSize;
        }
        let extOffset = 0;
        if (offsetSize === 4) {
          extOffset = view.getUint32(p);
          p += 4;
        } else if (offsetSize === 8) {
          const hi = view.getUint32(p);
          const lo = view.getUint32(p + 4);
          extOffset = hi * 4294967296 + lo;
          p += 8;
        } else {
          p += offsetSize;
        }

        let extLen = 0;
        if (lengthSize === 4) {
          extLen = view.getUint32(p);
          p += 4;
        } else if (lengthSize === 8) {
          const hi = view.getUint32(p);
          const lo = view.getUint32(p + 4);
          extLen = hi * 4294967296 + lo;
          p += 8;
        } else {
          p += lengthSize;
        }
        extents.push({ extOffset, extLen });
      }
      ilocItems.push({ iid, cm, drefIdx, baseOffset, extents });
    }

    const newItemId = maxItemId + 1;

    // 5. Build infe box (41 bytes)
    const mimeType = "application/rdf+xml\0";
    const infeLen = 12 + 2 + 2 + 4 + 1 + mimeType.length; // 41 bytes
    const infeBox = new Uint8Array(infeLen);
    const infeView = new DataView(infeBox.buffer);
    infeView.setUint32(0, infeLen);
    infeBox.set([0x69, 0x6e, 0x66, 0x65], 4); // "infe"
    infeBox[8] = 2; // version 2
    infeBox[9] = 0; infeBox[10] = 0; infeBox[11] = 1; // flags (hidden item = 1)
    infeView.setUint16(12, newItemId);
    infeView.setUint16(14, 0); // item_protection_index = 0
    infeBox.set([0x6d, 0x69, 0x6d, 0x65], 16); // "mime"
    infeBox[20] = 0; // null item_name
    for (let k = 0; k < mimeType.length; k++) {
      infeBox[21 + k] = mimeType.charCodeAt(k);
    }

    // 6. Build cdsc box in iref (14 bytes)
    const cdscLen = 14;
    const cdscBox = new Uint8Array(cdscLen);
    const cdscView = new DataView(cdscBox.buffer);
    cdscView.setUint32(0, cdscLen);
    cdscBox.set([0x63, 0x64, 0x73, 0x63], 4); // "cdsc"
    cdscView.setUint16(8, newItemId);
    cdscView.setUint16(10, 1); // reference_count = 1
    cdscView.setUint16(12, primaryItemId);

    // 7. Calculate total offset shift
    const newIlocEntryLen = (ilocVer < 2 ? 2 : 4) + ((ilocVer === 1 || ilocVer === 2) ? 2 : 0) + 2 + baseOffsetSize + 2 + offsetSize + lengthSize;
    const hasIref = !!children["iref"];
    let metaGrowth = infeBox.length + cdscBox.length + newIlocEntryLen;
    if (!hasIref) metaGrowth += 12; // iref header + ver/flags

    // Prepare new mdat header
    let newMdatHdr;
    const newMdatPayloadLen = xmpBytes.length + (mdat.sz - mdat.hlen);
    if (mdat.hlen === 8 && (newMdatPayloadLen + 8) < 4294967296) {
      newMdatHdr = new Uint8Array(8);
      const dv = new DataView(newMdatHdr.buffer);
      dv.setUint32(0, newMdatPayloadLen + 8);
      newMdatHdr.set([0x6d, 0x64, 0x61, 0x74], 4);
    } else {
      newMdatHdr = new Uint8Array(16);
      const dv = new DataView(newMdatHdr.buffer);
      dv.setUint32(0, 1);
      newMdatHdr.set([0x6d, 0x64, 0x61, 0x74], 4);
      const totalMdatSize = newMdatPayloadLen + 16;
      const hi = Math.floor(totalMdatSize / 4294967296);
      const lo = totalMdatSize >>> 0;
      dv.setUint32(8, hi);
      dv.setUint32(12, lo);
    }

    const mdatHdrGrowth = newMdatHdr.length - mdat.hlen;
    const totalShift = metaGrowth + mdatHdrGrowth + xmpBytes.length;

    // 8. Rebuild iloc
    const ilocHeaderLen = (ilocVer < 2 ? 16 : 18);
    const estIlocLen = iloc.sz + newIlocEntryLen;
    const newIlocBuf = new Uint8Array(estIlocLen + 100);
    const newIlocView = new DataView(newIlocBuf.buffer);

    newIlocBuf.set(photoBytes.subarray(iloc.pos, iloc.pos + 12), 0);
    newIlocBuf[12] = offLenByte;
    newIlocBuf[13] = baseIdxByte;
    if (ilocVer < 2) {
      newIlocView.setUint16(14, itemCount + 1);
    } else {
      newIlocView.setUint32(14, itemCount + 1);
    }

    let wp = ilocHeaderLen;
    for (const it of ilocItems) {
      if (ilocVer < 2) {
        newIlocView.setUint16(wp, it.iid); wp += 2;
      } else {
        newIlocView.setUint32(wp, it.iid); wp += 4;
      }
      if (ilocVer === 1 || ilocVer === 2) {
        newIlocView.setUint16(wp, it.cm); wp += 2;
      }
      newIlocView.setUint16(wp, it.drefIdx); wp += 2;
      if (baseOffsetSize === 4) {
        newIlocView.setUint32(wp, it.baseOffset); wp += 4;
      } else if (baseOffsetSize === 8) {
        const hi = Math.floor(it.baseOffset / 4294967296);
        const lo = it.baseOffset >>> 0;
        newIlocView.setUint32(wp, hi);
        newIlocView.setUint32(wp + 4, lo);
        wp += 8;
      }
      newIlocView.setUint16(wp, it.extents.length); wp += 2;
      for (const ext of it.extents) {
        // construction_method == 1 means offset is within idat (in meta), not mdat
        const newOff = (it.cm === 1) ? ext.extOffset : (ext.extOffset + totalShift);
        if (offsetSize === 4) {
          newIlocView.setUint32(wp, newOff); wp += 4;
        } else if (offsetSize === 8) {
          const hi = Math.floor(newOff / 4294967296);
          const lo = newOff >>> 0;
          newIlocView.setUint32(wp, hi);
          newIlocView.setUint32(wp + 4, lo);
          wp += 8;
        }
        if (lengthSize === 4) {
          newIlocView.setUint32(wp, ext.extLen); wp += 4;
        } else if (lengthSize === 8) {
          const hi = Math.floor(ext.extLen / 4294967296);
          const lo = ext.extLen >>> 0;
          newIlocView.setUint32(wp, hi);
          newIlocView.setUint32(wp + 4, lo);
          wp += 8;
        }
      }
    }

    // Add XMP item in iloc
    const newXmpOffset = (mdat.pos + metaGrowth) + newMdatHdr.length;
    if (ilocVer < 2) {
      newIlocView.setUint16(wp, newItemId); wp += 2;
    } else {
      newIlocView.setUint32(wp, newItemId); wp += 4;
    }
    if (ilocVer === 1 || ilocVer === 2) {
      newIlocView.setUint16(wp, 0); wp += 2;
    }
    newIlocView.setUint16(wp, 0); wp += 2; // dref_idx
    if (baseOffsetSize > 0) {
      wp += baseOffsetSize; // base_offset 0
    }
    newIlocView.setUint16(wp, 1); wp += 2; // extent_count 1
    if (offsetSize === 4) {
      newIlocView.setUint32(wp, newXmpOffset); wp += 4;
    } else if (offsetSize === 8) {
      const hi = Math.floor(newXmpOffset / 4294967296);
      const lo = newXmpOffset >>> 0;
      newIlocView.setUint32(wp, hi);
      newIlocView.setUint32(wp + 4, lo);
      wp += 8;
    }
    if (lengthSize === 4) {
      newIlocView.setUint32(wp, xmpBytes.length); wp += 4;
    } else if (lengthSize === 8) {
      const hi = Math.floor(xmpBytes.length / 4294967296);
      const lo = xmpBytes.length >>> 0;
      newIlocView.setUint32(wp, hi);
      newIlocView.setUint32(wp + 4, lo);
      wp += 8;
    }

    newIlocView.setUint32(0, wp); // set actual iloc size
    const finalIloc = newIlocBuf.subarray(0, wp);

    // 9. Rebuild iinf
    const iinf = children["iinf"];
    const iinfVer = photoBytes[iinf.pos + 8];
    const newIinf = new Uint8Array(iinf.sz + infeBox.length);
    newIinf.set(photoBytes.subarray(iinf.pos, iinf.pos + iinf.sz), 0);
    const newIinfView = new DataView(newIinf.buffer);
    newIinfView.setUint32(0, newIinf.length);
    if (iinfVer === 0) {
      const oc = view.getUint16(iinf.pos + 12);
      newIinfView.setUint16(12, oc + 1);
    } else {
      const oc = view.getUint32(iinf.pos + 12);
      newIinfView.setUint32(12, oc + 1);
    }
    newIinf.set(infeBox, iinf.sz);

    // 10. Rebuild iref
    let finalIref;
    if (hasIref) {
      const iref = children["iref"];
      finalIref = new Uint8Array(iref.sz + cdscBox.length);
      finalIref.set(photoBytes.subarray(iref.pos, iref.pos + iref.sz), 0);
      const irefView = new DataView(finalIref.buffer);
      irefView.setUint32(0, finalIref.length);
      finalIref.set(cdscBox, iref.sz);
    } else {
      finalIref = new Uint8Array(12 + cdscBox.length);
      const irefView = new DataView(finalIref.buffer);
      irefView.setUint32(0, finalIref.length);
      finalIref.set([0x69, 0x72, 0x65, 0x66], 4); // "iref"
      finalIref.set(cdscBox, 12);
    }

    // 11. Assemble new meta
    const metaChildParts = [];
    for (const name of Object.keys(children)) {
      const ch = children[name];
      if (name === "iinf") metaChildParts.push(newIinf);
      else if (name === "iref") metaChildParts.push(finalIref);
      else if (name === "iloc") metaChildParts.push(finalIloc);
      else metaChildParts.push(photoBytes.subarray(ch.pos, ch.pos + ch.sz));
    }
    if (!hasIref) {
      metaChildParts.push(finalIref);
    }

    let totalMetaChildrenLen = 0;
    for (const part of metaChildParts) totalMetaChildrenLen += part.length;

    const newMetaHeaderLen = 12; // 4 size + 4 "meta" + 4 ver/flags
    const newMeta = new Uint8Array(newMetaHeaderLen + totalMetaChildrenLen);
    const newMetaView = new DataView(newMeta.buffer);
    newMetaView.setUint32(0, newMeta.length);
    newMeta.set([0x6d, 0x65, 0x74, 0x61], 4); // "meta"
    let mp = newMetaHeaderLen;
    for (const part of metaChildParts) {
      newMeta.set(part, mp);
      mp += part.length;
    }

    const origMdatPayload = photoBytes.subarray(mdat.pos + mdat.hlen, mdat.pos + mdat.sz);

    // 12. Assemble final bytes
    const finalLen = meta.pos + newMeta.length + newMdatHdr.length + xmpBytes.length + origMdatPayload.length + videoBytes.length;
    const finalBytes = new Uint8Array(finalLen);
    let fp = 0;
    finalBytes.set(photoBytes.subarray(0, meta.pos), fp); fp += meta.pos;
    finalBytes.set(newMeta, fp); fp += newMeta.length;
    finalBytes.set(newMdatHdr, fp); fp += newMdatHdr.length;
    finalBytes.set(xmpBytes, fp); fp += xmpBytes.length;
    finalBytes.set(origMdatPayload, fp); fp += origMdatPayload.length;
    finalBytes.set(videoBytes, fp);

    return new Blob([finalBytes], { type: 'image/heic' });
  }

  // --- Brainless Batch Processing & ZIP Packaging Trigger ---
  convertBtn.addEventListener('click', async () => {
    const totalPairs = matchedPairs.length;
    const totalPassThrough = passThroughFiles.length;
    const totalWork = totalPairs + totalPassThrough;
    if (totalWork === 0) return;

    convertBtn.disabled = true;
    progressCard.classList.add('visible');
    resultsCard.classList.remove('visible');
    qrSection.classList.remove('visible');
    previewCard.classList.remove('visible');
    processedBlobs = [];

    const zip = new JSZip();
    const convertHeic = convertHeicToggle ? convertHeicToggle.checked : false;

    // 1. Process and Mux all Live Photos
    for (let i = 0; i < totalPairs; i++) {
      const pair = matchedPairs[i];
      const percent = Math.round(((i) / totalWork) * 85);
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;

      await new Promise(r => setTimeout(r, 15));

      const photoBuf = new Uint8Array(await pair.photo.arrayBuffer());
      const videoBuf = new Uint8Array(await pair.video.arrayBuffer());

      let muxedBlob;
      let displayPhotoBlob;
      let targetExt;

      if (pair.format === 'heic' && convertHeic) {
        progressDetails.textContent = `Converting HEIC to 100% JPG & Muxing Live Photo ${i + 1} of ${totalPairs}: ${pair.photo.name}...`;
        const { jpegBlob, jpegBuf } = await convertHeicToJpegWithExif(pair.photo, photoBuf);
        muxedBlob = muxJpeg(jpegBuf, videoBuf, 750000, pair.isStarred);
        displayPhotoBlob = jpegBlob;
        targetExt = 'MP.JPG';
      } else if (pair.format === 'heic') {
        progressDetails.textContent = `Muxing Live Photo ${i + 1} of ${totalPairs}: ${pair.photo.name}...`;
        muxedBlob = muxHeic(photoBuf, videoBuf, 750000, pair.isStarred);
        displayPhotoBlob = new Blob([photoBuf], { type: 'image/heic' });
        targetExt = 'MP.HEIC';
      } else {
        progressDetails.textContent = `Muxing Live Photo ${i + 1} of ${totalPairs}: ${pair.photo.name}...`;
        muxedBlob = muxJpeg(photoBuf, videoBuf, 750000, pair.isStarred);
        displayPhotoBlob = new Blob([photoBuf], { type: 'image/jpeg' });
        targetExt = 'MP.JPG';
      }

      const outputFilename = `${pair.stem}.${targetExt}`;
      const zipPath = pair.dir ? `${pair.dir}/${outputFilename}` : outputFilename;

      zip.file(zipPath, muxedBlob);

      processedBlobs.push({
        filename: outputFilename,
        zipPath,
        blob: muxedBlob,
        photoBlob: displayPhotoBlob,
        videoBlob: new Blob([videoBuf], { type: 'video/mp4' })
      });
    }

    // 2. Add all Pass-Through Media (PNGs, videos, standalone photos)
    for (let i = 0; i < totalPassThrough; i++) {
      const item = passThroughFiles[i];
      const completed = totalPairs + i;
      const percent = Math.round((completed / totalWork) * 85);
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;

      if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));

      const fileBuf = await item.file.arrayBuffer();

      if (item.format === 'heic' && convertHeic) {
        progressDetails.textContent = `Converting standalone HEIC ${item.file.name} to 100% JPG...`;
        const { jpegBlob } = await convertHeicToJpegWithExif(item.file, new Uint8Array(fileBuf));
        const newRelativePath = item.relativePath.replace(/\.heic$/i, '.JPG').replace(/\.heif$/i, '.JPG');
        zip.file(newRelativePath, jpegBlob);
      } else {
        progressDetails.textContent = `Bundling media ${i + 1} of ${totalPassThrough}: ${item.file.name}...`;
        zip.file(item.relativePath, fileBuf);
      }
    }

    // 3. Finalize ZIP Package
    progressBar.style.width = '90%';
    progressPercent.textContent = '90%';
    progressDetails.textContent = 'Packing final ZIP archive for Pixel...';
    await new Promise(r => setTimeout(r, 40));

    finalZipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });

    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressDetails.textContent = 'All photos and videos packaged successfully!';

    setTimeout(() => {
      progressCard.classList.remove('visible');
      showResults(finalZipBlob, totalPairs, totalPassThrough);
    }, 400);
  });

  function showResults(zipBlob, numLivePhotos, numOtherMedia) {
    resultsCard.classList.add('visible');
    const zipSizeMb = (zipBlob.size / (1024 * 1024)).toFixed(1);
    
    let summaryText = `🎉 Ready for your Pixel! Converted ${numLivePhotos} Live Photos to Google Motion Photos`;
    if (numOtherMedia > 0) {
      summaryText += ` and preserved ${numOtherMedia} other media files`;
    }
    summaryText += ` (${zipSizeMb} MB total).`;

    successMessage.textContent = summaryText;
    downloadZipBtn.textContent = `📦 Download Pixel Package (${zipSizeMb} MB)`;

    // Setup Preview for the first converted Motion Photo
    if (processedBlobs.length > 0) {
      setupPreview(processedBlobs[0]);
    }
  }

  // --- Download ZIP Handler ---
  downloadZipBtn.addEventListener('click', () => {
    if (!finalZipBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(finalZipBlob);
    a.download = `Pixel_MotionPhotos_${Date.now()}.zip`;
    a.click();
  });

  // --- Direct Wi-Fi Download via QR Code ---
  showQrBtn.addEventListener('click', async () => {
    if (!finalZipBlob) return;

    qrSection.classList.add('visible');
    qrSection.scrollIntoView({ behavior: 'smooth' });

    qrCodeBox.innerHTML = '<span style="color:#64748b; font-size:12px;">Generating QR Code...</span>';
    if (qrTransferStatus) {
      qrTransferStatus.textContent = 'Preparing Wi-Fi download link...';
    }

    try {
      const response = await fetch('/api/bundle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          'X-Filename': `Pixel_MotionPhotos_${Date.now()}.zip`
        },
        body: finalZipBlob
      });

      if (response.ok) {
        const data = await response.json();
        renderQrCode(data.downloadUrl);
        qrUrlEl.textContent = data.downloadUrl;
        if (qrTransferStatus) {
          qrTransferStatus.innerHTML = '<span style="color: #34d399; font-weight: 500;">📶 Connect your phone to the same Wi-Fi and scan to download!</span>';
        }
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (err) {
      console.warn('Local bridge server upload failed:', err);
      qrCodeBox.innerHTML = '<div style="color: #f87171; font-size: 13px; padding: 12px; line-height: 1.5; max-width: 320px;"><strong>Local Server Required for Mobile Transfer</strong><br><br>Make sure <code>node web/server.js</code> is running in your terminal, and open <strong>http://localhost:3000</strong> in your computer\'s browser.</div>';
      qrUrlEl.textContent = 'http://localhost:3000';
      if (qrTransferStatus) {
        qrTransferStatus.innerHTML = '<span style="color: #94a3b8;">Or tap <strong>Download Pixel Package</strong> above to save directly on this computer.</span>';
      }
    }
  });

  function renderQrCode(url) {
    qrCodeBox.innerHTML = '';
    new QRCode(qrCodeBox, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#0a0d14',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  copyLinkBtn.addEventListener('click', () => {
    const text = qrUrlEl.textContent;
    if (text) {
      navigator.clipboard.writeText(text);
      copyLinkBtn.textContent = '✓ Copied!';
      setTimeout(() => copyLinkBtn.textContent = '📋 Copy Link', 2000);
    }
  });

  // --- Interactive Motion Player Preview ---
  let isMotionPlaying = false;
  function setupPreview(item) {
    previewCard.classList.add('visible');
    previewTitle.textContent = `Motion Photo Preview: ${item.filename}`;

    const photoUrl = URL.createObjectURL(item.photoBlob);
    const videoUrl = URL.createObjectURL(item.videoBlob);

    previewImg.src = photoUrl;
    previewVid.src = videoUrl;

    previewImg.style.display = 'block';
    previewVid.style.display = 'none';
    isMotionPlaying = false;
    motionToggle.querySelector('span').textContent = '▶ MOTION';

    motionToggle.onclick = () => {
      isMotionPlaying = !isMotionPlaying;
      if (isMotionPlaying) {
        previewImg.style.display = 'none';
        previewVid.style.display = 'block';
        previewVid.play();
        motionToggle.querySelector('span').textContent = '⏹ STILL';
      } else {
        previewVid.pause();
        previewVid.currentTime = 0;
        previewVid.style.display = 'none';
        previewImg.style.display = 'block';
        motionToggle.querySelector('span').textContent = '▶ MOTION';
      }
    };
  }
});

