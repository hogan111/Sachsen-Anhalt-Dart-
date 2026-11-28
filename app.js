/* =========================================
   SACHSEN-ANHALT DART
   Vollständige, bereinigte App-Logik
   ========================================= */

"use strict";

/* Zentrale Hilfsfunktionen */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const STORAGE_KEY = "sachsen-anhalt-dart-v1";
const PREFERENCES_KEY = "sachsen-anhalt-dart-preferences";

const DART_NUMBERS = [
  20, 1, 18, 4, 13,
  6, 10, 15, 2, 17,
  3, 19, 7, 16, 8,
  11, 14, 9, 12, 5
];

const BOARD_COLORS = {
  dark: "#20252d",
  light: "#f2e7d2",
  green: "#27864e",
  red: "#c94b43"
};

const EXTRA_MODES = [
  { id: "shanghai", name: "Shanghai", info: "Zielzahl mit Single, Double und Triple treffen" },
  { id: "one20", name: "1 bis 20", info: "Die Zahlen von 1 bis 20 nacheinander treffen" },
  { id: "splitscore", name: "Splitscore", info: "Punkte sammeln und den eigenen Wert halten" },
  { id: "elimination", name: "Elimination", info: "Punkte sammeln und Gegner überholen" },
  { id: "killer", name: "Killer", info: "Ein besonderer Mehrspieler-Modus" },
  { id: "shooter", name: "Shooter", info: "Treffer sammeln und Runde für Runde punkten" }
];

const MODE_LABELS = {
  x01: "X01",
  durst: "Dart & Durst",
  cricket: "Cricket",
  highscore: "Highscore",
  around: "Around the Clock",
  training: "Training",
  shanghai: "Shanghai",
  one20: "1 bis 20",
  "1to20": "1 bis 20",
  splitscore: "Splitscore",
  elimination: "Elimination",
  killer: "Killer",
  shooter: "Shooter"
};

const MODE_CONFIGS = {
  x01: {
    name: "X01",
    description: "301, 501, 701, 901 oder 1001 Punkte auf 0 herunterspielen.",
    scoring: "subtract"
  },
  durst: {
    name: "Dart & Durst",
    description: "Nur Double, Triple, Bull und Bullseye zählen. Singles und Fehlwürfe zählen null.",
    scoring: "special"
  },
  cricket: {
    name: "Cricket",
    description: "Zahlen von 15 bis 20 und Bull schließen (3 Treffer) und danach bei offenen Zielen punkten.",
    scoring: "marks"
  },
  highscore: {
    name: "Highscore",
    description: "In den gewählten Runden so viele Punkte wie möglich sammeln.",
    scoring: "add"
  },
  around: {
    name: "Around the Clock",
    description: "Die Zahlen von 1 bis 20 der Reihe nach treffen.",
    scoring: "sequence"
  },
  one20: {
    name: "1 bis 20",
    description: "Die Zahlen von 1 bis 20 nacheinander treffen.",
    scoring: "sequence"
  },
  "1to20": {
    name: "1 bis 20",
    description: "Die Zahlen von 1 bis 20 nacheinander treffen.",
    scoring: "sequence"
  },
  training: {
    name: "Training",
    description: "Gezielt Treffsicherheit, Doppel, Triple oder Around the Clock trainieren.",
    scoring: "training"
  },
  shanghai: {
    name: "Shanghai",
    description: "In jeder Runde zählt die aktuelle Rundenzahl. Single, Double und Triple derselben Zahl ergeben ein Shanghai.",
    scoring: "special"
  },
  splitscore: {
    name: "Splitscore",
    description: "Rundenziele treffen – bei Fehlwurf halbiert sich der Punktestand.",
    scoring: "special"
  },
  elimination: {
    name: "Elimination",
    description: "Punkte sammeln und Gegner überholen.",
    scoring: "special"
  },
  killer: {
    name: "Killer",
    description: "Treffer sammeln und im Mehrspieler-Modus Punkte erzielen.",
    scoring: "special"
  },
  shooter: {
    name: "Shooter",
    description: "Treffer sammeln und Runde für Runde punkten.",
    scoring: "special"
  }
};

/* Zentrale App-Daten */

const app = {
  currentPage: "home",
  selectedMode: "x01",
  players: [],
  completedGames: [],
  tournaments: [],
  trainingHistory: [],
  errorLog: [],
  game: null,

  settings: {
    voicePlayer: true,
    voiceScore: true,
    voiceResults: true,
    voiceSpeed: 1,
    confirmEnd: true,
    keepScreenOn: false,
    animations: true,
    compactView: false,
    soundEffects: true
  }
};

const tournamentState = {
  currentId: null
};

const trainingState = {
  active: false,
  type: "highscore",
  round: 1,
  maxRounds: 10,
  dartsThrown: 0,
  totalPoints: 0,
  results: [],
  currentTarget: 20
};

let dartUndoSnapshots = [];
let visitUndoSnapshots = [];
let durstFinishTimer = null;
let screenWakeLock = null;
let deferredInstallPrompt = null;
let gameClockInterval = null;

/* ID-Generator */

function generateId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

/* Toast-Meldungen */

function toast(message) {
  const element = $("#toast");
  if (!element) return;

  element.textContent = String(message || "");
  element.classList.add("show");

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 2600);
}

function setGameMessage(message) {
  const el = $("#game-message");
  if (el) {
    el.textContent = message || "";
  }
}

/* Spielstand sicher kopieren */

function cloneData(data) {
  try {
    return structuredClone(data);
  } catch (_) {
    return JSON.parse(JSON.stringify(data));
  }
}

/* Fehlerprotokoll */

function logAppError(message, details = "") {
  const entry = {
    message: String(message || "Unbekannter Fehler"),
    source: String(details || "App"),
    details: String(details || ""),
    date: new Date().toISOString(),
    timestamp: new Date().toISOString()
  };

  if (!Array.isArray(app.errorLog)) {
    app.errorLog = [];
  }

  app.errorLog.push(entry);
  if (app.errorLog.length > 100) {
    app.errorLog = app.errorLog.slice(-100);
  }

  console.error("[Sachsen-Anhalt Dart]", entry.message, entry.details);

  try {
    saveData();
  } catch (_) {
    // Ignorieren, falls Speichern nicht möglich
  }
}

/* Speichern & Laden */

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      players: app.players,
      history: app.completedGames,
      tournaments: app.tournaments,
      trainingHistory: app.trainingHistory,
      errorLog: app.errorLog,
      settings: app.settings
    }));
  } catch (_) {
    toast("Speichern momentan nicht möglich.");
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;

    app.players = Array.isArray(saved.players) ? saved.players : [];
    app.completedGames = Array.isArray(saved.history)
      ? saved.history
      : Array.isArray(saved.completedGames)
        ? saved.completedGames
        : [];
    app.tournaments = Array.isArray(saved.tournaments) ? saved.tournaments : [];
    app.trainingHistory = Array.isArray(saved.trainingHistory) ? saved.trainingHistory : [];
    app.errorLog = Array.isArray(saved.errorLog) ? saved.errorLog : [];

    if (saved.settings && typeof saved.settings === "object") {
      app.settings = {
        ...app.settings,
        ...saved.settings
      };
    }
  } catch (_) {
    console.warn("Gespeicherte Daten konnten nicht geladen werden.");
  }
}

function validateAppData() {
  const warnings = [];

  if (!Array.isArray(app.players)) {
    warnings.push("Spielerliste war ungültig und wurde zurückgesetzt.");
    app.players = [];
  }
  if (!Array.isArray(app.completedGames)) {
    warnings.push("Spielverlauf war ungültig und wurde zurückgesetzt.");
    app.completedGames = [];
  }
  if (!Array.isArray(app.tournaments)) {
    warnings.push("Turnierliste war ungültig und wurde zurückgesetzt.");
    app.tournaments = [];
  }
  if (!Array.isArray(app.trainingHistory)) {
    app.trainingHistory = [];
  }
  if (!Array.isArray(app.errorLog)) {
    app.errorLog = [];
  }

  app.players.forEach((player, index) => {
    if (!player || typeof player !== "object") return;
    if (!player.id) player.id = generateId("player");
    player.name = typeof player.name === "string" && player.name.trim()
      ? player.name.trim()
      : "Spieler " + (index + 1);
    player.games = Number.isFinite(Number(player.games)) ? Number(player.games) : 0;
    player.wins = Number.isFinite(Number(player.wins)) ? Number(player.wins) : 0;
    player.totalPoints = Number.isFinite(Number(player.totalPoints)) ? Number(player.totalPoints) : 0;
    player.totalDarts = Number.isFinite(Number(player.totalDarts)) ? Number(player.totalDarts) : 0;
    player.bestVisit = Number.isFinite(Number(player.bestVisit)) ? Number(player.bestVisit) : 0;
  });

  return warnings;
}

function checkAppDataIntegrity() {
  const problems = [];

  if (!Array.isArray(app.players)) {
    problems.push("Die Spielerliste ist nicht verfügbar.");
  } else {
    const ids = app.players.map(p => p && p.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      problems.push("Es gibt doppelte Spieler-IDs.");
    }
    app.players.forEach((player, idx) => {
      if (!player || typeof player !== "object") {
        problems.push(`Spieler ${idx + 1} ist ungültig.`);
        return;
      }
      if (!player.name || typeof player.name !== "string" || !player.name.trim()) {
        problems.push(`Spieler ${idx + 1} hat keinen gültigen Namen.`);
      }
      if (!Number.isFinite(Number(player.totalPoints))) {
        problems.push(`${player.name || "Spieler"}: Gesamtpunkte prüfen.`);
      }
      if (!Number.isFinite(Number(player.totalDarts)) || Number(player.totalDarts) < 0) {
        problems.push(`${player.name || "Spieler"}: Dart-Anzahl prüfen.`);
      }
    });
  }

  if (!Array.isArray(app.completedGames)) {
    problems.push("Die Spielhistorie ist nicht verfügbar.");
  }
  if (!Array.isArray(app.tournaments)) {
    problems.push("Die Turnierliste ist nicht verfügbar.");
  }

  return problems;
}

function saveGamePreferences() {
  const preferences = {
    mode: app.selectedMode || "x01",
    startScore: $("#x01-start")?.value || "501",
    inRule: $("#x01-in")?.value || "single",
    outRule: $("#x01-out")?.value || "double",
    rounds: $("#round-limit")?.value || "10"
  };

  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (_) {
    // Ignorieren
  }
}

function loadGamePreferences() {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return;

    const preferences = JSON.parse(raw);
    if (!preferences || typeof preferences !== "object") return;

    const fields = [
      ["#x01-start", preferences.startScore],
      ["#x01-in", preferences.inRule],
      ["#x01-out", preferences.outRule],
      ["#round-limit", preferences.rounds]
    ];

    fields.forEach(([selector, value]) => {
      const field = $(selector);
      if (field && value !== undefined) {
        field.value = String(value);
      }
    });
  } catch (_) {
    // Ignorieren
  }
}

/* Datum & Dauer formatieren */

