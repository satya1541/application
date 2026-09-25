import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { User, Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import {
  UserProfile,
  SoundStats,
  supabase,
  isSupabaseConfigured,
} from '@/services/supabase';
import { SafeStorage } from '@/services/storage';
import { getSoundStats } from '@/services/cloudSyncService';
import {
  saveGoogleYouTubeTokens,
  clearGoogleYouTubeTokens,
  getGoogleYouTubeToken,
  isYouTubeConnected,
  prefetchAndCacheUserSubscriptions,
} from '@/services/youtubeUserFeedService';

WebBrowser.maybeCompleteAuthSession();

const LOCAL_GUEST_PROFILE_KEY = '@shorty_guest_profile_v1';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isGuest: boolean;
  stats: SoundStats | null;
  isAuthModalVisible: boolean;
  isProfileModalVisible: boolean;
  authModalTab: 'signin' | 'signup' | 'forgot';
  googleYoutubeToken: string | null;
  isYouTubeLinked: boolean;
  openAuthModal: (tab?: 'signin' | 'signup' | 'forgot') => void;
  closeAuthModal: () => void;
  openProfileModal: () => void;
  closeProfileModal: () => void;
  signIn: (email: string, pass: string) => Promise<{ error?: string }>;
  signUp: (email: string, pass: string, displayName: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  connectYouTubeAccount: () => Promise<{ error?: string }>;
  disconnectYouTubeAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error?: string }>;
  refreshStats: () => Promise<void>;
}

