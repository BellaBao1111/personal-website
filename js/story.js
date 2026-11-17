/* ------------------------------------------------------------------
   story.js — everything you'd want to edit lives here.
   Words, dates, links and the level layout. No drawing code.

   Two players, both Bella, together a forward deployed engineer:
     L = forward       (left world, daylight) in the room with the customer
                        keys A D W
     R = the engineer  (right world, night)   deep in the implementation
                        keys ← → ↑
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

  const END_X = 218;      // where the two marks are

  // ---- Chapters ----------------------------------------------------
  const CHAPTERS = [
    { start: -50, year: '2019',
      l: { no: 'Chapter one', title: 'Hello, world', place: 'La Jolla, California', zh: '起点' },
      r: { no: 'ch_01', title: 'hello, world', place: 'la jolla, california', zh: '起点' } },
    { start: 50, year: '2023',
      l: { no: 'Chapter two', title: 'Ship it', place: 'Shenzhen, summer 2023', zh: '上线' },
      r: { no: 'ch_02', title: 'ship it', place: 'shenzhen, summer 2023', zh: '上线' } },
    { start: 105, year: '2024',
      l: { no: 'Chapter three', title: 'Two halves start talking', place: 'New Haven, Connecticut', zh: '对话' },
      r: { no: 'ch_03', title: 'two halves start talking', place: 'new haven, connecticut', zh: '对话' } },
    { start: 165, year: '2025',
      l: { no: 'Chapter four', title: 'Forward deployed', place: 'San Jose, California', zh: '合流' },
      r: { no: 'ch_04', title: 'forward deployed', place: 'san jose, california', zh: '合流' } }
  ];

  // ---- Story beats -------------------------------------------------
  // l fires when the forward half passes x, r when the engineer does.
  const BEATS = [
    { x: 0.5, l: '2019. UC San Diego. I learn to ask what people actually need.',
              r: '2019. uc san diego. i learn to build it.' },
    { x: 5,   l: 'A and D to walk. W to jump.',
              r: 'left and right arrows to walk. up arrow to jump.' },
    { x: 18,  l: 'That plate ahead opens her door, not mine. Getting us in the door is my job.',
              r: 'my door is shut. she has to open it.' },
    { x: 27,  r: 'through. now i hold the next one: she needs something that works to walk in with.' },
    { x: 37,  l: 'Two marks, two doors. We press together.',
              r: 'two marks, two doors. we press together.' },

    { x: 51,  l: 'Summer 2023. Real users, real phones, real bugs.',
              r: 'summer 2023. two internships: software engineering at bytedance, mobile messaging ui at easycount in shenzhen.' },
    { x: 54,  l: 'A bug, in front of a user. Jump on it.',
              r: 'a bug. jump on it.' },
    { x: 65,  l: 'She can’t cross that gap alone. When I walk, her platform moves.',
              r: 'i can’t cross alone. i step on, she walks, i ride.' },
    { x: 84,  l: 'My turn. What she ships carries me across.',
              r: 'now i carry her.' },

    { x: 106, l: 'Autumn 2023. Yale, for a master’s.',
              r: 'new coast, colder, harder problems.' },
    { x: 109, l: 'Too high to jump. I wait on the lift.',
              r: 'i stand on the switch. her lift goes up.' },
    { x: 116, l: 'Up. Now I find her switch.' },
    { x: 124, l: 'The half that listens and the half that builds start to talk.',
              r: 'turns out they need each other.' },
    { x: 141, l: 'Summer 2024. A side quest: software engineering intern at Adobe.',
              r: 'side quest accepted. (it becomes the main quest.)' },
    { x: 145.5, l: 'I hold the bridge. She crosses.',
              r: 'then i hold hers.' },

    { x: 166, l: 'My customers are engineers. I work across their teams until it runs in their pipelines.',
              r: 'july 2025. adobe, developer experience. i build ai that reviews code.' },
    { x: 168, l: 'Every piece of feedback I bring back clears something in her way.',
              r: 'blocked. i need to know what they actually meant.' },
    { x: 177, r: 'every fix i ship gives her ground to stand on.' },
    { x: 196.5, l: 'Somewhere along the way I start mentoring interns.',
              r: 'new party member joined.' },
    { x: 209, l: 'In the room and in the code were never two jobs.',
              r: 'in the room and in the code were never two jobs.' },
    { x: 214, l: 'One mark each. Stand on both.',
              r: 'one mark each. stand on both.' }
  ];

  // Lines spoken when something happens rather than somewhere.
  const LINES = {
    sync:    { l: 'Nothing ships alone.', r: 'nothing ships alone.' },
    stompL:  { l: 'Caught it before the customer did.' },
    stompR:  { r: 'fixed.' },
    comment: { l: 'Feedback, straight from the customer.', r: 'unblocked. so that’s what they meant.' },
    commit:  { l: 'Something real to stand on.', r: 'fix shipped.' },
    finale:  { l: 'Hold still. Merging.', r: 'hold still. merging.' }
  };

  // ---- The ending and the page beneath it ---------------------------
  const WHOLE = {
    hello: 'I’m Bella.',
    line: 'The one in the room with the customer and the one who ships the fix. Both players were always me.',
    about: [
      'I’m a software engineer at Adobe, on the Developer Experience team in San Jose. I work on AI-powered code review: building it, getting it running in other teams’ pipelines, and building the evaluation that tells us whether to trust it.',
      'My customers are engineers, so the feedback is fast and blunt. The part of the work I like best is the loop: sit with the people who have the problem, find out what is actually blocking them, go build the fix, and come back to watch it land.',
      'That is how a forward deployed engineer works, and it is how I work: one half out front with the customer, one half deep in the implementation, and no handoff between them.',
      'I think in two languages, Chinese and English, and switch between them without noticing.'
    ],
    path: [
      { when: '2025 to now', what: 'Software Engineer, Adobe', more: 'Developer Experience. AI code review, cross-team integration, evaluation frameworks, benchmarking, production monitoring. Mentoring interns.' },
      { when: 'Summer 2024', what: 'Software Engineering Intern, Adobe', more: 'The side quest that became the main quest.' },
      { when: '2023 to 2025', what: 'M.S., Yale University', more: '' },
      { when: 'Summer 2023', what: 'Software Engineering Intern, ByteDance', more: '' },
      { when: 'May to Sep 2023', what: 'Assistant Engineer, Easycount Technology', more: 'Shenzhen. Mobile messaging UI.' },
      { when: '2019 to 2023', what: 'B.S., UC San Diego', more: '' }
    ],
    loadout: [
      'Cross-team integration', 'AI code review', 'Evaluation design', 'Benchmarking',
      'Production monitoring', 'CI/CD integration', 'LLM and agent tooling', 'Mentoring'
    ],
    sidequests: [
      'Prototyping small games. This site is one of them.',
      'Home automation with Home Assistant.',
      'Tinkering with AI agents and MCP.'
    ],
    credits: 'Written, scoped, built and shipped by Bella. Player one: Bella. Player two: also Bella.'
  };

  // ---- Level layout ------------------------------------------------
  // Units are metres, y is up, the ground is y = 0. A player is 0.9 tall,
  // jumps 2.3 high and about 4.4 far.
  //
  //   ground:  [x0, x1, top]            anything not covered is a pit
  //   blocks:  [x0, x1, y0, y1]         static things to climb
  //   plates:  work only while stood on; `drives` something in the OTHER
  //            world, `sync` plates open a pair of doors when both are held
  //   doors, lifts, bridges: driven by a plate or a pickup in the other world
  //   carry:   a platform whose x follows the other player along `track`
  const LEVEL = {
    L: {
      ground: [[-12, 14, 0], [16.6, 88, 0], [100, 115, 0], [115, 140, 5], [140, 150, 0], [158, 176, 0], [182, 190, 0], [196, 240, 0]],
      blocks: [
        [8, 10, 0, 1], [39, 41.5, 0, 1.2],
        [72, 74, 0, 1], [128, 130, 5, 6], [132, 134.5, 5, 6.6],
        [184, 185.6, 0, 1], [185.6, 187.2, 0, 2],
        [206, 208, 0, 3.3]
      ],
      plates: [
        { id: 'pL1', x: 22, y: 0, drives: 'dR1' },
        { id: 'sL1', x: 44, y: 0, sync: 's1' },
        { id: 'sL2', x: 101.6, y: 0, sync: 's2' },
        { id: 'pL3', x: 119.5, y: 5, drives: 'liftR' },
        { id: 'pL4', x: 146.6, y: 0, drives: 'bR4' },
        { id: 'sL3', x: 160.6, y: 0, sync: 's3' }
      ],
      doors: [
        { id: 'dL1', x: 34 }, { id: 's1', x: 47, sync: true }, { id: 's2', x: 103.6, sync: true }, { id: 's3', x: 163, sync: true }
      ],
      lifts: [{ id: 'liftL', x0: 111.4, x1: 114.9, y0: 0.35, y1: 5 }],
      bridges: [
        { id: 'bL4', x0: 150, x1: 158, y: 0 },
        { id: 'gL1', x0: 176, x1: 182, y: 0, ghost: true },
        { id: 'gL2', x0: 190, x1: 196, y: 0, ghost: true },
        { id: 'gL3', x0: 204, x1: 206, y: 1.6, ghost: true, step: true }
      ],
      carry: [{ id: 'cL', w: 3, y: 0, from: 89.5, to: 98.5, track: [86, 95] }],
      rails: [[68, 77]],
      bugs: [{ x0: 55, x1: 61, y: 0 }, { x0: 141.5, x1: 145, y: 0 }, { x0: 197, x1: 202, y: 0 }],
      pickups: [
        { x: 5, y: 1.3 }, { x: 9, y: 2.5 }, { x: 15.3, y: 2.3 }, { x: 28, y: 1.3 }, { x: 40.2, y: 2.7 },
        { x: 64, y: 1.3 }, { x: 73, y: 2.6 }, { x: 94, y: 2.4 },
        { x: 113, y: 2.6 }, { x: 129, y: 7.4 }, { x: 133.2, y: 8.1 }, { x: 154, y: 2.2 },
        { x: 179, y: 2.2 }, { x: 193, y: 2.2 }, { x: 207, y: 4.8 },
        { x: 169, y: 1.2, key: 'wR1', kind: 'comment' },
        { x: 186.4, y: 3.2, key: 'wR2', kind: 'comment' },
        { x: 198.5, y: 1.2, key: 'wR3', kind: 'comment' }
      ],
      signs: [{ x: 143, text: ['Summer 2024', 'Adobe', 'intern'] }]
    },
    R: {
      ground: [[-12, 13.6, 0], [16.2, 70, 0], [82, 123, 0], [123, 140, 5], [140, 148, 0], [156, 240, 0]],
      blocks: [
        [4.6, 6.6, 0, 1], [7.4, 9, 0, 1.9],
        [64, 66, 0, 1.1], [98, 100, 0, 1],
        [127, 129, 5, 6.2], [134, 136, 5, 6],
        [188.2, 189.8, 0, 1.2], [189.8, 191.4, 0, 2.2],
        [210, 212, 0, 1.2]
      ],
      plates: [
        { id: 'pR1', x: 30, y: 0, drives: 'dL1' },
        { id: 'sR1', x: 44, y: 0, sync: 's1' },
        { id: 'sR2', x: 101.6, y: 0, sync: 's2' },
        { id: 'pR3', x: 109.5, y: 0, drives: 'liftL' },
        { id: 'pR4', x: 158.4, y: 0, drives: 'bL4' },
        { id: 'sR3', x: 160.9, y: 0, sync: 's3' }
      ],
      doors: [
        { id: 'dR1', x: 26 }, { id: 's1', x: 47, sync: true }, { id: 's2', x: 103.6, sync: true }, { id: 's3', x: 163, sync: true },
        { id: 'wR1', x: 172, wall: true }, { id: 'wR2', x: 186, wall: true }, { id: 'wR3', x: 200, wall: true }
      ],
      lifts: [{ id: 'liftR', x0: 119.4, x1: 122.9, y0: 0.35, y1: 5 }],
      bridges: [{ id: 'bR4', x0: 148, x1: 156, y: 0 }],
      carry: [{ id: 'cR', w: 3, y: 0, from: 71.5, to: 80.5, track: [68, 77] }],
      rails: [[86, 95]],
      bugs: [{ x0: 57, x1: 63, y: 0 }, { x0: 141.5, x1: 146.5, y: 0 }, { x0: 177, x1: 183, y: 0 }],
      pickups: [
        { x: 3.4, y: 1.3 }, { x: 5.6, y: 2.4 }, { x: 14.9, y: 2.3 }, { x: 20, y: 1.3 }, { x: 36, y: 1.3 },
        { x: 65, y: 2.6 }, { x: 76, y: 2.4 }, { x: 99, y: 2.5 },
        { x: 115, y: 1.3 }, { x: 128, y: 7.7 }, { x: 135, y: 7.5 }, { x: 152, y: 2.2 },
        { x: 181, y: 1.3 }, { x: 194, y: 1.3 }, { x: 211, y: 2.8 },
        { x: 175, y: 1.2, key: 'gL1', kind: 'commit' },
        { x: 190.6, y: 3.4, key: 'gL2', kind: 'commit' },
        { x: 203, y: 1.2, key: 'gL3', kind: 'commit' }
      ],
      signs: [{ x: 143, text: ['summer 2024', 'adobe', 'intern'] }]
    }
  };

  window.BELLA = { CONFIG, END_X, CHAPTERS, BEATS, LINES, WHOLE, LEVEL };
})();
