"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, Music, Users, LogOut, User, Heart, Github, ExternalLink } from "lucide-react"

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

interface YouTubeVideo {
  videoId: string
  title: string
  thumbnailUrl: string
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

export default function PlayExportApp() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isGeneratingCSV, setIsGeneratingCSV] = useState(false)
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0, playlist: "" })
  const [spotifyLink, setSpotifyLink] = useState("")
  const [linkLoading, setLinkLoading] = useState(false)

  // Secure API key handling - in production, this should be handled via a backend
  const getYouTubeAPIKey = async (): Promise<string> => {
    // This is a placeholder - in a real app, you'd call your backend API
    // to retrieve the YouTube API key securely
    return "AIzaSyD8Y7rATIwK9ape7LVbF_IK_67YhDAiUNk"
  }

  const searchYouTube = async (query: string, artist: string): Promise<YouTubeVideo | null> => {
    try {
      const apiKey = await getYouTubeAPIKey()
      const enhancedQuery = `${query} ${artist} official audio`
      const searchQuery = encodeURIComponent(enhancedQuery)
      
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&videoCategoryId=10&maxResults=3&key=${apiKey}`,
      )

      if (!response.ok) {
        if (response.status === 403) {
          console.error("YouTube API quota exceeded")
          return null
        }
        console.log("YouTube API error:", response.status)
        return null
      }

      const data = await response.json()

      if (data.items && data.items.length > 0) {
        const video = data.items[0]
        return {
          videoId: video.id.videoId,
          title: video.snippet.title,
          thumbnailUrl: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default?.url || "",
        }
      }

      return null
    } catch (error) {
      console.log("Error searching YouTube:", error)
      return null
    }
  }

  const processTracksInBatches = async (tracks: any[], playlistName: string, batchSize = 5) => {
    const results = []
    setProgress({ current: 0, total: tracks.length, playlist: playlistName })
    
    for (let i = 0; i < tracks.length; i += batchSize) {
      const batch = tracks.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          if (!item.track) return null
          
          const track = item.track
          const youtubeVideo = await searchYouTube(
            track.name, 
            track.artists[0]?.name || ""
          )
          
          return {
            track,
            youtubeVideo
          }
        })
      )
      
      results.push(...batchResults.filter(result => result !== null))
      setProgress(prev => ({ ...prev, current: Math.min(i + batchSize, tracks.length) }))
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    setProgress({ current: 0, total: 0, playlist: "" })
    return results
  }

  const getQueryParam = (name: string): string => {
    if (typeof window === "undefined") return ""
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get(name) || ""
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    const hash = window.location.hash
    if (hash) {
      const params = new URLSearchParams(hash.substring(1))
      const token = params.get("access_token")

      if (token) {
        setAccessToken(token)
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }
  }, [])

  const handleSpotifyLogin = () => {
    if (isRedirecting) return

    setIsRedirecting(true)
    let clientId = getQueryParam("app_client_id")
    const changeUser = getQueryParam("change_user") !== ""

    if (clientId === "") {
      clientId = "5734ccb0dd104131a9cd34866bde12b6"
    }

    const redirectUri = encodeURIComponent(
      [window.location.protocol, "//", window.location.host, window.location.pathname].join(""),
    )

    const authUrl =
      "https://accounts.spotify.com/authorize" +
      "?client_id=" +
      clientId +
      "&redirect_uri=" +
      redirectUri +
      "&scope=playlist-read-private%20playlist-read-collaborative%20user-library-read" +
      "&response_type=token" +
      "&show_dialog=" +
      changeUser

    window.location.href = authUrl
  }

  const fetchPlaylists = async () => {
    if (!accessToken) return

    console.log("Fetching playlists and liked songs...")
    setLoading(true)
    setError(null)

    try {
      // Fetch all playlists with pagination
      let allPlaylists: any[] = []
      let nextUrl = "https://api.spotify.com/v1/me/playlists?limit=50"

      while (nextUrl) {
        const playlistsResponse = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!playlistsResponse.ok) {
          throw new Error(`Failed to fetch playlists: ${playlistsResponse.status}`)
        }

        const playlistsData = await playlistsResponse.json()
        allPlaylists = [...allPlaylists, ...playlistsData.items]
        nextUrl = playlistsData.next
      }

      // Fetch liked songs
      const likedSongsResponse = await fetch("https://api.spotify.com/v1/me/tracks?limit=50", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      let likedSongsPlaylist = null
      if (likedSongsResponse.ok) {
        const likedSongsData = await likedSongsResponse.json()

        likedSongsPlaylist = {
          id: "liked-songs",
          name: "Liked Songs",
          description: "Your liked songs on Spotify",
          images: [{ url: "/api/placeholder/300/300" }],
          owner: { display_name: "You" },
          tracks: {
            total: likedSongsData.total,
            items: likedSongsData.items.map((item: any) => ({ track: item.track })),
          },
        }
      }

      // Fetch detailed playlist data with tracks
      const detailedPlaylists = await Promise.all(
        allPlaylists.map(async (playlist: any) => {
          const tracksResponse = await fetch(playlist.tracks.href, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
          const tracksData = await tracksResponse.json()
          return {
            ...playlist,
            tracks: tracksData,
          }
        }),
      )

      // Add liked songs playlist if it exists
      const finalPlaylists = likedSongsPlaylist ? [likedSongsPlaylist, ...detailedPlaylists] : detailedPlaylists

      setPlaylists(finalPlaylists)
    } catch (err) {
      console.log("Error fetching playlists:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const extractPlaylistIdFromLink = (link: string): string | null => {
    const patterns = [
      /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    ]
    
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
      if (!playlists.some(p => p.id === playlistData.id)) {
        setPlaylists(prev => [playlistData, ...prev])
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

  const generateCSV = async (): Promise<string> => {
    const headers = [
      "PlaylistBrowseId",
      "PlaylistName",
      "MediaId",
      "Title",
      "Artists",
      "Duration",
      "ThumbnailUrl"
    ]

    const rows = []
    const playlistsToProcess = playlists.filter((playlist) => selectedPlaylists.has(playlist.id))

    for (const playlist of playlistsToProcess) {
      const playlistName = playlist.name === "Liked Songs" ? "Liked Songs" : playlist.name

      console.log(`Processing playlist: ${playlistName}`)
      const processedTracks = await processTracksInBatches(playlist.tracks.items, playlistName)
      
      for (const result of processedTracks) {
        if (!result) continue
        
        const { track, youtubeVideo } = result
        const row = [
          "", // PlaylistBrowseId - empty
          escapeCSVField(playlistName),
          youtubeVideo?.videoId || "", // YouTube video ID
          escapeCSVField(track.name),
          escapeCSVField(track.artists.map((artist) => artist.name).join(", ")),
          Math.floor(track.duration_ms / 1000).toString(), // Convert to seconds
          youtubeVideo?.thumbnailUrl || track.album.images[0]?.url || ""
        ]
        
        rows.push(row)
      }
    }

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")
  }

  const downloadCSV = async () => {
    if (selectedPlaylists.size === 0) {
      setError("Please select at least one playlist to download")
      return
    }

    setIsGeneratingCSV(true)
    setError(null)
    
    try {
      console.log("Starting CSV generation with YouTube data...")
      const csvContent = await generateCSV()
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")

      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", "youtube_music_playlists_export.csv")
        link.style.visibility = "hidden"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
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
    setSelectedPlaylists(new Set())
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

      if (response.ok) {
        const profile = await response.json()
        setUserProfile(profile)
      }
    } catch (err) {
      console.log("Error fetching user profile:", err)
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
    const newSelected = new Set(selectedPlaylists)
    if (newSelected.has(playlistId)) {
      newSelected.delete(playlistId)
    } else {
      newSelected.add(playlistId)
    }
    setSelectedPlaylists(newSelected)
  }

  const selectAllPlaylists = () => {
    const allIds = new Set(playlists.map((p) => p.id))
    setSelectedPlaylists(allIds)
  }

  const clearAllSelections = () => {
    setSelectedPlaylists(new Set())
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-purple-700">PlayExport</h1>
          <p className="text-muted-foreground">Convert Spotify playlists to YouTube format for Cubic Music, YTB, Kreate, Nzik, Riplay and more</p>
        </div>

        {/* Authentication */}
        {!accessToken ? (
          <Card className="text-center border-purple-200">
            <CardHeader>
              <CardTitle className="flex items-center justify-center gap-2 text-purple-700">
                <Music className="h-6 w-6 text-purple-700" />
                Connect to Spotify
              </CardTitle>
              <CardDescription>Sign in with your Spotify account to export your playlists</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button
                  onClick={handleSpotifyLogin}
                  size="lg"
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold w-full"
                  disabled={isRedirecting}
                >
                  {isRedirecting ? "Redirecting to Spotify..." : "Login with Spotify"}
                </Button>
                
                <div className="text-sm text-muted-foreground pt-4">
                  <p>You can also paste a Spotify playlist link after logging in</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* User info and logout section */}
            {userProfile && (
              <Card className="border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {userProfile.images && userProfile.images.length > 0 ? (
                        <img 
                          src={userProfile.images[0].url} 
                          alt={userProfile.display_name}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                          <User className="h-5 w-5 text-purple-600" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">Welcome, {userProfile.display_name}</p>
                        <p className="text-sm text-muted-foreground">@{userProfile.id}</p>
                      </div>
                    </div>
                    <Button
                      onClick={handleLogout}
                      variant="outline"
                      size="sm"
                      className="border-purple-300 text-purple-700 hover:bg-purple-100"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Spotify Link Input */}
            <Card className="border-purple-200">
              <CardHeader>
                <CardTitle className="text-purple-700">Import Spotify Playlist</CardTitle>
                <CardDescription>Paste a Spotify playlist link to import it</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://open.spotify.com/playlist/..."
                    value={spotifyLink}
                    onChange={(e) => setSpotifyLink(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={fetchPlaylistFromLink}
                    disabled={!spotifyLink || linkLoading}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {linkLoading ? "Importing..." : "Import"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Progress Indicator */}
            {progress.total > 0 && (
              <Card className="border-purple-200">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Processing {progress.playlist}</span>
                      <span className="font-medium">{progress.current}/{progress.total}</span>
                    </div>
                    <div className="w-full bg-purple-100 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Playlists Display */}
            <Card className="border-purple-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-purple-700">
                    <Users className="h-5 w-5 text-purple-700" />
                    Your Playlists ({playlists.length})
                  </CardTitle>
                  <CardDescription>
                    {playlists.reduce((total, playlist) => total + playlist.tracks.total, 0)} total tracks • {selectedPlaylists.size} selected
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {playlists.length > 0 && (
                    <>
                      <Button onClick={selectAllPlaylists} variant="outline" size="sm" className="border-purple-300 text-purple-700 hover:bg-purple-100">
                        Select All
                      </Button>
                      <Button onClick={clearAllSelections} variant="outline" size="sm" className="border-purple-300 text-purple-700 hover:bg-purple-100">
                        Clear All
                      </Button>
                    </>
                  )}
                  {selectedPlaylists.size > 0 && (
                    <Button
                      onClick={downloadCSV}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      disabled={isGeneratingCSV}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {isGeneratingCSV ? (
                        progress.total > 0 ? (
                          `Processing ${progress.current}/${progress.total}`
                        ) : (
                          "Preparing..."
                        )
                      ) : (
                        `Export ${selectedPlaylists.size} Playlist${selectedPlaylists.size > 1 ? "s" : ""}`
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="mt-2 text-muted-foreground">Loading playlists...</p>
                  </div>
                )}

                {error && (
                  <div className="text-center py-8">
                    <p className="text-red-500">{error}</p>
                    <Button onClick={fetchPlaylists} variant="outline" className="mt-2 border-purple-300 text-purple-700 hover:bg-purple-100">
                      Try Again
                    </Button>
                  </div>
                )}

                {playlists.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {playlists.map((playlist) => (
                      <Card
                        key={playlist.id}
                        className={`cursor-pointer transition-all duration-200 ${
                          selectedPlaylists.has(playlist.id)
                            ? "bg-purple-50 border-purple-400 ring-2 ring-purple-200"
                            : "bg-white border-purple-100 hover:bg-purple-50/50 hover:border-purple-200"
                        }`}
                        onClick={() => togglePlaylistSelection(playlist.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            {playlist.images && playlist.images.length > 0 ? (
                              <img 
                                src={playlist.images[0].url} 
                                alt={playlist.name}
                                className="h-12 w-12 rounded-md object-cover"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-md bg-purple-100 flex items-center justify-center">
                                <Music className="h-6 w-6 text-purple-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-sm line-clamp-2 text-foreground">
                                {playlist.name}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-1">
                                {playlist.owner.display_name}
                              </p>
                            </div>
                            {selectedPlaylists.has(playlist.id) && (
                              <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center ml-2 flex-shrink-0">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{playlist.tracks.total} tracks</span>
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                              {playlist.id === "liked-songs" ? "Liked" : "Playlist"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!loading && !error && playlists.length === 0 && accessToken && (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No playlists found</p>
                    <Button onClick={fetchPlaylists} variant="outline" className="mt-2 border-purple-300 text-purple-700 hover:bg-purple-100">
                      Refresh
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Support Section */}
            <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-700">
                  <Heart className="h-5 w-5 text-pink-500" fill="#ec4899" />
                  Support The Cube Development 💜
                </CardTitle>
                <CardDescription>
                  Hello, Cube users! I'm a student developer passionate about making streaming accessible to everyone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  I hate asking for money, but maintaining thecube takes a lot of time and effort. If you're enjoying the service, 
                  consider supporting me on Ko-Fi - it would help cover server expenses and keep me motivated to add more features!
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild className="bg-pink-500 hover:bg-pink-600 text-white">
                    <a href="https://ko-fi.com/anonghost40418" target="_blank" rel="noopener noreferrer">
                      <Heart className="h-4 w-4 mr-2" />
                      Support on Ko-Fi
                    </a>
                  </Button>
                  
                  <Button asChild variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-100">
                    <a href="https://github.com/cybruGhost" target="_blank" rel="noopener noreferrer">
                      <Github className="h-4 w-4 mr-2" />
                      Follow on GitHub
                    </a>
                  </Button>
                </div>
                
                <div className="pt-4 border-t border-purple-100">
                  <p className="text-xs text-muted-foreground">
                    PlayExport allows you to convert Spotify playlists to YouTube format for use in Cubic Music, YTB, Kreate, Nzik, Riplay and other platforms.
                    Your Spotify data is processed securely and never stored on our servers.
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
