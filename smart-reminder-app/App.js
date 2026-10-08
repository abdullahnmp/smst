import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Modal, Switch, Animated, Alert,
  StyleSheet, StatusBar as RNStatusBar, KeyboardAvoidingView, Platform, Easing,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { C } from './src/theme';
import { loadState, saveState } from './src/storage';
import { setupNotifications, ensurePermission, rescheduleAll, upcoming } from './src/scheduler';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');
const toHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt12 = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
const repText = (n) =>
  n.rep === 'daily' ? 'Daily' : n.rep === 'days' ? n.days.map((d) => DAY_NAMES[d]).join(' ') : `Once${n.date ? ' ' + n.date : ''}`;
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : h < 21 ? 'Good evening.' : 'Good night.';
};

/* ---------- visual pieces ---------- */
function Background() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#05050c', '#0b0a1f', '#05050c']} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(110,80,255,0.35)', 'transparent']} style={[s.orb, { top: -160, left: -140 }]} />
      <LinearGradient colors={['rgba(40,210,190,0.22)', 'transparent']} style={[s.orb, { top: 260, right: -200 }]} />
      <LinearGradient colors={['rgba(255,79,154,0.18)', 'transparent']} style={[s.orb, { bottom: -200, left: -160 }]} />
    </View>
  );
}

