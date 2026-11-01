const DURATIONS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const MODE_LABELS = { focus: 'TIME TO FOCUS', short: 'TAKE A BREATHER', long: 'TIME TO RESET' };
const MODE_HINTS = { focus: "Put your phone away. You've got this.", short: 'Stretch, hydrate, and rest your eyes.', long: 'You earned a longer break. Recharge.' };
const MODE_ICONS = { focus: '✦', short: '☁', long: '☼' };
let mode = 'focus';
let remaining = DURATIONS.focus;
let timerId = null;
let running = false;
let completedSessions = 0;
let focusMinutes = 0;
let soundOn = false;
let toastTimeout;
let audioContext;
const circumference = 2 * Math.PI * 112;
const $ = (id) => document.getElementById(id);

$('year').textContent = new Date().getFullYear();
$('ring-progress').style.strokeDasharray = circumference;
$('ring-progress').style.strokeDashoffset = 0;

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}
function renderTimer() {
  $('time-display').textContent = formatTime(remaining);
  $('timer-caption').textContent = MODE_LABELS[mode];
  $('timer-icon').textContent = MODE_ICONS[mode];
  $('timer-hint').textContent = MODE_HINTS[mode];
  $('session-count-label').textContent = `SESSION ${completedSessions + 1}`;
  const fraction = remaining / DURATIONS[mode];
  $('ring-progress').style.strokeDashoffset = circumference * (1 - fraction);
  document.title = `${formatTime(remaining)} · FocusFlow`;
}
function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  running = false;
  $('start-icon').textContent = '▶';
  $('start-label').textContent = mode === 'focus' ? 'Start focus' : 'Start break';
}
function startTimer() {
  if (running) { stopTimer(); return; }
  running = true;
  $('start-icon').textContent = 'Ⅱ';
  $('start-label').textContent = 'Pause timer';
  timerId = setInterval(() => {
    remaining -= 1;
    renderTimer();
    if (remaining <= 0) finishSession();
  }, 1000);
}
function setMode(nextMode) {
  stopTimer();
  mode = nextMode;
  remaining = DURATIONS[mode];
  document.querySelectorAll('.mode-tab').forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderTimer();
  $('start-label').textContent = mode === 'focus' ? 'Start focus' : 'Start break';
}
function finishSession() {
  stopTimer();
  remaining = 0;
  renderTimer();
  playChime();
  if (mode === 'focus') {
    completedSessions += 1;
    focusMinutes += 25;
    renderStats();
    showToast('Focus session complete! Time to take a break.');
    setMode(completedSessions % 4 === 0 ? 'long' : 'short');
  } else {
    showToast('Break complete. Ready for another focus session?');
    setMode('focus');
  }
}
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}
function playChime() {
  if (!soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    [0, .18, .36].forEach((delay, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine'; osc.frequency.value = [660, 790, 990][i];
      gain.gain.setValueAtTime(.0001, audioContext.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(.12, audioContext.currentTime + delay + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + delay + .2);
      osc.connect(gain); gain.connect(audioContext.destination);
      osc.start(audioContext.currentTime + delay); osc.stop(audioContext.currentTime + delay + .22);
    });
  } catch (e) { /* Sound is optional; the timer still works if audio is unavailable. */ }
}
$('start-pause').addEventListener('click', startTimer);
$('reset-timer').addEventListener('click', () => { stopTimer(); remaining = DURATIONS[mode]; renderTimer(); showToast('Timer reset.'); });
$('skip-timer').addEventListener('click', () => {
  if (mode === 'focus') setMode(completedSessions > 0 && completedSessions % 4 === 0 ? 'long' : 'short');
  else setMode('focus');
  showToast('Switched to the next session.');
});
document.querySelectorAll('.mode-tab').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

// Tasks are kept in this browser using localStorage, so they remain after a refresh.
let tasks = [];
try { tasks = JSON.parse(localStorage.getItem('focusflow-tasks') || '[]'); if (!Array.isArray(tasks)) tasks = []; } catch { tasks = []; }
function saveTasks() { try { localStorage.setItem('focusflow-tasks', JSON.stringify(tasks)); } catch { /* App remains usable without storage. */ } }
function renderTasks() {
  const list = $('task-list');
  list.innerHTML = '';
  const done = tasks.filter(task => task.done).length;
  $('task-count').textContent = `${done}/${tasks.length}`;
  if (!tasks.length) {
    const empty = document.createElement('li'); empty.className = 'empty-state'; empty.textContent = 'Add one small task to get started.'; list.appendChild(empty); return;
  }
  tasks.forEach(task => {
    const li = document.createElement('li'); li.className = `task-item${task.done ? ' done' : ''}`;
    const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'task-check'; check.checked = task.done; check.setAttribute('aria-label', `Mark ${task.text} complete`);
    check.addEventListener('change', () => { task.done = check.checked; saveTasks(); renderTasks(); });
    const text = document.createElement('span'); text.className = 'task-text'; text.textContent = task.text;
    const remove = document.createElement('button'); remove.className = 'delete-task'; remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Delete ${task.text}`);
    remove.addEventListener('click', () => { tasks = tasks.filter(item => item.id !== task.id); saveTasks(); renderTasks(); });
    li.append(check, text, remove); list.appendChild(li);
  });
}
$('task-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('task-input'); const text = input.value.trim();
  if (!text) { input.focus(); return; }
  tasks.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, done: false });
  saveTasks(); renderTasks(); input.value = ''; input.focus(); showToast('Task added. One step at a time.');
});
$('clear-completed').addEventListener('click', () => {
  const before = tasks.length; tasks = tasks.filter(task => !task.done); saveTasks(); renderTasks();
  showToast(before === tasks.length ? 'No completed tasks to clear.' : 'Completed tasks cleared.');
});
function renderStats() {
  $('focus-minutes').textContent = focusMinutes;
  $('completed-sessions').textContent = completedSessions;
  $('goal-label').textContent = `${Math.min(focusMinutes, 100)} / 100 min`;
  $('goal-progress').style.width = `${Math.min(100, focusMinutes)}%`;
}
$('sound-toggle').addEventListener('click', () => {
  soundOn = !soundOn;
  $('sound-toggle').textContent = soundOn ? '♪ Sound: on' : '♪ Sound: off';
  $('sound-toggle').setAttribute('aria-pressed', String(soundOn));
  if (soundOn) playChime();
});
renderTimer(); renderTasks(); renderStats();
