"""
Spotify internal GraphQL query strings and persisted-query extensions.

Hashes are pre-registered server-side by Spotify — they must match exactly.
Run pipeline/get_spotify_hashes.py to refresh them when Spotify deploys updates.
"""
import json

GRAPHQL_URL = "https://api-partner.spotify.com/pathfinder/v2/query"

# ── Confirmed hashes (captured 2026-05-22 via get_spotify_hashes.py) ─────────

_HASHES = {
    "queryArtistOverview":       "7f86ff63e38c24973a2842b672abe44c910c1973978dc8a4a0cb648edef34527",
    "queryArtistDiscographyAll": None,  # not yet captured — see get_spotify_hashes.py
    "getAlbum":                  "b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10",
}


def _ext(op: str) -> str:
    h = _HASHES[op]
    if not h:
        raise RuntimeError(
            f"Hash for '{op}' not yet captured. Run: python get_spotify_hashes.py"
        )
    return json.dumps({"persistedQuery": {"version": 1, "sha256Hash": h}})


EXT_ARTIST_OVERVIEW = _ext("queryArtistOverview")
EXT_GET_ALBUM       = _ext("getAlbum")

# ── Query strings ─────────────────────────────────────────────────────────────
# Kept for reference and for potential APQ fallback. Not used in the hash.

QUERY_ARTIST_OVERVIEW = """query queryArtistOverview($uri: ID!, $locale: String, $includePrerelease: Boolean!) {
  artistUnion(uri: $uri) {
    __typename
    ... on Artist {
      id
      uri
      stats {
        followers
        monthlyListeners
        worldRank
        topCities {
          items {
            numberOfListeners
            city
            country
            region
          }
        }
      }
      discography {
        topTracks(offset: 0, limit: 10) {
          items {
            uid
            track {
              id
              uri
              name
              playcount
              discNumber
              duration {
                totalMilliseconds
              }
              artists {
                items {
                  uri
                  profile {
                    name
                  }
                }
              }
              albumOfTrack {
                uri
                coverArt {
                  sources {
                    url
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}"""

QUERY_ARTIST_DISCOGRAPHY_ALL = """query queryArtistDiscographyAll($uri: ID!, $offset: Int, $limit: Int) {
  artistUnion(uri: $uri) {
    ... on Artist {
      discography {
        all(offset: $offset, limit: $limit) {
          totalCount
          items {
            releases(offset: 0, limit: 1) {
              items {
                id
                uri
                name
                type
                date {
                  year
                  month
                  day
                  precision
                }
              }
            }
          }
        }
      }
    }
  }
}"""

QUERY_GET_ALBUM = """query getAlbum($uri: ID!, $locale: String, $offset: Int, $limit: Int) {
  albumUnion(uri: $uri) {
    __typename
    ... on Album {
      uri
      name
      tracks(offset: $offset, limit: $limit) {
        totalCount
        items {
          uid
          track {
            uri
            name
            playcount
            discNumber
            trackNumber
            duration {
              totalMilliseconds
            }
            artists(offset: 0, limit: 20) {
              items {
                uri
                profile {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
}"""
