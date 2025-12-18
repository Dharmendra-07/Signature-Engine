# Signature Injection Engine

A full-stack MERN application that bridges the gap between browser coordinates and PDF coordinates, enabling precise signature field placement on legal documents.

## 🎯 Problem Statement

Web browsers and PDF files speak different coordinate systems:
- **Browsers**: CSS pixels, top-left origin, responsive
- **PDFs**: Points (72 DPI), bottom-left origin, static dimensions

This engine solves the coordinate transformation challenge while maintaining visual accuracy across all screen sizes.

## 🏗️ Architecture

### Frontend (React + PDF.js)
- Responsive PDF viewer using `react-pdf`
- Drag-and-drop interface for field placement
- **Percentage-based coordinate storage** (the key to responsiveness)
- Real-time field resizing with corner handles

### Backend (Node.js + Express + pdf-lib)
- PDF manipulation and signature embedding
- Coordinate transformation from percentage to PDF points
- Aspect ratio preservation for images
- SHA-256 hash generation for audit trail

### Database (MongoDB)
- Document audit trail storage
- Original and signed PDF hashes
- Timestamp and metadata tracking

## 🔑 Core Mathematical Solution

### The Coordinate Transformation Algorithm

```javascript
/**
 * Frontend: Store coordinates as percentages
 * This makes fields resolution-independent
 */
function pixelToPercentage(pixelX, pixelY, pixelWidth, pixelHeight) {
  const actualX = pixelX / scale;  // Remove viewport scaling
  const actualY = pixelY / scale;
  const actualWidth = pixelWidth / scale;
  const actualHeight = pixelHeight / scale;

  // Convert to percentage of PDF dimensions
  return {
    x: (actualX / pdfPageWidth) * 100,
    y: (actualY / pdfPageHeight) * 100,
    width: (actualWidth / pdfPageWidth) * 100,
    height: (actualHeight / pdfPageHeight) * 100
  };
}

/**
 * Backend: Transform percentages to PDF points
 * Handle origin transformation (top-left to bottom-left)
 */
function transformCoordinatesToPDF(percentCoords, pdfPageDimensions) {
  // Step 1: Convert percentage to points
  const xPoints = (percentCoords.x / 100) * pdfPageDimensions.width;
  const yPointsFromTop = (percentCoords.y / 100) * pdfPageDimensions.height;
  const widthPoints = (percentCoords.width / 100) * pdfPageDimensions.width;
  const heightPoints = (percentCoords.height / 100) * pdfPageDimensions.height;

  // Step 2: Transform Y-axis (Browser: top-left, PDF: bottom-left)
  const yPointsFromBottom = pdfPageDimensions.height - yPointsFromTop - heightPoints;

  return {
    x: xPoints,
    y: yPointsFromBottom,
    width: widthPoints,
    height: heightPoints
  };
}
```

### Why This Works

1. **Resolution Independence**: By storing percentages instead of pixels, fields maintain their relative position regardless of screen size
2. **Origin Transformation**: The Y-axis flip ensures coordinates map correctly between coordinate systems
3. **Scale Awareness**: Frontend recalculates pixel positions based on current viewport scale
4. **PDF Points**: Backend converts to PDF's 72 DPI point system for precise rendering

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### Backend Setup

```bash
cd backend
npm install

# Create .env file
echo "MONGODB_URI=mongodb://localhost:27017/signature_engine" > .env
echo "PORT=5000" >> .env

# Start server
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install

# Create .env file
echo "REACT_APP_API_URL=http://localhost:5000" > .env

# Start development server
npm start
```

## 🚀 Features Implemented

### ✅ Responsive Editor
- [x] PDF rendering with PDF.js
- [x] Drag-and-drop field placement
- [x] Five field types: Text, Signature, Image, Date, Radio
- [x] Resizable fields with corner handles
- [x] **Responsive positioning** - fields stay anchored across viewport changes

### ✅ Backend Processing
- [x] `/sign-pdf` endpoint for PDF processing
- [x] Signature image embedding with aspect ratio preservation
- [x] Text field rendering
- [x] Date field support
- [x] Radio button rendering

### ✅ Security & Audit Trail
- [x] SHA-256 hash calculation before signing
- [x] SHA-256 hash calculation after signing
- [x] MongoDB storage of audit trail
- [x] `/verify-hash` endpoint for verification

## 🎮 How to Use

1. **Upload PDF**: Click "Upload PDF" and select your document
2. **Add Fields**: Drag field types from the left sidebar onto the PDF
3. **Position & Resize**: Click and drag fields to position, use corner handles to resize
4. **Fill Fields**: 
   - Text: Type directly in the sidebar
   - Signature: Click "Draw Signature" and draw with mouse
   - Date: Use date picker
   - Radio: Check/uncheck in sidebar
5. **Sign PDF**: Click "Sign PDF" to process and download

## 🧪 Testing Responsiveness

### Desktop to Mobile Test
1. Place fields on PDF in desktop view
2. Open Chrome DevTools (F12)
3. Toggle Device Toolbar (Ctrl+Shift+M)
4. Switch between devices (iPhone, iPad, Desktop)
5. **Observe**: Fields maintain their position relative to PDF content

### The Math Behind It
```
# When viewport changes:
1. Scale factor updates: scale = containerWidth / pdfPageWidth
2. Fields re-render: pixelPosition = (percentage / 100) * pdfDimension * scale
3. Visual position remains constant relative to PDF content
```