function Rise({ index = 0, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 600, delay: 120 + index * 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function Fab({ onPress }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(p, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true })).start();
  }, []);
  return (
    <View style={s.fabWrap}>
      <Animated.View
        style={[s.fabPulse, { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]}
      />
      <Pressable onPress={onPress} accessibilityLabel="New note">
        <LinearGradient colors={[C.acc, C.acc2]} style={s.fab}>
          <Text style={s.fabPlus}>+</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <View style={s.seg}>
      {options.map(([k, label]) => (
        <Pressable key={String(k)} onPress={() => onChange(k)} style={[s.segBtn, value === k && s.segOn]}>
          <Text style={[s.segTxt, value === k && { color: C.acc }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- new note sheet ---------- */
function NoteSheet({ visible, onClose, onSave }) {
  const blank = { title: '', desc: '', times: [], rep: 'daily', days: [], date: '', alarm: false, on: true };
  const [d, setD] = useState(blank);
  useEffect(() => { if (visible) setD(blank); }, [visible]);

  const addTime = () =>
    DateTimePickerAndroid.open({
      value: new Date(), mode: 'time', is24Hour: false,
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        const t = toHM(date);
        setD((x) => (x.times.includes(t) ? x : { ...x, times: [...x.times, t].sort() }));
      },
    });
  const pickDate = () =>
    DateTimePickerAndroid.open({
      value: d.date ? new Date(d.date + 'T00:00:00') : new Date(), mode: 'date', minimumDate: new Date(),
      onChange: (e, date) => { if (e.type === 'set' && date) setD((x) => ({ ...x, date: toYMD(date) })); },
    });
  const toggleDay = (i) => setD((x) => ({ ...x, days: x.days.includes(i) ? x.days.filter((v) => v !== i) : [...x.days, i] }));
  const save = () => {
    if (!d.title.trim()) return Alert.alert('Add a headline first');
    if (d.times.length && d.rep === 'days' && !d.days.length) return Alert.alert('Pick at least one day');
    onSave({ ...d, id: String(Date.now()), title: d.title.trim(), desc: d.desc.trim() });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.panel}>
          <View style={s.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.h3}>New note</Text>
            <Text style={s.lbl}>Headline</Text>
            <TextInput style={s.input} value={d.title} onChangeText={(v) => setD({ ...d, title: v })} placeholder="What should it say?" placeholderTextColor={C.mute} maxLength={120} />
            <Text style={s.lbl}>Description (optional)</Text>
            <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} value={d.desc} onChangeText={(v) => setD({ ...d, desc: v })} multiline placeholderTextColor={C.mute} />

            <Text style={s.lbl}>Times</Text>
            <View style={s.wrap}>
              {d.times.map((t) => (
                <Pressable key={t} style={s.chipBtn} onPress={() => setD({ ...d, times: d.times.filter((x) => x !== t) })}>
                  <Text style={s.chipTxt}>{fmt12(t)}  ×</Text>
                </Pressable>
              ))}
              <Pressable style={[s.chipBtn, { backgroundColor: C.card }]} onPress={addTime}>
                <Text style={s.chipTxt}>+ Add time</Text>
              </Pressable>
            </View>

            {d.times.length > 0 && (
              <>
                <Text style={s.lbl}>Repeat</Text>
                <Seg options={[['once', 'Once'], ['daily', 'Daily'], ['days', 'Custom days']]} value={d.rep} onChange={(v) => setD({ ...d, rep: v })} />
                {d.rep === 'days' && (
                  <View style={s.daysRow}>
                    {DAY_LETTERS.map((l, i) => (
                      <Pressable key={i} onPress={() => toggleDay(i)} style={[s.day, d.days.includes(i) && s.dayOn]}>
                        <Text style={[s.dayTxt, d.days.includes(i) && { color: '#0b0a1a' }]}>{l}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {d.rep === 'once' && (
                  <Pressable style={[s.input, { marginTop: 10 }]} onPress={pickDate}>
                    <Text style={{ color: d.date ? C.ink : C.mute }}>{d.date || 'Next occurrence (tap to pick a date)'}</Text>
                  </Pressable>
                )}
                <Text style={s.lbl}>Alert type</Text>
                <Seg options={[[false, 'Notification'], [true, 'Alarm']]} value={d.alarm} onChange={(v) => setD({ ...d, alarm: v })} />
              </>
            )}

            <View style={s.line}>
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>Include in interval notifications</Text>
                <Text style={s.note}>Shown in serial order</Text>
              </View>
              <Switch value={d.on} onValueChange={(v) => setD({ ...d, on: v })} trackColor={{ true: C.acc2, false: C.line }} thumbColor="#fff" />
            </View>

            <View style={s.acts}>
              <Pressable style={[s.actBtn, { backgroundColor: C.card }]} onPress={onClose}><Text style={s.actTxt}>Cancel</Text></Pressable>
              <Pressable style={{ flex: 1 }} onPress={save}>
                <LinearGradient colors={[C.acc, C.acc2]} style={s.actBtn}><Text style={[s.actTxt, { color: '#0b0a1a' }]}>Save note</Text></LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [st, setSt] = useState({ notes: [], mins: 30, running: false, startAt: 0 });
  const [tab, setTab] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [now, setNow] = useState(Date.now());
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setupNotifications();
    (async () => {
      await ensurePermission();
      const saved = await loadState();
      if (saved) { setSt(saved); rescheduleAll(saved); }
    })();
    const i = setInterval(() => setNow(Date.now()), 1000);
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1800, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1800, useNativeDriver: true }),
    ])).start();
    return () => clearInterval(i);
  }, []);

  const commit = useCallback((next) => { setSt(next); saveState(next); rescheduleAll(next); }, []);

  const toggleRun = async () => {
    if (st.running) return commit({ ...st, running: false });
    if (!st.notes.some((n) => n.on)) return Alert.alert('Switch on at least one note first');
    if (!(await ensurePermission())) return Alert.alert('Allow notifications in system settings to use reminders');
    commit({ ...st, running: true, startAt: Date.now() + 3000 });
  };
  const remove = (n) =>
    Alert.alert('Delete note?', n.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => commit({ ...st, notes: st.notes.filter((x) => x.id !== n.id) }) },
    ]);
  const flip = (n, v) => commit({ ...st, notes: st.notes.map((x) => (x.id === n.id ? { ...x, on: v } : x)) });

  const up = upcoming(st, now);
  const left = up ? Math.max(0, Math.round((up.at - now) / 1000)) : 0;
  const progress = up ? Math.min(1, Math.max(0, 1 - (up.at - now) / (st.mins * 60000))) : 0;
  const included = st.notes.filter((n) => n.on).length;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Background />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {tab === 0 ? (
          <>
            <Rise index={0}><Text style={s.h1}>Smart Reminder</Text></Rise>
            <Rise index={1}><Text style={s.sub}>{greeting()} Here is your plan.</Text></Rise>

            <Rise index={2}>
              <View style={s.hero}>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.heroGlow, { opacity: st.running ? glow : 0 }]} />
                <Text style={s.small}>{st.running ? 'Up next' : 'Interval notifications are off'}</Text>
                <Text style={s.heroTitle} numberOfLines={2}>{up ? up.note.title : st.notes.length ? 'Tap Start to begin' : 'Add a note to begin'}</Text>
                {st.running && up && (
                  <>
                    <View style={s.track}><View style={[s.fill, { width: `${progress * 100}%` }]} /></View>
                    <Text style={s.small}>in {Math.floor(left / 60)}:{pad(left % 60)}</Text>
                  </>
                )}
                <Pressable onPress={toggleRun} style={{ marginTop: 14, alignSelf: 'flex-start' }}>
                  <LinearGradient colors={st.running ? [C.hot, C.hot] : [C.acc, C.acc2]} style={s.pill}>
                    <Text style={[s.pillTxt, st.running && { color: '#fff' }]}>{st.running ? 'Stop' : 'Start'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </Rise>

            <Rise index={3}>
              <View style={s.secRow}>
                <Text style={s.h2}>My notes</Text>
                <Text style={s.small}>{st.notes.length} total, {included} in rotation</Text>
              </View>
            </Rise>

            {!st.notes.length && <Text style={s.empty}>No notes yet.{'\n'}Tap + to create your first one.</Text>}
            {st.notes.map((n, i) => (
              <Rise key={n.id} index={4 + i}>
                <View style={s.card}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{n.title}</Text>
                      {!!n.desc && <Text style={s.cardDesc} numberOfLines={2}>{n.desc}</Text>}
                    </View>
                    <Switch value={n.on} onValueChange={(v) => flip(n, v)} trackColor={{ true: C.acc2, false: C.line }} thumbColor="#fff" />
                  </View>
                  <View style={s.wrap}>
                    {n.times.map((t) => <Text key={t} style={s.chip}>{fmt12(t)}</Text>)}
                    {n.times.length > 0 && <Text style={s.chip}>{repText(n)}</Text>}
                    {n.times.length > 0 && n.alarm && <Text style={[s.chip, s.chipAlarm]}>Alarm</Text>}
                  </View>
                  <Pressable onPress={() => remove(n)}><Text style={s.del}>Delete</Text></Pressable>
                </View>
              </Rise>
            ))}
          </>
        ) : (
          <>
            <Rise index={0}><Text style={s.h1}>Settings</Text></Rise>
            <Rise index={1}><Text style={s.sub}>Interval notifications</Text></Rise>
            <Rise index={2}>
              <View style={s.card}>
                <Text style={s.bold}>Notify me every</Text>
                <View style={[s.wrap, { marginVertical: 12 }]}>
                  {[15, 30, 60, 120].map((m) => (
                    <Pressable key={m} onPress={() => commit({ ...st, mins: m, startAt: st.running ? Date.now() + 3000 : st.startAt })} style={[s.opt, st.mins === m && s.optOn]}>
                      <Text style={[s.optTxt, st.mins === m && { color: C.acc }]}>{m >= 60 ? `${m / 60} h` : `${m} min`}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.bold}>Order</Text>
                <View style={[s.wrap, { marginVertical: 12 }]}><View style={[s.opt, s.optOn]}><Text style={[s.optTxt, { color: C.acc }]}>Serial, from the first note</Text></View></View>
                <Pressable onPress={toggleRun}>
                  <LinearGradient colors={st.running ? [C.hot, C.hot] : [C.acc, C.acc2]} style={s.big}>
                    <Text style={[s.bigTxt, st.running && { color: '#fff' }]}>{st.running ? 'Stop notifications' : 'Start notifications'}</Text>
                  </LinearGradient>
                </Pressable>
                <Text style={s.note}>Only the note headline is shown. Notes switched off are skipped. The next 60 notifications are queued, and the queue refreshes whenever you open the app.</Text>
              </View>
            </Rise>
          </>
        )}
      </ScrollView>

      <View style={s.navWrap} pointerEvents="box-none">
        <View style={s.nav}>
          <Pressable onPress={() => setTab(0)} style={[s.navBtn, tab === 0 && s.navOn]}><Text style={[s.navTxt, tab === 0 && { color: C.ink }]}>Notes</Text></Pressable>
          <Fab onPress={() => setSheet(true)} />
          <Pressable onPress={() => setTab(1)} style={[s.navBtn, tab === 1 && s.navOn]}><Text style={[s.navTxt, tab === 1 && { color: C.ink }]}>Settings</Text></Pressable>
        </View>
      </View>

      <NoteSheet visible={sheet} onClose={() => setSheet(false)} onSave={(n) => { commit({ ...st, notes: [...st.notes, n] }); setSheet(false); setTab(0); }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  orb: { position: 'absolute', width: 420, height: 420, borderRadius: 210 },
  scroll: { paddingTop: (RNStatusBar.currentHeight || 40) + 18, paddingHorizontal: 18, paddingBottom: 150 },
  h1: { color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  sub: { color: C.mute, marginTop: 4, marginBottom: 22, fontSize: 14 },
  h2: { color: C.ink, fontSize: 16, fontWeight: '600' },
  h3: { color: C.ink, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  small: { color: C.mute, fontSize: 12 },
  bold: { color: C.ink, fontWeight: '600', fontSize: 14.5 },
  note: { color: C.mute, fontSize: 12.5, marginTop: 12, lineHeight: 18 },
  hero: { backgroundColor: 'rgba(155,140,255,0.14)', borderColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderRadius: 28, padding: 20, marginBottom: 26, overflow: 'hidden' },
  heroGlow: { backgroundColor: 'rgba(94,225,208,0.10)' },
  heroTitle: { color: C.ink, fontSize: 20, fontWeight: '600', marginTop: 4, marginBottom: 12, letterSpacing: -0.2 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden', marginBottom: 8 },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.acc2 },
  pill: { borderRadius: 99, paddingVertical: 10, paddingHorizontal: 24 },
  pillTxt: { color: '#0b0a1a', fontWeight: '700', fontSize: 13 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, paddingHorizontal: 4 },
  empty: { color: C.mute, textAlign: 'center', paddingVertical: 36, lineHeight: 22 },
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitle: { color: C.ink, fontSize: 15.5, fontWeight: '600' },
  cardDesc: { color: C.mute, fontSize: 13.5, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { backgroundColor: 'rgba(155,140,255,0.16)', color: C.acc, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 3, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  chipAlarm: { backgroundColor: 'rgba(255,107,139,0.16)', color: C.hot },
  del: { color: C.mute, fontSize: 12, marginTop: 12 },
  navWrap: { position: 'absolute', left: 0, right: 0, bottom: 22, alignItems: 'center' },
  nav: { width: '88%', maxWidth: 400, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: 'rgba(24,22,48,0.94)', borderColor: C.line, borderWidth: 1, borderRadius: 30, paddingVertical: 8, paddingHorizontal: 10 },
  navBtn: { paddingVertical: 11, paddingHorizontal: 22, borderRadius: 20 },
  navOn: { backgroundColor: 'rgba(155,140,255,0.16)' },
  navTxt: { color: C.mute, fontWeight: '600' },
  fabWrap: { width: 56, height: 56, marginTop: -30, alignItems: 'center', justifyContent: 'center' },
  fabPulse: { position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: C.acc2 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fabPlus: { color: '#0b0a1a', fontSize: 30, lineHeight: 34 },
  opt: { borderColor: C.line, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: C.card },
  optOn: { borderColor: C.acc, backgroundColor: 'rgba(155,140,255,0.16)' },
  optTxt: { color: C.ink, fontWeight: '600' },
  big: { borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  bigTxt: { color: '#0b0a1a', fontWeight: '700', fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,5,15,0.6)' },
  panel: { backgroundColor: C.sheet, borderColor: C.line, borderWidth: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, maxHeight: '92%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 4, backgroundColor: C.line, marginBottom: 14 },
  lbl: { color: C.mute, fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 15 },
  chipBtn: { backgroundColor: 'rgba(155,140,255,0.16)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7 },
  chipTxt: { color: C.acc, fontWeight: '600', fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: 'rgba(155,140,255,0.16)' },
  segTxt: { color: C.mute, fontWeight: '600', fontSize: 13 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  day: { width: 40, height: 40, borderRadius: 20, borderColor: C.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.acc2, borderColor: C.acc2 },
  dayTxt: { color: C.ink, fontWeight: '600', fontSize: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  acts: { flexDirection: 'row', gap: 10, marginTop: 24 },
  actBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  actTxt: { color: C.ink, fontWeight: '700' },
});
