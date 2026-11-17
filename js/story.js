/* ------------------------------------------------------------------
   story.js — everything you'd want to edit lives here.
   Words, dates, links and the level layout. No drawing code.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  // ---- You ---------------------------------------------------------
  const CONFIG = {
    name: 'Bella',
    // Leave a link empty ('') and it won't be shown.
    links: {
      github: 'https://github.com/BellaBao1111',
      linkedin: '',
      email: ''
    }
  };

  // ---- World measurements (world units, not pixels) ----------------
  const G = 470;          // y of the ground
  const END_X = 9050;     // where the two worlds meet

  // ---- Chapters ----------------------------------------------------
  // l = the scientist's voice (left / top), r = the engineer's voice.
  const CHAPTERS = [
    {
      start: -400, year: '2019',
      l: { no: 'Chapter one', title: 'Origin', place: 'La Jolla, California', zh: '起点' },
      r: { no: 'ch_01', title: 'origin', place: 'la jolla, california', zh: '起点' }
    },
    {
      start: 2200, year: '2023',
      l: { no: 'Chapter two', title: 'Bugs, both kinds', place: 'Shenzhen, summer 2023', zh: '捉虫' },
      r: { no: 'ch_02', title: 'bugs, both kinds', place: 'shenzhen, summer 2023', zh: '捉虫' }
    },
    {
      start: 4300, year: '2024',
      l: { no: 'Chapter three', title: 'Two halves start talking', place: 'New Haven, Connecticut', zh: '对话' },
      r: { no: 'ch_03', title: 'two halves start talking', place: 'new haven, connecticut', zh: '对话' }
    },
    {
      start: 6700, year: '2025',
      l: { no: 'Chapter four', title: 'Teaching machines to review', place: 'San Jose, California', zh: '合流' },
      r: { no: 'ch_04', title: 'teaching machines to review', place: 'san jose, california', zh: '合流' }
    }
  ];

  // ---- Story beats -------------------------------------------------
  // A beat fires when BOTH players have walked past x.
  const BEATS = [
    { x: 60,
      l: '2019. I arrive at UC San Diego wanting to know how living things work.',
      r: '2019. i arrive at uc san diego wanting to know how to make things work.' },
    { x: 430,
      l: 'So I major in Bioinformatics: biology, read as text.',
      r: 'and minor in computer science: text, made to run.' },
    { x: 1250,
      l: 'I have a question and no tools.',
      r: 'i have tools and no question.' },

    { x: 2260,
      l: 'Summer 2023. Degree in hand, I go to see what happens to ideas outside a lab.',
      r: 'summer 2023. two internships: software engineering at bytedance, mobile messaging ui at easycount in shenzhen.' },
    { x: 2470,
      l: 'There are bugs here. I know what to do with bugs: observe, collect, label.',
      r: 'there are bugs here. i know what to do with bugs: reproduce, fix, ship.' },
    { x: 3880,
      l: 'Field note: real users are the most surprising organisms I have studied.',
      r: 'real phones. real users. nothing teaches like shipping.' },

    { x: 4360,
      l: 'Autumn 2023. Yale, for a master’s in Health Informatics.',
      r: 'new coast, colder. same two tracks, running closer together.' },
    { x: 4880,
      l: 'Curiosity alone won’t get me across.' },
    { x: 5330,
      l: 'In health data, every row turns out to be a person.',
      r: 'so the code has to be right. not clever. right.' },
    { x: 5600,
      r: 'code alone won’t get me across.' },
    { x: 6230,
      l: 'Summer 2024. A side quest: software engineering intern at Adobe.',
      r: 'side quest accepted. (it becomes the main quest.)' },

    { x: 6760,
      l: 'And I ask the scientist’s question: is it actually any good?',
      r: 'july 2025. adobe, developer experience. i build ai that reviews code.' },
    { x: 6960,
      l: 'So I build the evaluation: benchmarks, evidence, a verdict.' },
    { x: 7500,
      l: 'Somewhere along the way I start mentoring interns.',
      r: 'new party member joined.' },
    { x: 7720,
      r: 'every claim gets a test run.' },
    { x: 8120,
      l: 'Building it is the engineer’s job. Doubting it is the scientist’s.',
      r: 'building it is the engineer’s job. doubting it is the scientist’s.' },
    { x: 8720,
      l: 'The line between us has been getting thinner for years.',
      r: 'no merge conflict found.' }
  ];

  // Lines spoken when something happens rather than somewhere.
  const LINES = {
    gotQuestion: { r: 'received: one good question.' },
    gotScript:   { l: 'Received: one working script.' },
    gate1:       { l: 'It turns out we need each other.', r: 'noted: we work better as a pair.' },
    bugsLeft:    { l: 'One got away. Go back for it.', r: 'one still open. go back for it.' },
    gate2:       { l: 'All six, catalogued.', r: 'all six, fixed.' },
    gotDataset:  { r: 'here. a dataset. build on it.' },
    gotHypo:     { l: 'Here. A hypothesis. Test it.' },
    stamp1:      { r: 'review passed. merging.' },
    tests:       { l: 'Evidence accepted.' },
    stamp2:      { r: 'approved. nothing left in the way.' },
    tether:      { l: 'I can’t go on without the other half of me.', r: 'waiting for the other half of me.' },
    finale:      { l: 'Here is where the worlds touch.', r: 'here is where the worlds touch.' }
  };

  // ---- The ending and the page beneath it ---------------------------
  const WHOLE = {
    hello: 'I’m Bella.',
    line: 'A scientist who ships, an engineer who measures. Both players were always me.',
    about: [
      'I’m a software engineer at Adobe, on the Developer Experience team in San Jose. I work on AI-powered code review: building the reviewer, and building the evaluation frameworks and benchmarks that tell us whether to trust it.',
      'I got here sideways. I studied Bioinformatics at UC San Diego, then Health Informatics at Yale, and somewhere between reading genomes and reading pull requests I noticed they were the same habit: compare two versions carefully, and care about what changed.',
      'I think in two languages, Chinese and English, and in two disciplines. This site is what that feels like.'
    ],
    path: [
      { when: '2025 to now', what: 'Software Engineer, Adobe', more: 'Developer Experience. AI code review, evaluation frameworks, benchmarking, production monitoring. Mentoring interns.' },
      { when: 'Summer 2024', what: 'Software Engineering Intern, Adobe', more: 'The side quest that became the main quest.' },
      { when: '2023 to 2025', what: 'M.S. Health Informatics, Yale University', more: '' },
      { when: 'Summer 2023', what: 'Software Engineering Intern, ByteDance', more: '' },
      { when: 'May to Sep 2023', what: 'Assistant Engineer, Easycount Technology', more: 'Shenzhen. Mobile messaging UI.' },
      { when: '2019 to 2023', what: 'B.S. Bioinformatics, UC San Diego', more: 'Minor in Computer Science.' }
    ],
    loadout: [
      'AI code review', 'Evaluation design', 'Benchmarking', 'Production monitoring',
      'CI/CD integration', 'LLM and agent tooling', 'Mentoring'
    ],
    sidequests: [
      'Prototyping small games. This site is one of them.',
      'Home automation with Home Assistant.',
      'Tinkering with AI agents and MCP.'
    ],
    credits: 'Written, directed and played by Bella. Player one: Bella. Player two: also Bella.'
  };

  // ---- Level layout ------------------------------------------------
  // crate(x, height, width) sits on the ground. Pickups are centred on x, y.
  const crate = (x, h, w) => ({ x, y: G - h, w, h });
  const pk = (x, up, glyph, extra) => Object.assign({ x, y: G - up, glyph, got: false }, extra || {});

  const LEVEL = {
    L: {
      solids: [
        // chapter one
        crate(560, 60, 120), crate(1010, 60, 110), crate(1120, 116, 130), crate(1450, 70, 150),
        // chapter two
        crate(2960, 64, 220),
        // chapter three
        crate(5440, 70, 150),
        // chapter four
        crate(7060, 64, 150), crate(8200, 60, 110), crate(8310, 116, 150)
      ],
      pits: [{ x0: 5000, x1: 5250, flag: 'bridgeL' }],
      pickups: [
        pk(790, 34, 'A'), pk(620, 100, 'C'), pk(1065, 100, 'G'), pk(1185, 158, 'T'),
        pk(1525, 118, '?', { key: 'gotQuestion', big: true }),
        pk(4500, 34, 'A'), pk(5125, 96, 'T'), pk(6000, 34, 'G'),
        pk(5515, 118, 'H₀', { key: 'gotHypo', big: true }),
        pk(6900, 34, 'C'), pk(7500, 104, 'A'), pk(8760, 34, 'T')
      ],
      bugs: [
        { x0: 2520, x1: 2760, y: G, fly: false },
        { x0: 2985, x1: 3150, y: G - 64, fly: false },
        { x0: 3450, x1: 3720, y: G - 112, fly: true }
      ],
      gates: [
        { id: 'g1', x: 1960, label: 'needs a script' },
        { id: 'g2', x: 4100, label: 'six bugs' },
        { id: 'wL1', x: 7960, label: 'unverified' }
      ],
      pads: [
        { id: 'stamp1', x: 7075, w: 120, y: G - 64, opens: 'wR1', line: 'stamp1' },
        { id: 'stamp2', x: 8325, w: 120, y: G - 116, opens: 'wR2', line: 'stamp2' }
      ],
      signs: [{ x: 6330, text: ['Summer 2024', 'Adobe', 'intern'] }]
    },
    R: {
      solids: [
        crate(450, 60, 110), crate(820, 60, 120), crate(940, 116, 120), crate(1620, 70, 150),
        crate(3160, 64, 220),
        crate(4720, 70, 150),
        crate(7640, 64, 150)
      ],
      pits: [{ x0: 5720, x1: 5970, flag: 'bridgeR' }],
      pickups: [
        pk(650, 34, '{'), pk(505, 100, '}'), pk(880, 100, '('), pk(1000, 158, ')'),
        pk(1695, 118, '.py', { key: 'gotScript', big: true }),
        pk(4450, 34, '['), pk(5300, 104, ']'), pk(5845, 96, '<'),
        pk(4795, 118, '.csv', { key: 'gotDataset', big: true }),
        pk(6850, 34, '>'), pk(8050, 104, '+'), pk(8820, 34, ';')
      ],
      bugs: [
        { x0: 2640, x1: 2880, y: G, fly: false },
        { x0: 3185, x1: 3350, y: G - 64, fly: false },
        { x0: 3560, x1: 3830, y: G - 112, fly: true }
      ],
      gates: [
        { id: 'g1', x: 1960, label: 'needs a question' },
        { id: 'g2', x: 4100, label: 'six bugs' },
        { id: 'wR1', x: 7380, label: 'needs review' },
        { id: 'wR2', x: 8640, label: 'needs review' }
      ],
      pads: [
        { id: 'tests', x: 7655, w: 120, y: G - 64, opens: 'wL1', line: 'tests' }
      ],
      signs: [{ x: 6330, text: ['summer 2024', 'adobe', 'intern'] }]
    }
  };

  window.BELLA = { CONFIG, G, END_X, CHAPTERS, BEATS, LINES, WHOLE, LEVEL };
})();
