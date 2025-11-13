import { useEffect, useState } from 'react';
import './App.css';
import { api } from './services/api';
import AuthView from './components/AuthView';

const GENRES = ['electronic', 'lofi', 'pop', 'indie', 'acoustic'];

const readStoredAuth = () => {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }
  const token = window.localStorage.getItem('spotifyAuthToken');
  const userRaw = window.localStorage.getItem('spotifyAuthUser');
  return {
    token,
    user: userRaw ? JSON.parse(userRaw) : null
  };
};

function App() {
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [genre, setGenre] = useState('electronic');
  const [searchInput, setSearchInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [feedbackState, setFeedbackState] = useState('idle');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const storedAuth = readStoredAuth();
  const [authToken, setAuthToken] = useState(storedAuth.token);
  const [currentUser, setCurrentUser] = useState(storedAuth.user);
  const [profileForm, setProfileForm] = useState({ displayName: '', bio: '', avatarUrl: '' });
  const [profileMessage, setProfileMessage] = useState('');

  const storage = typeof window !== 'undefined' ? window.localStorage : null;

  useEffect(() => {
    api.health()
      .then(setStatus)
      .catch(() => setStatus({ status: 'offline' }));
  }, []);

  useEffect(() => {
    if (!authToken) {
      storage?.removeItem('spotifyAuthToken');
      storage?.removeItem('spotifyAuthUser');
      setCurrentUser(null);
      return;
    }

    storage?.setItem('spotifyAuthToken', authToken);
    api.getProfile(authToken)
      .then((response) => {
        setCurrentUser(response.user);
        storage?.setItem('spotifyAuthUser', JSON.stringify(response.user));
        setProfileForm({
          displayName: response.user.displayName || '',
          bio: response.user.bio || '',
          avatarUrl: response.user.avatarUrl || ''
        });
      })
      .catch(() => {
        setAuthToken(null);
        setError('Session expired. Please log in again.');
      });
  }, [authToken]);

  useEffect(() => {
    let mounted = true;
    async function loadCollections() {
      setLoading(true);
      setError('');
      try {
        const [songData, playlistData, recommendationResponse] = await Promise.all([
          api.fetchSongs({ genre, search: searchFilter }),
          api.fetchPlaylists(),
          api.fetchRecommendations('demo')
        ]);

        if (!mounted) {
          return;
        }

        setSongs(songData);
        setPlaylists(playlistData);
        setRecommended(recommendationResponse.songs);
        setCurrentSong((prev) => (prev ? prev : songData[0] || null));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadCollections();
    return () => {
      mounted = false;
    };
  }, [genre, searchFilter]);

  const persistAuth = (payload) => {
    setAuthToken(payload.token);
    setCurrentUser(payload.user);
    storage?.setItem('spotifyAuthToken', payload.token);
    storage?.setItem('spotifyAuthUser', JSON.stringify(payload.user));
    setProfileMessage('');
  };

  const handleSongClick = (song) => {
    setCurrentSong(song);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setSearchFilter(searchInput);
  };

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault();
    setFeedbackState('sending');
    try {
      await api.sendFeedback({
        email: feedbackEmail,
        message: feedbackMessage,
        topic: 'product'
      });
      setFeedbackState('sent');
      setFeedbackEmail('');
      setFeedbackMessage('');
    } catch (err) {
      setFeedbackState('error');
      setError(err.message);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setProfileMessage('');
    storage?.removeItem('spotifyAuthToken');
    storage?.removeItem('spotifyAuthUser');
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    if (!authToken) return;
    try {
      const response = await api.updateProfile(authToken, profileForm);
      setCurrentUser(response.user);
      storage?.setItem('spotifyAuthUser', JSON.stringify(response.user));
      setProfileMessage('Profile updated.');
    } catch (err) {
      setError(err.message);
    }
  };

  const resetProfileForm = () => {
    setProfileForm({
      displayName: currentUser?.displayName || '',
      bio: currentUser?.bio || '',
      avatarUrl: currentUser?.avatarUrl || ''
    });
    setProfileMessage('');
  };

  if (!authToken) {
    return <AuthView onSuccess={persistAuth} status={status} />;
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Spotify-like MVP</p>
          <h1>Stream curated sounds, built to match the platform plan.</h1>
          <p className="subtitle">
            React + Express stack with a cloud Postgres option. Discover playlists, preview songs,
            and capture user feedback.
          </p>
          <div className="hero-status">
            <span className={`status-dot ${status?.status === 'ok' ? 'online' : 'offline'}`} />
            API {status?.status === 'ok' ? 'online' : 'offline'}
          </div>
        </div>
        <form className="filters" onSubmit={handleSearchSubmit}>
          <label>
            Genre
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              {GENRES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Search
            <div className="search-row">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Songs, artists, moods"
              />
              <button type="submit">Search</button>
            </div>
          </label>
        </form>
      </header>

      <nav className="user-bar">
        <div className="user-pill">
          {currentUser?.avatarUrl && <img src={currentUser.avatarUrl} alt={currentUser.displayName} />}
          <div>
            <p>{currentUser?.displayName || 'Loading user…'}</p>
            <span>{currentUser?.email || 'Loading profile…'}</span>
          </div>
        </div>
        <button className="secondary" onClick={handleLogout}>Logout</button>
      </nav>

      {error && <div className="banner error">{error}</div>}
      {loading && <div className="banner">Loading curated content…</div>}

      <main className="grid">
        <section className="panel account-panel">
          <div className="panel-header">
            <h2>Account Center</h2>
            <p>Manage profile data stored in the API.</p>
          </div>
          <div className="profile-header">
            {currentUser?.avatarUrl && <img src={currentUser.avatarUrl} alt={currentUser?.displayName} />}
            <div>
              <p>{currentUser?.displayName}</p>
              <p className="song-meta">{currentUser?.email}</p>
              <p className="song-meta">Tier: {currentUser?.tier}</p>
            </div>
          </div>
          <form onSubmit={handleProfileSave} className="profile-form">
            <label>
              Display name
              <input
                value={profileForm.displayName}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, displayName: event.target.value }))}
              />
            </label>
            <label>
              Avatar URL
              <input
                value={profileForm.avatarUrl}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, avatarUrl: event.target.value }))}
              />
            </label>
            <label>
              Bio
              <textarea
                value={profileForm.bio}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, bio: event.target.value }))}
              />
            </label>
            <div className="profile-actions">
              <button type="submit">Save profile</button>
              <button type="button" className="secondary" onClick={resetProfileForm}>Reset</button>
            </div>
            {profileMessage && <p className="success">{profileMessage}</p>}
          </form>
        </section>

        <section className="panel playlists">
          <div className="panel-header">
            <h2>Editorial Playlists</h2>
            <p>Blended from the product plan focus areas.</p>
          </div>
          <div className="playlist-grid">
            {playlists.map((playlist) => (
              <article key={playlist.id} className="playlist-card">
                <img src={playlist.coverUrl} alt={playlist.title} />
                <div>
                  <h3>{playlist.title}</h3>
                  <p>{playlist.description}</p>
                  <div className="tag-row">
                    {(playlist.tags || []).map((tag) => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel songs">
          <div className="panel-header">
            <h2>Now Playing queue</h2>
            <p>Click a track to preview metadata flowing from the API.</p>
          </div>
          <ul className="song-list">
            {songs.map((song) => (
              <li
                key={song.id}
                className={currentSong?.id === song.id ? 'active' : ''}
                onClick={() => handleSongClick(song)}
              >
                <img src={song.coverUrl} alt={song.title} />
                <div>
                  <p className="song-title">{song.title}</p>
                  <p className="song-meta">{song.artist} • {song.album}</p>
                </div>
                <span>{Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel recommendations">
          <div className="panel-header">
            <h2>Daily picks</h2>
            <p>Personalized selections powered by the recommendation endpoint.</p>
          </div>
          <div className="recommendation-grid">
            {recommended.map((song) => (
              <article key={`rec-${song.id}`} className="recommendation-card" onClick={() => handleSongClick(song)}>
                <img src={song.coverUrl} alt={song.title} />
                <div>
                  <p className="song-title">{song.title}</p>
                  <p className="song-meta">{song.artist}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel player">
          <div className="panel-header">
            <h2>Web Player</h2>
            <p>Simple audio preview built with the HTML media element.</p>
          </div>
          {currentSong ? (
            <div className="player-content">
              <img src={currentSong.coverUrl} alt={currentSong.title} />
              <div>
                <h3>{currentSong.title}</h3>
                <p>{currentSong.artist} • {currentSong.album}</p>
                <audio controls src={currentSong.audioUrl}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            </div>
          ) : (
            <p>Select a song to start playing.</p>
          )}
        </section>

        <section className="panel feedback">
          <div className="panel-header">
            <h2>Feedback capture</h2>
            <p>Posts to the API /feedback endpoint.</p>
          </div>
          <form onSubmit={handleFeedbackSubmit} className="feedback-form">
            <label>
              Email
              <input
                type="email"
                value={feedbackEmail}
                onChange={(event) => setFeedbackEmail(event.target.value)}
                placeholder="listener@example.com"
              />
            </label>
            <label>
              Message
              <textarea
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                placeholder="Let us know what to build next…"
              />
            </label>
            <button type="submit" disabled={feedbackState === 'sending'}>
              {feedbackState === 'sending' ? 'Sending…' : 'Send feedback'}
            </button>
            {feedbackState === 'sent' && <p className="success">Thanks! Stored in memory for now.</p>}
            {feedbackState === 'error' && <p className="error">Could not send feedback.</p>}
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
