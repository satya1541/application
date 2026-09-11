import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/services/supabase';

export const AuthModal: React.FC = () => {
  const { isAuthModalVisible, closeAuthModal, signIn, signUp, resetPassword, signInWithGoogle, authModalTab } = useAuth();

  const [tab, setTab] = useState<'signin' | 'signup' | 'forgot'>(authModalTab || 'signin');

  React.useEffect(() => {
    if (isAuthModalVisible && authModalTab) {
      setTab(authModalTab);
    }
  }, [isAuthModalVisible, authModalTab]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setErrorMessage(null);
    setLoading(false);
    setGoogleLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    closeAuthModal();
  }, [closeAuthModal, resetForm]);

  const handleGoogleSignIn = useCallback(async () => {
    setErrorMessage(null);
    setGoogleLoading(true);
    const res = await signInWithGoogle();
    setGoogleLoading(false);
    if (res.error) {
      setErrorMessage(res.error);
    } else {
      handleClose();
    }
  }, [signInWithGoogle, handleClose]);

  const handleSubmit = useCallback(async () => {
    setErrorMessage(null);
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (tab === 'forgot') {
      setLoading(true);
      const res = await resetPassword(cleanEmail);
      setLoading(false);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        Alert.alert(
          'Password Reset Link Sent',
          `We have sent password reset instructions to ${cleanEmail}. Check your inbox.`,
          [{ text: 'OK', onPress: () => setTab('signin') }]
        );
      }
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    if (tab === 'signin') {
      const res = await signIn(cleanEmail, password);
      setLoading(false);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        handleClose();
      }
    } else if (tab === 'signup') {
      const res = await signUp(cleanEmail, password, displayName);
      setLoading(false);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        Alert.alert(
          'Account Created! 🎉',
          'Welcome to Shorty! Your account has been created and your preferences will sync across devices.',
          [{ text: 'Get Started', onPress: handleClose }]
        );
      }
    }
  }, [email, password, displayName, tab, signIn, signUp, resetPassword, handleClose]);

  if (!isAuthModalVisible) return null;

  return (
    <Modal
      visible={isAuthModalVisible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Ionicons name="musical-notes" size={18} color="#000000" />
              </View>
              <Text style={styles.brandTitle}>Shorty Account</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollBody}
          >
            {/* Supabase Notice if not configured */}
            {!isSupabaseConfigured() && (
              <View style={styles.noticeBox}>
                <Ionicons name="information-circle" size={18} color="#f59e0b" style={{ marginRight: 8 }} />
                <Text style={styles.noticeText}>
                  Supabase credentials not yet added to .env. Adding credentials enables live cloud sync.
                </Text>
              </View>
            )}

            {/* Tab Switcher */}
            {tab !== 'forgot' ? (
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabBtn, tab === 'signin' && styles.tabBtnActive]}
                  onPress={() => {
                    setTab('signin');
                    setErrorMessage(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, tab === 'signin' && styles.tabTextActive]}>
                    Sign In
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, tab === 'signup' && styles.tabBtnActive]}
                  onPress={() => {
                    setTab('signup');
                    setErrorMessage(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, tab === 'signup' && styles.tabTextActive]}>
                    Create Account
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.forgotHeader}>
                <Text style={styles.forgotTitle}>Reset Your Password</Text>
                <Text style={styles.forgotSubtitle}>
                  Enter your email address to receive a secure password reset link.
                </Text>
              </View>
            )}

            {/* Error Banner */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#ef4444" style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Google Sign-In Button */}
            {tab !== 'forgot' && (
              <>
                <TouchableOpacity
                  style={styles.googleButton}
                  onPress={handleGoogleSignIn}
                  disabled={googleLoading || loading}
                  activeOpacity={0.8}
                >
                  {googleLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <View style={styles.googleButtonContent}>
                      <Ionicons name="logo-google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
                      <Text style={styles.googleButtonText}>
                        {tab === 'signin' ? 'Continue with Google' : 'Sign up with Google'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or with email</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            {/* Form Inputs */}
            {tab === 'signup' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Display Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color="#8e8e8e" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Your Name or Nickname"
                    placeholderTextColor="#666666"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#8e8e8e" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="#666666"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
            </View>

            {tab !== 'forgot' && (
              <View style={styles.inputGroup}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.label}>Password</Text>
                  {tab === 'signin' && (
                    <TouchableOpacity
                      onPress={() => {
                        setTab('forgot');
                        setErrorMessage(null);
                      }}
                    >
                      <Text style={styles.forgotLink}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color="#8e8e8e" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="At least 6 characters"
                    placeholderTextColor="#666666"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color="#8e8e8e"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Action Submit Button */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#1DB954', '#179c46']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.submitText}>
                    {tab === 'signin'
                      ? 'Sign In'
                      : tab === 'signup'
                      ? 'Create Free Account'
                      : 'Send Reset Link'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Back to sign in if in forgot tab */}
            {tab === 'forgot' && (
              <TouchableOpacity
                onPress={() => {
                  setTab('signin');
                  setErrorMessage(null);
                }}
                style={styles.backToSignInBtn}
              >
                <Text style={styles.backToSignInText}>Back to Sign In</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    color: '#f59e0b',
    fontSize: 12,
    lineHeight: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#222222',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: '#303030',
  },
  tabText: {
    color: '#8e8e8e',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  forgotHeader: {
    marginBottom: 18,
  },
  forgotTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  forgotSubtitle: {
    fontSize: 13,
    color: '#9e9e9e',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#d0d0d0',
    marginBottom: 6,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  forgotLink: {
    fontSize: 12,
    color: '#1DB954',
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242424',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    height: '100%',
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    borderRadius: 25,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 12,
  },
  submitGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  backToSignInBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  backToSignInText: {
    color: '#1DB954',
    fontSize: 13,
    fontWeight: '700',
  },
  guestBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  guestText: {
    color: '#8e8e8e',
    fontSize: 13,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#383838',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2E2E2E',
  },
  dividerText: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
