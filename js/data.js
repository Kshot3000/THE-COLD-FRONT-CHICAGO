/* ============ THE COLD FRONT — static seed data (fallback) ============
   These are FALLBACKS. The app fetches live data from ESPN/Kalshi/Polymarket
   and overwrites these at runtime. Seed keeps the site useful offline / if a
   fetch fails. */
(function (global) {
  'use strict';

  const LOGO = 'https://a.espncdn.com/i/teamlogos/nfl/500/';

  // All 32 NFL teams: abbr -> {name, short}
  const TEAMS = {
    ARI: { name: 'Arizona Cardinals', short: 'Cardinals' },
    ATL: { name: 'Atlanta Falcons', short: 'Falcons' },
    BAL: { name: 'Baltimore Ravens', short: 'Ravens' },
    BUF: { name: 'Buffalo Bills', short: 'Bills' },
    CAR: { name: 'Carolina Panthers', short: 'Panthers' },
    CHI: { name: 'Chicago Bears', short: 'Bears' },
    CLE: { name: 'Cleveland Browns', short: 'Browns' },
    DAL: { name: 'Dallas Cowboys', short: 'Cowboys' },
    DEN: { name: 'Denver Broncos', short: 'Broncos' },
    DET: { name: 'Detroit Lions', short: 'Lions' },
    GB:  { name: 'Green Bay Packers', short: 'Packers' },
    HOU: { name: 'Houston Texans', short: 'Texans' },
    IND: { name: 'Indianapolis Colts', short: 'Colts' },
    JAX: { name: 'Jacksonville Jaguars', short: 'Jaguars' },
    KC:  { name: 'Kansas City Chiefs', short: 'Chiefs' },
    LAC: { name: 'Los Angeles Chargers', short: 'Chargers' },
    LAR: { name: 'Los Angeles Rams', short: 'Rams' },
    MIA: { name: 'Miami Dolphins', short: 'Dolphins' },
    MIN: { name: 'Minnesota Vikings', short: 'Vikings' },
    NE:  { name: 'New England Patriots', short: 'Patriots' },
    NO:  { name: 'New Orleans Saints', short: 'Saints' },
    NYG: { name: 'New York Giants', short: 'Giants' },
    NYJ: { name: 'New York Jets', short: 'Jets' },
    PHI: { name: 'Philadelphia Eagles', short: 'Eagles' },
    PIT: { name: 'Pittsburgh Steelers', short: 'Steelers' },
    SEA: { name: 'Seattle Seahawks', short: 'Seahawks' },
    SF:  { name: 'San Francisco 49ers', short: '49ers' },
    TB:  { name: 'Tampa Bay Buccaneers', short: 'Bucs' },
    TEN: { name: 'Tennessee Titans', short: 'Titans' },
    WSH: { name: 'Washington Commanders', short: 'Commanders' }
  };
  // ESPN uses WAS for Washington; normalize both.
  TEAMS.WAS = TEAMS.WSH;

  const NFC_NORTH = ['CHI', 'GB', 'DET', 'MIN'];
  const NFC_EAST = ['PHI', 'NYG', 'WAS', 'TB'];
  const NFC_NORTHWEST = ['DEN', 'LAR', 'SEA', 'SF', 'MIN']; // placeholder, built live
  const NFC_SOUTHEAST = ['ATL', 'CAR', 'NO', 'TB', 'TEN'];

  // 2026 regular season schedule (fallback). week 8 is the bye.
  // format: {week, away, home, date(ISO)} — dates are kickoff UTC approximations.
  const SEED_SCHEDULE = [
    { week: 1, away: 'CHI', home: 'CAR', date: '2026-09-13T17:00:00Z' },
    { week: 2, away: 'MIN', home: 'CHI', date: '2026-09-20T17:00:00Z' },
    { week: 3, away: 'PHI', home: 'CHI', date: '2026-09-29T00:15:00Z' },
    { week: 4, away: 'NYJ', home: 'CHI', date: '2026-10-04T17:00:00Z' },
    { week: 5, away: 'CHI', home: 'GB',  date: '2026-10-11T20:25:00Z' },
    { week: 6, away: 'CHI', home: 'ATL', date: '2026-10-18T17:00:00Z' },
    { week: 7, away: 'NE',  home: 'CHI', date: '2026-10-23T00:15:00Z' },
    { week: 8, bye: true },
    { week: 9, away: 'CHI', home: 'SEA', date: '2026-11-03T01:15:00Z' },
    { week: 10, away: 'TB', home: 'CHI', date: '2026-11-09T01:20:00Z' },
    { week: 11, away: 'NO', home: 'CHI', date: '2026-11-22T18:00:00Z' },
    { week: 12, away: 'CHI', home: 'DET', date: '2026-11-26T18:00:00Z' },
    { week: 13, away: 'JAX', home: 'CHI', date: '2026-12-06T18:00:00Z' },
    { week: 14, away: 'CHI', home: 'MIA', date: '2026-12-13T18:00:00Z' },
    { week: 15, away: 'CHI', home: 'BUF', date: '2026-12-20T01:20:00Z' },
    { week: 16, away: 'GB', home: 'CHI', date: '2026-12-25T18:00:00Z' },
    { week: 17, away: 'DET', home: 'CHI', date: '2027-01-03T21:25:00Z' },
    { week: 18, away: 'CHI', home: 'MIN', date: '2027-01-10T05:00:00Z' }
  ];

  // Fallback standings (preseason 0-0). Live fetch overwrites.
  const SEED_STANDINGS = {
    chi: { name: 'Chicago Bears', abbr: 'CHI', record: '0-0', wins: 0, losses: 0, pct: 0, pf: 0, pa: 0, streak: '' },
    gb:  { name: 'Green Bay Packers', abbr: 'GB', record: '0-0', wins: 0, losses: 0, pct: 0, pf: 0, pa: 0, streak: '' },
    det: { name: 'Detroit Lions', abbr: 'DET', record: '0-0', wins: 0, losses: 0, pct: 0, pf: 0, pa: 0, streak: '' },
    min: { name: 'Minnesota Vikings', abbr: 'MIN', record: '0-0', wins: 0, losses: 0, pct: 0, pf: 0, pa: 0, streak: '' }
  };

  global.CF = {
    TEAMS, LOGO, NFC_NORTH,
    SEED_SCHEDULE, SEED_STANDINGS,
    X_DEV: 'kshot9000',
    BTC: '3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK',
    VERSION: '1.0.0'
  };
})(window);
