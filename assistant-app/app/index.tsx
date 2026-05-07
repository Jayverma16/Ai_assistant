import React, { useState, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Animated
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API, supabase,SUPABASE_ANON_KEY } from '../constants/api';

// ── theme ─────────────────────────────────────────────────────
const C = {
  bg:       '#0a0a0f',
  surface:  '#111118',
  surface2: '#1a1a24',
  border:   '#2a2a3a',
  accent:   '#7c6aff',
  accent2:  '#ff6a9a',
  green:    '#4affb4',
  text:     '#e8e8f0',
  muted:    '#6a6a8a',
  danger:   '#ff4a6a',
};

type Mode = 'voice' | 'text';

export default function HomeScreen() {
  const [mode, setMode]               = useState<Mode>('voice');
  const [recording, setRecording]     = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri]       = useState<string | null>(null);
  const [textInput, setTextInput]     = useState('');
  const [transcript, setTranscript]   = useState('');
  const [llamaResult, setLlamaResult] = useState('');
  const [memories, setMemories]       = useState<any[]>([]);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState('');

  const [loadingTranscribe, setLoadingTranscribe] = useState(false);
  const [loadingSave, setLoadingSave]             = useState(false);
  const [loadingMemory, setLoadingMemory]         = useState(false);
  const [loadingPlan, setLoadingPlan]             = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── recording ────────────────────────────────────────────────

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return Alert.alert('Permission needed', 'Microphone access required');

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);

      // pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();

    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setAudioUri(uri);
    setRecording(null);
    setIsRecording(false);
  }

  function toggleRecord() {
    isRecording ? stopRecording() : startRecording();
  }

  // ── API calls ────────────────────────────────────────────────

async function transcribeAudio() {
  if (!audioUri) {
    return Alert.alert('No audio', 'Record something first');
  }

  setLoadingTranscribe(true);

  try {
    const formData = new FormData();

    formData.append('file', {
      uri: audioUri,
      name: 'recording.wav',
      type: 'audio/wav',
    } as any);

    const res = await fetch(API.transcribe, {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },

      body: formData,
    });
    const data = await res.json();
    console.log(data);

    if (data.text) {
      setTranscript(data.text);
    } else {
      Alert.alert('Error', 'Transcription failed');
    }
  } catch (e: any) {
    Alert.alert('Error', e.message);
  }

  setLoadingTranscribe(false);
}


async function saveAudio() {
  if (!audioUri) {
    return Alert.alert(
      'No audio',
      'Record something first'
    );
  }

  setLoadingSave(true);

  try {
    const base64 =
      await FileSystem.readAsStringAsync(
        audioUri,
        {
          encoding: 'base64',
        }
      );

    const filename =
      `rec_${Date.now()}.wav`;

    // Convert base64 to ArrayBuffer

    const binaryString = atob(base64);

    const len = binaryString.length;

    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] =
        binaryString.charCodeAt(i);
    }

    const { error } =
      await supabase.storage
        .from('audio')
        .upload(
          filename,
          bytes,
          {
            contentType:
              'audio/wav',
          }
        );

    if (error) {
      throw error;
    }

    const { data } =
      supabase.storage
        .from('audio')
        .getPublicUrl(filename);

    setUploadedAudioUrl(
      data.publicUrl
    );

    Alert.alert(
      'Saved!',
      'Audio uploaded successfully'
    );

  } catch (e: any) {
    console.log(e);

    Alert.alert(
      'Error',
      e.message
    );
  }

  setLoadingSave(false);
}



async function saveToMemory() {
  const text = transcript.trim();

  if (!text) {
    return Alert.alert('No transcript', 'Transcribe audio first');
  }

  setLoadingMemory(true);

  try {
    const res = await fetch(API.embed, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        text,
        audio_url: '',
      }),
    });

    const data = await res.json();

    if (data.success) {
      Alert.alert('Saved!', 'Added to memory');
    } else {
      Alert.alert('Error', JSON.stringify(data));
    }
  } catch (e: any) {
    Alert.alert('Error', e.message);
  }

  setLoadingMemory(false);
}

