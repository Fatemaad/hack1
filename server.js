// server.js
require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');

// --- INITIALIZATION ---
const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const visionClient = new ImageAnnotatorClient();

app.use(express.json());

// --- SECURITY MIDDLEWARE ---

// Basic rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use(limiter);

// --- AUTHENTICATION MIDDLEWARE (As provided by user) ---
// This middleware checks for a valid Supabase JWT in the Authorization header.
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required: No token provided.' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) {
      console.error('Authentication Error:', error.message);
      return res.status(401).json({ error: 'Authentication failed: Invalid token.' });
    }
    if (!user) {
        return res.status(401).json({ error: 'Authentication failed: User not found.' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Unexpected Authentication Error:', error);
    res.status(500).json({ error: 'An unexpected error occurred during authentication.' });
  }
};


// --- MULTER CONFIGURATION FOR FILE UPLOADS ---
// Includes input validation for file type and size.
const upload = multer({
  storage: multer.memoryStorage(), // Store file in memory to process with Sharp and Vision API
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only jpg and png files
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'), false);
    }
  },
});

// --- HELPER FUNCTIONS ---

// Helper function to extract dominant color from an image buffer
async function getDominantColor(imageBuffer) {
  try {
    const [result] = await visionClient.imageProperties({ image: { content: imageBuffer } });
    const dominantColors = result.imagePropertiesAnnotation?.dominantColors?.colors;
    if (dominantColors && dominantColors.length > 0) {
      const color = dominantColors[0].color;
      // You can implement a more sophisticated RGB to color name mapping here
      return `rgb(${color.red}, ${color.green}, ${color.blue})`;
    }
    return 'unknown';
  } catch (error) {
    console.error('Vision API (Color Detection) Error:', error);
    // Don't throw, just return 'unknown' if color detection fails
    return 'unknown';
  }
}

// --- API ENDPOINTS ---

/**
 * @route POST /upload-photo
 * @desc Uploads, analyzes, and stores clothing details.
 * @access Private (Authenticated)
 */
app.post('/upload-photo', authenticate, upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded or file validation failed.' });
  }

  let fileName = ''; // To be used for cleanup on failure

  try {
    // --- PERFORMANCE: Resize image before analysis ---
    const resizedBuffer = await sharp(req.file.buffer)
      .resize({ width: 800, withoutEnlargement: true }) // Resize to a max width of 800px
      .toBuffer();

    fileName = `${req.user.id}/${uuidv4()}.jpg`;

    // 1. Upload photo to Supabase Storage temporarily
    const { error: storageError } = await supabase.storage
      .from('photos')
      .upload(fileName, resizedBuffer, {
        contentType: 'image/jpeg', // Always jpeg after sharp processing
        upsert: false,
      });

    if (storageError) {
      console.error('Supabase Storage Upload Error:', storageError.message);
      throw new Error('Failed to upload photo to storage.');
    }

    // 2. --- IMPROVED CLOTHING EXTRACTION with Vision API ---
    const [objectDetectionResult] = await visionClient.objectLocalization({ image: { content: resizedBuffer } });
    const objects = objectDetectionResult.localizedObjectAnnotations;
    
    if (!objects || objects.length === 0) {
      // If no objects are found, delete the uploaded photo and inform the user.
      await supabase.storage.from('photos').remove([fileName]);
      return res.status(200).json({ message: 'Analysis complete: No objects detected in the photo.', items: [] });
    }

    const clothingKeywords = ['shirt', 'pants', 'dress', 'jacket', 'shoes', 'footwear', 'top', 'jeans', 'coat', 'sweater'];
    const detectedClothing = objects.filter(obj => clothingKeywords.some(kw => obj.name.toLowerCase().includes(kw)));

    if (detectedClothing.length === 0) {
      // If no clothing is detected, clean up and inform user.
      await supabase.storage.from('photos').remove([fileName]);
      return res.status(200).json({ message: 'Analysis complete: No clothing items detected in the photo.', items: [] });
    }
    
    // 3. Process each detected clothing item to find its color
    const clothingItemsToStore = [];
    for (const item of detectedClothing) {
        const color = await getDominantColor(resizedBuffer); // For simplicity, getting dominant color of whole image.
                                                          // For higher accuracy, crop each item with Sharp and analyze individually.
        clothingItemsToStore.push({
            user_id: req.user.id,
            type: item.name,
            color: color,
            // material and season can be extracted from general label detection (not implemented here for brevity)
        });
    }

    // 4. Store clothing items in Supabase 'wardrobe' table
    const { data: wardrobeData, error: wardrobeError } = await supabase
      .from('wardrobe')
      .insert(clothingItemsToStore)
      .select();

    if (wardrobeError) {
      console.error('Supabase DB Insert Error:', wardrobeError.message);
      throw new Error('Failed to save clothing details to the database.');
    }

    // 5. Delete the photo from Supabase Storage after successful analysis
    const { error: deleteError } = await supabase.storage.from('photos').remove([fileName]);
    if (deleteError) {
      // Log this error but don't fail the request, as the primary goal was achieved.
      console.error('Supabase Storage Deletion Error:', deleteError.message);
    }

    res.status(200).json({
      message: 'Photo processed, clothing saved, and photo deleted successfully.',
      items: wardrobeData,
    });

  } catch (error) {
    // --- IMPROVED ERROR HANDLING ---
    console.error('Full Error in /upload-photo:', error);

    // Attempt to clean up the uploaded file if an error occurred after upload
    if (fileName) {
      await supabase.storage.from('photos').remove([fileName]);
    }

    // Provide specific error messages
    res.status(500).json({
      error: 'Failed to process photo.',
      details: error.message || 'An unexpected server error occurred.',
    });
  }
});


/**
 * @route GET /wardrobe
 * @desc Retrieves all wardrobe items for the authenticated user, with optional filters.
 * @access Private (Authenticated)
 */
app.get('/wardrobe', authenticate, async (req, res) => {
    try {
        const { type, color } = req.query; // Get optional filters from query params
        
        // Start building the query
        let query = supabase
            .from('wardrobe')
            .select('*')
            .eq('user_id', req.user.id);

        // --- DYNAMIC FILTERING for AI Agent ---
        if (type) {
            // Using .ilike for case-insensitive partial matching on clothing type
            query = query.ilike('type', `%${type}%`);
        }
        if (color) {
            query = query.eq('color', color);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Supabase DB Select Error:', error.message);
            throw new Error('Failed to retrieve wardrobe data.');
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error in /wardrobe:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve wardrobe.',
            details: error.message || 'An unexpected server error occurred.'
        });
    }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 