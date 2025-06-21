# AI-Powered Virtual Wardrobe Backend

This project is a Node.js Express backend for a virtual wardrobe application. It allows users to upload photos of their clothing, uses the Google Cloud Vision API to analyze the items, and stores the extracted details (like clothing type and color) in a Supabase database. The system is designed to support an AI agent (such as one from ACI.dev) that can provide outfit suggestions based on the user's wardrobe and other data points like weather.

---

## Features

-   **Secure User Authentication**: Endpoints are protected using Supabase JWT authentication.
-   **Image Upload**: Users can upload photos of their clothing (JPG/PNG).
-   **File Validation**: Validates uploaded files for type (JPG/PNG) and size (max 5MB).
-   **Image Processing**: Resizes images using `sharp` for efficient analysis and to reduce costs.
-   **AI-Powered Clothing Analysis**: Leverages Google Cloud Vision API's Object Localization and Image Properties features to accurately identify clothing items and their dominant colors.
-   **Database Storage**: Stores extracted clothing details in a user-specific `wardrobe` table in Supabase.
-   **Automated Cleanup**: Deletes photos from Supabase Storage after analysis is complete.
-   **Filtered Wardrobe API**: Provides a `/wardrobe` endpoint for an AI agent to query a user's clothing inventory with filters (e.g., by type or color).
-   **Security**: Includes basic rate limiting to prevent abuse.

---

## Tech Stack

-   **Backend**: Node.js, Express.js
-   **Database & Storage**: Supabase (PostgreSQL, Supabase Storage)
-   **AI / Machine Learning**: Google Cloud Vision API
-   **Image Processing**: `sharp`
-   **Authentication**: Supabase Auth (JWT)
-   **File Handling**: `multer`

---

## Setup and Installation

Follow these steps to get the project running locally.

### 1. Prerequisites

-   Node.js (v16 or later)
-   A Supabase project
-   A Google Cloud project with the Vision API enabled and service account credentials.

### 2. Clone the Repository

```bash
git clone https://github.com/Fatemaad/hack1.git
cd hack1
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Set Up Environment Variables

Create a `.env` file in the root of the project and add the following variables:

```
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Cloud Configuration
# Point this to the location of your service account JSON key file
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json

# Server Port
PORT=3001
```

### 5. Supabase Database Schema

Ensure you have a `wardrobe` table in your Supabase database. You can use the following SQL to create it:

```sql
CREATE TABLE wardrobe (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  color TEXT,
  material TEXT,
  season TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE wardrobe ENABLE ROW LEVEL SECURITY;

-- Create policies to allow users to manage their own items
CREATE POLICY "Users can view their own wardrobe items"
  ON wardrobe FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wardrobe items"
  ON wardrobe FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### 6. Run the Server

```bash
node server.js
```

The server should now be running on `http://localhost:3001`.

---

## API Endpoints

All endpoints require a valid Supabase JWT in the `Authorization: Bearer <TOKEN>` header.

### Upload a Photo

-   **Endpoint**: `POST /upload-photo`
-   **Description**: Uploads a single photo for analysis. The server will identify clothing items, store them in the database, and delete the photo.
-   **Content-Type**: `multipart/form-data`
-   **Form Field**: `photo` (The image file)
-   **Success Response (200)**:
    ```json
    {
      "message": "Photo processed, clothing saved, and photo deleted successfully.",
      "items": [
        {
          "id": 1,
          "user_id": "...",
          "type": "Jeans",
          "color": "rgb(48, 79, 122)",
          "material": null,
          "season": null,
          "created_at": "..."
        }
      ]
    }
    ```

### Retrieve Wardrobe

-   **Endpoint**: `GET /wardrobe`
-   **Description**: Retrieves a list of all clothing items for the authenticated user.
-   **Query Parameters (Optional)**:
    -   `type` (string): Filters items by type (e.g., `/wardrobe?type=shirt`). Uses case-insensitive partial matching.
    -   `color` (string): Filters items by color (e.g., `/wardrobe?color=rgb(255, 0, 0)`).
-   **Success Response (200)**:
    ```json
    [
      {
        "id": 1,
        "user_id": "...",
        "type": "Jeans",
        "color": "rgb(48, 79, 122)",
        "material": null,
        "season": null,
        "created_at": "..."
      },
      {
        "id": 2,
        "user_id": "...",
        "type": "T-shirt",
        "color": "rgb(250, 250, 250)",
        "material": "cotton",
        "season": null,
        "created_at": "..."
      }
    ]
    ``` 