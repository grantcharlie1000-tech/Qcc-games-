import {describe, expect, it} from 'vitest';
import {deal} from '../../../src/games/solitaire/model';

// Captured by running the pre-extraction implementations at d516854; keep these values literal.
const deals = [
  {
    seed: 0,
    expected: {
      seed: 0,
      moves: 0,
      recycles: 0,
      stock: [43,50,38,1,51,30,31,23,6,41,12,35,34,18,3,17,33,5,37,32,26,16,45,8],
      waste: [],
      foundations: [[],[],[],[]],
      tableau: [
        [{"id": 13,"up": true}],
        [{"id": 0,"up": false},{"id": 29,"up": true}],
        [{"id": 11,"up": false},{"id": 20,"up": false},{"id": 15,"up": true}],
        [{"id": 7,"up": false},{"id": 24,"up": false},{"id": 27,"up": false},{"id": 19,"up": true}],
        [{"id": 22,"up": false},{"id": 10,"up": false},{"id": 42,"up": false},{"id": 40,"up": false},{"id": 9,"up": true}],
        [{"id": 25,"up": false},{"id": 4,"up": false},{"id": 44,"up": false},{"id": 48,"up": false},{"id": 2,"up": false},{"id": 39,"up": true}],
        [{"id": 28,"up": false},{"id": 36,"up": false},{"id": 21,"up": false},{"id": 46,"up": false},{"id": 47,"up": false},{"id": 14,"up": false},{"id": 49,"up": true}],
      ],
    },
  },
  {
    seed: 123,
    expected: {
      seed: 123,
      moves: 0,
      recycles: 0,
      stock: [50,5,15,38,31,10,36,44,30,28,48,42,23,19,2,8,35,49,33,12,29,43,32,26],
      waste: [],
      foundations: [[],[],[],[]],
      tableau: [
        [{"id": 40,"up": true}],
        [{"id": 9,"up": false},{"id": 41,"up": true}],
        [{"id": 24,"up": false},{"id": 34,"up": false},{"id": 0,"up": true}],
        [{"id": 11,"up": false},{"id": 17,"up": false},{"id": 22,"up": false},{"id": 45,"up": true}],
        [{"id": 18,"up": false},{"id": 25,"up": false},{"id": 13,"up": false},{"id": 16,"up": false},{"id": 1,"up": true}],
        [{"id": 39,"up": false},{"id": 51,"up": false},{"id": 47,"up": false},{"id": 21,"up": false},{"id": 3,"up": false},{"id": 37,"up": true}],
        [{"id": 46,"up": false},{"id": 7,"up": false},{"id": 20,"up": false},{"id": 4,"up": false},{"id": 14,"up": false},{"id": 6,"up": false},{"id": 27,"up": true}],
      ],
    },
  },
  {
    seed: 4294967295,
    expected: {
      seed: 4294967295,
      moves: 0,
      recycles: 0,
      stock: [33,1,45,14,16,49,20,11,48,22,15,19,17,26,50,37,30,41,8,44,43,10,0,47],
      waste: [],
      foundations: [[],[],[],[]],
      tableau: [
        [{"id": 46,"up": true}],
        [{"id": 9,"up": false},{"id": 21,"up": true}],
        [{"id": 35,"up": false},{"id": 5,"up": false},{"id": 28,"up": true}],
        [{"id": 51,"up": false},{"id": 42,"up": false},{"id": 18,"up": false},{"id": 4,"up": true}],
        [{"id": 40,"up": false},{"id": 36,"up": false},{"id": 27,"up": false},{"id": 12,"up": false},{"id": 23,"up": true}],
        [{"id": 25,"up": false},{"id": 7,"up": false},{"id": 32,"up": false},{"id": 29,"up": false},{"id": 24,"up": false},{"id": 2,"up": true}],
        [{"id": 31,"up": false},{"id": 13,"up": false},{"id": 3,"up": false},{"id": 38,"up": false},{"id": 34,"up": false},{"id": 39,"up": false},{"id": 6,"up": true}],
      ],
    },
  },
];

describe('Solitaire seeded deal compatibility', () => {
  it.each(deals)('preserves the complete dealt state for seed $seed', ({seed, expected}) => {
    expect(deal(seed)).toEqual(expected);
  });
});
