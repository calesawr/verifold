# M1 cost exhibit: gear pipeline vs verifold-flat

Measured on simnet via `npm run test:report` (clarinet-sdk 3.19.0), toy
parameters (depth 4, 4 queries, 3 layers). The flat artifact is
token-identical to the gears modulo names (Layer 0), so this is a pure
dispatch-cost comparison.

| entry point | gear pipeline | verifold-flat |
| --- | --- | --- |
| driver verify totals | {"write_length":0,"write_count":0,"read_length":5385151,"read_count":2496,"runtime":50203879} | {"write_length":0,"write_count":0,"read_length":37482,"read_count":3,"runtime":44679207} |

Baseline run: 239 of 240 tests passed (one FRI property test timed out at the default 5s limit under cost instrumentation; the driver verify cost entry was complete). Flat run: 240 of 240 passed.

- read_count collapses because cross-contract dispatch was the entire read
  budget; a single contract has none. The spike projected read_count 3 and
  4 to 10% of a block at FULL parameters (docs/upstream, scale-up spike);
  this table is the real-artifact confirmation at toy parameters.
- Flat suite wall time: 121s (transform 252ms, setup 142ms, import 285ms, tests 119.53s, environment 874ms).
- Gate: flat runtime <= gear runtime. Holds on this run. Any future
  regeneration that violates it is a cost-model finding to investigate.
