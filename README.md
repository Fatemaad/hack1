# AI-Powered Virtual Wardrobe (Next.js)

This project is a full-stack Next.js application for a virtual wardrobe. It allows users to upload photos of their clothing, uses the Google Cloud Vision API to analyze the items, and stores the extracted details in a Supabase database. The frontend is built with Next.js App Router, Tailwind CSS, and shadcn/ui components.

---

## Features

-   **Modern Frontend**: Built with Next.js 14 (App Router), React, and Tailwind CSS.
-   **Component-Based UI**: Uses shadcn/ui for beautiful and accessible components.
-   **Image Upload**: Users can upload photos of their clothing (JPG/PNG).
-   **AI-Powered Clothing Analysis**: Leverages Google Cloud Vision API's Object Localization and Image Properties features to accurately identify clothing items and their dominant colors.
-   **Database & Storage**: Stores extracted clothing details and photos in Supabase.
-   **API Routes**: Backend logic is handled by Next.js API Routes.
-   **Filtered Wardrobe API**: Provides a `/api/wardrobe` endpoint for querying a user's clothing inventory with filters.

---

## Getting Started

Follow these steps to get the project running locally.

### 1. Prerequisites

-   Node.js (v18 or later)
-   npm, yarn, or pnpm
-   A Supabase project with a `wardrobe` table and a `wardrobe-photos` storage bucket.
-   A Google Cloud project with the Vision API enabled and service account credentials.

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root of the project and add the following variables. You can get the Supabase keys from your project's settings.

```
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key


# Google Cloud Configuration
# Point this to the location of your service account JSON key file
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
```

**Note:** For the Vision API to work, you need to have your Google Cloud credentials file (`credentials.json`) in the root of the project.

### 4. Supabase Database Schema

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

You also need a storage bucket named `wardrobe-photos`. You can create this in your Supabase project's Storage section.

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## Deployment to Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

1.  **Push to GitHub**: Push your code to a GitHub repository.
2.  **Import Project**: Import your repository into Vercel.
3.  **Configure Environment Variables**: Add your `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GOOGLE_APPLICATION_CREDENTIALS` (you'll need to paste the content of your `credentials.json` file) as environment variables in the Vercel project settings.
4.  **Deploy**: Vercel will automatically build and deploy your application.

**Note:** Any push to the `main` branch of the linked GitLab repository will automatically trigger a new deployment on Vercel.

---

## How to Test

### User Authentication

The application is set up to work with Supabase Auth. However, for testing the API endpoints directly or for the purpose of this demo, the frontend is currently using the anon key as a placeholder for the Authorization header. To properly test, you should implement a full authentication flow:

1.  Create a sign-up and sign-in page in the UI.
2.  Use the Supabase client library (`@supabase/supabase-js`) to handle user authentication.
3.  When a user is logged in, get the JWT from `supabase.auth.getSession()` and use it in the `Authorization` header for API requests.

### Photo Upload

1.  Navigate to the **Upload** page.
2.  Drag and drop or select a photo of a clothing item.
3.  The photo will be sent to the `/api/upload-photo` endpoint.
4.  The backend will analyze the photo, save the item to your `wardrobe` table, and you should see a success message.

### Wardrobe Display

1.  Navigate to the **Wardrobe** page.
2.  The page will fetch all items from your `wardrobe` table and display them.
3.  You can use the filters to search for items by name or filter by category and color.