function formatGameDate(dateValue) {
  if (!dateValue) return "Datum unbekannt";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Datum unbekannt";
  return date.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getGameDurationSeconds(game) {
  if (!game || !game.startedAt) return 0;
  const start = Number(game.startedAt);
  const end = Number(game.finishedAt) || Date.now();
  if (!Number.isFinite(start) || end < start) return 0;
  return Math.floor((end - start) / 1000);
}

function formatGameDuration(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours} Std. ${minutes} Min.`;
  }
  return `${minutes} Min. ${secs} Sek.`;
}

/* Soundeffekte & Sprachkommentator */

function playAppSound(type = "tap") {
  if (!app.settings.soundEffects) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const context = new AudioCtx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    const freqs = { tap: 440, success: 660, finish: 880, bust: 220 };
    oscillator.frequency.value = freqs[type] || freqs.tap;
    oscillator.type = "sine";

    gain.gain.setValueAtTime(0.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.onended = () => {
      try { context.close(); } catch (_) {}
    };
  } catch (_) {
    // Ignorieren
  }
}

function announce(message, category = "score") {
  if (!("speechSynthesis" in window)) return;

  const normalizedCategory = category === "results" ? "result" : category;
  const allowed = {
    player: app.settings.voicePlayer,
    score: app.settings.voiceScore,
    result: app.settings.voiceResults
  };

  if (allowed[normalizedCategory] === false) return;

  try {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(String(message || ""));
    speech.lang = "de-DE";
    speech.rate = Number(app.settings.voiceSpeed || 1);
    speech.pitch = 1;
    speech.volume = 1;
    window.speechSynthesis.speak(speech);
  } catch (_) {
    // Ignorieren
  }
}

function announceDart(result) {
  if (!result) return;

  if (result.type === "miss" || Number(result.score) === 0) {
    announce("Pappe!", "score");
    return;
  }
  if (result.type === "bullseye") {
    announce("Bullseye!", "score");
    return;
  }
  if (result.type === "bull") {
    announce("Bull!", "score");
    return;
  }

  const multiplier = Number(result.multiplier || 1);
  const number = Number(result.number || 0);
  const prefix = multiplier === 3 ? "Triple" : multiplier === 2 ? "Double" : "Single";
  announce(`${prefix} ${number}`, "score");
}

function announceCurrentPlayer() {
  const player = getCurrentPlayer();
  if (!player) return;
  announce(`${player.name} ist dran!`, "player");
}

/* Bildschirm-Wachhalten */

async function updateScreenWakeLock() {
  if (!("wakeLock" in navigator)) return;

  const shouldLock = Boolean(
    app.settings.keepScreenOn &&
    app.game &&
    !app.game.finished &&
    app.currentPage === "game"
  );

  if (shouldLock) {
    if (screenWakeLock) return;
    try {
      screenWakeLock = await navigator.wakeLock.request("screen");
      screenWakeLock.addEventListener("release", () => {
        screenWakeLock = null;
      });
    } catch (_) {
      console.warn("Bildschirm-Wachhalten nicht verfügbar.");
    }
  } else if (screenWakeLock) {
    try {
      await screenWakeLock.release();
    } catch (_) {
      // Ignorieren
    }
    screenWakeLock = null;
  }
}

function applyComfortSettings() {
  document.body.classList.toggle("no-animations", !app.settings.animations);
  document.body.classList.toggle("compact-view", Boolean(app.settings.compactView));
}

function loadVoiceSettings() {
  const setChecked = (sel, val) => {
    const el = $(sel);
    if (el) el.checked = Boolean(val);
  };

  setChecked("#voice-player", app.settings.voicePlayer);
  setChecked("#voice-score", app.settings.voiceScore);
  setChecked("#voice-results", app.settings.voiceResults);
  setChecked("#confirm-end", app.settings.confirmEnd);
  setChecked("#keep-screen-on", app.settings.keepScreenOn);
  setChecked("#setting-animations", app.settings.animations);
  setChecked("#setting-compact", app.settings.compactView);
  setChecked("#setting-sounds", app.settings.soundEffects);

  const speedEl = $("#voice-speed");
  if (speedEl) {
    speedEl.value = String(app.settings.voiceSpeed ?? 1);
  }
}

function saveVoiceSettings() {
  const voicePlayer = $("#voice-player");
  const voiceScore = $("#voice-score");
  const voiceResults = $("#voice-results");
  const voiceSpeed = $("#voice-speed");
  const confirmEnd = $("#confirm-end");
  const keepScreenOn = $("#keep-screen-on");

  if (voicePlayer) app.settings.voicePlayer = voicePlayer.checked;
  if (voiceScore) app.settings.voiceScore = voiceScore.checked;
  if (voiceResults) app.settings.voiceResults = voiceResults.checked;
  if (voiceSpeed) app.settings.voiceSpeed = Number(voiceSpeed.value) || 1;
  if (confirmEnd) app.settings.confirmEnd = confirmEnd.checked;
  if (keepScreenOn) app.settings.keepScreenOn = keepScreenOn.checked;

  saveData();
  updateScreenWakeLock();
}

/* Seitennavigation */

function showPage(pageName) {
  if (!pageName) return;

  $$(".page").forEach(page => {
    const isMatch = page.dataset.page === pageName;
    page.classList.toggle("active", isMatch);
    page.hidden = !isMatch;
  });

  app.currentPage = pageName;
  updateScreenWakeLock();

  if (pageName === "players") {
    renderPlayers();
    renderProfileExportOptions();
  } else if (pageName === "stats") {
    renderStatistics();
  } else if (pageName === "history") {
    renderGameHistory();
  } else if (pageName === "tournament") {
    renderTournamentPlayerList();
    renderTournament();
    renderTournamentArchive();
  } else if (pageName === "training") {
    renderTrainingHistory();
    renderBoardTraining();
  } else if (pageName === "settings") {
    loadVoiceSettings();
    renderErrorLog();
    renderAppSystemCheck();
    renderDataIntegrity();
    renderFullDiagnostics();
  } else if (pageName === "game" && app.game) {
    renderGame();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* Spieler anlegen & verwalten */

function getPlayerStatistics(player) {
  const gamesFromHistory = app.completedGames.filter(game =>
    Array.isArray(game.players) && game.players.some(item => item.name === player.name)
  );

  const winsFromHistory = gamesFromHistory.filter(
    game => game.winner === player.name
  ).length;

  const games = Math.max(Number(player.games) || 0, gamesFromHistory.length);
  const wins = Math.max(Number(player.wins) || 0, winsFromHistory);
  const totalDarts = Number(player.totalDarts) || 0;
  const totalPoints = Number(player.totalPoints) || 0;
  const average = totalDarts > 0 ? totalPoints / totalDarts : 0;

  return {
    games,
    wins,
    losses: Math.max(0, games - wins),
    darts: totalDarts,
    points: totalPoints,
    average,
    threeDartAverage: average * 3,
    bestVisit: Number(player.bestVisit) || 0
  };
}

function addPlayer(name) {
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    toast("Bitte einen Spielernamen eingeben.");
    return false;
  }

  if (cleanName.length > 24) {
    toast("Der Name ist zu lang (max. 24 Zeichen).");
    return false;
  }

  const exists = app.players.some(
    player => player.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (exists) {
    toast("Diesen Spieler gibt es bereits.");
    return false;
  }

  app.players.push({
    id: generateId("player"),
    name: cleanName,
    games: 0,
    wins: 0,
    totalPoints: 0,
    totalDarts: 0,
    bestVisit: 0
  });

  saveData();
  renderPlayers();
  renderSetupPlayers();
  renderTournamentPlayerList();
  renderProfileExportOptions();
  renderStatistics();

  toast(cleanName + " wurde hinzugefügt.");
  return true;
}

function deletePlayer(playerId) {
  const player = app.players.find(item => item.id === playerId);
  if (!player) return;

  if (!window.confirm(player.name + " wirklich löschen?")) return;

  app.players = app.players.filter(item => item.id !== playerId);

  const panel = $("#player-detail-panel");
  if (panel && panel.dataset.playerId === playerId) {
    panel.remove();
  }

  saveData();
  renderPlayers();
  renderSetupPlayers();
  renderTournamentPlayerList();
  renderProfileExportOptions();
  renderStatistics();

  toast("Spieler wurde gelöscht.");
}

function showPlayerDetails(playerId) {
  const player = app.players.find(item => item.id === playerId);
  if (!player) return;

  const stats = getPlayerStatistics(player);
  const oldPanel = $("#player-detail-panel");
  if (oldPanel) oldPanel.remove();

  const panel = document.createElement("section");
  panel.id = "player-detail-panel";
  panel.className = "section-block";
  panel.dataset.playerId = player.id;

  const heading = document.createElement("h2");
  heading.textContent = player.name;

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Schließen";
  close.addEventListener("click", () => panel.remove());

  const details = [
    ["Spiele", stats.games],
    ["Siege", stats.wins],
    ["Niederlagen", stats.losses],
    ["Geworfene Darts", stats.darts],
    ["Erfasste Punkte", stats.points],
    ["3-Dart-Average", stats.threeDartAverage.toFixed(2)],
    ["Punkte pro Dart", stats.average.toFixed(2)],
    ["Beste Aufnahme", stats.bestVisit]
  ];

  panel.append(heading, close);

  details.forEach(([labelText, valueText]) => {
    const row = document.createElement("div");
    row.className = "scoreboard-row";

    const label = document.createElement("span");
    label.textContent = labelText;

    const value = document.createElement("strong");
    value.textContent = String(valueText);

    row.append(label, value);
    panel.appendChild(row);
  });

  const profilePage = $('[data-page="players"]');
  profilePage?.appendChild(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPlayers() {
  const container = $("#player-profiles");
  if (!container) return;

  container.innerHTML = "";

  if (app.players.length === 0) {
    container.textContent = "Noch keine Spieler angelegt.";
    return;
  }

  app.players.forEach(player => {
    const stats = getPlayerStatistics(player);
    const card = document.createElement("div");
    card.className = "player-card";

    const name = document.createElement("strong");
    name.textContent = player.name;

    const details = document.createElement("p");
    details.textContent =
      `Spiele: ${stats.games} · Siege: ${stats.wins} · 3-Dart-Ø: ${stats.threeDartAverage.toFixed(2)} · Beste Aufnahme: ${stats.bestVisit}`;

    const showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.textContent = "Profil ansehen";
    showBtn.addEventListener("click", () => showPlayerDetails(player.id));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Spieler löschen";
    removeBtn.addEventListener("click", () => deletePlayer(player.id));

    card.append(name, details, showBtn, removeBtn);
    container.appendChild(card);
  });
}

function renderSetupPlayers() {
  const container = $("#setup-player-list");
  if (!container) return;

  const previouslyChecked = new Set(
    Array.from($$(".setup-player-checkbox:checked")).map(cb => cb.value)
  );
  const hadCheckboxes = $$(".setup-player-checkbox").length > 0;

  container.innerHTML = "";

  if (app.players.length === 0) {
    container.textContent = "Lege zuerst Spieler an.";
    return;
  }

  app.players.forEach(player => {
    const label = document.createElement("label");
    label.className = "setup-player";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = player.id;
    checkbox.className = "setup-player-checkbox";
    checkbox.checked = hadCheckboxes ? previouslyChecked.has(player.id) : true;

    const span = document.createElement("span");
    span.textContent = player.name;

    label.append(checkbox, span);
    container.appendChild(label);
  });
}

/* Zusatz-Modi auf Startseite einfügen */

function addExtraModeCards() {
  const home = $('[data-page="home"]');
  if (!home || $("#extra-mode-section")) return;

  const section = document.createElement("section");
  section.id = "extra-mode-section";
  section.className = "section-block";

  const heading = document.createElement("h2");
  heading.textContent = "Weitere Spielmodi";

  const grid = document.createElement("div");
  grid.className = "mode-grid";

  EXTRA_MODES.forEach(mode => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-card";
    button.dataset.mode = mode.id;

    const title = document.createElement("strong");
    title.className = "mode-name";
    title.textContent = mode.name;

    const info = document.createElement("span");
    info.className = "mode-description";
    info.textContent = mode.info;

    button.append(title, info);
    button.addEventListener("click", () => {
      selectModeAndOpenSetup(mode.id, mode.name);
    });

    grid.appendChild(button);
  });

  section.append(heading, grid);

  const quickLinksSection = home.querySelector(".quick-links")?.closest(".section-block");
  if (quickLinksSection) {
    home.insertBefore(section, quickLinksSection);
  } else {
    home.appendChild(section);
  }
}

function selectModeAndOpenSetup(modeId, customTitle = "") {
  app.selectedMode = modeId;

  const title = $("#setup-title");
  if (title) {
    title.textContent = customTitle || MODE_LABELS[modeId] || "Neues Dartspiel";
  }

  updateSetupOptions();
  renderSetupPlayers();
  saveGamePreferences();
  showPage("setup");
}

function updateSetupOptions() {
  const x01Options = $("#x01-options");
  const generalOptions = $("#general-options");
  const durstOptions = $("#durst-options");

  if (x01Options) {
    x01Options.hidden = app.selectedMode !== "x01";
  }
  if (generalOptions) {
    generalOptions.hidden = app.selectedMode === "x01" || app.selectedMode === "durst";
  }
  if (durstOptions) {
    durstOptions.hidden = app.selectedMode !== "durst";
  }
}

/* Dartboard zeichnen */

function boardPoint(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: 200 + radius * Math.cos(radians),
    y: 200 + radius * Math.sin(radians)
  };
}

function boardSectorPath(innerRadius, outerRadius, startAngle, endAngle) {
  const a = boardPoint(outerRadius, startAngle);
  const b = boardPoint(outerRadius, endAngle);
  const c = boardPoint(innerRadius, endAngle);
  const d = boardPoint(innerRadius, startAngle);

  return [
    "M", a.x, a.y,
    "A", outerRadius, outerRadius, 0, 0, 1, b.x, b.y,
    "L", c.x, c.y,
    "A", innerRadius, innerRadius, 0, 0, 0, d.x, d.y,
    "Z"
  ].join(" ");
}

function renderDartboard() {
  const board = $("#dartboard");
  if (!board) return;

  let svg = `
    <svg viewBox="0 0 400 400"
      width="100%" height="100%"
      role="group"
      aria-label="Interaktives Dartboard">
  `;

  DART_NUMBERS.forEach((number, index) => {
    const start = index * 18 - 9;
    const end = start + 18;
    const middle = start + 9;

    const singleColor = index % 2 === 0 ? BOARD_COLORS.light : BOARD_COLORS.dark;
    const ringColor = index % 2 === 0 ? BOARD_COLORS.green : BOARD_COLORS.red;

    const rings = [
      { inner: 115, outer: 165, multiplier: 1, color: singleColor },
      { inner: 95, outer: 115, multiplier: 3, color: ringColor },
      { inner: 20, outer: 95, multiplier: 1, color: singleColor },
      { inner: 165, outer: 185, multiplier: 2, color: ringColor }
    ];

    rings.forEach(ring => {
      const path = boardSectorPath(ring.inner, ring.outer, start, end);
      const kind = ring.multiplier === 3 ? "Triple" : ring.multiplier === 2 ? "Double" : "Single";

      svg += `
        <path
          class="dart-segment"
          d="${path}"
          fill="${ring.color}"
          stroke="#111820"
          stroke-width="1.5"
          data-number="${number}"
          data-multiplier="${ring.multiplier}"
          tabindex="0"
          role="button"
          aria-label="${kind} ${number}"
        />
      `;
    });

    const labelPosition = boardPoint(174, middle);

    svg += `
      <text
        x="${labelPosition.x}"
        y="${labelPosition.y + 5}"
        fill="#ffffff"
        font-size="15"
        font-weight="900"
        text-anchor="middle"
        pointer-events="none">
        ${number}
      </text>
    `;
  });

  svg += `
    <circle cx="200" cy="200" r="20"
      fill="${BOARD_COLORS.green}"
      stroke="#111820" stroke-width="2"
      class="dart-segment"
      data-type="bull"
      data-score="25"
      tabindex="0"
      role="button"
      aria-label="Bull 25 Punkte" />

    <circle cx="200" cy="200" r="10"
      fill="${BOARD_COLORS.red}"
      stroke="#111820" stroke-width="2"
      class="dart-segment"
      data-type="bullseye"
      data-score="50"
      tabindex="0"
      role="button"
      aria-label="Bullseye 50 Punkte" />

    <circle cx="200" cy="200" r="188"
      fill="none" stroke="#111820" stroke-width="5" />
  </svg>
  `;

  board.innerHTML = svg;
}

function calculateDart(number, multiplier) {
  const num = Number(number) || 0;
  const mult = Number(multiplier) || 0;
  return {
    number: num,
    multiplier: mult,
    type: num === 0 || mult === 0 ? "miss" : mult === 3 ? "triple" : mult === 2 ? "double" : "single",
    score: num * mult,
    label: num === 0 || mult === 0
      ? "Pappe!"
      : (mult === 3 ? "Triple " : mult === 2 ? "Double " : "Single ") + num
  };
}

function calculateBull(type) {
  if (type === "bullseye") {
    return {
      number: 25,
      multiplier: 2,
      type: "bullseye",
      score: 50,
      label: "Bullseye"
    };
  }

  return {
    number: 25,
    multiplier: 1,
    type: "bull",
    score: 25,
    label: "Bull"
  };
}

/* Spielstart & Spielregeln */

function getCurrentPlayer() {
  if (!app.game || !Array.isArray(app.game.players)) return null;
  return app.game.players[app.game.currentPlayer] || null;
}

function preparePlayerForMode(player, mode) {
  player.marks = { 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0, bull: 0 };
  player.cricketMarks = { 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0, 25: 0 };
  player.cricketPoints = 0;
  player.shanghaiHits = {};
  player.shanghai = false;
  player.target = 1;
  player.completed = false;
  player.eliminated = false;
  player.lives = 3;
  player.lastRoundScore = 0;
  if (mode !== "x01") {
    player.score = 0;
  }
}

function startGame() {
  if (durstFinishTimer) {
    clearTimeout(durstFinishTimer);
    durstFinishTimer = null;
  }

  const selectedIds = Array.from($$(".setup-player-checkbox:checked")).map(input => input.value);

  if (selectedIds.length === 0) {
    toast("Bitte mindestens einen Spieler auswählen.");
    return;
  }

  const selectedPlayers = selectedIds
    .map(id => app.players.find(player => player.id === id))
    .filter(Boolean);

  if (selectedPlayers.length === 0) {
    toast("Keine gültigen Spieler gefunden.");
    return;
  }

  const mode = app.selectedMode || "x01";
  const startScore = mode === "x01" ? Number($("#x01-start")?.value || 501) : 0;
  const inRule = $("#x01-in")?.value || "single";
  const outRule = $("#x01-out")?.value || "double";
  const roundsLimit = mode === "durst"
    ? 10
    : Math.max(1, Number($("#round-limit")?.value || 10));

  const players = selectedPlayers.map(player => {
    const p = {
      id: player.id,
      name: player.name,
      score: mode === "x01" ? startScore : 0,
      startScore,
      totalPoints: 0,
      totalDarts: 0,
      visits: 0,
      startedLeg: mode !== "x01" || inRule === "single"
    };
    preparePlayerForMode(p, mode);
    return p;
  });

  app.game = {
    id: generateId("game"),
    mode,
    players,
    currentPlayer: 0,
    round: 1,
    darts: [],
    history: [],
    finished: false,
    resultSaved: false,
    started: true,
    inRule,
    outRule,
    visitStart: startScore,
    bust: false,
    roundsLimit,
    winner: null,
    startScore,
    startedAt: Date.now(),
    finishedAt: null
  };

  dartUndoSnapshots = [];
  visitUndoSnapshots = [];
  setGameMessage("");
  saveGamePreferences();
  renderGame();
  showPage("game");
  playAppSound("success");

  if (app.game.players[0]) {
    announce(`${app.game.players[0].name} beginnt.`, "player");
  }
}

function isValidGameIn(result, player) {
  if (!app.game || player?.startedLeg) return true;
  const rule = app.game.inRule;
  if (rule === "single") return true;
  if (rule === "double") {
    return result.multiplier === 2 || result.type === "bullseye";
  }
  return result.multiplier >= 2 || result.type === "bull" || result.type === "bullseye";
}

function isValidGameOut(result) {
  if (!app.game) return true;
  const rule = app.game.outRule;
  if (rule === "single") return true;
  if (rule === "double") {
    return result.multiplier === 2 || result.type === "bullseye";
  }
  return result.multiplier >= 2 || result.type === "bull" || result.type === "bullseye";
}

function pushDartSnapshot() {
  if (!app.game) return;
  dartUndoSnapshots.push({
    game: cloneData(app.game),
    players: cloneData(app.players)
  });
  if (dartUndoSnapshots.length > 200) {
    dartUndoSnapshots.shift();
  }
}

function pushVisitSnapshot() {
  if (!app.game) return;
  visitUndoSnapshots.push({
    game: cloneData(app.game),
    players: cloneData(app.players)
  });
  if (visitUndoSnapshots.length > 100) {
    visitUndoSnapshots.shift();
  }
}

function recordDartToGame(game, player, dartObj, pointsAwarded) {
  const safePoints = Number(pointsAwarded) || 0;
  const entry = {
    ...dartObj,
    score: safePoints,
    player: player.name,
    playerName: player.name,
    round: game.round
  };

  game.darts.push(entry);
  game.history.push(entry);
  player.totalDarts = (Number(player.totalDarts) || 0) + 1;
  player.totalPoints = (Number(player.totalPoints) || 0) + safePoints;
  return entry;
}

function throwDart(result) {
  const game = app.game;
  if (!game || game.finished || !game.started) return;
  if (game.pendingTurnAdvance) {
    completePendingTurnAdvance();
  }
  if (Array.isArray(game.darts) && game.darts.length >= 3) return;

  const player = getCurrentPlayer();
  if (!player) return;

  if (durstFinishTimer) {
    clearTimeout(durstFinishTimer);
    durstFinishTimer = null;
  }

  pushDartSnapshot();
  setGameMessage("");

  if (game.mode === "x01") {
    handleX01Dart(game, player, result);
  } else if (game.mode === "durst") {
    handleDurstDart(game, player, result);
  } else if (game.mode === "cricket") {
    handleCricketDart(game, player, result);
  } else if (game.mode === "shanghai") {
    handleShanghaiDart(game, player, result);
  } else if (game.mode === "around" || game.mode === "one20" || game.mode === "1to20") {
    handleSequenceDart(game, player, result);
  } else if (game.mode === "splitscore") {
    handleSplitscoreDart(game, player, result);
  } else if (game.mode === "highscore" || game.mode === "elimination" || game.mode === "killer" || game.mode === "shooter") {
    handleAdditiveDart(game, player, result);
  } else {
    handleAdditiveDart(game, player, result);
  }
}

function handleX01Dart(game, player, result) {
  if (!player.startedLeg && !isValidGameIn(result, player)) {
    const dart = {
      ...result,
      score: 0,
      label: "Kein gültiger Start"
    };
    recordDartToGame(game, player, dart, 0);
    announceDart({ ...dart, score: 0 });
    playAppSound("tap");
    renderGame();
    if (game.darts.length >= 3) {
      finishVisit(false, true);
    }
    return;
  }

  const rawScore = Number(result.score) || 0;
  const newScore = player.score - rawScore;

  if (
    newScore < 0 ||
    (newScore === 1 && game.outRule !== "single") ||
    (newScore === 0 && !isValidGameOut(result))
  ) {
    game.bust = true;
    const bustPoints = Number(game.visitStart) - Number(player.score);
    player.totalPoints = Math.max(0, (Number(player.totalPoints) || 0) - bustPoints);
    player.score = game.visitStart;

    const bustDart = {
      ...result,
      score: 0,
      label: "Bust!"
    };
    recordDartToGame(game, player, bustDart, 0);
    setGameMessage("Bust! Punktestand der Aufnahme zurückgesetzt.");
    playAppSound("bust");
    announce("Bust!", "score");
    renderGame();
    finishVisit(true);
    return;
  }

  if (!player.startedLeg) {
    player.startedLeg = true;
  }

  player.score = newScore;
  recordDartToGame(game, player, result, rawScore);
  announceDart(result);
  playAppSound("tap");

  if (newScore === 0) {
    game.finished = true;
    game.winner = player;
    setGameMessage(`Game Shot! ${player.name} gewinnt!`);
    playAppSound("finish");
    announce("Game Shot!", "result");
    renderGame();
    finishGame();
    return;
  }

  renderGame();

  if (game.darts.length >= 3) {
    finishVisit(false, true);
  }
}

function handleDurstDart(game, player, result) {
  const counts =
    result.multiplier === 2 ||
    result.multiplier === 3 ||
    result.type === "bull" ||
    result.type === "bullseye";

  const pts = counts ? Number(result.score) || 0 : 0;
  const dart = {
    ...result,
    score: pts,
    label: counts ? result.label : "Pappe!"
  };

  player.score = (Number(player.score) || 0) + pts;
  recordDartToGame(game, player, dart, pts);
  playAppSound(counts ? "tap" : "bust");
  renderGame();

  if (!counts) {
    announce("Pappe!", "score");
  } else {
    announceDart(dart);
  }

  if (game.darts.length >= 3) {
    durstFinishTimer = setTimeout(() => {
      durstFinishTimer = null;
      if (app.game && !app.game.finished && app.game.darts.length >= 3) {
        finishVisit(false);
      }
    }, 300);
  }
}

function handleCricketDart(game, player, result) {
  const number = Number(result.number) || 0;
  const multiplier = Number(result.multiplier) || 1;

  let key = null;
  let scoreValue = 0;

  if ([15, 16, 17, 18, 19, 20].includes(number)) {
    key = String(number);
    scoreValue = number;
  } else if (number === 25 || result.type === "bull" || result.type === "bullseye") {
    key = result.type === "bullseye" ? "25" : "25";
    scoreValue = 25;
  }

  let points = 0;
  let label = result.label || "Pappe!";

  if (key) {
    const marksAdded = result.type === "bullseye" ? 2 : (multiplier === 3 ? 3 : multiplier === 2 ? 2 : 1);
    const oldMarks = Number(player.cricketMarks[key]) || 0;
    const newMarks = oldMarks + marksAdded;
    const extraMarks = Math.max(0, newMarks - 3);

    player.cricketMarks[key] = Math.min(3, newMarks);
    if (key === "25") {
      player.marks.bull = player.cricketMarks["25"];
    } else {
      player.marks[key] = player.cricketMarks[key];
    }

    if (extraMarks > 0) {
      const opponents = game.players.filter(other => other.id !== player.id);
      const opponentsStillOpen = opponents.length === 0 || opponents.some(
        other => (other.cricketMarks?.[key] || 0) < 3
      );
      if (opponentsStillOpen) {
        points = extraMarks * scoreValue;
        player.cricketPoints = (Number(player.cricketPoints) || 0) + points;
        player.score = (Number(player.score) || 0) + points;
      }
    }

    label = key === "25"
      ? (result.type === "bullseye" ? "Bullseye" : "Bull")
      : (marksAdded === 3 ? "Triple " : marksAdded === 2 ? "Double " : "Single ") + key;
  }

  const dart = { ...result, score: points, label };
  recordDartToGame(game, player, dart, points);
  announceDart(dart);
  playAppSound("tap");

  const allClosed = [15, 16, 17, 18, 19, 20, 25].every(
    num => (player.cricketMarks?.[String(num)] || 0) >= 3
  );
  const highestScore = Math.max(...game.players.map(p => Number(p.score) || 0));
  if (allClosed && (Number(player.score) || 0) >= highestScore) {
    game.finished = true;
    game.winner = player;
    setGameMessage(`${player.name} hat alle Felder geschlossen und gewinnt!`);
    playAppSound("finish");
    renderGame();
    finishGame();
    return;
  }

  renderGame();

  if (game.darts.length >= 3) {
    finishVisit(false, true);
  }
}

function handleShanghaiDart(game, player, result) {
  const target = Math.min(20, Math.max(1, Number(game.round) || 1));
  const number = Number(result.number) || 0;
  const multiplier = Number(result.multiplier) || 0;

  if (!player.shanghaiHits) player.shanghaiHits = {};
  if (!player.shanghaiHits[target]) {
    player.shanghaiHits[target] = { single: false, double: false, triple: false };
  }

  let points = 0;
  let label = "Kein Zieltreffer";

  if (number === target && multiplier > 0) {
    points = target * multiplier;
    player.score = (Number(player.score) || 0) + points;
    if (multiplier === 1) player.shanghaiHits[target].single = true;
    if (multiplier === 2) player.shanghaiHits[target].double = true;
    if (multiplier === 3) player.shanghaiHits[target].triple = true;
    label = `Ziel ${target}: ${points} Pkt.`;
  }

  const dart = { ...result, score: points, label };
  recordDartToGame(game, player, dart, points);
  announceDart(dart);
  playAppSound(points > 0 ? "tap" : "bust");

  const hits = player.shanghaiHits[target];
  if (hits.single && hits.double && hits.triple) {
    player.shanghai = true;
    game.finished = true;
    game.winner = player;
    setGameMessage(`Shanghai auf ${target}! ${player.name} gewinnt sofort!`);
    playAppSound("finish");
    announce("Shanghai! Game Shot!", "result");
    renderGame();
    finishGame();
    return;
  }

  renderGame();

  if (game.darts.length >= 3) {
    finishVisit(false, true);
  }
}

function handleSequenceDart(game, player, result) {
  const target = Number(player.target) || 1;
  const number = Number(result.number) || 0;
  let points = 0;
  let label = `Ziel: ${target}`;

  if (number === target) {
    points = 1;
    player.score = (Number(player.score) || 0) + 1;
    label = `Treffer ${target}!`;
    player.target++;
    if (player.target > 20) {
      player.completed = true;
      player.target = 20;
    }
  }

  const dart = { ...result, score: points, label };
  recordDartToGame(game, player, dart, points);
  announceDart(dart);
  playAppSound(points > 0 ? "success" : "tap");

  if (player.completed) {
    game.finished = true;
    game.winner = player;
    setGameMessage(`${player.name} hat 1 bis 20 geschafft!`);
    playAppSound("finish");
    renderGame();
    finishGame();
    return;
  }

  renderGame();

  if (game.darts.length >= 3) {
    finishVisit(false, true);
  }
}

function handleSplitscoreDart(game, player, result) {
  const target = Math.min(20, Math.max(1, Number(game.round) || 1));
  const number = Number(result.number) || 0;
  const multiplier = Number(result.multiplier) || 0;

  let points = 0;
  let label = `Ziel ${target}`;

  if (number === target && multiplier > 0) {
    points = target * multiplier;
    player.score = (Number(player.score) || 0) + points;
    player.lastRoundScore = (Number(player.lastRoundScore) || 0) + points;
    label = `Ziel ${target}: +${points}`;
  }

  const dart = { ...result, score: points, label };
  recordDartToGame(game, player, dart, points);
  announceDart(dart);
  playAppSound(points > 0 ? "tap" : "bust");
  renderGame();

  if (game.darts.length >= 3) {
    finishVisit(false, true);
  }
}

function handleAdditiveDart(game, player, result) {
  const points = Number(result.score) || 0;
  player.score = (Number(player.score) || 0) + points;
  const dart = {
    ...result,
    score: points,
    label: result.label || `${points} Punkte`
  };
  recordDartToGame(game, player, dart, points);
  announceDart(dart);
  playAppSound(points > 0 ? "tap" : "bust");
  renderGame();

  if (game.darts.length >= 3) {
    finishVisit(false, true);
  }
}

function updateBestVisit(playerId, points) {
  const profile = app.players.find(item => item.id === playerId);
  if (!profile) return;
  if (points > (Number(profile.bestVisit) || 0)) {
    profile.bestVisit = points;
  }
}


function completePendingTurnAdvance() {
  const game = app.game;
  if (!game || !game.pendingTurnAdvance) return;
  game.pendingTurnAdvance = false;
  game.darts = [];
  game.bust = false;

  const isLastPlayer = game.currentPlayer >= game.players.length - 1;
  if (isLastPlayer) {
    game.currentPlayer = 0;
    game.round = (Number(game.round) || 1) + 1;
  } else {
    game.currentPlayer++;
  }

  if (game.mode !== "x01" && game.round > game.roundsLimit) {
    finishGame();
    return;
  }

  const nextPlayer = getCurrentPlayer();
  if (nextPlayer && game.mode === "x01") {
    game.visitStart = nextPlayer.score;
  }
}

function finishVisit(wasBust = false, deferTurnSwitch = false) {
  const game = app.game;
  if (!game || game.finished) return;

  const player = getCurrentPlayer();
  if (!player) return;

  pushVisitSnapshot();

  const visitPoints = game.darts.reduce((sum, dart) => sum + (Number(dart.score) || 0), 0);

  if (game.mode === "splitscore" && !wasBust && visitPoints === 0) {
    player.score = Math.floor((Number(player.score) || 0) / 2);
    setGameMessage(`${player.name}: Kein Treffer auf Ziel ${game.round} – Punkte halbiert.`);
  }

  if (!wasBust && visitPoints > 0) {
    updateBestVisit(player.id, visitPoints);
  }

  player.visits = (Number(player.visits) || 0) + 1;

  if (deferTurnSwitch && !wasBust) {
    game.pendingTurnAdvance = true;
    saveData();
    renderGame();
    setGameMessage(`${player.name}: 3. Dart geworfen (${visitPoints} Pkt.). Klicke „Nächster Spieler“ oder wirf weiter.`);
    return;
  }

  game.pendingTurnAdvance = false;
  game.darts = [];
  game.bust = false;

  const isLastPlayer = game.currentPlayer >= game.players.length - 1;
  if (isLastPlayer) {
    game.currentPlayer = 0;
    game.round = (Number(game.round) || 1) + 1;
  } else {
    game.currentPlayer++;
  }

  if (game.mode !== "x01" && game.round > game.roundsLimit) {
    finishGame();
    return;
  }

  const nextPlayer = getCurrentPlayer();
  if (nextPlayer) {
    if (game.mode === "x01") {
      game.visitStart = nextPlayer.score;
    }
    announce(`${nextPlayer.name} ist dran!`, "player");
  }

  saveData();
  renderGame();
}

function finishGame() {
  const game = app.game;
  if (!game || game.resultSaved) return;

  if (durstFinishTimer) {
    clearTimeout(durstFinishTimer);
    durstFinishTimer = null;
  }

  game.finished = true;
  game.resultSaved = true;
  game.finishedAt = game.finishedAt || Date.now();

  const ranking = [...game.players].sort((a, b) => {
    if (game.mode === "x01") {
      if (a.score === 0 && b.score !== 0) return -1;
      if (b.score === 0 && a.score !== 0) return 1;
      return a.score - b.score;
    }
    return (Number(b.score) || 0) - (Number(a.score) || 0);
  });

  const winner = game.winner || (
    game.mode === "x01"
      ? game.players.find(p => p.score === 0) || null
      : ranking[0] || null
  );

  game.winner = winner;

  game.players.forEach(player => {
    const profile = app.players.find(item => item.id === player.id);
    if (!profile) return;

    profile.games = (Number(profile.games) || 0) + 1;
    profile.totalPoints = (Number(profile.totalPoints) || 0) + (Number(player.totalPoints) || 0);
    profile.totalDarts = (Number(profile.totalDarts) || 0) + (Number(player.totalDarts) || 0);

    if (winner && profile.id === winner.id) {
      profile.wins = (Number(profile.wins) || 0) + 1;
    }
  });

  app.completedGames.push({
    id: game.id || generateId("game"),
    mode: game.mode,
    date: new Date().toISOString(),
    durationSeconds: getGameDurationSeconds(game),
    winner: winner ? winner.name : "Kein Sieger",
    players: ranking.map(player => ({
      id: player.id,
      name: player.name,
      score: Number(player.score) || 0,
      points: Number(player.totalPoints) || 0,
      darts: Number(player.totalDarts) || 0
    }))
  });

  dartUndoSnapshots = [];
  visitUndoSnapshots = [];

  saveData();
  renderPlayers();
  renderStatistics();
  renderGameHistory();
  renderResult(ranking, winner);
  updateScreenWakeLock();
  showPage("result");

  if (winner) {
    announce(`Game Shot! ${winner.name} gewinnt!`, "result");
  }
}

function undoLastDart() {
  if (!app.game) {
    toast("Kein aktives Spiel vorhanden.");
    return;
  }
  if (app.game.finished) {
    toast("Das Spiel ist bereits beendet.");
    return;
  }
  if (dartUndoSnapshots.length === 0) {
    toast("Es gibt keinen Wurf zum Zurücknehmen.");
    return;
  }

  const prev = dartUndoSnapshots.pop();
  app.game = prev.game;
  app.players = prev.players;
  setGameMessage("Letzter Wurf zurückgenommen.");

  saveData();
  renderGame();
  showPage("game");
  toast("Letzter Dart wurde zurückgenommen.");
  announce("Letzter Wurf zurückgenommen.", "result");
}

function undoLastVisit() {
  if (!app.game) {
    toast("Kein aktives Spiel vorhanden.");
    return;
  }
  if (app.game.finished) {
    toast("Das Spiel ist bereits beendet.");
    return;
  }

  if (app.game.darts.length > 0 && dartUndoSnapshots.length >= app.game.darts.length) {
    for (let i = 0; i < app.game.darts.length; i++) {
      dartUndoSnapshots.pop();
    }
    const targetSnap = dartUndoSnapshots[dartUndoSnapshots.length - 1];
    if (targetSnap) {
      app.game = cloneData(targetSnap.game);
      app.players = cloneData(targetSnap.players);
      app.game.darts = [];
      app.game.bust = false;
      saveData();
      renderGame();
      toast("Aktuelle Aufnahme zurückgesetzt.");
      return;
    }
  }

  if (visitUndoSnapshots.length > 0) {
    const prev = visitUndoSnapshots.pop();
    app.game = prev.game;
    app.players = prev.players;
    saveData();
    renderGame();
    toast("Runde zurückgenommen.");
    return;
  }

  toast("Keine Runde zum Zurücknehmen vorhanden.");
}

/* Checkout-Berechnung */

const checkoutTargets = [];
for (let number = 1; number <= 20; number++) {
  checkoutTargets.push({ name: "Single " + number, label: "S" + number, score: number, multiplier: 1 });
  checkoutTargets.push({ name: "Double " + number, label: "D" + number, score: number * 2, multiplier: 2 });
  checkoutTargets.push({ name: "Triple " + number, label: "T" + number, score: number * 3, multiplier: 3 });
}
checkoutTargets.push({ name: "Bull", label: "Bull", score: 25, multiplier: 1 });
checkoutTargets.push({ name: "Bullseye", label: "Bullseye", score: 50, multiplier: 2 });

function calculateCheckoutWays(rest, maxDarts = 3) {
  const results = [];
  if (!Number.isInteger(rest) || rest < 2 || rest > 170) return results;

  function search(sum, path, dartsLeft) {
    if (sum === rest) {
      if (path.length > 0 && path[path.length - 1].multiplier === 2) {
        results.push([...path]);
      }
      return;
    }
    if (sum > rest || dartsLeft === 0 || results.length >= 24) return;

    for (const target of checkoutTargets) {
      if (sum + target.score <= rest) {
        search(sum + target.score, [...path, target], dartsLeft - 1);
      }
    }
  }

  search(0, [], maxDarts);

  const unique = new Map();
  results.forEach(path => {
    const key = path.map(item => item.name).join(" + ");
    if (!unique.has(key)) {
      unique.set(key, path);
    }
  });

  return [...unique.values()].sort((a, b) => a.length - b.length);
}

function getCheckoutSuggestion(score) {
  const ways = calculateCheckoutWays(Number(score), 3);
  if (!ways.length) return "Passenden Weg selbst wählen.";
  return ways[0].map(item => item.label).join(" · ");
}

/* Spielanzeige rendern */

function renderGame() {
  const game = app.game;
  if (!game) return;

  const player = getCurrentPlayer();
  if (!player) return;

  const currentName = $("#current-player");
  const remaining = $("#remaining-score");
  const remainingLabel = $("#remaining-label");
  const roundEl = $("#game-round");
  const modeLabel = $("#game-mode-label");
  const visitTotal = $("#visit-total");
  const dartSlots = $("#dart-slots");
  const checkoutPanel = $("#checkout-panel");
  const checkoutSuggestion = $("#checkout-suggestion");

  if (currentName) currentName.textContent = player.name;

  if (remaining) {
    if (game.mode === "x01" || game.mode === "durst" || game.mode === "highscore" || game.mode === "cricket" || game.mode === "shanghai" || game.mode === "splitscore" || game.mode === "elimination" || game.mode === "killer" || game.mode === "shooter") {
      remaining.textContent = String(player.score ?? 0);
    } else if (game.mode === "around" || game.mode === "one20" || game.mode === "1to20") {
      remaining.textContent = `Ziel ${player.target || 1}`;
    } else {
      remaining.textContent = String(player.score ?? 0);
    }
  }

  if (remainingLabel) {
    if (game.mode === "x01") remainingLabel.textContent = "Rest";
    else if (game.mode === "around" || game.mode === "one20" || game.mode === "1to20") remainingLabel.textContent = "Nächstes Feld";
    else remainingLabel.textContent = "Punkte";
  }

  if (roundEl) {
    roundEl.textContent = game.mode === "x01"
      ? String(game.round)
      : `${game.round} / ${game.roundsLimit}`;
  }

  if (modeLabel) {
    const baseName = MODE_LABELS[game.mode] || game.mode;
    if (game.mode === "x01") {
      const inText = game.inRule === "double" ? "Double In" : game.inRule === "master" ? "Master In" : "";
      const outText = game.outRule === "double" ? "Double Out" : game.outRule === "master" ? "Master Out" : "Single Out";
      modeLabel.textContent = [game.startScore, inText, outText].filter(Boolean).join(" · ");
    } else if (game.mode === "shanghai") {
      modeLabel.textContent = `${baseName} · Ziel ${Math.min(20, game.round)}`;
    } else {
      modeLabel.textContent = baseName;
    }
  }

  const currentVisitSum = (game.darts || []).reduce((sum, d) => sum + (Number(d.score) || 0), 0);
  if (visitTotal) {
    visitTotal.textContent = String(currentVisitSum);
  }

  if (dartSlots) {
    dartSlots.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const dart = game.darts[i];
      const slot = document.createElement("div");
      slot.className = "dart-slot" + (dart ? " filled" : "");

      const label = document.createElement("span");
      label.textContent = "Dart " + (i + 1);

      const value = document.createElement("strong");
      value.textContent = dart ? (dart.label || String(dart.score ?? 0)) : "–";

      slot.append(label, value);
      dartSlots.appendChild(slot);
    }
  }

  if (checkoutPanel && checkoutSuggestion) {
    const showCheckout = game.mode === "x01" && !game.finished && Number(player.score) >= 2 && Number(player.score) <= 170;
    checkoutPanel.hidden = !showCheckout;
    if (showCheckout) {
      checkoutSuggestion.textContent = getCheckoutSuggestion(Number(player.score));
    } else {
      checkoutSuggestion.textContent = "";
    }
  }

  renderScoreboard();
  renderLiveMatchHistory();
  renderModeExtrasInGame();
}

function renderScoreboard() {
  const container = $("#scoreboard-list");
  const game = app.game;
  if (!container || !game) return;

  container.innerHTML = "";

  game.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "scoreboard-row" + (index === game.currentPlayer ? " active" : "");

    const name = document.createElement("span");
    const extra = (game.mode === "around" || game.mode === "one20" || game.mode === "1to20")
      ? ` (Ziel ${player.target || 1})`
      : "";
    name.textContent = player.name + extra;

    const score = document.createElement("strong");
    score.textContent = String(player.score ?? 0);

    row.append(name, score);
    container.appendChild(row);
  });
}

function renderLiveMatchHistory() {
  const container = $("#game-history");
  const game = app.game;
  if (!container || !game) return;

  container.innerHTML = "";
  const items = (game.history || []).slice(-12).reverse();

  if (items.length === 0) {
    container.textContent = "Noch keine Würfe.";
    return;
  }

  items.forEach(entry => {
    const row = document.createElement("div");
    row.className = "history-row";

    const name = document.createElement("span");
    name.textContent = `${entry.playerName || entry.player || "Spieler"} (R${entry.round || 1})`;

    const result = document.createElement("strong");
    result.textContent = entry.label || String(entry.score ?? 0);

    row.append(name, result);
    container.appendChild(row);
  });
}

function renderModeExtrasInGame() {
  const game = app.game;
  const gamePage = $('[data-page="game"]');
  if (!gamePage) return;

  let cricketPanel = $("#cricket-status-panel");
  if (game && game.mode === "cricket" && !game.finished) {
    if (!cricketPanel) {
      cricketPanel = document.createElement("section");
      cricketPanel.id = "cricket-status-panel";
      cricketPanel.className = "panel";
      const finishBtn = $("#finish-game");
      if (finishBtn && finishBtn.parentElement === gamePage) {
        gamePage.insertBefore(cricketPanel, finishBtn);
      } else {
        gamePage.appendChild(cricketPanel);
      }
    }

    cricketPanel.innerHTML = "<h3>Cricket – Felder & Punkte</h3>";
    const targets = [20, 19, 18, 17, 16, 15, 25];

    game.players.forEach(player => {
      const marks = player.cricketMarks || {};
      const row = document.createElement("p");
      const summary = targets.map(num => {
        const count = Math.min(3, Number(marks[String(num)]) || 0);
        const label = num === 25 ? "Bull" : String(num);
        return `${label}: ${"●".repeat(count)}${"○".repeat(3 - count)}`;
      }).join(" · ");
      row.textContent = `${player.name} (${player.score || 0} Pkt.): ${summary}`;
      cricketPanel.appendChild(row);
    });
  } else if (cricketPanel) {
    cricketPanel.remove();
  }

  let modeInfoPanel = $("#dart-mode-info-panel");
  if (game && !game.finished) {
    if (!modeInfoPanel) {
      modeInfoPanel = document.createElement("section");
      modeInfoPanel.id = "dart-mode-info-panel";
      modeInfoPanel.className = "panel";
      gamePage.appendChild(modeInfoPanel);
    }
    const cfg = MODE_CONFIGS[game.mode] || { name: game.mode, description: "" };
    const elapsed = formatGameDuration(getGameDurationSeconds(game));
    modeInfoPanel.innerHTML = `<h3>${cfg.name}</h3><p>${cfg.description}</p><p class="muted">Spielzeit: ${elapsed}</p>`;
  } else if (modeInfoPanel) {
    modeInfoPanel.remove();
  }
}

function renderResult(ranking, winner) {
  const winnerDisplay = $("#winner-display");
  const resultList = $("#result-list");

  if (winnerDisplay) {
    winnerDisplay.textContent = winner ? `${winner.name} gewinnt!` : "Spiel beendet";
  }

  if (!resultList) return;
  resultList.innerHTML = "";

  ranking.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "result-row scoreboard-row";

    const place = document.createElement("span");
    place.textContent = `${index + 1}. ${player.name}`;

    const score = document.createElement("strong");
    score.textContent = app.game?.mode === "x01"
      ? `Rest: ${player.score} (${player.totalPoints || 0} geworfen)`
      : `${player.score || 0} Punkte`;

    row.append(place, score);
    resultList.appendChild(row);
  });
}

/* Statistiken & Spielverlauf */

function renderStatistics() {
  const container = $("#statistics-content");
  if (!container) return;

  container.innerHTML = "";

  const totalGames = app.completedGames.length;
  const totalWins = app.players.reduce((sum, p) => sum + (Number(p.wins) || 0), 0);
  const totalDarts = app.players.reduce((sum, p) => sum + (Number(p.totalDarts) || 0), 0);

  const overviewHeading = document.createElement("h3");
  overviewHeading.textContent = "Gesamtübersicht";

  const grid = document.createElement("div");
  grid.className = "stat-grid";

  [
    ["Spieler", app.players.length],
    ["Gespielte Partien", totalGames],
    ["Erfasste Darts", totalDarts],
    ["Siege insgesamt", totalWins]
  ].forEach(([labelText, valueNum]) => {
    const card = document.createElement("div");
    card.className = "stat-card";

    const val = document.createElement("strong");
    val.textContent = String(valueNum);

    const lbl = document.createElement("span");
    lbl.textContent = labelText;

    card.append(val, lbl);
    grid.appendChild(card);
  });

  container.append(overviewHeading, grid);

  const rankingHeading = document.createElement("h3");
  rankingHeading.textContent = "Spielerrangliste & Leistungen";
  container.appendChild(rankingHeading);

  if (app.players.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Noch keine Spieler vorhanden.";
    container.appendChild(empty);
  } else {
    const ranked = [...app.players]
      .map(p => ({ player: p, stats: getPlayerStatistics(p) }))
      .sort((a, b) => b.stats.wins - a.stats.wins || b.stats.threeDartAverage - a.stats.threeDartAverage);

    const maxAvg = Math.max(1, ...ranked.map(item => item.stats.threeDartAverage));

    ranked.forEach(({ player, stats }, idx) => {
      const card = document.createElement("div");
      card.className = "advanced-stat-card";

      const title = document.createElement("h4");
      title.textContent = `${idx + 1}. ${player.name}`;

      const line1 = document.createElement("p");
      line1.textContent = `Siege: ${stats.wins} · Spiele: ${stats.games} · 3-Dart-Average: ${stats.threeDartAverage.toFixed(2)}`;

      const line2 = document.createElement("p");
      line2.textContent = `Punkte: ${stats.points} · Darts: ${stats.darts} · Beste Aufnahme: ${stats.bestVisit}`;

      const barBg = document.createElement("div");
      barBg.className = "average-bar-background";

      const bar = document.createElement("div");
      bar.className = "average-bar";
      bar.style.width = `${Math.min(100, (stats.threeDartAverage / maxAvg) * 100)}%`;

      barBg.appendChild(bar);
      card.append(title, line1, line2, barBg);
      container.appendChild(card);
    });
  }

  const recentHeading = document.createElement("h3");
  recentHeading.textContent = "Letzte Spiele";
  container.appendChild(recentHeading);

  if (app.completedGames.length === 0) {
    const emptyGames = document.createElement("p");
    emptyGames.textContent = "Noch keine abgeschlossenen Spiele.";
    container.appendChild(emptyGames);
  } else {
    [...app.completedGames].reverse().slice(0, 15).forEach(game => {
      const row = document.createElement("div");
      row.className = "history-row";

      const winner = document.createElement("span");
      winner.textContent = `${game.winner || "Kein Sieger"} (${formatGameDate(game.date)})`;

      const mode = document.createElement("strong");
      mode.textContent = MODE_LABELS[game.mode] || String(game.mode || "").toUpperCase();

      row.append(winner, mode);
      container.appendChild(row);
    });
  }

  const csvBtn = document.createElement("button");
  csvBtn.id = "export-statistics-csv";
  csvBtn.type = "button";
  csvBtn.className = "secondary-button";
  csvBtn.textContent = "Statistik als CSV exportieren";
  csvBtn.addEventListener("click", exportStatisticsCSV);
  container.appendChild(csvBtn);
}

function exportStatisticsCSV() {
  if (!Array.isArray(app.players) || app.players.length === 0) {
    toast("Es sind noch keine Spielerdaten vorhanden.");
    return;
  }

  const escapeCSV = (val) => '"' + String(val ?? "").replace(/"/g, '""') + '"';
  const rows = [
    ["Spieler", "Siege", "Spiele", "Punkte", "Geworfene Darts", "3-Dart-Average", "Beste Aufnahme"]
  ];

  app.players.forEach(player => {
    const stats = getPlayerStatistics(player);
    rows.push([
      player.name,
      stats.wins,
      stats.games,
      stats.points,
      stats.darts,
      stats.threeDartAverage.toFixed(2),
      stats.bestVisit
    ]);
  });

  const csv = "\uFEFF" + rows.map(r => r.map(escapeCSV).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sachsen-anhalt-dart-statistik.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Statistik als CSV exportiert.");
}

function renderGameHistory() {
  const container = $("#game-history-list");
  if (!container) return;

  container.innerHTML = "";
  const games = [...app.completedGames].reverse();

  if (games.length === 0) {
    container.textContent = "Noch keine abgeschlossenen Spiele.";
    return;
  }

  games.forEach((game, index) => {
    const card = document.createElement("article");
    card.className = "history-card";

    const title = document.createElement("h3");
    title.textContent = MODE_LABELS[game.mode] || String(game.mode || "Dart-Spiel");

    const date = document.createElement("p");
    date.textContent = formatGameDate(game.date);

    const winner = document.createElement("p");
    winner.textContent = "Gewinner: " + (game.winner || "Nicht angegeben");

    const playersBox = document.createElement("div");
    (game.players || []).forEach(player => {
      const row = document.createElement("p");
      row.textContent = `${player.name}: ${player.score ?? player.points ?? 0} Punkte`;
      playersBox.appendChild(row);
    });

    const num = document.createElement("small");
    num.textContent = "Spiel " + (games.length - index);

    card.append(title, date, winner, playersBox, num);
    container.appendChild(card);
  });
}

/* Turniersystem (K.-o. & Jeder gegen jeden) */

function buildTournamentExtras() {
  const page = $('[data-page="tournament"]');
  const createPanel = page?.querySelector(".panel");
  const createBtn = $("#create-tournament");
  if (!page || !createPanel || !createBtn) return;

  if (!$("#tournament-third-wrap")) {
    const wrap = document.createElement("label");
    wrap.id = "tournament-third-wrap";
    wrap.className = "setup-player";

    const cb = document.createElement("input");
    cb.id = "tournament-third";
    cb.type = "checkbox";

    const span = document.createElement("span");
    span.textContent = "Spiel um Platz 3";

    wrap.append(cb, span);
    createPanel.insertBefore(wrap, createBtn);
  }

  if (!$("#tournament-player-list")) {
    const heading = document.createElement("h4");
    heading.textContent = "Spieler auswählen";

    const list = document.createElement("div");
    list.id = "tournament-player-list";

    createPanel.insertBefore(heading, createBtn);
    createPanel.insertBefore(list, createBtn);
  }

  if (!$("#tournament-archive-panel")) {
    const archivePanel = document.createElement("section");
    archivePanel.id = "tournament-archive-panel";
    archivePanel.className = "panel";

    const h3 = document.createElement("h3");
    h3.textContent = "Turnierarchiv";

    const archiveList = document.createElement("div");
    archiveList.id = "tournament-archive";

    archivePanel.append(h3, archiveList);
    page.appendChild(archivePanel);
  }
}

function renderTournamentPlayerList() {
  const container = $("#tournament-player-list");
  if (!container) return;

  container.innerHTML = "";

  if (app.players.length < 2) {
    container.textContent = "Lege zuerst mindestens zwei Spieler an.";
    return;
  }

  app.players.forEach(player => {
    const label = document.createElement("label");
    label.className = "setup-player";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = player.id;
    checkbox.checked = true;
    checkbox.className = "tournament-player-checkbox";

    const span = document.createElement("span");
    span.textContent = player.name;

    label.append(checkbox, span);
    container.appendChild(label);
  });
}

function createKnockoutRounds(tournament) {
  const shuffled = [...tournament.players].sort(() => Math.random() - 0.5);
  const count = shuffled.length;

  let size = 1;
  while (size < count) size *= 2;

  const byes = size - count;
  const queue = [...shuffled];
  const round = [];

  for (let i = 0; i < byes; i++) {
    const player = queue.shift();
    round.push({
      id: generateId("match"),
      player1: player,
      player2: null,
      winner: player,
      loser: null,
      bye: true,
      completed: true
    });
  }

  while (queue.length >= 2) {
    round.push({
      id: generateId("match"),
      player1: queue.shift(),
      player2: queue.shift(),
      winner: null,
      loser: null,
      bye: false,
      completed: false
    });
  }

  tournament.rounds.push(round);
}

function createRoundRobinMatches(tournament) {
  const players = [...tournament.players];
  if (players.length % 2 !== 0) {
    players.push(null);
  }

  const count = players.length;
  const rounds = count - 1;

  for (let r = 0; r < rounds; r++) {
    const matches = [];
    for (let i = 0; i < count / 2; i++) {
      const first = players[i];
      const second = players[count - 1 - i];
      if (first && second) {
        matches.push({
          id: generateId("match"),
          player1: first,
          player2: second,
          winner: null,
          completed: false
        });
      }
    }
    tournament.matches.push(matches);

    const fixed = players[0];
    const rotating = players.slice(1);
    rotating.unshift(rotating.pop());
    players.splice(0, players.length, fixed, ...rotating);
  }
}

function createTournament() {
  const selectedIds = Array.from($$(".tournament-player-checkbox:checked")).map(cb => cb.value);

  if (selectedIds.length < 2) {
    toast("Wähle mindestens zwei Spieler aus.");
    return;
  }

  if (selectedIds.length > 32) {
    toast("Ein Turnier ist auf 32 Spieler begrenzt.");
    return;
  }

  const players = selectedIds
    .map(id => app.players.find(p => p.id === id))
    .filter(Boolean)
    .map(p => ({ id: p.id, name: p.name }));

  const formatSelect = $("#tournament-format") || $("#tournament-type");
  const type = formatSelect?.value === "round-robin" || formatSelect?.value === "roundrobin"
    ? "roundrobin"
    : "ko";

  const nameInput = $("#tournament-name");
  const name = (nameInput?.value || "").trim() || "Dartturnier";

  const tournament = {
    id: generateId("tournament"),
    name,
    type,
    players,
    rounds: [],
    matches: [],
    finished: false,
    thirdPlace: Boolean($("#tournament-third")?.checked),
    thirdPlaceMatch: null,
    thirdPlaceWinner: null,
    winner: null,
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  if (type === "ko") {
    createKnockoutRounds(tournament);
  } else {
    createRoundRobinMatches(tournament);
  }

  app.tournaments.push(tournament);
  tournamentState.currentId = tournament.id;

  if (nameInput) nameInput.value = "";

  saveData();
  renderTournament();
  renderTournamentArchive();
  toast("Turnier wurde erstellt.");
}

function getCurrentTournament() {
  if (tournamentState.currentId) {
    const found = app.tournaments.find(t => t.id === tournamentState.currentId);
    if (found) return found;
  }
  return app.tournaments[app.tournaments.length - 1] || null;
}

function advanceKnockoutRound(tournament) {
  const currentRound = tournament.rounds[tournament.rounds.length - 1];
  if (!currentRound || !currentRound.every(match => match.completed)) return;

  if (currentRound.length === 2 && tournament.thirdPlace && !tournament.thirdPlaceMatch) {
    const losers = currentRound.map(m => m.loser).filter(Boolean);
    if (losers.length === 2) {
      tournament.thirdPlaceMatch = {
        id: generateId("match"),
        player1: losers[0],
        player2: losers[1],
        winner: null,
        completed: false,
        isThirdPlace: true
      };
    }
  }

  if (currentRound.length <= 1) {
    const finalMatch = currentRound[0];
    if (finalMatch && finalMatch.winner) {
      tournament.winner = finalMatch.winner;
      const thirdDone = !tournament.thirdPlaceMatch || tournament.thirdPlaceMatch.completed;
      if (thirdDone) {
        tournament.finished = true;
        tournament.completedAt = tournament.completedAt || new Date().toISOString();
      }
    }
    return;
  }

  const winners = currentRound.map(match => match.winner).filter(Boolean);
  const nextRound = [];

  for (let i = 0; i < winners.length; i += 2) {
    const first = winners[i];
    const second = winners[i + 1] || null;
    nextRound.push({
      id: generateId("match"),
      player1: first,
      player2: second,
      winner: second ? null : first,
      loser: null,
      bye: !second,
      completed: !second
    });
  }

  tournament.rounds.push(nextRound);
}

function setKnockoutWinner(matchId, playerId) {
  const tournament = getCurrentTournament();
  if (!tournament || tournament.finished) return;

  if (tournament.thirdPlaceMatch && tournament.thirdPlaceMatch.id === matchId) {
    const m = tournament.thirdPlaceMatch;
    if (m.completed) return;
    const w = [m.player1, m.player2].find(p => p && p.id === playerId);
    if (!w) return;
    m.winner = w;
    m.completed = true;
    tournament.thirdPlaceWinner = w;
    if (tournament.winner) {
      tournament.finished = true;
      tournament.completedAt = tournament.completedAt || new Date().toISOString();
    }
    saveData();
    renderTournament();
    renderTournamentArchive();
    return;
  }

  let found = null;
  for (const round of tournament.rounds) {
    for (const match of round) {
      if (match.id === matchId) {
        found = match;
        break;
      }
    }
    if (found) break;
  }

  if (!found || found.completed) return;

  const winner = [found.player1, found.player2].find(p => p && p.id === playerId);
  if (!winner) return;

  const loser = found.player1 && found.player1.id === winner.id
    ? found.player2
    : found.player1;

  found.winner = winner;
  found.loser = loser || null;
  found.completed = true;

  advanceKnockoutRound(tournament);

  saveData();
  renderTournament();
  renderTournamentArchive();
}

function calculateTournamentTable(tournament) {
  const table = tournament.players.map(player => ({
    ...player,
    wins: 0,
    played: 0,
    points: 0
  }));

  tournament.matches.flat().forEach(match => {
    if (!match.completed || !match.winner) return;
    const wRow = table.find(p => p.id === match.winner.id);
    if (wRow) {
      wRow.wins++;
      wRow.played++;
      wRow.points += 3;
    }
    const loserId = match.player1.id === match.winner.id ? match.player2.id : match.player1.id;
    const lRow = table.find(p => p.id === loserId);
    if (lRow) {
      lRow.played++;
    }
  });

  return table.sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function setRoundRobinWinner(matchId, playerId) {
  const tournament = getCurrentTournament();
  if (!tournament || tournament.finished) return;

  let found = null;
  for (const round of tournament.matches) {
    for (const match of round) {
      if (match.id === matchId) {
        found = match;
        break;
      }
    }
    if (found) break;
  }

  if (!found || found.completed) return;

  const winner = [found.player1, found.player2].find(p => p && p.id === playerId);
  if (!winner) return;

  found.winner = winner;
  found.completed = true;

  const allDone = tournament.matches.every(round => round.every(match => match.completed));
  if (allDone) {
    tournament.finished = true;
    tournament.completedAt = tournament.completedAt || new Date().toISOString();
    const table = calculateTournamentTable(tournament);
    tournament.winner = table[0] || null;
  }

  saveData();
  renderTournament();
  renderTournamentArchive();
}

function renderTournament() {
  const container = $("#tournament-content");
  if (!container) return;

  container.innerHTML = "";
  const tournament = getCurrentTournament();

  if (!tournament) {
    container.textContent = "Noch kein Turnier ausgewählt.";
    return;
  }

  const heading = document.createElement("h3");
  heading.textContent = tournament.name;

  const meta = document.createElement("p");
  meta.className = "muted";
  meta.textContent = `${tournament.type === "ko" ? "K.-o.-System" : "Jeder gegen jeden"} · ${tournament.finished ? "Abgeschlossen" : "Läuft"}`;

  container.append(heading, meta);

  if (tournament.type === "ko") {
    tournament.rounds.forEach((round, roundIndex) => {
      const section = document.createElement("div");
      section.className = "tournament-round";

      const rTitle = document.createElement("h4");
      rTitle.textContent = "Runde " + (roundIndex + 1);
      section.appendChild(rTitle);

      round.forEach(match => {
        const card = document.createElement("div");
        card.className = "tournament-card";

        const p1Name = match.player1?.name || "Freilos";
        const p2Name = match.player2?.name || "Freilos";

        const title = document.createElement("strong");
        title.textContent = `${p1Name} gegen ${p2Name}`;
        card.appendChild(title);

        if (match.bye) {
          const info = document.createElement("p");
          info.textContent = `Freilos – ${p1Name} kommt weiter.`;
          card.appendChild(info);
        } else if (match.completed) {
          const res = document.createElement("p");
          res.textContent = `Sieger: ${match.winner.name}`;
          card.appendChild(res);
        } else {
          [match.player1, match.player2].forEach(player => {
            if (!player) return;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = `${player.name} gewinnt`;
            btn.addEventListener("click", () => setKnockoutWinner(match.id, player.id));
            card.appendChild(btn);
          });
        }

        section.appendChild(card);
      });

      container.appendChild(section);
    });

    if (tournament.thirdPlaceMatch) {
      const m = tournament.thirdPlaceMatch;
      const card = document.createElement("div");
      card.className = "tournament-card";

      const title = document.createElement("strong");
      title.textContent = `Spiel um Platz 3: ${m.player1.name} gegen ${m.player2.name}`;
      card.appendChild(title);

      if (m.completed) {
        const res = document.createElement("p");
        res.textContent = `Platz 3: ${m.winner.name}`;
        card.appendChild(res);
      } else {
        [m.player1, m.player2].forEach(player => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = `${player.name} gewinnt`;
          btn.addEventListener("click", () => setKnockoutWinner(m.id, player.id));
          card.appendChild(btn);
        });
      }
      container.appendChild(card);
    }
  } else {
    tournament.matches.forEach((round, rIdx) => {
      const section = document.createElement("div");
      section.className = "tournament-round";

      const rTitle = document.createElement("h4");
      rTitle.textContent = "Spieltag " + (rIdx + 1);
      section.appendChild(rTitle);

      round.forEach(match => {
        const card = document.createElement("div");
        card.className = "tournament-card";

        const title = document.createElement("strong");
        title.textContent = `${match.player1.name} gegen ${match.player2.name}`;
        card.appendChild(title);

        if (match.completed) {
          const res = document.createElement("p");
          res.textContent = `Sieger: ${match.winner.name}`;
          card.appendChild(res);
        } else {
          [match.player1, match.player2].forEach(player => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = `${player.name} gewinnt`;
            btn.addEventListener("click", () => setRoundRobinWinner(match.id, player.id));
            card.appendChild(btn);
          });
        }
        section.appendChild(card);
      });

      container.appendChild(section);
    });

    const tableHeading = document.createElement("h4");
    tableHeading.textContent = "Tabelle";
    container.appendChild(tableHeading);

    const table = calculateTournamentTable(tournament);
    table.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "scoreboard-row";

      const name = document.createElement("span");
      name.textContent = `${idx + 1}. ${entry.name}`;

      const pts = document.createElement("strong");
      pts.textContent = `${entry.points} Punkte · ${entry.wins} Siege`;

      row.append(name, pts);
      container.appendChild(row);
    });
  }

  if (tournament.winner) {
    const winBox = document.createElement("p");
    winBox.className = "tournament-winner";
    winBox.textContent = `Turniersieger: ${tournament.winner.name}`;
    container.appendChild(winBox);
  }
}

function renderTournamentArchive() {
  const container = $("#tournament-archive");
  if (!container) return;

  container.innerHTML = "";

  if (app.tournaments.length === 0) {
    container.textContent = "Noch keine Turniere vorhanden.";
    return;
  }

  [...app.tournaments].reverse().forEach(t => {
    const card = document.createElement("div");
    card.className = "tournament-card";

    const title = document.createElement("strong");
    title.textContent = `${t.name} (${t.finished ? "Beendet" : "Läuft"})`;

    const info = document.createElement("p");
    const winnerName = t.winner?.name || (typeof t.winner === "string" ? t.winner : "Noch offen");
    info.textContent = `Modus: ${t.type === "ko" ? "K.-o." : "Jeder gegen jeden"} · Sieger: ${winnerName}`;

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.textContent = "Turnier anzeigen";
    openBtn.addEventListener("click", () => {
      tournamentState.currentId = t.id;
      renderTournament();
    });

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.textContent = "Exportieren";
    exportBtn.addEventListener("click", () => exportTournament(t.id));

    card.append(title, info, openBtn, exportBtn);
    container.appendChild(card);
  });
}

function exportTournament(tournamentId) {
  const tournament = app.tournaments.find(t => t.id === tournamentId);
  if (!tournament) {
    toast("Turnier nicht gefunden.");
    return;
  }

  const blob = new Blob([JSON.stringify(tournament, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = (tournament.name || "Turnier").replace(/[^a-z0-9_-]/gi, "_") + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Turnier exportiert.");
}

/* Trainingszentrale */

function buildTrainingPage() {
  let page = $('[data-page="training"]');
  const main = $("#main-content") || $("main");

  if (!page && main) {
    page = document.createElement("section");
    page.id = "page-training";
    page.className = "page";
    page.dataset.page = "training";
    page.hidden = true;
    main.appendChild(page);
  }

  if (!page || $("#training-app")) return;

  const section = document.createElement("section");
  section.id = "training-app";
  section.className = "panel";

  section.innerHTML = `
    <button type="button" class="back-button" data-page-target="home">← Zurück</button>
    <span class="eyebrow">TRAINING</span>
    <h2>Trainingszentrale</h2>
    <p class="muted">Verbessere deine Treffsicherheit und verfolge deine Trainingsergebnisse.</p>

    <label for="training-type">Trainingsart</label>
    <select id="training-type">
      <option value="highscore">Highscore</option>
      <option value="target">Zieltraining</option>
      <option value="around">Around the Clock</option>
      <option value="doubles">Doppeltraining</option>
      <option value="triples">Tripletraining</option>
    </select>

    <label for="training-rounds">Anzahl der Runden</label>
    <select id="training-rounds">
      <option value="5">5 Runden</option>
      <option value="10" selected>10 Runden</option>
      <option value="15">15 Runden</option>
      <option value="20">20 Runden</option>
    </select>

    <button id="training-start" class="primary-button" type="button">Training starten</button>
    <div id="training-status"></div>

    <div id="training-actions" hidden>
      <h3>Dein Training</h3>
      <p id="training-target"></p>
      <p id="training-progress"></p>
      <p id="training-score"></p>
      <p id="training-last-dart" class="muted">Letzter Wurf: –</p>
      <div class="dart-actions">
        <button id="training-s20" type="button">Single 20 (20)</button>
        <button id="training-t20" type="button">Triple 20 (60)</button>
        <button id="training-d20" type="button">Double 20 (40)</button>
        <button id="training-bull" type="button">Bullseye (50)</button>
        <button id="training-miss" type="button">Fehlwurf (0)</button>
        <button id="training-undo" type="button">Letzten Dart zurück</button>
      </div>
      <div class="dart-actions">
        <button id="training-next" type="button">Runde abschließen</button>
        <button id="training-stop" type="button">Training beenden</button>
      </div>
    </div>

    <div id="training-summary"></div>
    <div id="training-history"></div>
  `;

  page.appendChild(section);

  section.querySelector('[data-page-target="home"]')?.addEventListener("click", () => showPage("home"));
  $("#training-start")?.addEventListener("click", startTraining);
  $("#training-s20")?.addEventListener("click", () => recordTrainingDart(20, "Single 20"));
  $("#training-t20")?.addEventListener("click", () => recordTrainingDart(60, "Triple 20"));
  $("#training-d20")?.addEventListener("click", () => recordTrainingDart(40, "Double 20"));
  $("#training-bull")?.addEventListener("click", () => recordTrainingDart(50, "Bullseye"));
  $("#training-miss")?.addEventListener("click", () => recordTrainingDart(0, "Fehlwurf"));
  $("#training-undo")?.addEventListener("click", undoTrainingDart);
  $("#training-next")?.addEventListener("click", nextTrainingRound);
  $("#training-stop")?.addEventListener("click", finishTraining);

  renderTrainingHistory();
  renderBoardTraining();
}

function getTrainingTarget() {
  if (trainingState.type === "around") return String(trainingState.currentTarget);
  if (trainingState.type === "doubles") return "Double 20";
  if (trainingState.type === "triples") return "Triple 20";
  if (trainingState.type === "target") return "Ziel: 20";
  return "Freie Punktesammlung";
}

function startTraining() {
  const type = $("#training-type")?.value || "highscore";
  const rounds = Number($("#training-rounds")?.value || 10);

  trainingState.active = true;
  trainingState.type = type;
  trainingState.round = 1;
  trainingState.maxRounds = rounds;
  trainingState.dartsThrown = 0;
  trainingState.totalPoints = 0;
  trainingState.results = [];
  trainingState.currentTarget = 20;

  const actions = $("#training-actions");
  const summary = $("#training-summary");
  if (actions) actions.hidden = false;
  if (summary) summary.innerHTML = "";

  updateTrainingDisplay();
  toast("Training gestartet!");
}

function recordTrainingDart(points, label = "") {
  if (!trainingState.active) return;

  const value = Math.max(0, Number(points) || 0);
  trainingState.dartsThrown++;
  trainingState.totalPoints += value;
  trainingState.results.push({
    round: trainingState.round,
    points: value,
    label: label || `${value} Pkt.`
  });

  const lastDartEl = $("#training-last-dart");
  if (lastDartEl) {
    lastDartEl.textContent = `Letzter Wurf: ${label || value + " Punkte"}`;
  }

  if (trainingState.type === "around" && value > 0) {
    trainingState.currentTarget++;
    if (trainingState.currentTarget > 20) {
      trainingState.currentTarget = 1;
    }
  }

  updateTrainingDisplay();

  if (trainingState.dartsThrown % 3 === 0) {
    if (trainingState.round >= trainingState.maxRounds) {
      finishTraining();
      return;
    }
    trainingState.round++;
    updateTrainingDisplay();
    toast("Runde abgeschlossen. Nächste Runde!");
  }
}

function undoTrainingDart() {
  if (!trainingState.active || trainingState.results.length === 0) {
    toast("Kein Training-Wurf zum Zurücknehmen vorhanden.");
    return;
  }
  const removed = trainingState.results.pop();
  trainingState.dartsThrown = Math.max(0, trainingState.dartsThrown - 1);
  trainingState.totalPoints = Math.max(0, trainingState.totalPoints - (Number(removed?.points) || 0));
  trainingState.round = Math.min(trainingState.maxRounds, Math.max(1, Math.floor(trainingState.dartsThrown / 3) + 1));
  updateTrainingDisplay();
  toast("Letzter Trainingswurf zurückgenommen.");
}

function nextTrainingRound() {
  if (!trainingState.active) return;
  if (trainingState.dartsThrown % 3 !== 0) {
    toast("Bitte erst alle drei Darts werfen.");
    return;
  }
  trainingState.round++;
  if (trainingState.round > trainingState.maxRounds) {
    finishTraining();
    return;
  }
  updateTrainingDisplay();
}

function updateTrainingDisplay() {
  const target = $("#training-target");
  const progress = $("#training-progress");
  const score = $("#training-score");
  const status = $("#training-status");

  if (target) target.textContent = "Aktuelles Ziel: " + getTrainingTarget();
  if (progress) {
    progress.textContent = `Runde ${trainingState.round} von ${trainingState.maxRounds} · Dart ${(trainingState.dartsThrown % 3) + 1}`;
  }
  if (score) score.textContent = "Gesamtpunkte: " + trainingState.totalPoints;
  if (status) status.textContent = trainingState.active ? "Training läuft" : "Training nicht gestartet";
}

function finishTraining() {
  if (!trainingState.active) return;
  trainingState.active = false;

  const completedRounds = Math.min(
    trainingState.maxRounds,
    Math.max(1, Math.ceil(trainingState.dartsThrown / 3) || trainingState.round)
  );

  const result = {
    type: trainingState.type,
    date: new Date().toISOString(),
    rounds: completedRounds,
    darts: trainingState.dartsThrown,
    points: trainingState.totalPoints
  };

  if (!Array.isArray(app.trainingHistory)) {
    app.trainingHistory = [];
  }
  app.trainingHistory.push(result);
  saveData();

  const actions = $("#training-actions");
  if (actions) actions.hidden = true;

  const summary = $("#training-summary");
  if (summary) {
    summary.innerHTML = "";
    const h3 = document.createElement("h3");
    h3.textContent = "Training abgeschlossen!";
    const p = document.createElement("p");
    p.textContent = `Du hast ${result.darts} Darts in ${result.rounds} Runden geworfen und ${result.points} Punkte erreicht.`;
    summary.append(h3, p);
  }

  renderTrainingHistory();
  toast("Trainingsergebnis gespeichert.");
}

function renderTrainingHistory() {
  const container = $("#training-history");
  if (!container) return;

  container.innerHTML = "<h3>Deine Trainingsergebnisse</h3>";
  const entries = [...(app.trainingHistory || [])].reverse().slice(0, 15);

  if (entries.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Noch keine Trainingsergebnisse vorhanden.";
    container.appendChild(p);
    return;
  }

  entries.forEach(entry => {
    const row = document.createElement("p");
    row.textContent = `${entry.type} · ${entry.points} Punkte · ${formatGameDate(entry.date)}`;
    container.appendChild(row);
  });
}

function renderBoardTraining() {
  const page = $('[data-page="training"]');
  if (!page || $("#board-training-panel")) return;

  const panel = document.createElement("section");
  panel.id = "board-training-panel";
  panel.className = "panel";
  panel.innerHTML = `
    <h3>Schnell-Punkte im Training</h3>
    <p class="muted">Erfasse direkt Punkte für dein laufendes Training.</p>
  `;

  [20, 40, 60, 100, 140, 180].forEach(pts => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `+${pts} Pkt.`;
    btn.addEventListener("click", () => {
      if (!trainingState.active) {
        toast("Starte zuerst ein Training.");
        return;
      }
      recordTrainingDart(pts);
    });
    panel.appendChild(btn);
  });

  page.appendChild(panel);
}

/* Hilfe-Seite */

function buildHelpPage() {
  let page = $('[data-page="help"]');
  const main = $("#main-content") || $("main");

  if (!page && main) {
    page = document.createElement("section");
    page.id = "page-help";
    page.className = "page";
    page.dataset.page = "help";
    page.hidden = true;
    main.appendChild(page);
  }

  if (!page || $("#help-content")) return;

  const section = document.createElement("section");
  section.id = "help-content";
  section.className = "panel";
  section.innerHTML = `
    <button type="button" class="back-button" data-page-target="home">← Zurück</button>
    <span class="eyebrow">HILFE &amp; REGELN</span>
    <h2>Spielregeln und Bedienung</h2>

    <details open>
      <summary>X01 – 301, 501, 701, 901 und 1001</summary>
      <p>Jeder Spieler startet mit der gewählten Punktzahl und spielt sie auf genau 0 herunter. Bei Bust wird der Punktestand der Aufnahme auf den Stand zu Beginn der Runde zurückgesetzt.</p>
    </details>

    <details>
      <summary>Double-In, Master-In und Double-Out</summary>
      <p>Bei Double-In zählt der Start erst ab einem Doppel oder Bullseye; bei Master-In ab Doppel, Triple, Bull oder Bullseye. Bei Double-Out muss der letzte Dart ein Doppel oder Bullseye sein.</p>
    </details>

    <details>
      <summary>Cricket</summary>
      <p>Gespielt werden 15 bis 20 sowie Bull. Drei Treffer schließen ein Feld; weitere Treffer bringen Punkte, solange mindestens ein Gegner das Feld noch nicht geschlossen hat.</p>
    </details>

    <details>
      <summary>Shanghai &amp; Dart &amp; Durst</summary>
      <p>Bei Shanghai zählt in Runde 1–20 jeweils die aktuelle Rundenzahl; Single, Double und Triple derselben Zahl ergeben ein Shanghai. Bei Dart &amp; Durst zählen nur Double, Triple, Bull und Bullseye.</p>
    </details>

    <details>
      <summary>Tastaturkürzel</summary>
      <p><strong>U</strong>: Letzten Dart zurücknehmen · <strong>M</strong>: Fehlwurf erfassen · <strong>Enter / Leertaste</strong>: Ausgewähltes Dartboard-Feld bestätigen.</p>
    </details>
  `;

  page.appendChild(section);
  section.querySelector('[data-page-target="home"]')?.addEventListener("click", () => showPage("home"));
}

/* Einstellungen: Komfort, Profile, Datenschutz, PWA, Diagnose */

function buildSettingsSections() {
  const page = $('[data-page="settings"]');
  if (!page) return;

  if (!$("#comfort-settings")) {
    const section = document.createElement("section");
    section.id = "comfort-settings";
    section.className = "panel";
    section.innerHTML = `
      <h3>Anzeige und Komfort</h3>
      <label class="setting-row">
        <input id="setting-animations" type="checkbox">
        <span>Animationen</span>
      </label>
      <label class="setting-row">
        <input id="setting-compact" type="checkbox">
        <span>Kompakte Spielansicht</span>
      </label>
      <label class="setting-row">
        <input id="setting-sounds" type="checkbox">
        <span>Soundeffekte</span>
      </label>
      <button id="reset-comfort-settings" type="button">Anzeigeeinstellungen zurücksetzen</button>
    `;
    page.appendChild(section);

    $("#setting-animations")?.addEventListener("change", (e) => {
      app.settings.animations = e.target.checked;
      applyComfortSettings();
      saveData();
    });

    $("#setting-compact")?.addEventListener("change", (e) => {
      app.settings.compactView = e.target.checked;
      applyComfortSettings();
      saveData();
    });

    $("#setting-sounds")?.addEventListener("change", (e) => {
      app.settings.soundEffects = e.target.checked;
      saveData();
    });

    $("#reset-comfort-settings")?.addEventListener("click", () => {
      app.settings.animations = true;
      app.settings.compactView = false;
      app.settings.soundEffects = true;
      loadVoiceSettings();
      applyComfortSettings();
      saveData();
      toast("Anzeigeeinstellungen zurückgesetzt.");
    });
  }

  if (!$("#game-backup-panel")) {
    const panel = document.createElement("section");
    panel.id = "game-backup-panel";
    panel.className = "panel";
    panel.innerHTML = `
      <h3>Spielstand-Backup</h3>
      <p class="muted">Sichere oder stelle einen laufenden Spielstand wieder her.</p>
      <button id="export-game-state" type="button">Aktuellen Spielstand sichern</button>
      <label for="import-game-state">Spielstand wiederherstellen</label>
      <input id="import-game-state" type="file" accept=".json,application/json">
    `;
    page.appendChild(panel);

    $("#export-game-state")?.addEventListener("click", createGameBackup);
    $("#import-game-state")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      restoreGameBackup(file);
      e.target.value = "";
    });
  }

  if (!$("#privacy-information")) {
    const section = document.createElement("section");
    section.id = "privacy-information";
    section.className = "panel";
    section.innerHTML = `
      <h3>Datenschutz &amp; lokale Daten</h3>
      <p>Sachsen-Anhalt Dart speichert alle Spielerdaten, Ergebnisse und Turniere lokal im Browser.</p>
      <button id="privacy-clear" type="button">Alle lokalen App-Daten löschen</button>
      <p id="privacy-status" class="muted"></p>
    `;
    page.appendChild(section);
    $("#privacy-clear")?.addEventListener("click", clearAllLocalData);
  }

  if (!$("#pwa-install-section")) {
    const section = document.createElement("section");
    section.id = "pwa-install-section";
    section.className = "panel";
    section.innerHTML = `
      <h3>App-Installation &amp; Status</h3>
      <button id="install-app-button" type="button">App installieren</button>
      <p id="install-status" class="muted"></p>
      <p id="connection-status" class="muted"></p>
    `;
    page.appendChild(section);
    $("#install-app-button")?.addEventListener("click", installPWA);
  }

  if (!$("#app-system-check")) {
    const section = document.createElement("section");
    section.id = "app-system-check";
    section.className = "panel";
    page.appendChild(section);
  }

  if (!$("#app-error-log")) {
    const section = document.createElement("section");
    section.id = "app-error-log";
    section.className = "panel";
    section.innerHTML = `
      <h3>Fehlerprotokoll</h3>
      <div id="app-error-list"></div>
      <button id="clear-error-log" type="button">Fehlerprotokoll löschen</button>
    `;
    page.appendChild(section);
    $("#clear-error-log")?.addEventListener("click", () => {
      app.errorLog = [];
      saveData();
      renderErrorLog();
      toast("Fehlerprotokoll gelöscht.");
    });
  }

  if (!$("#app-about")) {
    const section = document.createElement("section");
    section.id = "app-about";
    section.className = "panel";
    section.innerHTML = `
      <h3>Über Sachsen-Anhalt Dart</h3>
      <p><strong>Version:</strong> 1.0 (korrigiert)</p>
      <p><strong>Plattform:</strong> Installierbare PWA (Offline-fähig)</p>
      <p><strong>Datenschutz:</strong> Lokale Speicherung auf deinem Gerät.</p>
    `;
    page.appendChild(section);
  }

  loadVoiceSettings();
  updateConnectionStatus();
  renderInstallButton();
  renderAppSystemCheck();
  renderErrorLog();
}

function buildPlayerProfileTools() {
  const page = $('[data-page="players"]');
  if (!page || $("#player-profile-tools")) return;

  const section = document.createElement("section");
  section.id = "player-profile-tools";
  section.className = "panel";
  section.innerHTML = `
    <h3>Spielerprofile übertragen</h3>
    <p class="muted">Exportiere ein Spielerprofil als JSON oder importiere ein vorhandenes Profil.</p>
    <label for="profile-export-select">Spieler auswählen</label>
    <select id="profile-export-select"></select>
    <button id="profile-export-button" type="button">Profil exportieren</button>
    <label for="profile-import-file">Profil importieren</label>
    <input id="profile-import-file" type="file" accept=".json,application/json">
  `;
  page.appendChild(section);

  $("#profile-export-button")?.addEventListener("click", () => {
    exportPlayerProfile($("#profile-export-select")?.value);
  });

  $("#profile-import-file")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    importPlayerProfile(file);
    e.target.value = "";
  });

  renderProfileExportOptions();
}

function renderProfileExportOptions() {
  const select = $("#profile-export-select");
  if (!select) return;

  select.innerHTML = "";
  if (app.players.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Keine Spieler vorhanden";
    select.appendChild(opt);
    return;
  }

  app.players.forEach(player => {
    const opt = document.createElement("option");
    opt.value = player.id;
    opt.textContent = player.name;
    select.appendChild(opt);
  });
}

function exportPlayerProfile(playerId) {
  const player = app.players.find(p => p.id === playerId);
  if (!player) {
    toast("Spieler nicht gefunden.");
    return;
  }

  const payload = {
    app: "Sachsen-Anhalt Dart",
    version: 1,
    exportedAt: new Date().toISOString(),
    player
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = player.name.replace(/[^a-z0-9_-]/gi, "_") + "_Dartprofil.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Spielerprofil exportiert.");
}

function importPlayerProfile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.app !== "Sachsen-Anhalt Dart" || !data.player || typeof data.player.name !== "string") {
        throw new Error("Ungültiges Profilformat.");
      }

      const imported = { ...data.player, name: data.player.name.trim() };
      if (!imported.name) throw new Error("Name ist leer.");

      const existing = app.players.find(p => p.name.toLowerCase() === imported.name.toLowerCase());
      if (existing) {
        if (!window.confirm("Dieser Spieler existiert bereits. Profil ersetzen?")) return;
        Object.assign(existing, imported, { id: existing.id });
      } else {
        imported.id = imported.id || generateId("player");
        app.players.push(imported);
      }

      saveData();
      renderPlayers();
      renderSetupPlayers();
      renderTournamentPlayerList();
      renderProfileExportOptions();
      renderStatistics();
      toast("Spielerprofil importiert.");
    } catch (_) {
      toast("Die Profildatei ist ungültig.");
    }
  };
  reader.readAsText(file);
}

function exportAppData() {
  const backup = {
    app: "Sachsen-Anhalt Dart",
    version: 1,
    createdAt: new Date().toISOString(),
    players: app.players,
    history: app.completedGames,
    tournaments: app.tournaments,
    trainingHistory: app.trainingHistory || [],
    settings: app.settings
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sachsen-anhalt-dart-backup.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Datensicherung erstellt.");
}

function importAppData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      const gamesArr = Array.isArray(backup.history)
        ? backup.history
        : Array.isArray(backup.completedGames)
          ? backup.completedGames
          : null;

      if (!backup || !Array.isArray(backup.players) || !gamesArr || !Array.isArray(backup.tournaments)) {
        throw new Error("Ungültige Sicherungsdatei.");
      }

      if (!window.confirm("Vorhandene Daten durch die Sicherung ersetzen?")) return;

      app.players = backup.players;
      app.completedGames = gamesArr;
      app.tournaments = backup.tournaments;
      app.trainingHistory = Array.isArray(backup.trainingHistory) ? backup.trainingHistory : [];

      if (backup.settings && typeof backup.settings === "object") {
        app.settings = { ...app.settings, ...backup.settings };
      }

      validateAppData();
      saveData();
      loadVoiceSettings();
      applyComfortSettings();
      renderPlayers();
      renderSetupPlayers();
      renderTournamentPlayerList();
      renderTournament();
      renderTournamentArchive();
      renderStatistics();
      renderGameHistory();
      renderTrainingHistory();
      renderProfileExportOptions();

      toast("Datensicherung wiederhergestellt.");
    } catch (_) {
      toast("Diese Sicherungsdatei ist ungültig.");
    }
  };
  reader.readAsText(file);
}

function createGameBackup() {
  if (!app.game) {
    toast("Es gibt keinen aktiven Spielstand.");
    return;
  }

  const backup = {
    appName: "Sachsen-Anhalt Dart",
    version: 1,
    createdAt: new Date().toISOString(),
    game: cloneData(app.game),
    players: cloneData(app.players)
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sachsen-anhalt-dart-spielstand.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Spielstand wurde gesichert.");
}

function restoreGameBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      if (
        backup.appName !== "Sachsen-Anhalt Dart" ||
        !backup.game ||
        !Array.isArray(backup.game.players) ||
        !Number.isInteger(backup.game.currentPlayer) ||
        backup.game.currentPlayer < 0 ||
        backup.game.currentPlayer >= backup.game.players.length
      ) {
        throw new Error("Ungültiger Spielstand.");
      }

      if (app.game && !app.game.finished && !window.confirm("Den aktuellen Spielstand ersetzen?")) {
        return;
      }

      app.game = cloneData(backup.game);
      if (Array.isArray(backup.players)) {
        app.players = cloneData(backup.players);
      }

      saveData();
      renderGame();
      showPage("game");
      toast("Spielstand wurde wiederhergestellt.");
    } catch (_) {
      toast("Diese Backup-Datei ist ungültig.");
    }
  };
  reader.readAsText(file);
}

function clearAllLocalData() {
  const confirmed = window.confirm(
    "Möchtest du wirklich alle Spieler, Ergebnisse, Turniere, Trainingsdaten und Einstellungen löschen?"
  );
  if (!confirmed) return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    app.players = [];
    app.completedGames = [];
    app.tournaments = [];
    app.trainingHistory = [];
    app.errorLog = [];
    app.game = null;
    dartUndoSnapshots = [];
    visitUndoSnapshots = [];

    saveData();
    renderPlayers();
    renderSetupPlayers();
    renderTournamentPlayerList();
    renderTournament();
    renderTournamentArchive();
    renderStatistics();
    renderGameHistory();
    renderTrainingHistory();
    renderProfileExportOptions();
    renderErrorLog();

    const status = $("#privacy-status");
    if (status) status.textContent = "Lokale App-Daten wurden gelöscht.";
    toast("Lokale App-Daten gelöscht.");
  } catch (_) {
    toast("Daten konnten nicht vollständig gelöscht werden.");
  }
}

/* PWA & Diagnose */

function renderInstallButton() {
  const btn = $("#install-app-button");
  const status = $("#install-status");
  if (!btn || !status) return;

  if (window.matchMedia("(display-mode: standalone)").matches) {
    btn.hidden = true;
    status.textContent = "Die App ist bereits installiert.";
    return;
  }

  btn.hidden = false;
  status.textContent = deferredInstallPrompt
    ? "Installation ist verfügbar."
    : "Falls keine Installation angeboten wird, nutze das Browsermenü und wähle „Zum Startbildschirm hinzufügen“.";
}

async function installPWA() {
  if (!deferredInstallPrompt) {
    toast("Öffne das Browsermenü und wähle „Zum Startbildschirm hinzufügen“.");
    return;
  }

  try {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === "accepted") {
      toast("Installation wurde bestätigt.");
    } else {
      toast("Installation wurde nicht durchgeführt.");
    }
  } catch (_) {
    toast("Installation momentan nicht verfügbar.");
  } finally {
    deferredInstallPrompt = null;
    renderInstallButton();
  }
}

function updateConnectionStatus() {
  const status = $("#connection-status");
  if (!status) return;
  status.textContent = navigator.onLine
    ? "Online – Verbindung verfügbar."
    : "Offline – keine Internetverbindung.";
}

async function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (
    location.protocol !== "https:" &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (err) {
    console.warn("Service Worker konnte nicht registriert werden:", err);
  }
}

function renderAppSystemCheck() {
  const panel = $("#app-system-check");
  if (!panel) return;

  const checks = [
    ["Spielerverwaltung", Array.isArray(app.players)],
    ["Spielhistorie", Array.isArray(app.completedGames)],
    ["Turnierverwaltung", Array.isArray(app.tournaments)],
    ["Lokale Speicherung", typeof saveData === "function"],
    ["Dartboard", Boolean($("#dartboard"))],
    ["Spielstart", typeof startGame === "function"],
    ["Wurfauswertung", typeof throwDart === "function"],
    ["Sprachkommentar", typeof announce === "function"]
  ];

  panel.innerHTML = "<h3>Systemprüfung</h3><p class=\"muted\">Überprüfung der wichtigsten App-Funktionen.</p>";

  checks.forEach(([name, ok]) => {
    const p = document.createElement("p");
    p.textContent = `${ok ? "✓" : "○"} ${name}: ${ok ? "bereit" : "nicht verfügbar"}`;
    p.style.color = ok ? "#23833b" : "#b7791f";
    panel.appendChild(p);
  });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Prüfung wiederholen";
  btn.addEventListener("click", () => {
    renderAppSystemCheck();
    renderDataIntegrity();
    renderFullDiagnostics();
  });
  panel.appendChild(btn);
}

function renderDataIntegrity() {
  const panel = $("#app-system-check");
  if (!panel) return;

  let box = $("#data-integrity-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "data-integrity-box";
    panel.appendChild(box);
  }

  const problems = checkAppDataIntegrity();
  box.innerHTML = "";

  const heading = document.createElement("h4");
  heading.textContent = "Datenintegrität";
  box.appendChild(heading);

  if (problems.length === 0) {
    const okP = document.createElement("p");
    okP.textContent = "✓ Keine Datenprobleme gefunden.";
    okP.style.color = "#23833b";
    box.appendChild(okP);
  } else {
    problems.forEach(prob => {
      const errP = document.createElement("p");
      errP.textContent = "• " + prob;
      errP.style.color = "#b7791f";
      box.appendChild(errP);
    });
  }
}

function renderFullDiagnostics() {
  const panel = $("#app-system-check");
  if (!panel) return;

  let diagBox = $("#full-diagnostics-box");
  if (!diagBox) {
    diagBox = document.createElement("div");
    diagBox.id = "full-diagnostics-box";
    panel.appendChild(diagBox);
  }

  const storageAvailable = (() => {
    try {
      const k = "__sa_dart_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (_) {
      return false;
    }
  })();

  diagBox.innerHTML = `
    <h4>Diagnose-Details</h4>
    <p class="muted">Spieler: ${app.players.length} · Partien: ${app.completedGames.length} · Turniere: ${app.tournaments.length}</p>
    <p class="muted">LocalStorage: ${storageAvailable ? "verfügbar" : "eingeschränkt"} · Sprache: ${"speechSynthesis" in window ? "verfügbar" : "nicht verfügbar"}</p>
  `;
}

function renderErrorLog() {
  const list = $("#app-error-list");
  if (!list) return;

  list.innerHTML = "";
  const errors = Array.isArray(app.errorLog) ? app.errorLog : [];

  if (errors.length === 0) {
    list.textContent = "Keine protokollierten Fehler vorhanden.";
    return;
  }

  [...errors].reverse().slice(0, 15).forEach(entry => {
    const card = document.createElement("article");
    card.className = "history-card";

    const msg = document.createElement("strong");
    msg.textContent = entry.message || "Unbekannter Fehler";

    const date = document.createElement("p");
    date.textContent = formatGameDate(entry.date || entry.timestamp);

    const det = document.createElement("small");
    det.textContent = entry.details || entry.source || "";

    card.append(msg, date, det);
    list.appendChild(card);
  });
}

/* Event-Listener binden */

function bindEvents() {
  $$("[data-page-target]").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.pageTarget;
      if (target) showPage(target);
    });
  });

  $$("[data-mode]").forEach(button => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (mode === "training") {
        showPage("training");
        return;
      }
      const label = button.querySelector(".mode-name")?.textContent || "";
      selectModeAndOpenSetup(mode, label);
    });
  });

  $("#quick-add-player")?.addEventListener("click", () => {
    const input = $("#quick-player-name");
    if (!input) return;
    if (addPlayer(input.value)) {
      input.value = "";
    }
  });

  $("#quick-player-name")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#quick-add-player")?.click();
    }
  });

  $("#create-player")?.addEventListener("click", () => {
    const input = $("#profile-name");
    if (!input) return;
    if (addPlayer(input.value)) {
      input.value = "";
    }
  });

  $("#profile-name")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#create-player")?.click();
    }
  });

  ["#x01-start", "#x01-in", "#x01-out", "#round-limit"].forEach(sel => {
    $(sel)?.addEventListener("change", saveGamePreferences);
  });

  $("#start-game")?.addEventListener("click", startGame);

  $("#dartboard")?.addEventListener("click", (event) => {
    const segment = event.target.closest(".dart-segment");
    if (!segment || !app.game) return;

    segment.classList.remove("hit-flash");
    void segment.offsetWidth;
    segment.classList.add("hit-flash");
    setTimeout(() => {
      segment.classList.remove("hit-flash");
    }, 600);

    if (typeof segment.blur === "function") {
      segment.blur();
    }

    let result;
    if (segment.dataset.type === "bull") {
      result = calculateBull("bull");
    } else if (segment.dataset.type === "bullseye") {
      result = calculateBull("bullseye");
    } else {
      result = calculateDart(
        Number(segment.dataset.number),
        Number(segment.dataset.multiplier)
      );
    }

    throwDart(result);
  });

  $("#dartboard")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const segment = event.target.closest(".dart-segment");
    if (!segment) return;
    event.preventDefault();
    segment.click();
  });

  $("#undo-dart")?.addEventListener("click", undoLastDart);
  $("#undo-visit")?.addEventListener("click", undoLastVisit);

  $("#miss-dart")?.addEventListener("click", () => {
    throwDart({
      number: 0,
      multiplier: 0,
      score: 0,
      type: "miss",
      label: "Pappe!"
    });
  });

  $("#finish-visit")?.addEventListener("click", () => {
    if (!app.game || app.game.finished) return;
    if (!app.game.darts || app.game.darts.length === 0) {
      toast("Es wurde noch kein Dart geworfen.");
      return;
    }
    finishVisit(false);
  });

  $("#finish-game")?.addEventListener("click", () => {
    if (!app.game || app.game.finished) return;
    if (app.settings.confirmEnd) {
      if (!window.confirm("Möchtest du das Spiel wirklich beenden?")) return;
    }
    finishGame();
  });

  $("#leave-game")?.addEventListener("click", () => {
    if (app.game && !app.game.finished && app.settings.confirmEnd) {
      if (!window.confirm("Aktuelles Spiel wirklich verlassen?")) return;
    }
    if (durstFinishTimer) {
      clearTimeout(durstFinishTimer);
      durstFinishTimer = null;
    }
    app.game = null;
    updateScreenWakeLock();
    showPage("home");
  });

  $("#play-again")?.addEventListener("click", () => {
    showPage("setup");
  });

  $("#create-tournament")?.addEventListener("click", createTournament);

  [
    "#voice-player",
    "#voice-score",
    "#voice-results",
    "#voice-speed",
    "#confirm-end",
    "#keep-screen-on"
  ].forEach(sel => {
    $(sel)?.addEventListener("change", saveVoiceSettings);
  });

  $("#voice-test")?.addEventListener("click", () => {
    announce("Willkommen bei Sachsen-Anhalt Dart. Good Darts!", "result");
  });

  $("#export-data")?.addEventListener("click", exportAppData);

  $("#import-file")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    importAppData(file);
    event.target.value = "";
  });

  $("#install-button")?.addEventListener("click", installPWA);

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable) {
      return;
    }

    if (!app.game || app.game.finished || !app.game.started || app.currentPage !== "game") {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "u") {
      event.preventDefault();
      undoLastDart();
    } else if (key === "m") {
      event.preventDefault();
      $("#miss-dart")?.click();
    } else if (key === "escape") {
      document.activeElement?.blur?.();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const topBtn = $("#install-button");
    if (topBtn) topBtn.hidden = false;
    renderInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    const topBtn = $("#install-button");
    if (topBtn) topBtn.hidden = true;
    renderInstallButton();
    toast("Sachsen-Anhalt Dart wurde installiert!");
  });

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateScreenWakeLock();
      updateConnectionStatus();
    } else {
      saveData();
    }
  });

  window.addEventListener("pagehide", saveData);
  window.addEventListener("beforeunload", saveData);

  window.addEventListener("error", (event) => {
    logAppError(
      event.message || "Unbekannter JavaScript-Fehler",
      `${event.filename || ""}:${event.lineno || ""}`
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    logAppError(
      "Nicht behandelter asynchroner Fehler",
      event.reason?.message || String(event.reason || "")
    );
  });

  if (!gameClockInterval) {
    gameClockInterval = setInterval(() => {
      if (app.currentPage === "game" && app.game && app.game.started && !app.game.finished) {
        renderModeExtrasInGame();
      }
    }, 1000);
  }
}

/* Initialisierung */

function initApp() {
  loadData();
  validateAppData();
  addExtraModeCards();
  buildTournamentExtras();
  buildTrainingPage();
  buildHelpPage();
  buildSettingsSections();
  buildPlayerProfileTools();
  loadGamePreferences();
  loadVoiceSettings();
  applyComfortSettings();
  renderDartboard();
  renderPlayers();
  renderSetupPlayers();
  updateSetupOptions();
  renderTournamentPlayerList();
  renderTournament();
  renderTournamentArchive();
  renderStatistics();
  renderGameHistory();
  bindEvents();
  registerAppServiceWorker();
  console.log("Sachsen-Anhalt Dart: Bereinigte App erfolgreich initialisiert.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