## 📊 Aspect Ratio Algorithm

When embedding images (signatures) that don't match the box dimensions:

```javascript
function calculateAspectRatioFit(boxWidth, boxHeight, imgWidth, imgHeight) {
  const boxRatio = boxWidth / boxHeight;
  const imgRatio = imgWidth / imgHeight;

  if (imgRatio > boxRatio) {
    // Image wider - fit to width
    return {
      width: boxWidth,
      height: boxWidth / imgRatio,
      offsetX: 0,
      offsetY: (boxHeight - boxWidth / imgRatio) / 2
    };
  } else {
    // Image taller - fit to height
    return {
      width: boxHeight * imgRatio,
      height: boxHeight,
      offsetX: (boxWidth - boxHeight * imgRatio) / 2,
      offsetY: 0
    };
  }
}
```

This ensures:
- No image distortion
- Image centered in box
- Maintains original aspect ratio

## 🔐 Security Features

### Audit Trail
Every PDF signing operation creates an audit record:
```javascript
{
  originalHash: "sha256_hash_of_original",
  signedHash: "sha256_hash_of_signed",
  timestamp: "2024-01-15T10:30:00Z",
  metadata: {
    originalFilename: "contract.pdf",
    fieldsApplied: 3
  }
}
```

### Verification
```bash
curl -X POST http://localhost:5000/verify-hash \
  -H "Content-Type: application/json" \
  -d '{"hash": "abc123..."}'
```

## 📁 Project Structure

```
signature-engine/
├── backend/
│   ├── server.js              # Express server & core logic
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Main React component
│   │   └── index.js
│   ├── package.json
│   └── .env
└── README.md
```

## 🚢 Deployment

### Frontend (Vercel)
```bash
cd frontend
npm run build
vercel --prod
```

### Backend (Render)
1. Create new Web Service on Render
2. Connect GitHub repository
3. Build command: `cd backend && npm install`
4. Start command: `node backend/server.js`
5. Add environment variables: `MONGODB_URI`

## 🎥 Video Walkthrough Script

**[0:00-0:30] Demo**
- Upload sample contract PDF
- Drag signature and text fields onto document
- Draw signature in modal
- Resize fields using corner handles
- Test responsiveness by switching viewport sizes
- Click "Sign PDF" and download result

**[0:30-2:00] Code Walkthrough**
- Open `server.js` → Show `transformCoordinatesToPDF` function
- Explain percentage to points conversion
- Explain Y-axis origin transformation
- Show aspect ratio calculation function
- Display MongoDB audit trail

**[2:00-3:00] Technical Deep Dive**
- Open browser DevTools → Show coordinate calculations
- Toggle device sizes → Demonstrate fields staying anchored
- Open signed PDF → Show signature rendered at exact location
- Show console logs of hash generation

## 🔬 Technical Decisions

### Why Percentages?
Absolute pixel coordinates break on different screen sizes. Percentages provide resolution independence.

### Why Bottom-Left Transformation?
PDF specification uses Cartesian coordinates (bottom-left origin). Browsers use screen coordinates (top-left origin). The transformation:
```
pdfY = pageHeight - browserY - elementHeight
```

### Why pdf-lib?
- Pure JavaScript (no native dependencies)
- Excellent TypeScript support
- Handles complex PDF operations
- Active maintenance

## 🐛 Known Limitations

1. **Single Page**: Currently only processes page 1 (can be extended)
2. **File Size**: Large PDFs may take time to process
3. **Font Embedding**: Text fields use default PDF fonts

## 🎯 Future Enhancements

- [ ] Multi-page support
- [ ] Custom font selection
- [ ] Form field validation
- [ ] Bulk signing workflow
- [ ] Mobile touch support for signature drawing
- [ ] Real-time collaboration

## 📚 Key Learnings

1. **Coordinate Systems Matter**: Browser vs PDF coordinate systems require careful transformation
2. **Percentage-Based Positioning**: The key to responsive design in PDF context
3. **Aspect Ratio Preservation**: Critical for professional-looking signatures
4. **Audit Trail**: Essential for legal document workflows

## 🤝 API Endpoints

### POST /sign-pdf
**Request:**
```javascript
FormData {
  pdf: File,
  data: JSON.stringify({
    fields: [{
      id, type, coordinates: {x, y, width, height},
      value, imageData, checked
    }],
    pdfDimensions: {width, height}
  })
}
```

**Response:**
```
Content-Type: application/pdf
X-Original-Hash: sha256...
X-Signed-Hash: sha256...
[PDF Binary Data]
```

### POST /verify-hash
**Request:**
```json
{
  "hash": "sha256_hash_string"
}
```

**Response:**
```json
{
  "found": true,
  "originalHash": "...",
  "signedHash": "...",
  "timestamp": "...",
  "metadata": {...}
}
```

## 💡 Core Innovation

The breakthrough is **storing coordinates as percentages** rather than pixels. This single decision:
- Makes fields resolution-independent
- Enables responsive positioning
- Simplifies coordinate transformation
- Maintains visual accuracy across devices

---

**Built with ❤️ for BoloForms Assignment**

*Developer: Dharmendra Kumar* 
*Tech Stack: MongoDB, Express, React, Node.js, PDF.js, pdf-lib*
