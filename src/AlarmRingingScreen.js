/**
 * AlarmRingingScreen.js
 * The punishment screen. You cannot leave until you solve N questions.
 * Back button = disabled. Swipe back = disabled.
 * Wrong twice = 30s forced pause, then new question.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  BackHandler, Animated, ActivityIndicator, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as KeepAwake from 'expo-keep-awake';
import { useAlarms } from '../context/AlarmContext';
import { generateQuestion } from '../services/QuestionService';
import { cancelAlarm } from '../services/AlarmService';

const MAX_WRONG_BEFORE_PAUSE = 2;
const PAUSE_SECONDS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTotalQuestions(alarm, penalty) {
  const base = alarm.questionCount || 5;
  if (penalty?.extraQuestions) return base + penalty.extraQuestions;
  return base;
}

// Given the alarm config, return subject + topic.
// Supports both new format (subject: string, topic: string)
// and old multi-subject format (subjects: [], topics: {}) for backwards compat.
function pickSubjectTopic(alarm, index) {
  // New format (created by updated CreateAlarmScreen)
  if (alarm.subject) {
    return { subject: alarm.subject, topic: alarm.topic || 'General' };
  }
  // Legacy multi-subject format
  const subjects = alarm.subjects?.length > 0 ? alarm.subjects : ['Mathematics'];
  const subject = subjects[index % subjects.length];
  const topicsForSubject = alarm.topics?.[subject];
  const topic = topicsForSubject?.length > 0
    ? pickRandom(topicsForSubject)
    : 'General';
  return { subject, topic };
}

// Convert legacy string difficulty ('Easy','Medium','Hard','JEE Advanced') to 1-5 int
function normaliseDifficulty(d) {
  if (typeof d === 'number') return Math.min(5, Math.max(1, d));
  const map = { 'Easy': 2, 'Medium': 3, 'Hard': 4, 'JEE Advanced': 4 };
  return map[d] || 3;
}

// ─── Sound ────────────────────────────────────────────────────────────────────

async function startAlarm(soundRef) {
  try {
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/alarm.mp3'),
      { isLooping: true, volume: 1.0, shouldPlay: true }
    );
    soundRef.current = sound;
  } catch (e) {
    console.warn('Alarm sound unavailable, using vibration only:', e.message);
  }
}

async function stopAlarm(soundRef) {
  Vibration.cancel();
  if (soundRef.current) {
    try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
    soundRef.current = null;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeaderPulse({ alarm }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 500, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 500, useNativeDriver: true }),
    ])).start();
  }, []);
  const h = alarm.hour % 12 || 12;
  const m = String(alarm.minute).padStart(2, '0');
  const ampm = alarm.hour < 12 ? 'AM' : 'PM';
  return (
    <Animated.View style={[hdr.wrap, { transform: [{ scale: pulse }] }]}>
      <Text style={hdr.label}>⏰  ALARM FIRING</Text>
      <Text style={hdr.time}>{h}:{m} {ampm}</Text>
    </Animated.View>
  );
}
const hdr = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#ff2244' + '44' },
  label: { color: '#ff2244', fontSize: 10, fontWeight: '900', letterSpacing: 4, marginBottom: 2 },
  time: { color: '#f0f0ff', fontSize: 52, fontWeight: '900', letterSpacing: 3, fontFamily: 'monospace' },
});

function ProgressDots({ total, solved }) {
  return (
    <View style={pg.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[pg.dot,
            i < solved      && pg.dotDone,
            i === solved     && pg.dotActive,
          ]}
        />
      ))}
      <Text style={pg.label}>{solved}/{total}</Text>
    </View>
  );
}
const pg = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 20, paddingVertical: 12, gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#2a2a44' },
  dotDone: { backgroundColor: '#00e676', borderColor: '#00e676' },
  dotActive: { backgroundColor: '#ff3d3d', borderColor: '#ff3d3d', width: 12, height: 12, borderRadius: 6 },
  label: { color: '#333', fontSize: 11, marginLeft: 6 },
});

function OptionBtn({ letter, text, state, onPress, disabled }) {
  const cfg = {
    idle:     { border: '#1e1e3a', bg: '#0e0e1f', txt: '#c0c0e0', badge: '#1e1e3a' },
    selected: { border: '#4f8ef7', bg: '#0d1a35', txt: '#4f8ef7', badge: '#4f8ef7' },
    correct:  { border: '#00e676', bg: '#001a10', txt: '#00e676', badge: '#00e676' },
    wrong:    { border: '#ff2244', bg: '#1a0008', txt: '#ff2244', badge: '#ff2244' },
    missed:   { border: '#ffb300', bg: '#1a1000', txt: '#ffb300', badge: '#ffb300' },
  }[state] || { border: '#1e1e3a', bg: '#0e0e1f', txt: '#c0c0e0', badge: '#1e1e3a' };

  return (
    <TouchableOpacity
      style={[ob.btn, { borderColor: cfg.border, backgroundColor: cfg.bg }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <View style={[ob.badge, { backgroundColor: cfg.badge + '33', borderColor: cfg.badge }]}>
        <Text style={[ob.badgeTxt, { color: cfg.txt }]}>{letter}</Text>
      </View>
      <Text style={[ob.text, { color: cfg.txt }]}>{text}</Text>
      {state === 'correct' && <Text style={ob.icon}>✓</Text>}
      {state === 'wrong'   && <Text style={ob.icon}>✗</Text>}
      {state === 'missed'  && <Text style={ob.icon}>!</Text>}
    </TouchableOpacity>
  );
}
const ob = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1.5, borderRadius: 13, padding: 13, marginBottom: 9,
  },
  badge: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, flexShrink: 0, marginTop: 1,
  },
  badgeTxt: { fontWeight: '900', fontSize: 13 },
  text: { flex: 1, fontSize: 15, lineHeight: 23 },
  icon: { fontSize: 16, alignSelf: 'center', marginLeft: 8 },
});

function PauseOverlay({ countdown }) {
  const flash = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(flash, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 1,   duration: 600, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={po.overlay}>
      <Animated.Text style={[po.skull, { opacity: flash }]}>☠️</Animated.Text>
      <Text style={po.title}>WRONG TWICE</Text>
      <Text style={po.countdown}>{countdown}</Text>
      <Text style={po.sub}>seconds of shame remaining</Text>
      <Text style={po.note}>A fresh question awaits after this.</Text>
    </View>
  );
}
const po = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 999,
    backgroundColor: '#03000a',
    alignItems: 'center', justifyContent: 'center',
  },
  skull: { fontSize: 80, marginBottom: 24 },
  title: { color: '#ff2244', fontSize: 24, fontWeight: '900', letterSpacing: 4, marginBottom: 16 },
  countdown: { color: '#ff2244', fontSize: 72, fontWeight: '900', fontFamily: 'monospace' },
  sub: { color: '#660022', fontSize: 14, marginBottom: 24 },
  note: { color: '#333', fontSize: 13 },
});

function SolutionBox({ question, onNext, isLast }) {
  return (
    <View style={sb.wrap}>
      <Text style={sb.correctLabel}>CORRECT ANSWER{question.type === 'multi' ? 'S' : ''}</Text>
      <Text style={sb.correctAns}>
        {Array.isArray(question.correct) ? question.correct.join(', ') : question.correct}
      </Text>
      <Text style={sb.hintLabel}>HINT</Text>
      <Text style={sb.hint}>{question.hint}</Text>
      <TouchableOpacity style={[sb.nextBtn, isLast && sb.dismissBtn]} onPress={onNext}>
        <Text style={sb.nextTxt}>
          {isLast ? '✓  ALARM DISMISSED' : 'Next Question  →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
const sb = StyleSheet.create({
  wrap: {
    backgroundColor: '#001a10', borderRadius: 14,
    padding: 18, marginTop: 14, borderWidth: 1, borderColor: '#00e67644',
  },
  correctLabel: { color: '#00e676', fontSize: 9, fontWeight: '900', letterSpacing: 3 },
  correctAns: { color: '#00e676', fontSize: 22, fontWeight: '900', marginVertical: 6 },
  hintLabel: { color: '#444', fontSize: 9, fontWeight: '900', letterSpacing: 3, marginTop: 10 },
  hint: { color: '#aaa', fontSize: 14, lineHeight: 22, marginTop: 4 },
  nextBtn: {
    marginTop: 18, backgroundColor: '#4f8ef722', borderWidth: 1, borderColor: '#4f8ef7',
    borderRadius: 12, padding: 16, alignItems: 'center',
  },
  dismissBtn: { backgroundColor: '#00e67622', borderColor: '#00e676' },
  nextTxt: { color: '#f0f0ff', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AlarmRingingScreen({ navigation, route }) {
  const alarm = route.params?.alarm;
  const { penalty, savePenalty } = useAlarms();

  const soundRef     = useRef(null);
  const hapticRef    = useRef(null);
  const pauseRef     = useRef(null);

  const totalQ = alarm ? getTotalQuestions(alarm, penalty) : 5;

  // ── Core state ──────────────────────────────────────────────────────────
  const [questionIndex, setQuestionIndex] = useState(0); // which Q (0-based)
  const [solved, setSolved]               = useState(0); // how many correctly done

  const [question, setQuestion]           = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(false);

  const [selected, setSelected]           = useState(new Set()); // current selection
  const [submitted, setSubmitted]         = useState(false);
  const [correct, setCorrect]             = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  const [paused, setPaused]               = useState(false);
  const [pauseCountdown, setPauseCountdown] = useState(PAUSE_SECONDS);

  const [recentQuestions, setRecentQuestions] = useState([]); // avoid repeats

  // ── Guards ──────────────────────────────────────────────────────────────

  // Hard back-button block
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Keep screen on
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    return () => KeepAwake.deactivateKeepAwake();
  }, []);

  // ── Alarm audio + haptics ───────────────────────────────────────────────

  useEffect(() => {
    startAlarm(soundRef);
    Vibration.vibrate([0, 600, 300, 600, 300, 600], true);
    hapticRef.current = setInterval(() =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 1200
    );
    return () => {
      stopAlarm(soundRef);
      clearInterval(hapticRef.current);
    };
  }, []);

  // ── Load first question ─────────────────────────────────────────────────

  useEffect(() => {
    if (alarm) loadQuestion(0);
  }, []);

  // ── Pause countdown ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!paused) return;
    let remaining = PAUSE_SECONDS;
    setPauseCountdown(remaining);
    pauseRef.current = setInterval(() => {
      remaining -= 1;
      setPauseCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(pauseRef.current);
        setPaused(false);
        loadQuestion(questionIndex); // new question, same slot
      }
    }, 1000);
    return () => clearInterval(pauseRef.current);
  }, [paused]);

  // ── Load question ───────────────────────────────────────────────────────

  const loadQuestion = useCallback(async (index) => {
    setLoading(true);
    setError(false);
    setSelected(new Set());
    setSubmitted(false);
    setCorrect(false);
    setWrongAttempts(0);

    try {
      const { subject, topic } = pickSubjectTopic(alarm, index);
      const q = await generateQuestion({
        subject,
        topic,
        difficulty: normaliseDifficulty(alarm.difficulty),
        type: alarm.questionType || 'single',
        excludeQuestions: recentQuestions,
      });
      setQuestion(q);
      setRecentQuestions(prev => [...prev.slice(-5), q.question]);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [alarm, recentQuestions]);

  // ── Option tap ──────────────────────────────────────────────────────────

  const toggleOption = (letter) => {
    if (submitted) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (question?.type === 'single') {
        next.clear();
        next.add(letter);
      } else {
        next.has(letter) ? next.delete(letter) : next.add(letter);
      }
      return next;
    });
  };

  // ── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (selected.size === 0 || submitted) return;

    const correctSet = new Set(
      Array.isArray(question.correct)
        ? question.correct
        : [question.correct]
    );

    const isCorrect =
      selected.size === correctSet.size &&
      [...selected].every(o => correctSet.has(o));

    setSubmitted(true);
    setCorrect(isCorrect);

    if (isCorrect) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Solution box will appear; user taps Next to advance
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate([0, 200, 100, 200]);
      const newWrong = wrongAttempts + 1;
      setWrongAttempts(newWrong);

      if (newWrong >= MAX_WRONG_BEFORE_PAUSE) {
        // Trigger punishment pause
        setTimeout(() => setPaused(true), 900);
      } else {
        // Allow one retry
        setTimeout(() => {
          setSubmitted(false);
          setSelected(new Set());
        }, 1100);
      }
    }
  };

  // ── Advance / dismiss ───────────────────────────────────────────────────

  const handleNext = async () => {
    const newSolved = solved + 1;
    setSolved(newSolved);

    if (newSolved >= totalQ) {
      // ALL DONE — dismiss
      await stopAlarm(soundRef);
      clearInterval(hapticRef.current);
      if (alarm?.id) await cancelAlarm(alarm.id);
      // Clear penalty now that it has been served
      if (penalty) await savePenalty(null);
      navigation.replace('Home');
    } else {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      loadQuestion(nextIndex);
    }
  };

  // ── Option state ────────────────────────────────────────────────────────

  const getOptionState = (letter) => {
    if (!submitted) return selected.has(letter) ? 'selected' : 'idle';
    const correctSet = new Set(
      Array.isArray(question.correct) ? question.correct : [question.correct]
    );
    if (correct) return correctSet.has(letter) ? 'correct' : 'idle';
    // Wrong answer was submitted
    if (selected.has(letter) && correctSet.has(letter)) return 'correct';
    if (selected.has(letter) && !correctSet.has(letter)) return 'wrong';
    if (!selected.has(letter) && correctSet.has(letter)) return 'missed';
    return 'idle';
  };

  // ── Render guard ────────────────────────────────────────────────────────

  if (!alarm) {
    return (
      <View style={s.center}>
        <Text style={{ color: '#555' }}>No alarm data. Go back.</Text>
      </View>
    );
  }

  const isLastQuestion = solved + 1 >= totalQ;

  return (
    <View style={s.root}>
      {paused && <PauseOverlay countdown={pauseCountdown} />}

      <SafeAreaView style={{ flex: 1 }}>

        <HeaderPulse alarm={alarm} />
        <ProgressDots total={totalQ} solved={solved} />

        {/* Meta row */}
        <View style={s.meta}>
          <Text style={s.metaText}>
            {alarm.subject || alarm.subjects?.join(' · ') || 'Mathematics'}  ·  D{normaliseDifficulty(alarm.difficulty)}
          </Text>
          <Text style={s.metaQ}>
            Q{solved + 1}/{totalQ}
            {question && (
              <Text style={s.metaType}>
                {'  '}·{'  '}{question.type === 'multi' ? 'MULTI-CORRECT' : 'SINGLE'}
              </Text>
            )}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Loading */}
          {loading && (
            <View style={s.center2}>
              <ActivityIndicator color="#4f8ef7" size="large" />
              <Text style={s.loadingTxt}>Generating question…</Text>
            </View>
          )}

          {/* Error */}
          {!loading && error && (
            <View style={s.center2}>
              <Text style={s.errorTxt}>Failed to load question.</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => loadQuestion(questionIndex)}>
                <Text style={s.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Question */}
          {!loading && !error && question && (
            <>
              {/* Wrong-attempt warning */}
              {wrongAttempts > 0 && !paused && !correct && (
                <View style={s.wrongWarn}>
                  <Text style={s.wrongWarnTxt}>
                    ✗  Wrong!{'  '}
                    {MAX_WRONG_BEFORE_PAUSE - wrongAttempts > 0
                      ? `${MAX_WRONG_BEFORE_PAUSE - wrongAttempts} attempt${MAX_WRONG_BEFORE_PAUSE - wrongAttempts > 1 ? 's' : ''} left before 30s timeout.`
                      : 'Triggering timeout…'}
                  </Text>
                </View>
              )}

              {/* Topic chip */}
              <View style={s.topicChip}>
                <Text style={s.topicChipTxt}>{question.subject}  ›  {question.topic}</Text>
              </View>

              {/* Question text */}
              <View style={s.qBox}>
                <Text style={s.qText}>{question.question}</Text>
              </View>

              {/* Options */}
              {['A', 'B', 'C', 'D'].map(letter => (
                <OptionBtn
                  key={letter}
                  letter={letter}
                  text={question.options[letter]}
                  state={getOptionState(letter)}
                  onPress={() => toggleOption(letter)}
                  disabled={submitted && (correct || wrongAttempts >= MAX_WRONG_BEFORE_PAUSE)}
                />
              ))}

              {/* Multi-correct hint */}
              {question.type === 'multi' && !submitted && (
                <Text style={s.multiHint}>Select ALL correct options, then Submit.</Text>
              )}

              {/* Submit */}
              {!correct && (
                <TouchableOpacity
                  style={[s.submitBtn, (selected.size === 0 || (submitted && wrongAttempts < MAX_WRONG_BEFORE_PAUSE)) && s.submitDim]}
                  onPress={handleSubmit}
                  disabled={selected.size === 0 || (submitted && wrongAttempts < MAX_WRONG_BEFORE_PAUSE && !correct)}
                >
                  <Text style={s.submitTxt}>SUBMIT</Text>
                </TouchableOpacity>
              )}

              {/* Solution */}
              {correct && (
                <SolutionBox
                  question={question}
                  onNext={handleNext}
                  isLast={isLastQuestion}
                />
              )}

              <View style={{ height: 50 }} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060610' },
  center: { flex: 1, backgroundColor: '#060610', alignItems: 'center', justifyContent: 'center' },
  center2: { alignItems: 'center', paddingTop: 60, gap: 14 },

  meta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 4,
  },
  metaText: { color: '#2a2a44', fontSize: 11 },
  metaQ: { color: '#4f8ef7', fontSize: 12, fontWeight: '800' },
  metaType: { color: '#333', fontSize: 10, fontWeight: '400' },

  scroll: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 40 },

  loadingTxt: { color: '#333', fontSize: 13, marginTop: 8 },
  errorTxt: { color: '#ff2244', fontSize: 15 },
  retryBtn: {
    marginTop: 10, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#2a2a44',
  },
  retryTxt: { color: '#888', fontWeight: '700' },

  wrongWarn: {
    backgroundColor: '#1a0008', borderWidth: 1, borderColor: '#ff224430',
    borderRadius: 10, padding: 11, marginBottom: 12,
  },
  wrongWarnTxt: { color: '#ff2244', fontSize: 13, fontWeight: '600' },

  topicChip: {
    alignSelf: 'flex-start', backgroundColor: '#0e0e1f',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#1e1e3a', marginBottom: 10,
  },
  topicChipTxt: { color: '#444', fontSize: 11 },

  qBox: {
    backgroundColor: '#0a0a1a', borderRadius: 14,
    padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: '#1a1a2e',
  },
  qText: { color: '#dde0ff', fontSize: 16, lineHeight: 27, fontWeight: '500' },

  multiHint: { color: '#2a2a44', fontSize: 12, textAlign: 'center', marginBottom: 10 },

  submitBtn: {
    backgroundColor: '#4f8ef7', borderRadius: 13,
    paddingVertical: 17, alignItems: 'center', marginTop: 4,
    shadowColor: '#4f8ef7', shadowOpacity: 0.45, shadowRadius: 14, elevation: 9,
  },
  submitDim: { backgroundColor: '#1a1a2e', shadowOpacity: 0 },
  submitTxt: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
});