async function runPlan() {
  const text = transcript.trim();

  if (!text) {
    return Alert.alert('No transcript', 'Add some text first');
  }

  setLoadingPlan(true);
  setLlamaResult('');
  setMemories([]);

  try {

const res = await fetch(API.plan, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',

        Authorization:
          `Bearer ${SUPABASE_ANON_KEY}`,

        apikey:
          SUPABASE_ANON_KEY,
      },

      body: JSON.stringify({
        text,
        match_count: 5,
      }),
    });

    const data = await res.json();

    setLlamaResult(data.answer || '');
    setMemories(data.memories || []);

  } catch (e: any) {
    Alert.alert('Error', e.message);
  }

  setLoadingPlan(false);
}

  function useTextAsTranscript() {
    if (!textInput.trim()) return Alert.alert('Empty', 'Type something first');
    setTranscript(textInput.trim());
  }

  // ── render ───────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* header */}
          <View style={s.header}>
            <View style={s.logo}>
              <Text style={{ fontSize: 20 }}>🧠</Text>
            </View>
            <View>
              <Text style={s.headerTitle}>Jay's <Text style={{ color: C.accent }}>Assistant</Text></Text>
              <Text style={s.headerSub}>voice · memory · planning</Text>
            </View>
            <View style={s.statusDot} />
          </View>

          {/* mode toggle */}
          <View style={s.modeToggle}>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'voice' && s.modeBtnActive]}
              onPress={() => setMode('voice')}
            >
              <Text style={[s.modeBtnText, mode === 'voice' && s.modeBtnTextActive]}>🎙 Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeBtn, mode === 'text' && s.modeBtnActive]}
              onPress={() => setMode('text')}
            >
              <Text style={[s.modeBtnText, mode === 'text' && s.modeBtnTextActive]}>✏️ Text</Text>
            </TouchableOpacity>
          </View>

          {/* ── INPUT PANEL ── */}
          <View style={s.panel}>
            <View style={s.panelHeader}>
              <View style={[s.tag, { backgroundColor: 'rgba(124,106,255,0.15)' }]}>
                <Text style={[s.tagText, { color: C.accent }]}>01</Text>
              </View>
              <Text style={s.panelTitle}>Input</Text>
            </View>

            <View style={s.panelBody}>
              {mode === 'voice' ? (
                <>
                  {/* record button */}
                  <View style={s.recorderArea}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                      <TouchableOpacity
                        style={[s.recordBtn, isRecording && s.recordBtnActive]}
                        onPress={toggleRecord}
                        activeOpacity={0.8}
                      >
                        <View style={[s.recordIcon, isRecording && s.recordIconActive]} />
                      </TouchableOpacity>
                    </Animated.View>
                    <Text style={[s.recordLabel, isRecording && { color: C.danger }]}>
                      {isRecording ? 'Recording... tap to stop' : audioUri ? 'Tap to record again' : 'Tap to record'}
                    </Text>
                    {audioUri && (
                      <View style={s.audioTag}>
                        <Ionicons name="checkmark-circle" size={14} color={C.green} />
                        <Text style={s.audioTagText}>Audio ready</Text>
                      </View>
                    )}
                  </View>

                  {/* action buttons */}
                  <View style={s.btnRow}>
                    <TouchableOpacity
                      style={[s.btn, s.btnPrimary, !audioUri && s.btnDisabled]}
                      onPress={transcribeAudio}
                      disabled={!audioUri || loadingTranscribe}
                    >
                      {loadingTranscribe
                        ? <ActivityIndicator size="small" color="white" />
                        : <Text style={s.btnText}>🔤 Transcribe</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btn, s.btnSecondary, !audioUri && s.btnDisabled]}
                      onPress={saveAudio}
                      disabled={!audioUri || loadingSave}
                    >
                      {loadingSave
                        ? <ActivityIndicator size="small" color={C.text} />
                        : <Text style={s.btnTextSecondary}>💾 Save Audio</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <TextInput
                    style={s.textInput}
                    multiline
                    placeholder="Type your note, reminder, or question in Hindi or English..."
                    placeholderTextColor={C.muted}
                    value={textInput}
                    onChangeText={setTextInput}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity style={[s.btn, s.btnPrimary, { marginTop: 12 }]} onPress={useTextAsTranscript}>
                    <Text style={s.btnText}>→ Use This Text</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* ── TRANSCRIPT PANEL ── */}
          <View style={s.panel}>
            <View style={s.panelHeader}>
              <View style={[s.tag, { backgroundColor: 'rgba(74,255,180,0.1)' }]}>
                <Text style={[s.tagText, { color: C.green }]}>02</Text>
              </View>
              <Text style={s.panelTitle}>Transcript</Text>
              <Text style={s.editHint}>editable</Text>
            </View>

            <View style={s.panelBody}>
              <TextInput
                style={s.transcriptBox}
                multiline
                placeholder="Transcript will appear here after recording..."
                placeholderTextColor={C.muted}
                value={transcript}
                onChangeText={setTranscript}
                textAlignVertical="top"
              />

              <View style={s.btnRow}>
                <TouchableOpacity
                  style={[s.btn, s.btnGreen, !transcript && s.btnDisabled]}
                  onPress={runPlan}
                  disabled={!transcript || loadingPlan}
                >
                  {loadingPlan
                    ? <ActivityIndicator size="small" color={C.green} />
                    : <Text style={[s.btnText, { color: C.green }]}>🦙 Plan with Llama</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, s.btnSecondary, !transcript && s.btnDisabled]}
                  onPress={saveToMemory}
                  disabled={!transcript || loadingMemory}
                >
                  {loadingMemory
                    ? <ActivityIndicator size="small" color={C.text} />
                    : <Text style={s.btnTextSecondary}>🧠 Save Memory</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── LLAMA PANEL ── */}
          {(llamaResult || loadingPlan) && (
            <View style={s.panel}>
              <View style={s.panelHeader}>
                <View style={[s.tag, { backgroundColor: 'rgba(255,106,154,0.1)' }]}>
                  <Text style={[s.tagText, { color: C.accent2 }]}>03</Text>
                </View>
                <Text style={s.panelTitle}>Llama Planning</Text>
                {memories.length > 0 && (
                  <Text style={s.contextTag}>{memories.length} memories</Text>
                )}
              </View>

              <View style={s.panelBody}>
                {/* memory chips */}
                {memories.length > 0 && (
                  <View style={s.chipsWrap}>
                    {memories.map((m, i) => (
                      <View key={i} style={s.chip}>
                        <Text style={s.chipText} numberOfLines={1}>
                          {m.text.slice(0, 30)}...
                        </Text>
                        <Text style={s.chipSim}>{(m.similarity * 100).toFixed(0)}%</Text>
                      </View>
                    ))}
                  </View>
                )}

                {loadingPlan ? (
                  <View style={s.loadingBox}>
                    <ActivityIndicator size="large" color={C.accent} />
                    <Text style={s.loadingText}>Thinking with Llama...</Text>
                  </View>
                ) : (
                  <Text style={s.llamaText}>{llamaResult}</Text>
                )}
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.bg },
  scroll:      { flex: 1 },
  scrollContent: { padding: 20 },

  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  logo:        { width: 42, height: 42, borderRadius: 10, backgroundColor: '#7c6aff33', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#7c6aff44' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  headerSub:   { fontSize: 11, color: C.muted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  statusDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, marginLeft: 'auto', shadowColor: C.green, shadowRadius: 6, shadowOpacity: 0.8 },

  modeToggle:       { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start' },
  modeBtn:          { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  modeBtnActive:    { backgroundColor: C.accent },
  modeBtnText:      { color: C.muted, fontWeight: '700', fontSize: 14 },
  modeBtnTextActive:{ color: 'white' },

  panel:       { backgroundColor: C.surface, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  panelTitle:  { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  panelBody:   { padding: 16 },
  tag:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  tagText:     { fontSize: 10, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1 },
  editHint:    { fontSize: 11, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  recorderArea:    { alignItems: 'center', paddingVertical: 24, gap: 14 },
  recordBtn:       { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: C.accent, backgroundColor: 'rgba(124,106,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  recordBtnActive: { borderColor: C.danger, backgroundColor: 'rgba(255,74,106,0.15)' },
  recordIcon:      { width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent },
  recordIconActive:{ width: 22, height: 22, borderRadius: 4, backgroundColor: C.danger },
  recordLabel:     { fontSize: 13, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  audioTag:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(74,255,180,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  audioTagText:    { fontSize: 12, color: C.green },

  textInput:   { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text, fontSize: 15, padding: 14, minHeight: 100, lineHeight: 22 },
  transcriptBox: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text, fontSize: 15, padding: 14, minHeight: 80, lineHeight: 22, marginBottom: 14 },

  btnRow:       { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, gap: 6 },
  btnPrimary:   { backgroundColor: C.accent },
  btnSecondary: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  btnGreen:     { backgroundColor: 'rgba(74,255,180,0.1)', borderWidth: 1, borderColor: 'rgba(74,255,180,0.3)' },
  btnDisabled:  { opacity: 0.4 },
  btnText:      { color: 'white', fontWeight: '700', fontSize: 14 },
  btnTextSecondary: { color: C.text, fontWeight: '600', fontSize: 14 },

  contextTag:  { fontSize: 11, color: C.accent2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  chipsWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(124,106,255,0.08)', borderWidth: 1, borderColor: 'rgba(124,106,255,0.2)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  chipText:    { fontSize: 11, color: C.accent, maxWidth: 140, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  chipSim:     { fontSize: 10, color: C.muted },

  loadingBox:  { alignItems: 'center', padding: 24, gap: 12 },
  loadingText: { fontSize: 13, color: C.muted },
  llamaText:   { fontSize: 15, color: C.text, lineHeight: 24 },
});
