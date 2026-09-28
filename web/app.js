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

  // Event Handlers for File Selection
  selectFilesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  selectFolderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    folderInput.click();
  });

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
    }
  });

  folderInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      for (const f of files) {
        f.customRelativePath = f.webkitRelativePath || f.name;
      }
      handleIncomingFiles(files);
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

        matchedPairs.push({
          dir: photoItem.parts.dir,
          stem: photoItem.parts.stem,
          photo: photoItem.file,
          video: videoItem.file,
          format,
          relativePhotoPath: photoItem.relPath
        });

        // If there were extra photos or videos with identical stem in same dir, pass them through
        for (let i = 1; i < group.photos.length; i++) {
          passThroughFiles.push({ file: group.photos[i].file, relativePath: group.photos[i].relPath, label: 'Photo' });
        }
        for (let i = 1; i < group.videos.length; i++) {
          passThroughFiles.push({ file: group.videos[i].file, relativePath: group.videos[i].relPath, label: 'Video' });
        }
      } else {
        // No match: Pass everything in this group through unmodified
        for (const p of group.photos) {
          passThroughFiles.push({ file: p.file, relativePath: p.relPath, label: 'Photo (Single)' });
        }
        for (const v of group.videos) {
          passThroughFiles.push({ file: v.file, relativePath: v.relPath, label: 'Video (Standalone)' });
        }
      }

      // Add other non-live files (PNGs, GIFs, existing Motion Photos, metadata)
      for (const o of group.others) {
        passThroughFiles.push({ file: o.file, relativePath: o.relPath, label: o.parts.ext.toUpperCase() || 'File' });
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

    // 1. Render Matched Live Photos
    if (matchedPairs.length > 0) {
      const header = document.createElement('div');
      header.style.cssText = 'font-size: 12px; font-weight: 700; color: #60a5fa; text-transform: uppercase; margin-top: 4px;';
      header.textContent = `⚡ Live Photos to Convert (${matchedPairs.length})`;
      pairsList.appendChild(header);

      matchedPairs.slice(0, 15).forEach((pair) => {
        const row = document.createElement('div');
        row.className = 'pair-row';
        const photoSize = (pair.photo.size / (1024 * 1024)).toFixed(1);
        const videoSize = (pair.video.size / (1024 * 1024)).toFixed(1);

        row.innerHTML = `
          <div class="pair-info">
            <span class="pair-badge ${pair.format}">${pair.format}</span>
            <div>
              <div class="pair-name">${pair.relativePhotoPath}</div>
              <div class="pair-details">Live Photo: ${photoSize} MB + Motion: ${videoSize} MB</div>
            </div>
          </div>
          <div class="pair-status">➔ .MP.${pair.format.toUpperCase()}</div>
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

        row.innerHTML = `
          <div class="pair-info">
            <span class="pair-badge passthrough">${item.label}</span>
            <div>
              <div class="pair-name">${item.relativePath}</div>
              <div class="pair-details">${sizeMb} MB • Included as-is</div>
            </div>
          </div>
          <div class="pair-status" style="color: var(--text-muted);">Pass-Through</div>
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
    if (actionBar) actionBar.classList.toggle('visible', hasFiles);
    pairsContainer.classList.toggle('visible', hasFiles);
    convertBtn.disabled = !hasFiles;

    if (matchedPairs.length > 0) {
      convertBtn.innerHTML = `<span>✨ Convert & Package for Pixel (${totalItems} items)</span>`;
    } else {
      convertBtn.innerHTML = `<span>📦 Package ${totalItems} items for Pixel</span>`;
    }

    // Reset results on new changes
    resultsCard.classList.remove('visible');
    qrSection.classList.remove('visible');
    previewCard.classList.remove('visible');
  }

  // --- Core Muxing Engine ---
  function buildGCameraXmp(videoOffset, ptsUs = 750000) {
    return `<?xpacket begin='﻿' id='W5M0MpCehiHzreSzNTczkc9d'?>
<x:xmpmeta xmlns:x='adobe:ns:meta/'>
<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>
 <rdf:Description rdf:about='' xmlns:GCamera='http://ns.google.com/photos/1.0/camera/'>
  <GCamera:MicroVideo>1</GCamera:MicroVideo>
  <GCamera:MicroVideoOffset>${videoOffset}</GCamera:MicroVideoOffset>
  <GCamera:MicroVideoPresentationTimestampUs>${ptsUs}</GCamera:MicroVideoPresentationTimestampUs>
  <GCamera:MicroVideoVersion>1</GCamera:MicroVideoVersion>
  <GCamera:MotionPhoto>1</GCamera:MotionPhoto>
  <GCamera:MotionPhotoPresentationTimestampUs>${ptsUs}</GCamera:MotionPhotoPresentationTimestampUs>
  <GCamera:MotionPhotoVersion>1</GCamera:MotionPhotoVersion>
 </rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end='w'?>`;
  }

  function muxJpeg(photoBytes, videoBytes, ptsUs = 750000) {
    const xmpXml = buildGCameraXmp(videoBytes.length, ptsUs);
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

  function muxHeic(photoBytes, videoBytes, ptsUs = 750000) {
    const xmpXml = buildGCameraXmp(videoBytes.length, ptsUs);
    const encoder = new TextEncoder();
    const xmlBytes = encoder.encode(xmpXml);

    // Standard Adobe XMP UUID for ISOBMFF / MP4 / QuickTime:
    // BE 7A CF CB 97 A9 42 E8 9C 71 99 94 91 E3 AF AC
    const xmpUuid = new Uint8Array([
      0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8,
      0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac
    ]);

    const boxLength = 8 + 16 + xmlBytes.length;
    const uuidBox = new Uint8Array(boxLength);
    uuidBox[0] = (boxLength >> 24) & 0xFF;
    uuidBox[1] = (boxLength >> 16) & 0xFF;
    uuidBox[2] = (boxLength >> 8) & 0xFF;
    uuidBox[3] = boxLength & 0xFF;
    uuidBox[4] = 0x75; // 'u'
    uuidBox[5] = 0x75; // 'u'
    uuidBox[6] = 0x69; // 'i'
    uuidBox[7] = 0x64; // 'd'
    uuidBox.set(xmpUuid, 8);
    uuidBox.set(xmlBytes, 24);

    // Read ftyp box length to insert right after ftyp
    const ftypLen = (photoBytes[0] << 24) | (photoBytes[1] << 16) | (photoBytes[2] << 8) | photoBytes[3];
    const insertPos = (ftypLen > 0 && ftypLen < photoBytes.length) ? ftypLen : 0;

    const taggedPhoto = new Uint8Array(photoBytes.length + uuidBox.length);
    taggedPhoto.set(photoBytes.subarray(0, insertPos), 0);
    taggedPhoto.set(uuidBox, insertPos);
    taggedPhoto.set(photoBytes.subarray(insertPos), insertPos + uuidBox.length);

    // Concatenate [Tagged HEIC] + [Video Bytes]
    const finalBytes = new Uint8Array(taggedPhoto.length + videoBytes.length);
    finalBytes.set(taggedPhoto, 0);
    finalBytes.set(videoBytes, taggedPhoto.length);

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

    // 1. Process and Mux all Live Photos
    for (let i = 0; i < totalPairs; i++) {
      const pair = matchedPairs[i];
      const percent = Math.round(((i) / totalWork) * 85);
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressDetails.textContent = `Muxing Live Photo ${i + 1} of ${totalPairs}: ${pair.photo.name}...`;

      await new Promise(r => setTimeout(r, 15));

      const photoBuf = new Uint8Array(await pair.photo.arrayBuffer());
      const videoBuf = new Uint8Array(await pair.video.arrayBuffer());

      let muxedBlob;
      const targetExt = pair.format === 'heic' ? 'MP.HEIC' : 'MP.JPG';
      const outputFilename = `${pair.stem}.${targetExt}`;
      const zipPath = pair.dir ? `${pair.dir}/${outputFilename}` : outputFilename;

      if (pair.format === 'heic') {
        muxedBlob = muxHeic(photoBuf, videoBuf);
      } else {
        muxedBlob = muxJpeg(photoBuf, videoBuf);
      }

      zip.file(zipPath, muxedBlob);

      processedBlobs.push({
        filename: outputFilename,
        zipPath,
        blob: muxedBlob,
        photoBlob: new Blob([photoBuf], { type: pair.format === 'heic' ? 'image/heic' : 'image/jpeg' }),
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
      progressDetails.textContent = `Bundling media ${i + 1} of ${totalPassThrough}: ${item.file.name}...`;

      if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));

      const fileBuf = await item.file.arrayBuffer();
      zip.file(item.relativePath, fileBuf);
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

  // --- QR Code Mobile Sharing ---
  showQrBtn.addEventListener('click', async () => {
    if (!finalZipBlob) return;

    qrSection.classList.add('visible');
    qrSection.scrollIntoView({ behavior: 'smooth' });

    qrCodeBox.innerHTML = '<span style="color:#64748b; font-size:12px;">Generating QR Code...</span>';

    try {
      // If server is active, upload bundle to get local Wi-Fi download link
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
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      // Fallback for static browser preview without backend
      const fallbackUrl = window.location.href;
      renderQrCode(fallbackUrl);
      qrUrlEl.textContent = `${fallbackUrl} (Open directly on your phone)`;
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
