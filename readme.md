# PlayExport
 - Spotify to YouTube Playlist Converter

A web application that converts Spotify playlists to YouTube format for use in various music platforms like Cubic Music, YTB, Kreate, Nzik,and Riplay

# 🎯 What It Does
PlayExport allows you to:

Connect to your Spotify account and access your playlists

- Import Spotify playlists via link

- Convert Spotify tracks to YouTube format
- share playlists with others
- Generate CSV files with YouTube video IDs and metadata

- Export playlists for use in various music applications..ecsp Cubicmusic, kreate, rimusic ,riplay

# 🚀 Features
- 🔐 Secure Spotify OAuth authentication

- 📱 Responsive design with modern UI

- 🎵 Support for both playlists and liked songs

- ⚡ Batch processing with progress tracking

- 💾 Local caching for better performance

- 📊 CSV export with comprehensive metadata

 - 🔗 Import playlists via Spotify links

# 🛠️ Setup Instructions
Prerequisites
Node.js (v16 or higher)

A Spotify Developer Account

A web server to host the application

1. Spotify Developer Dashboard Setup
Create a Spotify Developer Account

Go to Spotify Developer Dashboard

Log in with your Spotify account

Create a New App

Click "Create App"

Fill in the required information:

App name: PlayExport (or your preferred name)

App description: Convert Spotify playlists to YouTube format

Redirect URI: http://localhost:3000 (or your deployment URL)

Configure App Settings

Note your Client ID

In app settings, add your redirect URI:

For development: http://localhost:3000

For production: https://yourdomain.com

User Management (Important!)

Since the app is in Development Mode, you need to add users:

Go to your app → Settings → User Management

Add email addresses of users who should access the app

OR enable "Extended Quota Mode" for up to 25 users

2. Environment Setup
Create a .env.local file in your project root:

env
# Optional: Override the default client ID
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
3. Installation & Running
bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

- 4. Deployment
The application can be deployed to various platforms:

Vercel (Recommended):

bash
npm install -g vercel
vercel
Netlify:

Connect your GitHub repository

Set build command: npm run build

Set publish directory: .next
vercel prob

# 🔧 Configuration
Default Client ID
The app uses a default client ID (644ccb0d31a9cd866bdeb6), but you can override it by:

URL Parameter: ?app_client_id=YOUR_CLIENT_ID

Environment Variable: NEXT_PUBLIC_SPOTIFY_CLIENT_ID

YouTube API
The app uses Invidious API instances for YouTube data:

Primary: https://inv.perditum.com/api/v1/

Fallback instances can be added if needed

# 📁 Project Structure
text
playexport/
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   └── input.tsx
├── app/
│   └── page.tsx          # Main application component
├── lib/
│   └── utils.ts          # Utility functions
└── public/
    └── assets/           # Static assets

# 🔒 Authentication Flow
User clicks "Login with Spotify"

Redirect to Spotify authorization

Spotify returns access token via URL hash

Token is cached in localStorage

App fetches user profile and playlists

# 📊 CSV Output Format
The generated CSV includes:

Playlist name

YouTube video ID

Track title

Artists

Duration (seconds)

Thumbnail URL

# 🐛 Troubleshooting
Common Issues
"Access Denied" Error

Solution: Ask the app owner to add your email to approved users

Or use: ?change_user=true to force re-login

Playlists Not Loading

Check if you have playlists on Spotify

Ensure the app has necessary permissions

CSV Generation Fails

Check internet connection

YouTube API might be rate-limited


