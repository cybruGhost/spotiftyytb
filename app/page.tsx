"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Download, Music, Users, LogOut, User, Heart, Github, CheckCircle, AlertCircle } from "lucide-react"

interface SpotifyTrack {
  id: string
  name: string
  artists: Array<{ id: string; name: string }>
  duration_ms: number
  album: {
    id: string
    name: string
    images: Array<{ url: string }>
  }
}

interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  images: Array<{ url: string }>
  owner: {
    display_name: string
  }
  tracks: {
    total: number
    items: Array<{ track: SpotifyTrack }>
  }
}

interface YouTubeVideoInfo {
  title: string
  videoId: string
  videoThumbnails: Array<{ quality: string; url: string; width: number; height: number }>
  description: string
  duration: number
  viewCount: number
  formatStreams: Array<{
    url: string
    itag: string
    type: string
    quality: string
    container: string
    encoding: string
    qualityLabel: string
    resolution: string
    size: string
  }>
  adaptiveFormats: Array<{
    url: string
    itag: string
    type: string
    quality: string
    container: string
    encoding: string
    qualityLabel: string
    resolution: string
    size: string
  }>
}

interface ProgressState {
  current: number
  total: number
  playlist: string
}

interface UserProfile {
  display_name: string
  id: string
  images: Array<{ url: string }>
}

// Cache keys
const CACHE_KEYS = {
  ACCESS_TOKEN: "spotify_access_token",
  TOKEN_TIMESTAMP: "spotify_token_timestamp",
  USER_PROFILE: "spotify_user_profile",
  PLAYLISTS: "spotify_playlists",
  REFRESH_TOKEN: "spotify_refresh_token",
  CODE_VERIFIER: "spotify_code_verifier",
}

// Generate a random string for code verifier
const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return values.reduce((acc, x) => acc + possible[x % possible.length], '')
}

