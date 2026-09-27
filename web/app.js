// LivePhotoBridge Web — Client-side Muxing & Sharing Engine
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const selectFilesBtn = document.getElementById('selectFilesBtn');
  const selectFolderBtn = document.getElementById('selectFolderBtn');
  
  const statsBar = document.getElementById('statsBar');
  const photoCountEl = document.getElementById('photoCount');
  const videoCountEl = document.getElementById('videoCount');
  const matchCountEl = document.getElementById('matchCount');
  const clearBtn = document.getElementById('clearBtn');
  
  const pairsContainer = document.getElementById('pairsContainer');
  const pairsList = document.getElementById('pairsList');
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
  let loadedFiles = new Map(); // key (base stem) -> { photo: File, video: File }
  let matchedPairs = [];       // array of { base, photo: File, video: File, format: 'heic'|'jpeg' }
  let processedBlobs = [];     // array of { filename, blob, photoBlob, videoBlob }
  let finalZipBlob = null;
  let qrCodeInstance = null;
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
          if (entry) await traverseFileTree(entry, files);
        } else {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
    } else if (e.dataTransfer.files) {
      for (const f of e.dataTransfer.files) files.push(f);
    }

    handleIncomingFiles(files);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleIncomingFiles(Array.from(e.target.files));
    }
  });

  folderInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleIncomingFiles(Array.from(e.target.files));
    }
  });

  clearBtn.addEventListener('click', () => {
    loadedFiles.clear();
    matchedPairs = [];
    processedBlobs = [];
    finalZipBlob = null;
    updateUI();
  });

  async function traverseFileTree(item, fileList) {
    if (item.isFile) {
      const file = await new Promise(r => item.file(r));
      fileList.push(file);
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const entries = await new Promise(r => dirReader.readEntries(r));
      for (const entry of entries) {
        await traverseFileTree(entry, fileList);
      }
    }
  }

  function getBaseStem(name) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1) return name.toUpperCase();
    return name.substring(0, lastDot).toUpperCase();
  }

  function getExtension(name) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1) return '';
    return name.substring(lastDot + 1).toLowerCase();
  }

  function isPhoto(ext) {
    return ['heic', 'heif', 'jpg', 'jpeg'].includes(ext);
  }

  function isVideo(ext) {
    return ['mov', 'mp4'].includes(ext);
  }

  function handleIncomingFiles(fileList) {
    for (const file of fileList) {
      const ext = getExtension(file.name);
      const stem = getBaseStem(file.name);

      if (!loadedFiles.has(stem)) {
        loadedFiles.set(stem, { photo: null, video: null });
      }

      const entry = loadedFiles.get(stem);
      if (isPhoto(ext)) entry.photo = file;
      else if (isVideo(ext)) entry.video = file;
    }

    recalculatePairs();
  }

  function recalculatePairs() {
    matchedPairs = [];
    let photoCount = 0;
    let videoCount = 0;

    for (const [stem, entry] of loadedFiles.entries()) {
      if (entry.photo) photoCount++;
      if (entry.video) videoCount++;

      if (entry.photo && entry.video) {
        const ext = getExtension(entry.photo.name);
        const format = (ext === 'heic' || ext === 'heif') ? 'heic' : 'jpeg';
        matchedPairs.push({
          stem,
          photo: entry.photo,
          video: entry.video,
          format
        });
      }
    }

    photoCountEl.textContent = photoCount;
    videoCountEl.textContent = videoCount;
    matchCountEl.textContent = matchedPairs.length;

    renderPairsList();
    updateUI();
  }

  function renderPairsList() {
    pairsList.innerHTML = '';
    matchedPairs.forEach((pair) => {
      const row = document.createElement('div');
      row.className = 'pair-row';
      const photoSize = (pair.photo.size / (1024 * 1024)).toFixed(1);
      const videoSize = (pair.video.size / (1024 * 1024)).toFixed(1);

      row.innerHTML = `
        <div class="pair-info">
          <span class="pair-badge ${pair.format}">${pair.format}</span>
          <div>
            <div class="pair-name">${pair.photo.name}</div>
            <div class="pair-details">Photo: ${photoSize} MB + Video: ${videoSize} MB</div>
          </div>
        </div>
        <div class="pair-status">Ready to Mux</div>
      `;
      pairsList.appendChild(row);
    });
  }

  function updateUI() {
    const hasFiles = loadedFiles.size > 0;
    const hasPairs = matchedPairs.length > 0;

    statsBar.classList.toggle('visible', hasFiles);
    pairsContainer.classList.toggle('visible', hasPairs);
    convertBtn.disabled = !hasPairs;

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

  // --- Batch Conversion Trigger ---
  convertBtn.addEventListener('click', async () => {
    if (matchedPairs.length === 0) return;

    convertBtn.disabled = true;
    progressCard.classList.add('visible');
    resultsCard.classList.remove('visible');
    qrSection.classList.remove('visible');
    previewCard.classList.remove('visible');
    processedBlobs = [];

    const zip = new JSZip();
    const total = matchedPairs.length;

    for (let i = 0; i < total; i++) {
      const pair = matchedPairs[i];
      const percent = Math.round(((i) / total) * 90);
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressDetails.textContent = `Muxing pair ${i + 1} of ${total}: ${pair.photo.name}...`;

      // Yield event loop so UI stays snappy
      await new Promise(r => setTimeout(r, 20));

      const photoBuf = new Uint8Array(await pair.photo.arrayBuffer());
      const videoBuf = new Uint8Array(await pair.video.arrayBuffer());

      let muxedBlob;
      let outputName;

      if (pair.format === 'heic') {
        muxedBlob = muxHeic(photoBuf, videoBuf);
        outputName = `${pair.photo.name.replace(/\.[^/.]+$/, "")}.MP.HEIC`;
      } else {
        muxedBlob = muxJpeg(photoBuf, videoBuf);
        outputName = `${pair.photo.name.replace(/\.[^/.]+$/, "")}.MP.JPG`;
      }

      zip.file(outputName, muxedBlob);

      processedBlobs.push({
        filename: outputName,
        blob: muxedBlob,
        photoBlob: new Blob([photoBuf], { type: pair.format === 'heic' ? 'image/heic' : 'image/jpeg' }),
        videoBlob: new Blob([videoBuf], { type: 'video/mp4' })
      });
    }

    progressBar.style.width = '95%';
    progressPercent.textContent = '95%';
    progressDetails.textContent = 'Generating final ZIP bundle...';
    await new Promise(r => setTimeout(r, 40));

    finalZipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });

    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressDetails.textContent = 'Done!';

    setTimeout(() => {
      progressCard.classList.remove('visible');
      showResults(finalZipBlob);
    }, 400);
  });

  function showResults(zipBlob) {
    resultsCard.classList.add('visible');
    const zipSizeMb = (zipBlob.size / (1024 * 1024)).toFixed(2);
    successMessage.textContent = `🎉 Successfully converted ${processedBlobs.length} Motion Photos (${zipSizeMb} MB)!`;
    downloadZipBtn.textContent = `📦 Download ZIP (${zipSizeMb} MB)`;

    // Setup Preview for the first converted photo
    if (processedBlobs.length > 0) {
      setupPreview(processedBlobs[0]);
    }
  }

  // --- Download ZIP Handler ---
  downloadZipBtn.addEventListener('click', () => {
    if (!finalZipBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(finalZipBlob);
    a.download = `LivePhotoBridge_MotionPhotos_${Date.now()}.zip`;
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
          'X-Filename': `LivePhotoBridge_${Date.now()}.zip`
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
      qrUrlEl.textContent = `${fallbackUrl} (Open on your phone to convert directly)`;
    }
  });

  function renderQrCode(url) {
    qrCodeBox.innerHTML = '';
    qrCodeInstance = new QRCode(qrCodeBox, {
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
    previewTitle.textContent = `Preview: ${item.filename}`;

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
