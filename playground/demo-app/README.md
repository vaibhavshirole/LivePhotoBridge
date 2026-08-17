# LivePhotoBridge — Motion Photo Demo App

This demo demonstrates creating native Google Motion Photos from Apple Live Photo pairs with dual XMP tags (`MicroVideo` + `MotionPhoto`).

---

## 1. Web Demo (In-Browser)

A zero-dependency, interactive web application that runs 100% in your browser.

### How to Run:
1. Double-click [`index.html`](file:///Users/vaibhav/Developer/projects/PhotoMuxer/demo-app/index.html) to open it directly in Chrome / Safari / Edge, or run a local web server:
   ```bash
   python3 -m http.server 3000 -d demo-app
   ```
2. Open `http://localhost:3000` in your browser.

### Features:
- **⚡ Load Demo Sample Pair:** Generates a synthetic photo + animated video clip on the fly for instant testing.
- **Drag & Drop:** Drop your `.heic`/`.jpg` photo and `.mov`/`.mp4` video pair.
- **Live Motion Photo Player:** Hover / click **"▶ MOTION"** to preview the live photo playing in real time.
- **Binary Structure Map:** Visual representation of the injected XMP header and video offset.
- **⬇️ Download:** Export the combined `.MP.jpg` motion photo directly from browser memory.

---

## 2. Native CLI Demo (Python)

A minimal script demonstrating the **Tag-First-Append-Second** pipeline for both `.heic` and `.jpg` files.

### How to Run:
```bash
python3 demo-app/demo_cli.py <photo.heic|photo.jpg> <video.mov|video.mp4> [output_path]
```

### Example:
```bash
python3 demo-app/demo_cli.py IMG_3009.HEIC IMG_3009.MOV ./IMG_3009.MP.heic
```
