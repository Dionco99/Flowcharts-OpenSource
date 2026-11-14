# replay

The replay clock and the session file. Pause, play, speed, step, seek, and jump to the next session open move one cursor. The session file stores that cursor, drawings, working orders, and fills on the machine. Every pane reads the same cursor. Bar aggregation stays in `packages/bars`. The fill matcher stays in `packages/orders`.

`stepCursor`, `nextSessionOpen`, and the browser session file live here for the desk.

`ReplayClock` and `ReplaySession` are the tested transport. The desk supplies the first and last minute close. Speed is trading bars per second. ArrowRight steps forward, ArrowLeft steps back, and Space pauses or plays. The next session open is Asia 00:00, London 08:00, or New York 13:00 in the viewer's timezone, skipping Saturday and Sunday. A version-1 file reopens paused on the saved cursor. A file for another symbol, another version, or a cursor outside the tape leaves the open session as it was.

From the repository root:

```bash
npm test -w @flowchart/replay
npm run typecheck -w @flowchart/replay
```

```ts
import { ReplaySession, applyReplayKey } from "@flowchart/replay";

const session = new ReplaySession({
  symbol: "EURUSD",
  tape: { firstClose: Date.parse("2024-06-03T07:00:00Z"), lastClose: Date.parse("2024-06-03T17:00:00Z") },
  timeframeMinutes: 15,
  timeZone: "America/New_York",
});

session.clock.play();
session.clock.setSpeed(2);
session.clock.advance(1000);
session.clock.nextSession();
applyReplayKey(session.clock, { key: " " });
const file = session.exportDocument();
```

Apache-2.0. See [docs/dependencies.md](../../docs/dependencies.md). No market-data files are bundled.
