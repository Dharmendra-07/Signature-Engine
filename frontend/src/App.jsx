import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { 
  FileText, Type, PenTool, Image as ImageIcon, 
  Calendar, Circle, Download, Upload, X, Check 
} from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const FIELD_TYPES = {
  TEXT: { id: 'text', label: 'Text Box', icon: Type, color: 'bg-blue-100 border-blue-400' },
  SIGNATURE: { id: 'signature', label: 'Signature', icon: PenTool, color: 'bg-green-100 border-green-400' },
  IMAGE: { id: 'image', label: 'Image', icon: ImageIcon, color: 'bg-purple-100 border-purple-400' },
  DATE: { id: 'date', label: 'Date', icon: Calendar, color: 'bg-yellow-100 border-yellow-400' },
  RADIO: { id: 'radio', label: 'Radio', icon: Circle, color: 'bg-red-100 border-red-400' }
};

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageWidth, setPageWidth] = useState(595);
  const [pageHeight, setPageHeight] = useState(842);
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [draggingType, setDraggingType] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [signaturePad, setSignaturePad] = useState(null);
  const [processing, setProcessing] = useState(false);
  
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Calculate scale factor based on container width
  const scale = containerWidth / pageWidth;

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(Math.min(containerRef.current.clientWidth - 40, 800));
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Handle PDF file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setFields([]);
    }
  };

  // PDF loaded callback
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  // Get actual PDF page dimensions
  const onPageLoadSuccess = (page) => {
    const viewport = page.getViewport({ scale: 1 });
    setPageWidth(viewport.width);
    setPageHeight(viewport.height);
  };

  /**
   * COORDINATE TRANSFORMATION - FRONTEND SIDE
   * Convert pixel coordinates to percentage-based coordinates
   * This ensures fields maintain position across different screen sizes
   */
  const pixelToPercentage = (pixelX, pixelY, pixelWidth, pixelHeight) => {
    // Divide by scale to get actual PDF coordinates, then convert to percentage
    const actualX = pixelX / scale;
    const actualY = pixelY / scale;
    const actualWidth = pixelWidth / scale;
    const actualHeight = pixelHeight / scale;

    return {
      x: (actualX / pageWidth) * 100,
      y: (actualY / pageHeight) * 100,
      width: (actualWidth / pageWidth) * 100,
      height: (actualHeight / pageHeight) * 100
    };
  };

  /**
   * Convert percentage coordinates back to pixels for rendering
   * This is called on every render to adapt to current viewport
   */
  const percentageToPixel = (field) => {
    return {
      x: (field.x / 100) * pageWidth * scale,
      y: (field.y / 100) * pageHeight * scale,
      width: (field.width / 100) * pageWidth * scale,
      height: (field.height / 100) * pageHeight * scale
    };
  };

  // Handle drop on PDF
  const handleDrop = (e) => {
    e.preventDefault();
    if (!draggingType || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    // Default size in pixels
    const defaultWidth = 150;
    const defaultHeight = 50;

    const percentCoords = pixelToPercentage(pixelX, pixelY, defaultWidth, defaultHeight);

    const newField = {
      id: Date.now(),
      type: draggingType,
      ...percentCoords,
      value: '',
      imageData: null,
      checked: false
    };

    setFields([...fields, newField]);
    setDraggingType(null);
  };

  // Handle field drag
  const handleFieldMouseDown = (e, fieldId) => {
    if (resizing) return;
    e.stopPropagation();
    setSelectedField(fieldId);

    const field = fields.find(f => f.id === fieldId);
    const startX = e.clientX;
    const startY = e.clientY;
    const pixelCoords = percentageToPixel(field);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newPixelX = pixelCoords.x + deltaX;
      const newPixelY = pixelCoords.y + deltaY;

      const newPercent = pixelToPercentage(newPixelX, newPixelY, pixelCoords.width, pixelCoords.height);

      setFields(prevFields => prevFields.map(f =>
        f.id === fieldId
          ? {
              ...f,
              x: Math.max(0, Math.min(100 - f.width, newPercent.x)),
              y: Math.max(0, Math.min(100 - f.height, newPercent.y))
            }
          : f
      ));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle field resize
  const handleResizeMouseDown = (e, fieldId, corner) => {
    e.stopPropagation();
    setResizing({ fieldId, corner });

    const field = fields.find(f => f.id === fieldId);
    const startX = e.clientX;
    const startY = e.clientY;
    const pixelCoords = percentageToPixel(field);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = pixelCoords.width;
      let newHeight = pixelCoords.height;
      let newX = pixelCoords.x;
      let newY = pixelCoords.y;

      if (corner.includes('e')) newWidth = Math.max(50, pixelCoords.width + deltaX);
      if (corner.includes('s')) newHeight = Math.max(30, pixelCoords.height + deltaY);
      if (corner.includes('w')) {
        newWidth = Math.max(50, pixelCoords.width - deltaX);
        newX = pixelCoords.x + deltaX;
      }
      if (corner.includes('n')) {
        newHeight = Math.max(30, pixelCoords.height - deltaY);
        newY = pixelCoords.y + deltaY;
      }

      const newPercent = pixelToPercentage(newX, newY, newWidth, newHeight);

      setFields(prevFields => prevFields.map(f =>
        f.id === fieldId ? { ...f, ...newPercent } : f
      ));
    };

    const handleMouseUp = () => {
      setResizing(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Update field value
  const updateFieldValue = (fieldId, key, value) => {
    setFields(fields.map(f => f.id === fieldId ? { ...f, [key]: value } : f));
  };

  // Delete field
  const deleteField = (fieldId) => {
    setFields(fields.filter(f => f.id !== fieldId));
    setSelectedField(null);
  };

  // Open signature pad
  const openSignaturePad = (fieldId) => {
    setSignaturePad(fieldId);
  };

  // Save signature
  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const imageData = canvas.toDataURL('image/png');
      updateFieldValue(signaturePad, 'imageData', imageData);
      setSignaturePad(null);
    }
  };

  // Clear signature canvas
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Submit to backend
  const handleSubmit = async () => {
    if (!pdfFile || fields.length === 0) {
      alert('Please upload a PDF and add at least one field');
      return;
    }

    setProcessing(true);

    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      
      const data = {
        fields: fields.map(f => ({
          id: f.id,
          type: f.type,
          coordinates: {
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height
          },
          value: f.value,
          imageData: f.imageData,
          checked: f.checked
        })),
        pdfDimensions: {
          width: pageWidth,
          height: pageHeight
        }
      };

      formData.append('data', JSON.stringify(data));

      const response = await fetch(`${API_BASE}/sign-pdf`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'signed-document.pdf';
        a.click();
        
        const originalHash = response.headers.get('X-Original-Hash');
        const signedHash = response.headers.get('X-Signed-Hash');
        
        alert(`PDF signed successfully!\nOriginal Hash: ${originalHash}\nSigned Hash: ${signedHash}`);
      } else {
        alert('Error signing PDF');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error signing PDF: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // Canvas drawing
  useEffect(() => {
    if (signaturePad && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      let drawing = false;

      const startDrawing = (e) => {
        drawing = true;
        const rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      };

      const draw = (e) => {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
      };

      const stopDrawing = () => {
        drawing = false;
      };

      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseleave', stopDrawing);

      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      return () => {
        canvas.removeEventListener('mousedown', startDrawing);
        canvas.removeEventListener('mousemove', draw);
        canvas.removeEventListener('mouseup', stopDrawing);
        canvas.removeEventListener('mouseleave', stopDrawing);
      };
    }
  }, [signaturePad]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r p-4 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Field Toolbox</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Upload PDF</label>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="block w-full text-sm"
          />
        </div>

        <div className="space-y-2 mb-6">
          {Object.values(FIELD_TYPES).map(ft => {
            const Icon = ft.icon;
            return (
              <div
                key={ft.id}
                draggable
                onDragStart={() => setDraggingType(ft.id)}
                className={`${ft.color} border-2 rounded p-3 cursor-move hover:shadow`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={16} />
                  <span className="text-sm font-medium">{ft.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {selectedField && (() => {
          const field = fields.find(f => f.id === selectedField);
          return (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2 text-sm">Field Properties</h3>
              
              {field.type === 'text' && (
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => updateFieldValue(field.id, 'value', e.target.value)}
                  placeholder="Enter text"
                  className="w-full px-2 py-1 border rounded text-sm mb-2"
                />
              )}

              {field.type === 'signature' && (
                <button
                  onClick={() => openSignaturePad(field.id)}
                  className="w-full bg-green-600 text-white px-3 py-1 rounded text-sm mb-2"
                >
                  Draw Signature
                </button>
              )}

              {field.type === 'date' && (
                <input
                  type="date"
                  value={field.value}
                  onChange={(e) => updateFieldValue(field.id, 'value', e.target.value)}
                  className="w-full px-2 py-1 border rounded text-sm mb-2"
                />
              )}

              {field.type === 'radio' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.checked}
                    onChange={(e) => updateFieldValue(field.id, 'checked', e.target.checked)}
                  />
                  Selected
                </label>
              )}

              <button
                onClick={() => deleteField(field.id)}
                className="w-full bg-red-600 text-white px-3 py-1 rounded text-sm mt-2"
              >
                Delete Field
              </button>
            </div>
          );
        })()}

        <button
          onClick={handleSubmit}
          disabled={processing || !pdfFile || fields.length === 0}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded mt-4 disabled:bg-gray-400 flex items-center justify-center gap-2"
        >
          {processing ? 'Processing...' : (
            <>
              <Download size={16} />
              Sign PDF
            </>
          )}
        </button>
      </div>

      {/* Main area */}
      <div ref={containerRef} className="flex-1 p-4 overflow-auto">
        <h1 className="text-2xl font-bold mb-4">Signature Injection Engine</h1>

        {pdfFile ? (
          <div
            className="relative inline-block shadow-lg bg-white"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
            >
              <Page
                pageNumber={1}
                width={containerWidth}
                onLoadSuccess={onPageLoadSuccess}
              />
            </Document>

            {fields.map(field => {
              const coords = percentageToPixel(field);
              const ft = FIELD_TYPES[field.type.toUpperCase()];
              const Icon = ft.icon;

              return (
                <div
                  key={field.id}
                  onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                  className={`absolute ${ft.color} border-2 cursor-move ${
                    selectedField === field.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  style={{
                    left: `${coords.x}px`,
                    top: `${coords.y}px`,
                    width: `${coords.width}px`,
                    height: `${coords.height}px`
                  }}
                >
                  <div className="flex items-center justify-center h-full text-xs gap-1">
                    <Icon size={12} />
                    {field.value || ft.label}
                  </div>

                  {selectedField === field.id && ['nw', 'ne', 'sw', 'se'].map(corner => (
                    <div
                      key={corner}
                      onMouseDown={(e) => handleResizeMouseDown(e, field.id, corner)}
                      className="absolute w-3 h-3 bg-blue-600 border border-white"
                      style={{
                        ...(corner.includes('n') ? { top: -4 } : { bottom: -4 }),
                        ...(corner.includes('w') ? { left: -4 } : { right: -4 })
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-gray-500 mt-20">
            Upload a PDF to get started
          </div>
        )}
      </div>

      {/* Signature modal */}
      {signaturePad && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <h3 className="text-lg font-bold mb-4">Draw Your Signature</h3>
            <canvas
              ref={canvasRef}
              width={400}
              height={200}
              className="border-2 border-gray-300 rounded mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={clearCanvas}
                className="px-4 py-2 bg-gray-300 rounded"
              >
                Clear
              </button>
              <button
                onClick={saveSignature}
                className="px-4 py-2 bg-green-600 text-white rounded"
              >
                <Check size={16} className="inline mr-1" />
                Save
              </button>
              <button
                onClick={() => setSignaturePad(null)}
                className="px-4 py-2 bg-red-600 text-white rounded"
              >
                <X size={16} className="inline mr-1" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;