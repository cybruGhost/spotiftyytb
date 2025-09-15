// app/api/youtube-search/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const artist = searchParams.get('artist');
  
  if (!query || !artist) {
    return NextResponse.json({ error: 'Missing query or artist parameters' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 500 });
  }

  try {
    const enhancedQuery = `${query} ${artist} official audio`;
    const searchQuery = encodeURIComponent(enhancedQuery);
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&videoCategoryId=10&maxResults=3&key=${apiKey}`,
    );

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json({ error: 'YouTube API quota exceeded' }, { status: 403 });
      }
      return NextResponse.json({ error: 'YouTube API error' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('YouTube search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}