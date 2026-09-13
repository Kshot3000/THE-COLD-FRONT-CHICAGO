/* ============ THE COLD FRONT — Chicago Bears fan hub ============
   Live data app. All fetching happens in the browser (CORS-friendly).
   Sources:
     ESPN  -> scores, schedule, standings, news, roster, injuries (CORS: *)
     Polymarket -> prediction markets (CORS: *)
     Kalshi -> regulated exchange markets (CORS: BLOCKED -> via proxies + cached seed)
   Seed data in data.js is the fallback when a fetch fails.
   ==================================================================== */
(function () {
  'use strict';

  const CF = window.CF || {};
  const TEAMS = CF.TEAMS || {};
  const LOGO = CF.LOGO || 'https://a.espncdn.com/i/teamlogos/nfl/500/';

  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
  const PM = 'https://gamma-api.polymarket.com';
  const KX = 'https://api.elections.kalshi.com/trade-api/v2';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money2 = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

  // ---------- fetch with timeout ----------
  async function getJSON(url, ms) {
    ms = ms || 15000;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- boot progress ----------
  const boot = (pct, msg) => {
    const bar = $('#boot-bar .boot-inner');
    if (bar) bar.style.width = Math.min(100, Math.max(5, pct)) + '%';
    const m = $('#boot-msg');
    if (m && msg) m.textContent = msg;
    if (pct >= 100) setTimeout(() => { const b = $('#boot-bar'); if (b) b.style.display = 'none'; }, 500);
  };

  const liveStatus = (state, text) => {
    const p = $('#live-pill');
    p.classList.remove('live', 'err');
    if (state) p.classList.add(state);
    const s = $('#live-status');
    if (s) s.textContent = text;
  };

  // ---------- time helpers (US/Central) ----------
  function fmtDate(utcIso, opts) {
    const d = new Date(utcIso);
    return d.toLocaleDateString('en-US', Object.assign({ timeZone: 'America/Chicago' }, opts || {}));
  }
  function fmtTime(utcIso) {
    const d = new Date(utcIso);
    return d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
  }
  function fmtWhen(utcIso) {
    const d = new Date(utcIso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return fmtTime(utcIso) + ' CT';
    return d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' + fmtTime(utcIso) + ' CT';
  }
  function relTime(iso) {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  const teamName = (a) => (TEAMS[a] || { name: a, short: a }).name;
  const teamShort = (a) => (TEAMS[a] || { name: a, short: a }).short;
  const logo = (a) => LOGO + a.toLowerCase() + '.png';

  // ===================== STATE =====================
  const S = {
    newsFilter: 'all',
    lastOdds: null,
    nextGame: null
  };

  // ===================== SCOREBOARD =====================
  async function loadScoreboard() {
    boot(15, 'Fetching today\'s scores…');
    const grid = $('#sb-grid');
    let events = [];
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const d = await getJSON(ESPN + '/scoreboard?dates=' + today);
      events = d.events || [];
      if (!events.length) {
        // try tomorrow
        const tm = new Date(Date.now() + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
        const d2 = await getJSON(ESPN + '/scoreboard?dates=' + tm);
        events = d2.events || [];
      }
    } catch (e) {
      grid.innerHTML = '<div class="err-note">Couldn\'t load today\'s games. <a target="_blank" rel="noopener" href="https://www.espn.com/nfl/scoreboard">See ESPN scoreboard ↗</a></div>';
      return;
    }
    if (!events.length) {
      grid.innerHTML = '<div class="empty-state"><div class="big">📅</div>No games scheduled today.<br>Check the <a href="#schedule" data-tab="schedule">schedule</a>.</div>';
      return;
    }
    grid.innerHTML = '';
    for (const ev of events) {
      const c = ev.competitions[0];
      const home = c.homeTeam, away = c.awayTeam;
      const status = ev.status && ev.status.type ? ev.status.type : {};
      const live = /in/.test(status.state || '') || (ev.status && ev.status.displayClock && ev.status.period > 0 && !status.completed);
      const isBears = home.team && home.team.id === '3' || away.team && away.team.id === '3';
      const item = el('a', 'sb-item' + (isBears ? ' hot' : ''));
      item.href = 'https://www.espn.com/nfl/game/_/gameId/' + ev.id;
      item.target = '_blank'; item.rel = 'noopener';
      const hs = home.score || '–', as = away.score || '–';
      const scoreTxt = (status.completed || live) ? (as + ' – ' + hs) : '– –';
      const whenTxt = status.shortDetail || fmtTime(ev.date);
      item.innerHTML =
        '<div class="sb-teams"><img src="' + logo(away.team.abbreviation) + '" onerror="this.remove()"><span class="' + (live || status.completed ? '' : 'dim') + '">' + esc(teamShort(away.team.abbreviation)) + '</span>' +
        '<img src="' + logo(home.team.abbreviation) + '" onerror="this.remove()"><span class="' + (live || status.completed ? '' : 'dim') + '">' + esc(teamShort(home.team.abbreviation)) + '</span></div>' +
        '<div class="sb-meta"><div class="sb-score">' + scoreTxt + '</div>' +
        '<div class="' + (live ? 'sb-live' : 'sb-status') + '">' + (live ? '● ' : '') + esc(whenTxt) + '</div></div>';
      grid.appendChild(item);
    }
    // find Bears game for next-game card
    const bears = events.find((e) => {
      const c = e.competitions[0];
      return (c.homeTeam.team.id === '3') || (c.awayTeam.team.id === '3');
    });
    if (bears) renderNextGame(bears);
    boot(35, 'Loading odds…');
    return events;
  }

  function renderNextGame(ev) {
    const c = ev.competitions[0];
    const home = c.homeTeam, away = c.awayTeam;
    const status = ev.status && ev.status.type ? ev.status.type : {};
    const live = (ev.status && ev.status.period > 0 && !status.completed) || /in/.test(status.state || '');
    const isHome = home.team.id === '3';
    const bear = isHome ? home : away, opp = isHome ? away : home;

    const body = $('#ng-body');
    let stateHtml;
    if (status.completed) stateHtml = '<span class="ng-state st-final">Final</span>';
    else if (live) stateHtml = '<span class="ng-state st-live">' + esc(status.shortDetail || 'Live') + '</span>';
    else stateHtml = '<span class="ng-state st-up">' + esc(status.shortDetail || 'Upcoming') + '</span>';

    const scoreHtml = (live || status.completed)
      ? '<div class="ng-score">' + (opp.score || 0) + ' : ' + (bear.score || 0) + '</div>'
      : '<div class="ng-when">' + fmtWhen(ev.date) + '</div>';

    body.innerHTML =
      '<div class="ng-team"><img src="' + logo(opp.team.abbreviation) + '" onerror="this.remove()"><div><div class="t-name">' + esc(teamShort(opp.team.abbreviation)) + '</div><div class="t-sub">' + (isHome ? 'Away' : 'Away') + '</div></div></div>' +
      '<div class="ng-mid">' + stateHtml + scoreHtml + '</div>' +
      '<div class="ng-team home"><div><div class="t-name">Bears</div><div class="t-sub">' + (isHome ? 'Home' : 'Away') + '</div></div><img src="' + logo('CHI') + '" onerror="this.remove()"></div>';

    $('#ng-week').textContent = (ev.season && ev.season.displayName ? ev.season.displayName + ' · ' : '') + 'Week ' + (ev.week ? ev.week.number : '');

    // vegas odds from scoreboard
    const odds = (c.odds || [])[0];
    $('#ng-ml').textContent = odds && odds.details ? odds.details : '—';
    $('#ng-spread').textContent = odds && odds.spread != null ? 'CHI ' + (isHome ? '+' : '') + odds.spread : '—';
    $('#ng-ou').textContent = odds && odds.overUnder != null ? 'O/U ' + odds.overUnder : '—';

    S.nextGame = ev;
  }

  // ===================== STANDINGS =====================
  async function loadStandings() {
    boot(45, 'Loading standings…');
    try {
      const d = await getJSON('https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=2026', 20000);
      // structure: children[0]=AFC, children[1]=NFC, each .standings.children = divisions, each .standings.entries
      const confs = d.children || [];
      const renderGroup = (entries, sel, onlyChiHighlight) => {
        const wrap = $(sel);
        if (!entries || !entries.length) { wrap.innerHTML = '<div class="empty-state">No data</div>'; return; }
        const rows = entries.map((e) => {
          const t = e.team, s = e.stats;
          const abbr = t.abbreviation;
          const val = (id) => { const x = s.find((x) => x.name === id); return x ? x.value : '–'; };
          const wins = val('wins'), losses = val('losses'), ties = val('ties') || 0;
          const rec = wins + '-' + losses + (ties ? '-' + ties : '');
          const pct = val('winningPercentage');
          const pf = val('pointsFor'), pa = val('pointsAgainst');
          const streak = val('streak');
          const isChi = abbr === 'CHI';
          return '<tr class="' + (isChi ? 'chi-row' : '') + '">' +
            '<td><span class="tcell"><img src="' + logo(abbr) + '" onerror="this.remove()">' + esc(t.displayName || t.name) + '</span></td>' +
            '<td class="num"><b>' + rec + '</b></td>' +
            '<td class="num pct ' + (pct >= 0.5 ? 'g' : pct > 0 ? 'r' : '') + '">' + (pct ? (pct * 100).toFixed(0) + '%' : '–') + '</td>' +
            '<td class="num">' + pf + '</td><td class="num">' + pa + '</td>' +
            '<td class="num">' + esc(streak || '') + '</td></tr>';
        }).join('');
        wrap.innerHTML = '<table><thead><tr><th>Team</th><th class="num">W-L</th><th class="num">PCT</th><th class="num">PF</th><th class="num">PA</th><th class="num">Streak</th></tr></thead><tbody>' + rows + '</tbody></table>';
      };
      const nfc = confs.find((c) => c.abbreviation === 'NFC');
      const afc = confs.find((c) => c.abbreviation === 'AFC');
      const north = nfc && nfc.standings && nfc.standings.children && nfc.standings.children.find((d) => /North/.test(d.name));
      if (north) {
        renderGroup(north.standings.entries, '#standings-north');
        renderGroup(north.standings.entries, '#standings-home');
      }
      // full conference = aggregate all division entries, sort by wins/pct
      const confEntries = (conf) => {
        if (!conf || !conf.standings || !conf.standings.children) return [];
        return conf.standings.children.flatMap((d) => d.standings.entries || []);
      };
      const sortEntries = (arr) => arr.slice().sort((a, b) => {
        const aw = (a.stats.find((s) => s.name === 'wins') || {}).value || 0;
        const bw = (b.stats.find((s) => s.name === 'wins') || {}).value || 0;
        if (bw !== aw) return bw - aw;
        const ap = (a.stats.find((s) => s.name === 'winningPercentage') || {}).value || 0;
        const bp = (b.stats.find((s) => s.name === 'winningPercentage') || {}).value || 0;
        return bp - ap;
      });
      renderGroup(sortEntries(confEntries(nfc)), '#standings-nfc');
      renderGroup(sortEntries(confEntries(afc)), '#standings-afc');
    } catch (e) {
      $('#standings-north').innerHTML = '<div class="err-note">Standings unavailable right now.</div>';
    }
  }

  // ===================== SCHEDULE =====================
  async function loadSchedule() {
    boot(55, 'Loading schedule…');
    const wrap = $('#sched-list');
    let items = null;
    try {
      const d = await getJSON(ESPN + '/teams/chi/schedule', 20000);
      items = (d.events || []).filter((e) => {
        // regular season only
        const st = e.seasonType || {};
        return st.type !== 4; // 4 = playoffs; include 2 (reg) and 3 (pre) but label
      }).map((e) => {
        const c = e.competitions[0];
        const home = c.homeTeam, away = c.awayTeam;
        const status = e.status && e.status.type ? e.status.type : {};
        const isHome = home.team.id === '3';
        const oppAbbr = (isHome ? away : home).team.abbreviation;
        let score = null, result = null;
        if (status.completed && home.score != null) {
          const chi = isHome ? home.score : away.score;
          const opp = isHome ? away.score : home.score;
          score = chi + ' - ' + opp;
          result = chi > opp ? 'W' : (chi < opp ? 'L' : 'T');
        } else if (e.status && e.status.period > 0 && !status.completed) {
          const chi = isHome ? (home.score || 0) : (away.score || 0);
          const opp = isHome ? (away.score || 0) : (home.score || 0);
          score = '● ' + opp + ' - ' + chi;
        }
        const weekNo = e.week ? e.week.number : (e.notes || []).reduce((acc, n) => /week (\d+)/i.test(n.headline || '') ? parseInt(RegExp.$1) : acc, null);
        return {
          week: weekNo, away: isHome ? 'CHI' : oppAbbr, home: isHome ? oppAbbr : 'CHI',
          date: e.date, score, result,
          pre: (e.seasonType || {}).type === 3,
          playoff: (e.seasonType || {}).type === 4
        };
      });
    } catch (e) { /* fall through to seed */ }
    if (!items || !items.length) items = CF.SEED_SCHEDULE.map((g) => Object.assign({ score: null, result: null, pre: false, playoff: false }, g));
    // mark next game (first future or in-progress)
    const now = Date.now();
    let marked = false;
    items.forEach((g) => { if (!marked && !g.score && new Date(g.date).getTime() >= now - 3 * 3600000) { g.next = true; marked = true; } });
    wrap.innerHTML = '';
    items.forEach((g) => {
      if (g.bye) {
        const row = el('div', 'sched-item');
        row.innerHTML = '<div class="wk">WK ' + g.week + '</div><div class="opp"><span class="at" style="color:var(--gold);font-weight:800;letter-spacing:.08em">BYE WEEK</span></div><div class="when"></div><div class="sc dim"></div>';
        wrap.appendChild(row); return;
      }
      const isHome = g.home === 'CHI';
      const opp = isHome ? g.away : g.home;
      const row = el('div', 'sched-item' + (isHome ? ' home' : '') + (g.next ? ' next' : ''));
      const up = g.result === 'W' ? '<span class="m-up win">W ' + esc(g.score) + '</span>' :
        g.result === 'L' ? '<span class="m-up loss">L ' + esc(g.score) + '</span>' :
        g.score && g.score.indexOf('●') === 0 ? '<span class="m-up" style="color:var(--red)">' + esc(g.score) + '</span>' :
        g.next ? '<span class="m-up">UP NEXT</span>' : '';
      const sc = g.result ? '<div class="sc">' + esc(g.score) + '</div>' :
        g.score && g.score.indexOf('●') === 0 ? '<div class="sc" style="color:var(--red)">' + esc(g.score) + '</div>' :
        '<div class="sc dim">' + (g.pre ? 'PRE' : '') + '</div>';
      row.innerHTML =
        '<div class="wk">WK ' + (g.week || '?') + '</div>' +
        '<div class="opp"><img src="' + logo(opp) + '" onerror="this.remove()"><span><span class="at">' + (isHome ? 'vs' : 'at') + '</span> ' + esc(teamName(opp)) + (g.next ? up : (g.result ? up : '')) + '</span></div>' +
        '<div class="when">' + (g.date ? fmtWhen(g.date) : 'TBD') + '</div>' + sc;
      wrap.appendChild(row);
    });
    $('#sched-note').textContent = CF.SEED_SCHEDULE.length === items.length ? 'Season opener: Week 1 @ Panthers (live today)' : 'Week 8 is the bye week';
  }

  // ===================== NEWS =====================
  async function loadNews() {
    boot(65, 'Loading news…');
    let articles = [];
    try {
      const d = await getJSON(ESPN + '/news?limit=20', 20000);
      articles = d.articles || [];
    } catch (e) { /* empty */ }
    renderNews();
  }
  function isBearsArt(a) {
    const t = ((a.headline || '') + ' ' + (a.description || '')).toLowerCase();
    return /chicago|bears|windy city|soldier field/.test(t);
  }
  function newsItemHtml(a) {
    const img = a.images && a.images[0] ? a.images[0].url : '';
    const href = a.links && a.links.find((l) => l.href) ? a.links.find((l) => l.href).href : '#';
    return '<a class="news-item" href="' + esc(href) + '" target="_blank" rel="noopener">' +
      (img ? '<img src="' + esc(img) + '" loading="lazy" onerror="this.remove()">' : '') +
      '<div class="n-body"><div class="n-hd">' + esc(a.headline || '') + '</div>' +
      (a.description ? '<div class="n-desc">' + esc(a.description) + '</div>' : '') +
      '<div class="n-meta"><span>' + (a.source && a.source.name ? esc(a.source.name) : 'ESPN') + '</span><span>' + relTime(a.lastModified || a.published) + '</span></div></div></a>';
  }
  function renderNews() {
    const full = $('#news-full');
    const home = $('#news-home');
    const list = S.newsFilter === 'all' ? window.__NEWS__ : window.__NEWS__.filter(isBearsArt);
    const shown = S.newsFilter === 'all' ? list : list;
    if (!shown.length) {
      full.innerHTML = '<div class="empty-state"><div class="big">📰</div>No news items loaded.</div>';
      if (home) home.innerHTML = '<div class="empty-state">Loading…</div>';
      return;
    }
    full.innerHTML = shown.slice(0, 30).map(newsItemHtml).join('');
    if (home) home.innerHTML = shown.slice(0, 4).map(newsItemHtml).join('');
  }

  // ===================== INJURIES =====================
  async function loadInjuries() {
    boot(72, 'Checking injury report…');
    const wrap = $('#injury-list');
    let data = null;
    try { data = await getJSON(ESPN + '/teams/chi/injuries', 20000); } catch (e) { /* empty */ }
    const items = [];
    if (data) {
      // shape: {athletes:[{position,items:[...]}]} or {groups:[...]} — handle both
      const groups = data.athletes || data.groups || [];
      groups.forEach((g) => (g.items || []).forEach((a) => items.push(Object.assign({ pos: g.position }, a))));
    }
    if (!items.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="big">🩹</div>No injuries reported this week.<br><span style="font-size:12px;color:var(--muted-2)">ESPN\'s injury report is typically published Sunday for each game day.</span></div>';
      return;
    }
    const statusCls = (s) => {
      s = (s || '').toLowerCase();
      if (/out/.test(s)) return 'inj-out';
      if (/doubt/.test(s)) return 'inj-doubt';
      if (/\?/.test(s)) return 'inj-qa';
      if (/prob/.test(s)) return 'inj-probable';
      return 'inj-unknown';
    };
    wrap.innerHTML = '<div class="inj-list">' + items.map((a) => {
      const st = a.status || 'Unknown';
      return '<div class="inj-item"><span class="inj-pos">' + esc((a.position || '?').slice(0, 3).toUpperCase()) + '</span>' +
        '<div><div class="inj-name">' + esc(a.fullName || a.displayName || a) + '</div>' +
        '<div class="inj-injury">' + esc(a.injury || a.description || st) + '</div></div>' +
        '<span class="inj-status ' + statusCls(st) + '">' + esc(st) + '</span></div>';
    }).join('') + '</div>';
  }

  // ===================== ROSTER =====================
  let rosterCache = null;
  async function loadRoster() {
    boot(80, 'Loading roster…');
    const wrap = $('#roster-table');
    if (!rosterCache) {
      try {
        rosterCache = await getJSON(ESPN + '/teams/chi/roster', 25000);
      } catch (e) { rosterCache = null; }
    }
    if (!rosterCache) {
      wrap.innerHTML = '<div class="err-note">Roster unavailable right now. <a target="_blank" rel="noopener" href="https://www.espn.com/nfl/team/roster/_/name/chi">See ESPN roster ↗</a></div>';
      return;
    }
    const renderPos = (pos) => {
      const groups = rosterCache.athletes || [];
      const g = groups.find((x) => x.position === pos) || groups[0];
      if (!g || !g.items || !g.items.length) { wrap.innerHTML = '<div class="empty-state">No players listed.</div>'; return; }
      const rows = g.items.map((p) => {
        const stats = p.season || {};
        const cells = [
          stats.passYds != null ? stats.passYds : (stats.recYds != null ? stats.recYds : (stats.rushYds != null ? stats.rushYds : (stats.tackles != null ? stats.tackles : (stats.fumblesRecovered != null ? stats.fumblesRecovered : '–'))))
        ];
        const lbl = stats.passYds != null ? 'Pass Yds' : stats.recYds != null ? 'Rec Yds' : stats.rushYds != null ? 'Rush Yds' : stats.tackles != null ? 'Tackles' : '';
        return '<tr><td><span class="tcell">' + esc(p.fullName || p.displayName) + '</span></td>' +
          '<td>' + esc((p.position && p.position !== pos ? p.position : '') || '') + '</td>' +
          '<td class="num">' + (p.age != null ? p.age : '–') + '</td>' +
          '<td class="num">' + (p.displayHeight || '') + ' / ' + (p.displayWeight || '') + '</td>' +
          '<td class="num" title="' + esc(lbl) + '">' + (cells[0] == null || cells[0] === '' ? '–' : Number(cells[0]).toLocaleString()) + '</td></tr>';
      }).join('');
      wrap.innerHTML = '<table><thead><tr><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">Ht/Wt</th><th class="num">Stat</th></tr></thead><tbody>' + rows + '</tbody></table>';
    };
    renderPos($('#roster-pos').value || 'offense');
    $('#roster-pos').onchange = () => renderPos($('#roster-pos').value);
  }

  // ===================== ODDS =====================
  function mlToDec(ml) {
    if (ml == null) return null;
    ml = Number(ml);
    if (ml >= 100) return (100 / (ml + 100)) * 100;
    if (ml <= -100) return ((-ml / (-ml + 100)) * 100);
    return null;
  }
  function decToMl(dec) {
    if (dec == null || dec <= 0 || dec >= 100) return null;
    const prob = dec / 100;
    const odds = (1 - prob) / prob;
    return odds >= 1 ? Math.round(100 * odds) : -Math.round(100 / odds);
  }
  function kxTickerFor(gameDate, away, home) {
    // KXNFLGAME-<YYMMDD><AWAY><HOME>-<TEAM>  (e.g. KXNFLGAME-26SEP13DALNYG-DAL)
    const d = new Date(gameDate);
    const ymd = d.getUTCFullYear().toString().slice(2) + d.toISOString().slice(5, 10).toUpperCase().replace('-', '');
    return 'KXNFLGAME-' + ymd + away.toUpperCase() + home.toUpperCase();
  }

  async function loadOdds() {
    boot(40, 'Pulling the odds…');
    const ev = S.nextGame;
    const label = $('#odds-game-label');
    const stamp = $('#odds-updated');

    if (!ev) {
      label.textContent = '';
      ['#odds-vegas', '#odds-pm', '#odds-kx'].forEach((s) => $(s).innerHTML = '<div class="err-note">No Bears game found in the schedule.</div>');
      stamp.textContent = '';
      return;
    }
    const c = ev.competitions[0];
    const home = c.homeTeam, away = c.awayTeam;
    const isBearsHome = home.team.id === '3';
    const awayAbbr = away.team.abbreviation, homeAbbr = home.team.abbreviation;
    label.textContent = 'Week ' + (ev.week ? ev.week.number : '?') + ' · ' + esc(teamShort(awayAbbr)) + ' at ' + esc(teamShort(homeAbbr));

    // ---------- VEGAS (ESPN scoreboard odds) ----------
    const vegasBox = $('#odds-vegas');
    try {
      const dateStr = ev.date.slice(0, 10).replace(/-/g, '');
      const sb = await getJSON(ESPN + '/scoreboard?dates=' + dateStr, 20000);
      const e2 = (sb.events || []).find((x) => x.id === ev.id) || ev;
      const o = ((e2.competitions || [])[0] || {}).odds && ((e2.competitions[0].odds || [])[0]);
      if (o) {
        const bearOdds = isBearsHome ? o.homeTeamOdds : o.awayTeamOdds;
        const oppOdds = isBearsHome ? o.awayTeamOdds : o.homeTeamOdds;
        const bearML = bearOdds && bearOdds.moneyline ? bearOdds.moneyline : null;
        const oppML = oppOdds && oppOdds.moneyline ? oppOdds.moneyline : null;
        const spreadVal = o.spread != null ? o.spread : null;
        const bearSpread = spreadVal != null ? (isBearsHome ? spreadVal : -spreadVal) : null;
        const row = (l, v, sub) => '<div class="odd-row"><span class="o-label">' + l + '</span><span class="o-val">' + v + (sub ? ' <small>' + sub + '</small>' : '') + '</span></div>';
        vegasBox.innerHTML =
          row('Bears ML', bearML ? (bearML > 0 ? '+' + bearML : bearML) : '–', bearML ? '(' + (mlToDec(bearML) || 0).toFixed(0) + '%)' : '') +
          row('Opponent ML', oppML ? (oppML > 0 ? '+' + oppML : oppML) : '–', oppML ? '(' + (mlToDec(oppML) || 0).toFixed(0) + '%)' : '') +
          row('Spread (CHI)', bearSpread != null ? (bearSpread > 0 ? '+' : '') + bearSpread : '–', o.details || '') +
          row('Total O/U', o.overUnder != null ? o.overUnder : '–', 'over/under') +
          (o.provider ? '<div style="font-size:10px;color:var(--muted-2);font-weight:700;margin-top:2px">Source: ' + esc(o.provider.displayName || 'Vegas') + ' · via ESPN</div>' : '');
        S.lastOdds = { vegas: { bearML: bearML && +bearML, bearSpread, ou: o.overUser != null ? +o.overUnder : null } };
      } else {
        vegasBox.innerHTML = '<div class="err-note">Vegas odds not posted yet for this game.</div>';
      }
    } catch (e) {
      vegasBox.innerHTML = '<div class="err-note">Couldn\'t load Vegas odds.</div>';
    }

    // ---------- POLYMARKET ----------
    const pmBox = $('#odds-pm');
    try {
      const ymd = ev.date.slice(0, 10);
      const slug = 'nfl-' + awayAbbr.toLowerCase() + '-' + homeAbbr.toLowerCase() + '-' + ymd;
      let d = null;
      try { d = await getJSON(PM + '/events?slug=' + slug, 15000); }
      catch (e) { d = null; }
      if (!d || !d.events || !d.events.length) {
        // search fallback
        const sr = await getJSON(PM + '/public-search?q=' + teamShort(awayAbbr) + '+' + teamShort(homeAbbr) + '&limit_per_type=6&events_status=active', 15000).catch(() => null);
        const evts = sr && sr.events ? sr.events.filter((e) => !e.closed && (e.title || '').toLowerCase().indexOf(teamShort(homeAbbr).toLowerCase()) > -1) : [];
        d = evts.length ? { events: evts } : null;
      }
      if (d && d.events && d.events.length) {
        const evts = d.events;
        let html = '';
        let winPrice = null;
        for (const evt of evts) {
          const mkts = evt.markets || [];
          for (const m of mkts) {
            if (m.closed) continue;
            let outcomes = [], prices = [];
            try { outcomes = JSON.parse(m.outcomes || '[]'); prices = JSON.parse(m.outcomePrices || '[]'); } catch (e) { continue; }
            const qi = outcomes.findIndex((o) => /bears/i.test(o));
            if (qi === -1) continue;
            const p = prices[qi] != null ? Number(prices[qi]) * 100 : null;
            if (winPrice == null && /^bears vs/i.test(m.question || '')) winPrice = p;
            if (mkts.length <= 8 || /bears vs|spread: bears/i.test(m.question || '')) {
              html += '<div class="odd-row"><span class="o-label">' + esc(m.question || '') + '</span><span class="o-val">' + (p != null ? p.toFixed(0) + '<small>¢</small>' : '–') + '</span></div>';
            }
          }
        }
        pmBox.innerHTML = html || '<div class="err-note">No active Polymarket market found for this game yet.</div>';
        if (winPrice != null) {
          $('#ng-pm').textContent = winPrice.toFixed(0) + '%';
          $('#ng-pm').className = 'gold';
        }
      } else {
        pmBox.innerHTML = '<div class="err-note">No Polymarket market found yet for this game.</div>';
      }
    } catch (e) {
      pmBox.innerHTML = '<div class="err-note">Couldn\'t reach Polymarket.</div>';
    }

    // ---------- KALSHI ----------
    const kxBox = $('#odds-kx');
    try {
      const base = kxTickerFor(ev.date, awayAbbr, homeAbbr);
      const tickers = [base + '-' + (isBearsHome ? homeAbbr : awayAbbr), base + '-' + (isBearsHome ? awayAbbr : homeAbbr)].join(',');
      const d = await kxFetch(KX + '/markets?tickers=' + encodeURIComponent(tickers));
      const mkts = d && d.markets ? d.markets.filter((m) => m.market_ticker && m.market_ticker.indexOf(base) === 0) : [];
      if (mkts.length) {
        let html = '';
        let bearBid = null;
        for (const m of mkts) {
          const isBears = m.market_ticker.endsWith('-' + (isBearsHome ? homeAbbr : awayAbbr)) || /bears/i.test(m.title || '');
          const bid = m.yes_bid_dollars != null ? Math.round(m.yes_bid_dollars * 100) : null;
          const ask = m.yes_ask_dollars != null ? Math.round(m.yes_ask_dollars * 100) : null;
          const vol = m.volume_fp;
          if (isBears && bid != null) bearBid = bid;
          const shortTitle = (m.title || '').replace(/.*game:\s*/i, '');
          html += '<div class="odd-row"><span class="o-label">' + esc(shortTitle) + '</span><span class="o-val">' + (bid != null ? bid + '<small>¢ bid</small>' : '–') + '</span></div>' +
            (ask != null ? '<div style="font-size:10.5px;color:var(--muted-2);margin:-4px 0 0 0;padding-left:2px">ask ' + ask + '¢' + (vol ? ' · vol ' + money2(vol) : '') + '</div>' : '');
        }
        kxBox.innerHTML = html;
        if (bearBid != null) {
          $('#ng-kx').textContent = bearBid + '%';
          $('#ng-kx').className = 'gold';
        }
      } else {
        kxBox.innerHTML = '<div class="err-note">No Kalshi market found yet for this game.<br>Check <a href="https://kalshi.com/markets/KXNFLGAME" target="_blank" rel="noopener">kalshi.com ↗</a></div>';
      }
    } catch (e) {
      kxBox.innerHTML = '<div class="err-note">Kalshi is blocking direct browser access (CORS) and the fallback proxy is down.<br>See live prices at <a href="https://kalshi.com/markets/KXNFLGAME" target="_blank" rel="noopener">kalshi.com/markets/KXNFLGAME ↗</a></div>';
    }

    stamp.textContent = 'updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // ---------- Polymarket movers ----------
    loadPMMovers();
  }

  // Kalshi fetch with proxy fallbacks
  async function kxFetch(url) {
    try {
      return await getJSON(url, 8000);
    } catch (e) {
      const proxies = [
        (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
        (u) => 'https://r.jina.ai/' + u
      ];
      for (const p of proxies) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 9000);
          const r = await fetch(p(url), { signal: ctrl.signal });
          clearTimeout(t);
          if (!r.ok) throw new Error('proxy ' + r.status);
          const text = await r.text();
          // jina wraps in markdown — extract the JSON body
          const m = text.match(/\{[\s\S]*\}/);
          if (m) return JSON.parse(m[0]);
          return JSON.parse(text);
        } catch (e2) { /* next */ }
      }
      throw new Error('all Kalshi routes failed');
    }
  }

  async function loadPMMovers() {
    const wrap = $('#pm-movers');
    if (!wrap) return;
    try {
      const d = await getJSON(PM + '/public-search?q=bears&limit_per_type=12&events_status=active', 20000);
      const evts = (d.events || []).filter((e) => !e.closed && !e.archived);
      if (!evts.length) { wrap.innerHTML = '<div class="empty-state">No active Bears markets on Polymarket.</div>'; return; }
      wrap.innerHTML = evts.slice(0, 8).map((evt) => {
        const m = (evt.markets || [])[0];
        let price = null;
        if (m) {
          try {
            const prices = JSON.parse(m.outcomePrices || '[]');
            const outcomes = JSON.parse(m.outcomes || '[]');
            const qi = outcomes.findIndex((o) => /yes|bears/i.test(o));
            price = prices[qi] != null ? (Number(prices[qi]) * 100).toFixed(0) : null;
          } catch (e) { /* */ }
        }
        const vol = evt.volume ? (Number(evt.volume) >= 1e6 ? (Number(evt.volume) / 1e6).toFixed(1) + 'M' : Math.round(Number(evt.volume) / 1000) + 'K') : '';
        return '<div class="pm-card"><div class="pm-q">' + esc(evt.title || '') + '</div>' +
          '<div class="pm-row"><span></span><span class="pm-price">' + (price != null ? price + '<small>% yes</small>' : '–') + '</span></div>' +
          (vol ? '<div class="pm-vol">Vol $' + vol + '</div>' : '') +
          (price != null ? '<div class="pm-bar"><i style="width:' + price + '%"></i></div>' : '') +
          (m ? '<a href="https://polymarket.com/event/' + esc(evt.slug || '') + '" target="_blank" rel="noopener" style="display:block;margin-top:8px;font-size:11px;font-weight:700">View market ↗</a>' : '') + '</div>';
      }).join('');
    } catch (e) {
      wrap.innerHTML = '<div class="err-note">Couldn\'t load Polymarket movers.</div>';
    }
  }

  // ===================== TICKER =====================
  function buildTicker(events, odds) {
    const track = $('#ticker-track');
    if (!track) return;
    let parts = ['🔵 <b>THE COLD FRONT</b> — Chicago Bears fan hub', 'Follow the dev on X: <b>@kshot9000</b>'];
    (events || []).forEach((ev) => {
      const c = ev.competitions[0];
      const st = ev.status && ev.status.type ? ev.status.type : {};
      const hs = c.homeTeam.score, as = c.awayTeam.score;
      const a = c.awayTeam.team.abbreviation, h = c.homeTeam.team.abbreviation;
      const isBears = h === 'CHI' || a === 'CHI';
      let txt;
      if (st.completed && hs != null) {
        const w = as > hs ? 'W' : hs > as ? 'W' : 'T';
        txt = (isBears && a === 'CHI' ? (as > hs ? '<span class="win">W</span> ' : '<span class="loss">L</span> ') : '') +
          (isBears && h === 'CHI' ? (hs > as ? '<span class="win">W</span> ' : '<span class="loss">L</span> ') : '') +
          teamShort(a) + ' ' + (as || 0) + ' · ' + teamShort(h) + ' ' + (hs || 0);
      } else if (ev.status && ev.status.period > 0) {
        txt = '● LIVE ' + teamShort(a) + ' ' + (as || 0) + ' · ' + teamShort(h) + ' ' + (hs || 0) + ' (' + esc(st.shortDetail || '') + ')';
      } else {
        txt = teamShort(a) + ' at ' + teamShort(h) + ' · ' + fmtTime(ev.date) + ' CT';
      }
      parts.push(txt);
    });
    if (odds && odds.vegas) {
      const v = odds.vegas;
      if (v.bearML != null) parts.push('Bears ML ' + (v.bearML > 0 ? '+' : '') + v.bearML);
      if (v.bearSpread != null) parts.push('Bears ' + (v.bearSpread > 0 ? '+' : '') + v.bearSpread);
      if (v.ou != null) parts.push('O/U ' + v.ou);
    }
    parts.push('Donate BTC: ' + CF.BTC.slice(0, 6) + '…' + CF.BTC.slice(-4));
    const html = parts.map((p) => '<span>' + p + '</span>').join('');
    track.innerHTML = html + html; // duplicate for seamless loop
  }

  // ===================== TABS =====================
  function wireTabs() {
    const switchTo = (name) => {
      $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
      $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '#' + name);
    };
    $$('.nav-link').forEach((b) => (b.onclick = () => switchTo(b.dataset.tab)));
    $$('[data-tab]').forEach((a) => {
      if (a.classList.contains('nav-link')) return;
      a.onclick = (e) => { e.preventDefault(); switchTo(a.dataset.tab); };
    });
    const initial = (location.hash || '#home').slice(1);
    if ($('#tab-' + initial)) switchTo(initial);
  }

  // ===================== DONATE =====================
  function wireDonate() {
    const addr = $('#btc-addr');
    if (addr) addr.textContent = CF.BTC;
    const copy = $('#btc-copy');
    if (copy) copy.onclick = () => {
      const done = () => { copy.textContent = '✓ Copied'; setTimeout(() => (copy.textContent = '⧉ Copy'), 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(CF.BTC).then(done).catch(done);
      else {
        const ta = document.createElement('textarea');
        ta.value = CF.BTC; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) { /* */ }
        document.body.removeChild(ta); done();
      }
    };
    // QR
    const canvas = $('#btc-qr-canvas');
    if (canvas && window.QRCode) {
      try {
        QRCode.toCanvas(canvas, 'bitcoin:' + CF.BTC, { width: 148, height: 148, margin: 1, errorCorrectionLevel: 'M' });
      } catch (e) { canvas.remove(); }
    }
  }

  // ===================== REFRESH WIRING =====================
  function wireRefresh() {
    $('#sb-refresh').onclick = () => loadScoreboard().then((ev) => buildTicker(ev, S.lastOdds));
    $('#news-refresh').onclick = () => loadNews();
    $('#injury-refresh').onclick = () => loadInjuries();
    $('#odds-refresh').onclick = () => loadOdds();
    $$('.news-controls .chip[data-filter]').forEach((c) => {
      c.onclick = () => {
        S.newsFilter = c.dataset.filter;
        $$('.news-controls .chip[data-filter]').forEach((x) => x.classList.toggle('active', x === c));
        renderNews();
      };
    });
  }

  // ===================== INIT =====================
  async function init() {
    wireTabs();
    wireDonate();
    wireRefresh();
    window.__NEWS__ = [];

    const tasks = [
      loadScoreboard().catch(() => null),
      loadStandings().catch(() => null),
      loadSchedule().catch(() => null),
      loadInjuries().catch(() => null)
    ];
    // fetch raw news before render
    let articles = [];
    try {
      const d = await getJSON(ESPN + '/news?limit=25', 20000);
      articles = d.articles || [];
    } catch (e) { /* */ }
    window.__NEWS__ = articles;
    renderNews();

    const [events] = await Promise.all(tasks);
    boot(90, 'Crunching the numbers…');
    await loadOdds().catch(() => null);
    await loadRoster().catch(() => null);

    buildTicker(events || [], S.lastOdds);

    // hero week
    const wk = S.nextGame && S.nextGame.week ? 'WEEK ' + S.nextGame.week.number + ' · ' : '';
    const hw = $('#hero-week');
    if (hw) hw.textContent = '2026 SEASON' + (S.nextGame ? ' · ' + (events && events.length ? 'GAMES TODAY' : '') : '');

    boot(100, 'Live');
    liveStatus('live', 'live');
    console.log('%c THE COLD FRONT v' + CF.VERSION, 'color:#C8380B;font-weight:bold');
  }

  document.addEventListener('DOMContentLoaded', () => init().catch((e) => {
    console.error(e);
    liveStatus('err', 'offline');
    boot(100, 'offline — using cached data');
  }));
})();
