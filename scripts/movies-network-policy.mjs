// The only third-party artwork the game-library/offline audit permits: decorative TMDB thumbnails.
// Full posters, players and all other external resources remain outside that game's audit exception.
export const isLibraryMovieArtwork=value=>typeof value==='string'&&/^https:\/\/image\.tmdb\.org\/t\/p\/w185\/[A-Za-z0-9]+\.(jpg|png|webp)$/.test(value);
