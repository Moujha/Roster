"""
Spotify internal GraphQL query strings and persisted-query hash helpers.

DO NOT modify the query strings — the SHA-256 hash must match exactly what
Spotify expects for its persisted query protocol. Any whitespace/field change
will produce a different hash and Spotify will reject the request.
"""
import hashlib
import json

GRAPHQL_URL = "https://api-partner.spotify.com/pathfinder/v1/query"

# ── Query strings (verbatim) ──────────────────────────────────────────────────

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


# ── Hash helpers ──────────────────────────────────────────────────────────────

def _sha256(query: str) -> str:
    return hashlib.sha256(query.encode()).hexdigest()


def build_extensions(query: str) -> str:
    return json.dumps({
        "persistedQuery": {"version": 1, "sha256Hash": _sha256(query)}
    })


# Pre-computed extensions strings (one per query)
EXT_ARTIST_OVERVIEW    = build_extensions(QUERY_ARTIST_OVERVIEW)
EXT_DISCOGRAPHY_ALL    = build_extensions(QUERY_ARTIST_DISCOGRAPHY_ALL)
EXT_GET_ALBUM          = build_extensions(QUERY_GET_ALBUM)