// Generate code challenge from verifier
const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export default function PlayExportApp() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isGeneratingCSV, setIsGeneratingCSV] = useState(false)
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0, playlist: "" })
  const [spotifyLink, setSpotifyLink] = useState("")
  const [linkLoading, setLinkLoading] = useState(false)
  const [currentlyProcessing, setCurrentlyProcessing] = useState<string | null>(null)

  // Check for cached token on component mount
  useEffect(() => {
    if (typeof window === "undefined") return

    const cachedToken = localStorage.getItem(CACHE_KEYS.ACCESS_TOKEN)
    const tokenTimestamp = localStorage.getItem(CACHE_KEYS.TOKEN_TIMESTAMP)

    if (cachedToken && tokenTimestamp) {
      const tokenAge = Date.now() - Number.parseInt(tokenTimestamp)
      const tokenExpiresIn = 3600 * 1000 // 1 hour in milliseconds

      if (tokenAge < tokenExpiresIn) {
        setAccessToken(cachedToken)

        // Try to restore cached data
        const cachedProfile = localStorage.getItem(CACHE_KEYS.USER_PROFILE)
        const cachedPlaylists = localStorage.getItem(CACHE_KEYS.PLAYLISTS)

        if (cachedProfile) {
          setUserProfile(JSON.parse(cachedProfile))
        }

        if (cachedPlaylists) {
          setPlaylists(JSON.parse(cachedPlaylists))
        }
      } else {
        // Try to refresh token
        refreshAccessToken()
      }
    }

    // Check for authorization code in URL query parameters
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const state = urlParams.get('state')
    const storedState = localStorage.getItem('spotify_auth_state')

    if (code && state && state === storedState) {
      // Exchange code for access token
      exchangeCodeForToken(code)
    }
  }, [])

  // Exchange authorization code for access token
  const exchangeCodeForToken = async (code: string) => {
    try {
      const codeVerifier = localStorage.getItem(CACHE_KEYS.CODE_VERIFIER)
      
      if (!codeVerifier) {
        throw new Error("Code verifier not found")
      }

      const clientId = getQueryParam("app_client_id") || "5734ccb0dd104131a9cd34866bde12b6"
      const redirectUri = window.location.origin + window.location.pathname

      const response = await fetch('/api/spotify/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          codeVerifier,
          redirectUri,
          clientId,
        }),
      })

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status}`)
      }

      const data = await response.json()

      if (data.access_token) {
        setAccessToken(data.access_token)
        localStorage.setItem(CACHE_KEYS.ACCESS_TOKEN, data.access_token)
        localStorage.setItem(CACHE_KEYS.TOKEN_TIMESTAMP, Date.now().toString())
        
        if (data.refresh_token) {
          localStorage.setItem(CACHE_KEYS.REFRESH_TOKEN, data.refresh_token)
        }

        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname)
        
        // Clear PKCE code verifier
        localStorage.removeItem(CACHE_KEYS.CODE_VERIFIER)
        localStorage.removeItem('spotify_auth_state')
      }
    } catch (error) {
      console.error("Error exchanging code for token:", error)
      setError("Failed to authenticate with Spotify. Please try again.")
    }
  }

  // Refresh access token using refresh token
  const refreshAccessToken = async () => {
    try {
      const refreshToken = localStorage.getItem(CACHE_KEYS.REFRESH_TOKEN)
      
      if (!refreshToken) {
        handleLogout()
        return
      }

      const clientId = getQueryParam("app_client_id") || "5734ccb0dd104131a9cd34866bde12b6"

      const response = await fetch('/api/spotify/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken,
          clientId,
        }),
      })

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`)
      }

      const data = await response.json()

      if (data.access_token) {
        setAccessToken(data.access_token)
        localStorage.setItem(CACHE_KEYS.ACCESS_TOKEN, data.access_token)
        localStorage.setItem(CACHE_KEYS.TOKEN_TIMESTAMP, Date.now().toString())
        
        if (data.refresh_token) {
          localStorage.setItem(CACHE_KEYS.REFRESH_TOKEN, data.refresh_token)
        }
      }
    } catch (error) {
      console.error("Error refreshing token:", error)
      handleLogout()
    }
  }

  // Search YouTube using the unofficial API
  const searchYouTube = async (query: string, artist: string): Promise<string | null> => {
    try {
      // Create a search query combining track name and artist
      const searchQuery = `${query} ${artist} official audio`
      const searchUrl = `https://inv.perditum.com/api/v1/search?q=${encodeURIComponent(searchQuery)}&type=video`

      const response = await fetch(searchUrl)

      if (!response.ok) {
        throw new Error(`YouTube search failed: ${response.status}`)
      }

      const data = await response.json()

      if (data.length > 0) {
        // Return the first video ID
        return data[0].videoId
      }

      return null
    } catch (error) {
      console.error("Error searching YouTube:", error)
      throw error
    }
  }

  // Get video info using the unofficial API
  const getYouTubeVideoInfo = async (videoId: string): Promise<YouTubeVideoInfo | null> => {
    try {
      const response = await fetch(`https://inv.perditum.com/api/v1/videos/${videoId}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch video info: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Error fetching YouTube video info:", error)
      throw error
    }
  }

  const processTracksInBatches = async (tracks: any[], playlistName: string, batchSize = 3) => {
    const results = []
    setProgress({ current: 0, total: tracks.length, playlist: playlistName })

    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          if (!item.track) return null

          const track = item.track
          try {
            // Search for the YouTube video
            const videoId = await searchYouTube(track.name, track.artists[0]?.name || "")

            let videoInfo = null
            if (videoId) {
              // Get video info including thumbnail
              videoInfo = await getYouTubeVideoInfo(videoId)
            }

            return {
              track,
              videoId,
              videoInfo,
            }
          } catch (error) {
            console.error("Error processing track:", track.name, error)
            return null
          }
        }),
      )

      results.push(...batchResults.filter((result) => result !== null))
      setProgress((prev) => ({ ...prev, current: Math.min(i + batchSize, tracks.length) }))

      // Add delay between batches to respect API limits
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    setProgress({ current: 0, total: 0, playlist: "" })
    return results
  }

  const getQueryParam = (name: string): string => {
    if (typeof window === "undefined") return ""
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get(name) || ""
  }

  const handleSpotifyLogin = async () => {
    if (isRedirecting) return

    setIsRedirecting(true)
    
    const clientId = getQueryParam("app_client_id") || "5734ccb0dd104131a9cd34866bde12b6"
    const changeUser = getQueryParam("change_user") !== ""

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateRandomString(64)
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateRandomString(16)

    // Store code verifier and state
    localStorage.setItem(CACHE_KEYS.CODE_VERIFIER, codeVerifier)
    localStorage.setItem('spotify_auth_state', state)

    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname)
    const scopes = encodeURIComponent('playlist-read-private playlist-read-collaborative user-library-read')

    const authUrl =
      `https://accounts.spotify.com/authorize?` +
      `client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${redirectUri}` +
      `&scope=${scopes}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${codeChallenge}` +
      `&state=${state}` +
      `&show_dialog=${changeUser ? "true" : "false"}`

    window.location.href = authUrl
  }

  const fetchPlaylists = async () => {
    if (!accessToken) return

    console.log("Fetching playlists and liked songs...")
    setLoading(true)
    setError(null)

    try {
      let allPlaylists: SpotifyPlaylist[] = []
      let nextUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50"

      // Fetch user playlists with pagination
      while (nextUrl) {
        const playlistsResponse = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!playlistsResponse.ok) {
          if (playlistsResponse.status === 403) {
            setError(
              "🚫 Access Denied - Cannot Access Your Playlists\n\n" +
                "This Spotify app is in Development Mode and your account is not authorized. " +
                "The app owner needs to:\n\n" +
                "1. Add your Spotify email to the approved users list\n" +
                "2. OR enable Extended Quota Mode for up to 25 users\n" +
                "3. OR submit for quota extension review\n\n" +
                "Please contact the developer to request access.",
            )
            handleLogout()
            return
          } else if (playlistsResponse.status === 401) {
            // Token expired, try to refresh
            await refreshAccessToken()
            return
          }
          throw new Error(`Failed to fetch playlists: ${playlistsResponse.status} ${playlistsResponse.statusText}`)
        }

        const playlistsData = await playlistsResponse.json()
        allPlaylists = [...allPlaylists, ...playlistsData.items]
        nextUrl = playlistsData.next
      }

      // Fetch liked songs with pagination
      let allLikedSongs: any[] = []
      let nextLikedUrl = "https://api.spotify.com/v1/me/tracks?limit=50"

      while (nextLikedUrl) {
        const likedSongsResponse = await fetch(nextLikedUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!likedSongsResponse.ok) {
          console.error("Failed to fetch liked songs:", likedSongsResponse.status)
          break
        }

        const likedSongsData = await likedSongsResponse.json()
        allLikedSongs = [...allLikedSongs, ...likedSongsData.items]
        nextLikedUrl = likedSongsData.next
      }

      let likedSongsPlaylist = null
      if (allLikedSongs.length > 0) {
        likedSongsPlaylist = {
          id: "liked-songs",
          name: "Liked Songs",
          description: "Your liked songs on Spotify",
          images: [{ url: "https://t.scdn.co/images/3099b3803ad9496896c43f22fe9be8c4.png" }],
          owner: { display_name: "You" },
          tracks: {
            total: allLikedSongs.length,
            items: allLikedSongs.map((item: any) => ({ track: item.track })),
          },
        }
      }

      // Fetch detailed playlist data with tracks (including private/custom playlists)
      const detailedPlaylists = await Promise.all(
        allPlaylists.map(async (playlist: any) => {
          try {
            // Use the tracks href provided by Spotify
            const tracksResponse = await fetch(playlist.tracks.href, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            })

            if (!tracksResponse.ok) {
              console.error(`Failed to fetch tracks for playlist ${playlist.name}:`, tracksResponse.status)
              return {
                ...playlist,
                tracks: { total: 0, items: [] },
              }
            }

            const tracksData = await tracksResponse.json()
            return {
              ...playlist,
              tracks: tracksData,
            }
          } catch (err) {
            console.error(`Error fetching tracks for playlist ${playlist.name}:`, err)
            return {
              ...playlist,
              tracks: { total: 0, items: [] },
            }
          }
        }),
      )

      // Add liked songs playlist if it exists
      const finalPlaylists = likedSongsPlaylist ? [likedSongsPlaylist, ...detailedPlaylists] : detailedPlaylists

      setPlaylists(finalPlaylists)
      localStorage.setItem(CACHE_KEYS.PLAYLISTS, JSON.stringify(finalPlaylists))
      setSuccess(`Successfully loaded ${finalPlaylists.length} playlists`)

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      console.log("Error fetching playlists:", err)
      setError(err instanceof Error ? err.message : "An error occurred")

      if (err instanceof Error && err.message.includes("403")) {
        setError(
          "Access denied when fetching playlists. Please try logging out and back in, or contact support if the issue persists.",
        )
      } else if (err instanceof Error && err.message.includes("401")) {
        setError("Your session has expired. Please log in again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const extractPlaylistIdFromLink = (link: string): string | null => {
    const patterns = [/spotify\.com\/playlist\/([a-zA-Z0-9]+)/, /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/]

    for (const pattern of patterns) {
      const match = link.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    return null
  }

  const fetchPlaylistFromLink = async () => {
    if (!accessToken || !spotifyLink) return

    setLinkLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const playlistId = extractPlaylistIdFromLink(spotifyLink)
      if (!playlistId) {
        setError("Invalid Spotify playlist link")
        return
      }

      const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch playlist: ${response.status}`)
      }

      const playlistData = await response.json()

      // Add to playlists list if not already there
      if (!playlists.some((p) => p.id === playlistData.id)) {
        const updatedPlaylists = [playlistData, ...playlists]
        setPlaylists(updatedPlaylists)
        // Update cache
        localStorage.setItem(CACHE_KEYS.PLAYLISTS, JSON.stringify(updatedPlaylists))
        setSuccess(`Playlist "${playlistData.name}" imported successfully!`)

        // Clear success message after 5 seconds
        setTimeout(() => setSuccess(null), 5000)
      } else {
        setSuccess("Playlist already in your list")

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000)
      }

      setSpotifyLink("")
    } catch (err) {
      console.log("Error fetching playlist from link:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLinkLoading(false)
    }
  }

  const escapeCSVField = (field: string): string => {
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`
    }
    return field
  }

  const generateCSV = async (): Promise<{ csvContent: string; playlistName: string }> => {
    const headers = ["PlaylistBrowseId", "PlaylistName", "MediaId", "Title", "Artists", "Duration", "ThumbnailUrl"]

    const rows = []
    const playlistsToProcess = playlists.filter((playlist) => selectedPlaylists.has(playlist.id))

    // Process only one playlist at a time
    if (playlistsToProcess.length > 0) {
      const playlist = playlistsToProcess[0]
      const playlistName = playlist.name === "Liked Songs" ? "Liked Songs" : playlist.name

      setCurrentlyProcessing(playlistName)
      console.log(`Processing playlist: ${playlistName}`)

      const processedTracks = await processTracksInBatches(playlist.tracks.items, playlistName)

      for (const result of processedTracks) {
        if (!result) continue

        const { track, videoId, videoInfo } = result

        // Get the best thumbnail available
        let thumbnailUrl = ""
        if (videoInfo && videoInfo.videoThumbnails && videoInfo.videoThumbnails.length > 0) {
          // Try to get high quality thumbnail first
          const hqThumbnail =
            videoInfo.videoThumbnails.find((t) => t.quality === "high") ||
            videoInfo.videoThumbnails.find((t) => t.quality === "medium") ||
            videoInfo.videoThumbnails[0]
          thumbnailUrl = hqThumbnail.url
        }

        const row = [
          "", // PlaylistBrowseId - empty
          escapeCSVField(playlistName),
          videoId || "", // YouTube video ID
          escapeCSVField(track.name),
          escapeCSVField(track.artists.map((artist) => artist.name).join(", ")),
          Math.floor(track.duration_ms / 1000).toString(), // Convert to seconds
          thumbnailUrl || track.album.images[0]?.url || "",
        ]

        rows.push(row)
      }

      setCurrentlyProcessing(null)

      return {
        csvContent: [headers.join(","), ...rows.map((row) => row.join(","))].join("\n"),
        playlistName,
      }
    }

    return {
      csvContent: [headers.join(",")].join("\n"),
      playlistName: "playlist",
    }
  }

  const downloadCSV = async () => {
    if (selectedPlaylists.size === 0) {
      setError("Please select at least one playlist to download")
      return
    }

    if (selectedPlaylists.size > 1) {
      setError("Please select only one playlist at a time for download")
      return
    }

    setIsGeneratingCSV(true)
    setError(null)
    setSuccess(null)

    try {
      console.log("Starting CSV generation with YouTube data...")
      const { csvContent, playlistName } = await generateCSV()
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")

      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        // Use playlist name for the filename
        link.setAttribute("download", `${playlistName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export.csv`)
        link.style.visibility = "hidden"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      setSuccess("Playlist exported successfully!")

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000)

      console.log("CSV download completed")
    } catch (error) {
      console.log("Error generating CSV:", error)
      setError("Failed to generate CSV with YouTube data")
    } finally {
      setIsGeneratingCSV(false)
      setProgress({ current: 0, total: 0, playlist: "" })
    }
  }

  const handleLogout = () => {
    setAccessToken(null)
    setPlaylists([])
    setUserProfile(null)
    setError(null)
    setSuccess(null)
    setSelectedPlaylists(new Set())
    // Clear cache on logout
    localStorage.removeItem(CACHE_KEYS.ACCESS_TOKEN)
    localStorage.removeItem(CACHE_KEYS.TOKEN_TIMESTAMP)
    localStorage.removeItem(CACHE_KEYS.USER_PROFILE)
    localStorage.removeItem(CACHE_KEYS.PLAYLISTS)
    localStorage.removeItem(CACHE_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(CACHE_KEYS.CODE_VERIFIER)
    localStorage.removeItem('spotify_auth_state')
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  const fetchUserProfile = async () => {
    if (!accessToken) return

    try {
      const response = await fetch("https://api.spotify.com/v1/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        if (response.status === 403) {
          setError(
            "🚫 Access Denied - Spotify App Limitation\n\n" +
              "This app is currently in Development Mode and only allows specific users. " +
              "To fix this issue, the app owner needs to:\n\n" +
              "1. Go to Spotify Developer Dashboard (developer.spotify.com)\n" +
              "2. Select this app (Client ID: 5734ccb0dd104131a9cd34866bde12b6)\n" +
              "3. Click 'Settings' → 'User Management'\n" +
              "4. Add your Spotify email to the approved users list\n\n" +
              "OR\n\n" +
              "Switch the app to 'Extended Quota Mode' to allow up to 25 users without approval.\n\n" +
              "Contact the developer to request access or ask them to enable Extended Quota Mode.",
          )
          handleLogout()
          return
        } else if (response.status === 401) {
          // Token expired, try to refresh
          await refreshAccessToken()
          return
        }
        throw new Error(`Failed to fetch user profile: ${response.status} ${response.statusText}`)
      }

      const userData = await response.json()
      setUserProfile(userData)
      // Cache user profile
      localStorage.setItem(CACHE_KEYS.USER_PROFILE, JSON.stringify(userData))
    } catch (error) {
      console.error("Error fetching user profile:", error)
      if (error instanceof Error) {
        if (error.message.includes("403") || error.message.includes("Access Denied")) {
          setError(
            "🚫 Access Denied - Spotify App Limitation\n\n" +
              "This app is currently in Development Mode and only allows specific users. " +
              "The app owner needs to add you to the approved users list or enable Extended Quota Mode.\n\n" +
              "Please contact the developer to request access.",
          )
        } else {
          setError(`Failed to fetch user profile: ${error.message}`)
        }
      } else {
        setError("An unexpected error occurred while fetching user profile")
      }
      handleLogout()
    }
  }

  useEffect(() => {
    if (accessToken) {
      if (!userProfile) {
        fetchUserProfile()
      }
      if (playlists.length === 0) {
        fetchPlaylists()
      }
    }
  }, [accessToken])

  const togglePlaylistSelection = (playlistId: string) => {
    const newSelected = new Set()
    newSelected.add(playlistId) // Only allow one selection at a time
    setSelectedPlaylists(newSelected)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-between">
            
            <div className="flex-1"></div>
            
            <div className="flex-1 text-center">
              <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-purple-500 animate-text">
                PlayExport
              </h1>
              <p className="text-gray-200 mt-3 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
                Convert <span className="font-bold text-purple-400">Spotify playlists</span> to <span className="font-bold text-white-400">YouTube format</span> for <span className="font-bold text-green-400">Cubic Music</span>, <span className="text-red-400 font-medium">YTB</span>, <span className="text-indigo-300 font-medium">Kreate</span>, <span className="text-indigo-400 font-medium">Nzik</span>, <span className="text-green-300 font-medium">Riplay</span> and more
              </p>
            </div>
            
            <div className="flex-1 flex justify-end">
              {accessToken && (
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="border-red-500 text-red-400 hover:bg-red-700 hover:text-white transition-all duration-300 shadow-lg shadow-red-800/50"
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  Sign Out
                </Button>
              )}
            </div>

          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-800/40 border border-green-600 rounded-xl p-4 text-green-200 flex items-center gap-3 shadow-md shadow-green-700/40 animate-pulse">
            <CheckCircle className="h-6 w-6" />
            <span className="font-medium">{success}</span>
          </div>
        )}
        

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-800 mb-2">Error</h3>
                <pre className="text-sm text-red-700 whitespace-pre-wrap font-mono bg-red-100 p-3 rounded border">
                  {error}
                </pre>
                {error.includes("Access Denied") && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                    <h4 className="font-semibold text-blue-800 mb-2">🛠️ How to Fix This (For App Owner)</h4>
                    <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
                      <li>
                        Go to{" "}
                        <a
                          href="https://developer.spotify.com/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-blue-900"
                        >
                          Spotify Developer Dashboard
                        </a>
                      </li>
                      <li>
                        Find your app with Client ID:{" "}
                        <code className="bg-blue-100 px-1 rounded">5734ccb0dd104131a9cd34866bde12b6</code>
                      </li>
                      <li>Click "Settings" → "User Management"</li>
                      <li>Add user emails to the approved list</li>
                      <li>
                        <strong>OR</strong> enable "Extended Quota Mode" for up to 25 users
                      </li>
                    </ol>
                    <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded">
                      <p className="text-xs text-yellow-800">
                        <strong>Note:</strong> This is a Spotify platform limitation, not an app bug. Development mode
                        apps only allow whitelisted users for security reasons.
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <Button onClick={() => setError(null)} variant="outline" size="sm">
                    Dismiss
                  </Button>
                  <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                    Refresh Page
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Authentication */}
        {!accessToken ? (
          <Card className="text-center border-purple-700 bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2 text-purple-400">
                <Music className="h-6 w-6 text-purple-400" />
                Connect to Spotify
              </CardTitle>
              <CardDescription className="text-gray-400">
                Sign in with your Spotify account to export your playlists
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button
                  onClick={handleSpotifyLogin}
                  size="lg"
                  className="bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-700 hover:to-purple-700 text-white font-semibold w-full"
                  disabled={isRedirecting}
                >
                  {isRedirecting ? "Redirecting to Spotify..." : "Login with Spotify"}
                </Button>
                <div className="text-sm text-gray-400 pt-4 space-y-2">
                  <p>You can also paste a Spotify playlist link after logging in</p>
                  <p className="text-xs text-gray-500">
                    Note: This app uses a shared client ID. If you encounter access issues, please contact support.
                  </p>
                  <p className="text-xs text-purple-400">
                    ⚠️ If your account cannot be accessed,{" "}
                    <a 
                      href="mailto:chrislumain@yahoo.com?subject=Spotify Access Request&body=Please add my email to the Spotify access list." 
                      className="underline"
                    >
                      email us here
                    </a>{" "}
                    to get your email added.
                  </p>
                </div>
              </div>
            </CardContent>
            </Card>
            ) : (
          <>
            {/* User info and logout section */}
            {userProfile && (
              <Card className="border-purple-700 bg-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {userProfile.images && userProfile.images.length > 0 ? (
                        <img
                          src={userProfile.images[0].url || "/placeholder.svg"}
                          alt={userProfile.display_name}
                          className="h-10 w-10 rounded-full border border-purple-600"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-purple-900 flex items-center justify-center border border-purple-600">
                          <User className="h-5 w-5 text-purple-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-white">Welcome, {userProfile.display_name}</p>
                        <p className="text-sm text-gray-400">@{userProfile.id}</p>
                      </div>
                    </div>
                    <Button
                      onClick={handleLogout}
                      variant="outline"
                      size="sm"
                      className="border-red-700 text-red-400 hover:bg-red-900 hover:text-white bg-transparent"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Spotify Playlist Notice */}
            <Card className="border border-purple-500 bg-gray-900 p-5 rounded-lg shadow-md">
              <CardHeader>
                <CardTitle className="text-purple-300 text-lg">Spotify Playlist Notice</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-purple-400">
                  ⚠️ If your account cannot be accessed,{" "}
                  <a 
                    href="mailto:chrislumain@yahoo.com?subject=Spotify Access Request&body=Please add my email to the Spotify access list." 
                    className="underline"
                  >
                    email us here
                  </a>{" "}
                  to get your email added.
                </p>
              </CardContent>
            </Card>

            {/* Spotify Link Input */}
            <Card className="border-purple-700 bg-gray-800">
              <CardHeader>
                <CardTitle className="text-purple-400">Import Spotify Playlist</CardTitle>
                <CardDescription className="text-gray-400">Paste a Spotify playlist link to import it</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://open.spotify.com/playlist/..."
                    value={spotifyLink}
                    onChange={(e) => setSpotifyLink(e.target.value)}
                    className="flex-1 bg-gray-700 border-gray-600 text-white placeholder-gray-500"
                  />
                  <Button
                    onClick={fetchPlaylistFromLink}
                    disabled={!spotifyLink || linkLoading}
                    className="bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-700 hover:to-purple-700"
                  >
                    {linkLoading ? "Importing..." : "Import"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Progress Indicator */}
            {(progress.total > 0 || currentlyProcessing) && (
              <Card className="border-purple-700 bg-gray-800">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">
                        {currentlyProcessing ? `Preparing ${currentlyProcessing}` : `Processing ${progress.playlist}`}
                      </span>
                      <span className="font-medium text-white">
                        {progress.current}/{progress.total}
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-red-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : "50%" }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-sm text-gray-400 pt-4">
              <p>Convert - Download - Import in your app</p>
            </div>

            {/* Playlists Display */}
            <Card className="border-purple-700 bg-gray-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-purple-400">
                    <Users className="h-5 w-5 text-purple-400" />
                    Your Playlists ({playlists.length})
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    {playlists.reduce((total, playlist) => total + playlist.tracks.total, 0)} total tracks •{" "}
                    {selectedPlaylists.size} selected
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {selectedPlaylists.size > 0 && (
                    <Button
                      onClick={downloadCSV}
                      className="bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-700 hover:to-purple-700 text-white"
                      disabled={isGeneratingCSV}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {isGeneratingCSV
                        ? progress.total > 0
                          ? `Processing ${progress.current}/${progress.total}`
                          : "Preparing..."
                        : `Export Selected Playlist`}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
                    <p className="mt-2 text-gray-400">Loading playlists...</p>
                  </div>
                )}

                {playlists.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {playlists.map((playlist) => (
                      <Card
                        key={playlist.id}
                        className={`cursor-pointer transition-all duration-200 ${
                          selectedPlaylists.has(playlist.id)
                            ? "bg-gradient-to-br from-red-900/30 to-purple-900/30 border-red-500 ring-2 ring-red-500/20"
                            : "bg-gray-700 border-gray-600 hover:bg-gray-600/50 hover:border-purple-500"
                        }`}
                        onClick={() => togglePlaylistSelection(playlist.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            {playlist.images && playlist.images.length > 0 ? (
                              <img
                                src={playlist.images[0].url || "/placeholder.svg"}
                                alt={playlist.name}
                                className="h-12 w-12 rounded-md object-cover border border-gray-600"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-md bg-gradient-to-br from-red-900 to-purple-900 flex items-center justify-center border border-gray-600">
                                <Music className="h-6 w-6 text-purple-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm line-clamp-2 text-white">{playlist.name}</h3>
                              <p className="text-xs text-gray-400 mt-1">{playlist.owner.display_name}</p>
                            </div>
                            {selectedPlaylists.has(playlist.id) && (
                              <div className="w-5 h-5 bg-gradient-to-r from-red-500 to-purple-500 rounded-full flex items-center justify-center ml-2 flex-shrink-0">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{playlist.tracks.total} tracks</span>
                            <Badge variant="secondary" className="bg-gray-600 text-gray-300">
                              {playlist.id === "liked-songs" ? "Liked" : "Playlist"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!loading && playlists.length === 0 && accessToken && (
                  <div className="text-center py-8">
                    <p className="text-gray-400">No playlists found</p>
                    <Button
                      onClick={fetchPlaylists}
                      variant="outline"
                      className="mt-2 border-purple-700 text-purple-400 hover:bg-purple-900 bg-transparent"
                    >
                      Refresh
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Support Section */}
            <Card className="border-purple-700 bg-gradient-to-r from-gray-800 to-purple-900/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-400">
                  <Heart className="h-5 w-5 text-red-400" fill="#f87171" />
                  Support The Cube Development
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Hey Cube fam! I'm a student developer building tools to make music more accessible
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-300">
                  Maintaining these services takes serious time and server resources. If PlayExport has been useful for
                  you, consider buying me a coffee to help keep the servers running and new features coming!
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    asChild
                    className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white"
                  >
                    <a href="https://ko-fi.com/anonghost40418" target="_blank" rel="noopener noreferrer">
                      <Heart className="h-4 w-4 mr-2" />
                      Support on Ko-Fi
                    </a>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    className="border-black-900 text-purple-480 hover:bg-purple-900 bg-transparent"
                  >
                    <a href="https://github.com/cybruGhost" target="_blank" rel="noopener noreferrer">
                      <Github className="h-4 w-4 mr-2" />
                      Follow on GitHub
                    </a>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    className="border-purple-600 text-purple-400 hover:bg-purple-900 bg-transparent"
                  >
                    <a
                      href="https://github.com/cybruGhost/Cubic-Music/releases/latest"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Cubic Music Apk
                    </a>
                  </Button>
                </div>

                <div className="pt-4 border-t border-purple-700">
                  <p className="text-xs text-gray-400">
                    PlayExport converts Spotify playlists to YouTube format for use in Cubic Music, YTB, Kreate, Nzik,
                    Riplay and other platforms. Your data is processed securely and never stored on our servers.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
