const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PDFDocument, rgb } = require('pdf-lib');
const crypto = require('crypto');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/signature_engine', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// MongoDB Schema
const SignatureSchema = new mongoose.Schema({
  originalHash: String,
  signedHash: String,
  timestamp: { type: Date, default: Date.now },
  metadata: {
    originalFilename: String,
    fieldsApplied: Number
  }
});

const Signature = mongoose.model('Signature', SignatureSchema);

// Utility: Calculate SHA-256 hash
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * CORE COORDINATE TRANSFORMATION FUNCTION
 * This is the mathematical heart of the engine
 * 
 * Converts percentage-based coordinates from frontend to PDF points
 * 
 * @param {Object} percentCoords - { x: %, y: %, width: %, height: % }
 * @param {Object} pdfPageDimensions - { width: points, height: points }
 * @returns {Object} - PDF coordinates in points with bottom-left origin
 */
function transformCoordinatesToPDF(percentCoords, pdfPageDimensions) {
  const { x: xPercent, y: yPercent, width: widthPercent, height: heightPercent } = percentCoords;
  const { width: pageWidth, height: pageHeight } = pdfPageDimensions;

  // Step 1: Convert percentage to points (based on PDF dimensions)
  const xPoints = (xPercent / 100) * pageWidth;
  const yPointsFromTop = (yPercent / 100) * pageHeight;
  const widthPoints = (widthPercent / 100) * pageWidth;
  const heightPoints = (heightPercent / 100) * pageHeight;

  // Step 2: Transform Y-coordinate from top-left to bottom-left origin
  // Browser uses top-left as (0,0), PDF uses bottom-left as (0,0)
  const yPointsFromBottom = pageHeight - yPointsFromTop - heightPoints;

  return {
    x: xPoints,
    y: yPointsFromBottom,
    width: widthPoints,
    height: heightPoints
  };
}

/**
 * Maintain aspect ratio when embedding images
 * Ensures image fits within box without distortion
 * 
 * @param {Number} boxWidth - Available width in points
 * @param {Number} boxHeight - Available height in points
 * @param {Number} imgWidth - Original image width
 * @param {Number} imgHeight - Original image height
 * @returns {Object} - { width, height, offsetX, offsetY } for centering
 */
function calculateAspectRatioFit(boxWidth, boxHeight, imgWidth, imgHeight) {
  const boxRatio = boxWidth / boxHeight;
  const imgRatio = imgWidth / imgHeight;

  let finalWidth, finalHeight, offsetX = 0, offsetY = 0;

  if (imgRatio > boxRatio) {
    // Image is wider - fit to width
    finalWidth = boxWidth;
    finalHeight = boxWidth / imgRatio;
    offsetY = (boxHeight - finalHeight) / 2;
  } else {
    // Image is taller - fit to height
    finalHeight = boxHeight;
    finalWidth = boxHeight * imgRatio;
    offsetX = (boxWidth - finalWidth) / 2;
  }

  return { width: finalWidth, height: finalHeight, offsetX, offsetY };
}

// API Endpoint: Sign PDF
app.post('/sign-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const { fields, pdfDimensions } = JSON.parse(req.body.data);
    const pdfBuffer = req.file.buffer;

    // Calculate hash of original PDF
    const originalHash = calculateHash(pdfBuffer);
    console.log('Original PDF Hash:', originalHash);

    // Load PDF
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    
    // Get actual PDF page dimensions
    const { width: pageWidth, height: pageHeight } = firstPage.getSize();
    console.log('PDF Page Dimensions:', { pageWidth, pageHeight });

    // Process each field
    for (const field of fields) {
      // Transform coordinates from percentage to PDF points
      const pdfCoords = transformCoordinatesToPDF(
        field.coordinates,
        { width: pageWidth, height: pageHeight }
      );

      console.log(`Field ${field.type}:`, {
        input: field.coordinates,
        output: pdfCoords
      });

      // Handle different field types
      switch (field.type) {
        case 'signature':
        case 'image':
          if (field.imageData) {
            // Decode base64 image
            const imageBytes = Buffer.from(field.imageData.split(',')[1], 'base64');
            
            // Embed image (supports PNG and JPEG)
            let embeddedImage;
            try {
              if (field.imageData.includes('image/png')) {
                embeddedImage = await pdfDoc.embedPng(imageBytes);
              } else {
                embeddedImage = await pdfDoc.embedJpg(imageBytes);
              }
            } catch (err) {
              console.error('Image embed error:', err);
              continue;
            }

            // Calculate aspect ratio fit
            const imgDims = embeddedImage.scale(1);
            const fitted = calculateAspectRatioFit(
              pdfCoords.width,
              pdfCoords.height,
              imgDims.width,
              imgDims.height
            );

            // Draw image centered in box
            firstPage.drawImage(embeddedImage, {
              x: pdfCoords.x + fitted.offsetX,
              y: pdfCoords.y + fitted.offsetY,
              width: fitted.width,
              height: fitted.height
            });
          }
          break;

        case 'text':
          if (field.value) {
            firstPage.drawText(field.value, {
              x: pdfCoords.x + 5,
              y: pdfCoords.y + pdfCoords.height / 2,
              size: Math.min(pdfCoords.height * 0.6, 12),
              color: rgb(0, 0, 0)
            });
          }
          break;

        case 'date':
          const dateValue = field.value || new Date().toLocaleDateString();
          firstPage.drawText(dateValue, {
            x: pdfCoords.x + 5,
            y: pdfCoords.y + pdfCoords.height / 2,
            size: Math.min(pdfCoords.height * 0.6, 12),
            color: rgb(0, 0, 0)
          });
          break;

        case 'radio':
          // Draw circle for radio button
          if (field.checked) {
            const centerX = pdfCoords.x + pdfCoords.width / 2;
            const centerY = pdfCoords.y + pdfCoords.height / 2;
            const radius = Math.min(pdfCoords.width, pdfCoords.height) / 3;

            // Draw filled circle
            firstPage.drawCircle({
              x: centerX,
              y: centerY,
              size: radius,
              color: rgb(0, 0, 0)
            });
          }
          break;
      }
    }

    // Save modified PDF
    const signedPdfBytes = await pdfDoc.save();
    const signedHash = calculateHash(Buffer.from(signedPdfBytes));
    console.log('Signed PDF Hash:', signedHash);

    // Store audit trail in MongoDB
    const auditRecord = new Signature({
      originalHash,
      signedHash,
      metadata: {
        originalFilename: req.file.originalname,
        fieldsApplied: fields.length
      }
    });
    await auditRecord.save();

    // Return signed PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=signed-document.pdf',
      'X-Original-Hash': originalHash,
      'X-Signed-Hash': signedHash
    });
    res.send(Buffer.from(signedPdfBytes));

  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Endpoint: Verify hash
app.post('/verify-hash', async (req, res) => {
  try {
    const { hash } = req.body;
    const record = await Signature.findOne({
      $or: [{ originalHash: hash }, { signedHash: hash }]
    });

    if (record) {
      res.json({
        found: true,
        originalHash: record.originalHash,
        signedHash: record.signedHash,
        timestamp: record.timestamp,
        metadata: record.metadata
      });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});