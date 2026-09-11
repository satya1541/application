import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  detectPlaylistUrl,
  fetchPlaylistPreview,
  importPlaylistToLibrary,
  PlaylistImportPreview,
  DetectedPlatformInfo,
} from '@/services/playlistImportService';
import { UserPlaylist } from '@/services/userPlaylistService';

interface ImportPlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onImportSuccess: (playlist: UserPlaylist) => void;
}

export const ImportPlaylistModal: React.FC<ImportPlaylistModalProps> = ({
  visible,
  onClose,
  onImportSuccess,
}) => {
  const [url, setUrl] = useState('');
  const [detected, setDetected] = useState<DetectedPlatformInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<PlaylistImportPreview | null>(null);
  const [customName, setCustomName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-detect platform when typing/pasting
  useEffect(() => {
    if (!url.trim()) {
      setDetected(null);
      return;
    }
    const info = detectPlaylistUrl(url.trim());
    setDetected(info);
    setErrorMessage(null);
  }, [url]);

  // Reset state when closing/opening
  useEffect(() => {
    if (!visible) {
      setUrl('');
      setDetected(null);
      setIsLoading(false);
      setIsImporting(false);
      setPreview(null);
      setCustomName('');
      setErrorMessage(null);
    }
  }, [visible]);

  const handleFetchPreview = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchPlaylistPreview(trimmed);
      setPreview(data);
      setCustomName(data.title);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Could not load playlist. Please check that the URL is correct and public.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const created = await importPlaylistToLibrary(preview, customName);
      onImportSuccess(created);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save imported playlist.');
      setIsImporting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView
              contentContainerStyle={styles.cardScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="link" size={18} color="#1DB954" />
                  </View>
                  <Text style={styles.headerTitle}>Import Playlist</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color="#A0A0A0" />
                </TouchableOpacity>
              </View>

              <Text style={styles.headerSub}>
                Paste a link from <Text style={{ color: '#FF4444', fontWeight: 'bold' }}>YouTube</Text> or{' '}
                <Text style={{ color: '#1DB954', fontWeight: 'bold' }}>Spotify</Text> to add it to your library.
              </Text>

              {/* URL Input Section */}
              {!preview ? (
                <View style={styles.inputSection}>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="globe-outline" size={18} color="#666666" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Paste playlist URL here..."
                      placeholderTextColor="#666666"
                      value={url}
                      onChangeText={setUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                      clearButtonMode="while-editing"
                    />
                    {url.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setUrl('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={18} color="#888888" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Platform Detection Pill */}
                  {detected && (
                    <View style={styles.detectedPill}>
                      <View style={[styles.platformDot, { backgroundColor: detected.badgeColor }]} />
                      <Text style={styles.detectedText}>{detected.platformName} detected</Text>
                    </View>
                  )}

                  {/* Error Message */}
                  {errorMessage && (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle" size={16} color="#FF5252" />
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  )}

                  {/* Fetch Button */}
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      (!url.trim() || isLoading) && styles.actionBtnDisabled,
                    ]}
                    disabled={!url.trim() || isLoading}
                    onPress={handleFetchPreview}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color="#000000" />
                        <Text style={styles.actionBtnText}>Loading Playlist...</Text>
                      </View>
                    ) : (
                      <Text style={styles.actionBtnText}>Find Playlist</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                /* Preview Section */
                <View style={styles.previewSection}>
                  <View style={styles.previewCard}>
                    <ExpoImage
                      source={{ uri: preview.coverUrl }}
                      style={styles.previewCover}
                      contentFit="cover"
                    />
                    <View style={styles.previewMeta}>
                      <View style={styles.previewBadgeRow}>
                        <View
                          style={[
                            styles.platformTag,
                            {
                              backgroundColor:
                                preview.platform === 'youtube'
                                  ? 'rgba(255, 0, 0, 0.2)'
                                  : 'rgba(29, 185, 84, 0.2)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.platformTagText,
                              {
                                color:
                                  preview.platform === 'youtube' ? '#FF4444' : '#1DB954',
                              },
                            ]}
                          >
                            {preview.platformName}
                          </Text>
                        </View>
                        <Text style={styles.songCountTag}>
                          {preview.totalTracks} {preview.totalTracks === 1 ? 'song' : 'songs'}
                        </Text>
                      </View>

                      {/* Name input */}
                      <Text style={styles.nameLabel}>Playlist Name</Text>
                      <TextInput
                        style={styles.previewNameInput}
                        value={customName}
                        onChangeText={setCustomName}
                        placeholder="Playlist name"
                        placeholderTextColor="#666666"
                        maxLength={60}
                      />
                    </View>
                  </View>

                  {errorMessage && (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle" size={16} color="#FF5252" />
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  )}

                  {/* Actions */}
                  <View style={styles.previewActionsRow}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => setPreview(null)}
                      disabled={isImporting}
                    >
                      <Text style={styles.secondaryBtnText}>Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.primaryConfirmBtn,
                        (!customName.trim() || isImporting) && styles.actionBtnDisabled,
                      ]}
                      disabled={!customName.trim() || isImporting}
                      onPress={handleConfirmImport}
                      activeOpacity={0.8}
                    >
                      {isImporting ? (
                        <View style={styles.loadingRow}>
                          <ActivityIndicator size="small" color="#000000" />
                          <Text style={styles.actionBtnText}>Saving...</Text>
                        </View>
                      ) : (
                        <Text style={styles.actionBtnText}>Add to Library</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  backdropTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#181818',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  cardScrollContent: {
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  headerSub: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  inputSection: {
    gap: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242424',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  detectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detectedText: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: '#FF7B7B',
    fontSize: 12,
  },
  actionBtn: {
    backgroundColor: '#1DB954',
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewSection: {
    gap: 16,
  },
  previewCard: {
    flexDirection: 'row',
    backgroundColor: '#222222',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  previewCover: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#333333',
  },
  previewMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  previewBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  platformTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  platformTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  songCountTag: {
    color: '#8E8E93',
    fontSize: 11,
  },
  nameLabel: {
    color: '#8E8E93',
    fontSize: 11,
    marginBottom: 4,
  },
  previewNameInput: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  previewActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryConfirmBtn: {
    flex: 2,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