const DEFAULT_GUEST_PROFILE: UserProfile = {
  id: 'guest_user',
  display_name: 'Music Lover',
  bio: 'Listening in Guest Mode 🎵',
  avatar_url: null,
  streaming_quality: 'very_high',
  preferred_languages: ['hindi', 'punjabi', 'english', 'sambalpuri'],
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<SoundStats | null>(null);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState<boolean>(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [googleYoutubeToken, setGoogleYoutubeToken] = useState<string | null>(null);
  const [isYouTubeLinkedState, setIsYouTubeLinkedState] = useState<boolean>(false);

  const isGuest = useMemo(() => !user, [user]);
  const isYouTubeLinked = useMemo(
    () => isYouTubeLinkedState || !!googleYoutubeToken,
    [isYouTubeLinkedState, googleYoutubeToken]
  );

  // Load guest profile from local storage if not logged in
  const loadLocalGuestProfile = useCallback(async () => {
    try {
      const stored = await SafeStorage.getItem(LOCAL_GUEST_PROFILE_KEY);
      if (stored) {
        setProfile(JSON.parse(stored));
      } else {
        setProfile(DEFAULT_GUEST_PROFILE);
      }
    } catch {
      setProfile(DEFAULT_GUEST_PROFILE);
    }
  }, []);

  // Fetch full user profile from Supabase profiles table
  const fetchUserProfile = useCallback(async (userId: string, userEmail?: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // If profile row doesn't exist yet, create a default one
        const fallback: UserProfile = {
          id: userId,
          email: userEmail,
          display_name: userEmail ? userEmail.split('@')[0] : 'Music Lover',
          avatar_url: null,
          bio: 'Vibing with Shorty 🎧',
          streaming_quality: 'very_high',
          preferred_languages: ['hindi', 'punjabi', 'english', 'sambalpuri'],
        };
        await supabase.from('profiles').upsert(fallback);
        setProfile(fallback);
        return;
      }

      if (data) {
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.warn('[AuthContext] Error fetching profile:', err);
    }
  }, []);

  // Fetch sound stats
  const refreshStats = useCallback(async () => {
    try {
      const computed = await getSoundStats(user?.id);
      setStats(computed);
    } catch (err) {
      console.warn('[AuthContext] Error calculating sound stats:', err);
    }
  }, [user?.id]);

  // Initialize session on startup
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      // Restore persistent YouTube connection status from local cache immediately
      const persistentYtConnected = await isYouTubeConnected();
      if (isMounted) setIsYouTubeLinkedState(persistentYtConnected);

      if (!isSupabaseConfigured()) {
        const storedYtToken = await getGoogleYouTubeToken();
        if (storedYtToken && isMounted) {
          setGoogleYoutubeToken(storedYtToken);
        }
        await loadLocalGuestProfile();
        await refreshStats();
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data?.session) {
          if (isMounted) {
            setSession(data.session);
            setUser(data.session.user);
          }
          await fetchUserProfile(data.session.user.id, data.session.user.email);
          // Restore YouTube token from session or persistent storage on startup
          if (data.session.provider_token) {
            await saveGoogleYouTubeTokens(
              data.session.provider_token,
              data.session.provider_refresh_token || null
            );
            if (isMounted) {
              setGoogleYoutubeToken(data.session.provider_token);
              setIsYouTubeLinkedState(true);
            }
            prefetchAndCacheUserSubscriptions(data.session.provider_token).catch(() => {});
          } else {
            const storedYtToken = await getGoogleYouTubeToken();
            if (storedYtToken && isMounted) {
              setGoogleYoutubeToken(storedYtToken);
            }
            if (persistentYtConnected && isMounted) {
              setIsYouTubeLinkedState(true);
            }
          }
        } else {
          await loadLocalGuestProfile();
          const storedYtToken = await getGoogleYouTubeToken();
          if (storedYtToken && isMounted) {
            setGoogleYoutubeToken(storedYtToken);
          }
          if (persistentYtConnected && isMounted) {
            setIsYouTubeLinkedState(true);
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Error initializing session:', err);
        await loadLocalGuestProfile();
      } finally {
        await refreshStats();
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    // Listen to real-time auth state transitions
    if (isSupabaseConfigured()) {
      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (_event, newSession) => {
          setSession(newSession);
          setUser(newSession?.user || null);

          if (newSession?.user) {
            await fetchUserProfile(newSession.user.id, newSession.user.email);
            // Capture provider_token (Google access token) when available
            if (newSession.provider_token) {
              console.log('[Auth] Captured Google provider_token via auth state change');
              await saveGoogleYouTubeTokens(
                newSession.provider_token,
                newSession.provider_refresh_token || null
              );
              if (isMounted) {
                setGoogleYoutubeToken(newSession.provider_token);
                setIsYouTubeLinkedState(true);
              }
              prefetchAndCacheUserSubscriptions(newSession.provider_token).catch(() => {});
            } else {
              // Ensure we restore persisted Google YouTube token if not in this event
              const stored = await getGoogleYouTubeToken();
              const connected = await isYouTubeConnected();
              if (isMounted) {
                if (stored) setGoogleYoutubeToken(stored);
                if (connected) setIsYouTubeLinkedState(true);
              }
            }
          } else if (_event === 'SIGNED_OUT') {
            await loadLocalGuestProfile();
            await clearGoogleYouTubeTokens();
            if (isMounted) {
              setGoogleYoutubeToken(null);
              setIsYouTubeLinkedState(false);
            }
          }
          await refreshStats();
        }
      );

      return () => {
        isMounted = false;
        authListener.subscription.unsubscribe();
      };
    }

    return () => {
      isMounted = false;
    };
  }, [fetchUserProfile, loadLocalGuestProfile, refreshStats]);

  const signIn = useCallback(
    async (email: string, pass: string): Promise<{ error?: string }> => {
      if (!isSupabaseConfigured()) {
        return {
          error:
            'Supabase is not configured yet. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.',
        };
      }

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        });
        if (error) return { error: error.message };
        setIsAuthModalVisible(false);
        return {};
      } catch (err: any) {
        return { error: err?.message || 'Login failed. Please try again.' };
      }
    },
    []
  );

  const signUp = useCallback(
    async (
      email: string,
      pass: string,
      displayName: string
    ): Promise<{ error?: string }> => {
      if (!isSupabaseConfigured()) {
        return {
          error:
            'Supabase is not configured yet. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment.',
        };
      }

      try {
        const cleanName = displayName.trim() || email.split('@')[0];
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: {
            data: { display_name: cleanName },
          },
        });

        if (error) return { error: error.message };

        if (data.user) {
          // Immediately prime profile table
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email,
            display_name: cleanName,
            bio: 'Vibing with Shorty 🎧',
            streaming_quality: 'very_high',
          });
        }

        setIsAuthModalVisible(false);
        return {};
      } catch (err: any) {
        return { error: err?.message || 'Registration failed. Please try again.' };
      }
    },
    []
  );

  const syncGoogleUserProfile = useCallback(async (authUser: User) => {
    try {
      const googleName =
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        (authUser.email ? authUser.email.split('@')[0] : 'Music Lover');
      const googleAvatar =
        authUser.user_metadata?.avatar_url ||
        authUser.user_metadata?.picture ||
        null;

      const profilePayload: Partial<UserProfile> = {
        id: authUser.id,
        email: authUser.email,
        display_name: googleName,
        avatar_url: googleAvatar,
      };

      await supabase.from('profiles').upsert(profilePayload);
      setProfile((prev) => ({
        ...(prev || DEFAULT_GUEST_PROFILE),
        ...profilePayload,
      } as UserProfile));
    } catch (err) {
      console.warn('[AuthContext] Error syncing Google user profile:', err);
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured()) {
      return {
        error: 'Supabase credentials are not configured in your .env file.',
      };
    }

    try {
      // 1. Build redirect URI for this app
      // In Expo Go: exp://<ip>:<port>
      // In standalone/build: shorty://
      const redirectUrl = makeRedirectUri();

      console.log('[Auth] Initiating Google OAuth with redirectUrl:', redirectUrl);

      // 2. Request OAuth URL from Supabase
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          scopes: 'https://www.googleapis.com/auth/youtube.readonly',
          queryParams: {
            prompt: 'consent',
            access_type: 'offline',
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      if (!data?.url) {
        return { error: 'Failed to initiate Google sign-in session.' };
      }

      // 3. Set up deep link listener as backup (ONLY resolve if it has auth tokens/codes)
      let listenerSub: any = null;
      let capturedDeepLinkUrl: string | null = null;

      const deepLinkPromise = new Promise<string | null>((resolve) => {
        listenerSub = Linking.addEventListener('url', (event) => {
          console.log('[Auth] Linking url event:', event.url);
          // Crucial: Only accept URLs that actually contain OAuth response data!
          // Android fires an event with the base app URL (exp://...) when switching tasks.
          if (
            event.url.includes('code=') ||
            event.url.includes('access_token=') ||
            event.url.includes('error=') ||
            event.url.includes('error_description=')
          ) {
            capturedDeepLinkUrl = event.url;
            resolve(event.url);
          }
        });
      });

      let callbackUrl: string | null = null;
      try {
        const browserPromise = WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        const result = await Promise.race([
          browserPromise,
          deepLinkPromise.then((url) => ({ type: 'success' as const, url: url! })),
        ]);

        if (result && result.type === 'success' && result.url) {
          callbackUrl = result.url;
        } else if (capturedDeepLinkUrl) {
          callbackUrl = capturedDeepLinkUrl;
        } else if (result && result.type === 'cancel') {
          return { error: 'Sign-in was cancelled.' };
        }
      } finally {
        if (listenerSub) {
          listenerSub.remove();
        }
        if (Platform.OS === 'ios') {
          try {
            WebBrowser.dismissAuthSession();
          } catch {}
        }
      }

      // 4. Fallback check for initial URL (only if it contains auth params)
      if (!callbackUrl || (!callbackUrl.includes('code=') && !callbackUrl.includes('access_token='))) {
        const initial = await Linking.getInitialURL();
        if (
          initial &&
          (initial.includes('code=') ||
            initial.includes('access_token=') ||
            initial.includes('error='))
        ) {
          callbackUrl = initial;
        }
      }

      // 5. If still no valid callbackUrl, check if Supabase session is already active
      if (!callbackUrl || (!callbackUrl.includes('code=') && !callbackUrl.includes('access_token='))) {
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session?.user) {
          await syncGoogleUserProfile(currentSession.session.user);
          setIsAuthModalVisible(false);
          return {};
        }
        return { error: 'Sign-in was not completed or was cancelled.' };
      }

      console.log('[Auth] Processing callback URL:', callbackUrl);

      // 6. Safe parser for query and hash parameters without Hermes URL issues
      const parseParams = (url: string): Record<string, string> => {
        const params: Record<string, string> = {};
        const queryIndex = url.indexOf('?');
        const hashIndex = url.indexOf('#');

        if (queryIndex !== -1) {
          const queryString =
            hashIndex !== -1 && hashIndex > queryIndex
              ? url.substring(queryIndex + 1, hashIndex)
              : url.substring(queryIndex + 1);
          queryString.split('&').forEach((item) => {
            const [k, v] = item.split('=');
            if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
          });
        }

        if (hashIndex !== -1) {
          const hashString = url.substring(hashIndex + 1);
          hashString.split('&').forEach((item) => {
            const [k, v] = item.split('=');
            if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
          });
        }

        return params;
      };

      const params = parseParams(callbackUrl);

      if (params.error || params.error_description) {
        return { error: params.error_description || params.error };
      }

      let authUser: User | null = null;

      // Direct capture from deep link parameters (if provided in URL fragment)
      if (params.provider_token) {
        console.log('[Auth] Captured Google provider_token directly from callback parameters');
        await saveGoogleYouTubeTokens(
          params.provider_token,
          params.provider_refresh_token || null
        );
        setGoogleYoutubeToken(params.provider_token);
        setIsYouTubeLinkedState(true);
        prefetchAndCacheUserSubscriptions(params.provider_token).catch(() => {});
      }

      // 7. Exchange code for session (PKCE) or set tokens (Implicit)
      if (params.code) {
        const { data: exchangeData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError) {
          return { error: exchangeError.message };
        }
        authUser = exchangeData.user;
        // Capture Google provider_token from the PKCE exchange response
        if (exchangeData.session?.provider_token) {
          console.log('[Auth] Captured Google provider_token from PKCE exchange');
          await saveGoogleYouTubeTokens(
            exchangeData.session.provider_token,
            exchangeData.session.provider_refresh_token || null
          );
          setGoogleYoutubeToken(exchangeData.session.provider_token);
          setIsYouTubeLinkedState(true);
          prefetchAndCacheUserSubscriptions(exchangeData.session.provider_token).catch(() => {});
        }
      } else if (params.access_token && params.refresh_token) {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
        if (sessionError) {
          return { error: sessionError.message };
        }
        authUser = sessionData.user;
        // Capture Google provider_token from implicit flow
        if (sessionData.session?.provider_token) {
          console.log('[Auth] Captured Google provider_token from implicit flow');
          await saveGoogleYouTubeTokens(
            sessionData.session.provider_token,
            sessionData.session.provider_refresh_token || null
          );
          setGoogleYoutubeToken(sessionData.session.provider_token);
          setIsYouTubeLinkedState(true);
          prefetchAndCacheUserSubscriptions(sessionData.session.provider_token).catch(() => {});
        }
      } else {
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session?.user) {
          authUser = currentSession.session.user;
        } else {
          return { error: 'No authorization code or session received.' };
        }
      }

      if (authUser) {
        await syncGoogleUserProfile(authUser);
      }

      setIsAuthModalVisible(false);
      return {};
    } catch (err: any) {
      console.warn('[AuthContext] Google Sign-In error:', err);
      return { error: err?.message || 'Google Sign-In failed or was cancelled.' };
    }
  }, [syncGoogleUserProfile]);

  // Connect YouTube account: re-initiates Google OAuth with youtube.readonly scope
  const connectYouTubeAccount = useCallback(async (): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured() || !user) {
      return { error: 'You must be signed in to connect your YouTube account.' };
    }

    try {
      const redirectUrl = makeRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          scopes: 'https://www.googleapis.com/auth/youtube.readonly',
          queryParams: {
            prompt: 'consent',
            access_type: 'offline',
          },
        },
      });

      if (error || !data?.url) {
        return { error: error?.message || 'Failed to start YouTube connection.' };
      }

      let listenerSub: any = null;
      let capturedDeepLinkUrl: string | null = null;

      const deepLinkPromise = new Promise<string | null>((resolve) => {
        listenerSub = Linking.addEventListener('url', (event) => {
          if (
            event.url.includes('code=') ||
            event.url.includes('access_token=') ||
            event.url.includes('error=') ||
            event.url.includes('error_description=')
          ) {
            capturedDeepLinkUrl = event.url;
            resolve(event.url);
          }
        });
      });

      let callbackUrl: string | null = null;
      try {
        const browserPromise = WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        const result = await Promise.race([
          browserPromise,
          deepLinkPromise.then((url) => ({ type: 'success' as const, url: url! })),
        ]);

        if (result && result.type === 'success' && result.url) {
          callbackUrl = result.url;
        } else if (capturedDeepLinkUrl) {
          callbackUrl = capturedDeepLinkUrl;
        } else if (result && result.type === 'cancel') {
          return { error: 'YouTube connection was cancelled.' };
        }
      } finally {
        if (listenerSub) {
          listenerSub.remove();
        }
        if (Platform.OS === 'ios') {
          try {
            WebBrowser.dismissAuthSession();
          } catch {}
        }
      }

      if (!callbackUrl || (!callbackUrl.includes('code=') && !callbackUrl.includes('access_token='))) {
        const initial = await Linking.getInitialURL();
        if (
          initial &&
          (initial.includes('code=') ||
            initial.includes('access_token=') ||
            initial.includes('error='))
        ) {
          callbackUrl = initial;
        }
      }

      if (!callbackUrl) {
        return { error: 'No authorization callback received.' };
      }

      const parseParams = (urlStr: string) => {
        const hashIndex = urlStr.indexOf('#');
        const queryIndex = urlStr.indexOf('?');
        const p: Record<string, string> = {};
        if (queryIndex !== -1) {
          const q =
            hashIndex !== -1 && hashIndex > queryIndex
              ? urlStr.substring(queryIndex + 1, hashIndex)
              : urlStr.substring(queryIndex + 1);
          q.split('&').forEach((item) => {
            const [k, v] = item.split('=');
            if (k) p[decodeURIComponent(k)] = decodeURIComponent(v || '');
          });
        }
        if (hashIndex !== -1) {
          const h = urlStr.substring(hashIndex + 1);
          h.split('&').forEach((item) => {
            const [k, v] = item.split('=');
            if (k) p[decodeURIComponent(k)] = decodeURIComponent(v || '');
          });
        }
        return p;
      };

      const params = parseParams(callbackUrl);
      if (params.error || params.error_description) {
        return { error: params.error_description || params.error };
      }

      // 1. Direct provider_token in URL
      if (params.provider_token) {
        await saveGoogleYouTubeTokens(
          params.provider_token,
          params.provider_refresh_token || null
        );
        setGoogleYoutubeToken(params.provider_token);
        setIsYouTubeLinkedState(true);
        prefetchAndCacheUserSubscriptions(params.provider_token).catch(() => {});
        console.log('[Auth] YouTube account connected via provider_token in URL');
        return {};
      }

      // 2. PKCE code exchange
      if (params.code) {
        const { data: exchangeData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError) return { error: exchangeError.message };
        if (exchangeData.session?.provider_token) {
          await saveGoogleYouTubeTokens(
            exchangeData.session.provider_token,
            exchangeData.session.provider_refresh_token || null
          );
          setGoogleYoutubeToken(exchangeData.session.provider_token);
          setIsYouTubeLinkedState(true);
          prefetchAndCacheUserSubscriptions(exchangeData.session.provider_token).catch(() => {});
          console.log('[Auth] YouTube account connected via PKCE exchange');
          return {};
        }
      } else if (params.access_token && params.refresh_token) {
        // 3. Implicit flow session
        const { data: sessionData, error: sessionError } =
          await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
        if (sessionError) return { error: sessionError.message };
        if (sessionData.session?.provider_token) {
          await saveGoogleYouTubeTokens(
            sessionData.session.provider_token,
            sessionData.session.provider_refresh_token || null
          );
          setGoogleYoutubeToken(sessionData.session.provider_token);
          setIsYouTubeLinkedState(true);
          prefetchAndCacheUserSubscriptions(sessionData.session.provider_token).catch(() => {});
          console.log('[Auth] YouTube account connected via implicit session');
          return {};
        }
      }

      return {
        error:
          'YouTube permission was not returned. Please make sure to check and approve YouTube permissions on the Google consent screen.',
      };
    } catch (err: any) {
      return { error: err?.message || 'Failed to connect YouTube account.' };
    }
  }, [user]);

  // Disconnect YouTube: clear tokens but keep Google sign-in active
  const disconnectYouTubeAccount = useCallback(async (): Promise<void> => {
    await clearGoogleYouTubeTokens();
    setGoogleYoutubeToken(null);
    setIsYouTubeLinkedState(false);
    console.log('[Auth] YouTube account disconnected');
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut().catch(() => {});
    }
    setSession(null);
    setUser(null);
    setGoogleYoutubeToken(null);
    setIsYouTubeLinkedState(false);
    await clearGoogleYouTubeTokens();
    await loadLocalGuestProfile();
    await refreshStats();
    setIsProfileModalVisible(false);
  }, [loadLocalGuestProfile, refreshStats]);

  const resetPassword = useCallback(async (email: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured()) {
      return { error: 'Supabase credentials not set.' };
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) return { error: error.message };
      return {};
    } catch (e: any) {
      return { error: e?.message || 'Password reset failed.' };
    }
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<{ error?: string }> => {
      if (isGuest || !user) {
        // Update local guest profile
        const updated = { ...(profile || DEFAULT_GUEST_PROFILE), ...updates };
        setProfile(updated);
        await SafeStorage.setItem(LOCAL_GUEST_PROFILE_KEY, JSON.stringify(updated)).catch(() => {});
        return {};
      }

      if (!isSupabaseConfigured()) return {};

      try {
        const payload = {
          ...updates,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', user.id);

        if (error) return { error: error.message };

        setProfile((prev) => (prev ? { ...prev, ...updates } : null));
        return {};
      } catch (err: any) {
        return { error: err?.message || 'Failed to update profile.' };
      }
    },
    [isGuest, user, profile]
  );

  const openAuthModal = useCallback((tab?: 'signin' | 'signup' | 'forgot') => {
    if (tab) {
      setAuthModalTab(tab);
    }
    setIsAuthModalVisible(true);
  }, []);
  const closeAuthModal = useCallback(() => setIsAuthModalVisible(false), []);
  const openProfileModal = useCallback(() => setIsProfileModalVisible(true), []);
  const closeProfileModal = useCallback(() => setIsProfileModalVisible(false), []);

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      isLoading,
      isGuest,
      stats,
      isAuthModalVisible,
      isProfileModalVisible,
      authModalTab,
      googleYoutubeToken,
      isYouTubeLinked,
      openAuthModal,
      closeAuthModal,
      openProfileModal,
      closeProfileModal,
      signIn,
      signUp,
      signInWithGoogle,
      connectYouTubeAccount,
      disconnectYouTubeAccount,
      signOut,
      resetPassword,
      updateProfile,
      refreshStats,
    }),
    [
      user,
      session,
      profile,
      isLoading,
      isGuest,
      stats,
      isAuthModalVisible,
      isProfileModalVisible,
      authModalTab,
      googleYoutubeToken,
      isYouTubeLinked,
      openAuthModal,
      closeAuthModal,
      openProfileModal,
      closeProfileModal,
      signIn,
      signUp,
      signInWithGoogle,
      connectYouTubeAccount,
      disconnectYouTubeAccount,
      signOut,
      resetPassword,
      updateProfile,
      refreshStats,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthSafe(): AuthContextType | null {
  return useContext(AuthContext) || null;
}

