import { PartySocket } from 'partysocket';

// PartySocket-backed network. Surface is tuned to match createMockNetwork
// so App / Lobby / Controls can ignore which one they're talking to:
//   const net = createPartyNetwork({ host, room, identity, onState, onFinished });
//   net.identify(identity);  net.setReady(true);  net.sendTap('L');  net.destroy();

export function createPartyNetwork({
  host,
  room = 'main',
  identity,
  onState,
  onFinished,
  onRejected,
}) {
  let serverClockOffset = 0; // serverNow - localNow at last broadcast
  let myConnId = null;

  const socket = new PartySocket({ host, room });

  // Re-send identify on every 'open' event — including auto-reconnects.
  // PartySocket fires 'open' on every underlying WS open, and the server's
  // onConnect always allocates a fresh slot with name='Rider' (and
  // isAdmin=false), so without re-identifying, a dropped/restored
  // connection silently downgrades the player back to a default-named
  // guest. The server's identify handler is idempotent (sets fields +
  // broadcasts), so re-sending is safe.
  socket.addEventListener('open', () => {
    if (identity) {
      socket.send(
        JSON.stringify({
          type: 'identify',
          name: identity.name,
          profileImage: identity.profileImage ?? null,
          provider: identity.provider ?? 'guest',
        }),
      );
    }
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === 'welcome') {
      myConnId = msg.connId;
    } else if (msg.type === 'state') {
      if (typeof msg.state?.serverNow === 'number') {
        serverClockOffset = msg.state.serverNow - Date.now();
      }
      onState && onState(msg.state);
    } else if (msg.type === 'finished') {
      if (typeof msg.state?.serverNow === 'number') {
        serverClockOffset = msg.state.serverNow - Date.now();
      }
      onState && onState(msg.state);
      onFinished &&
        onFinished({
          // Server now sends `top` (rank-ordered top 5) and `you` (full
          // player projection with rank) instead of the old full
          // `ranking` array. Match the contract Results.jsx expects.
          top: msg.top,
          you: msg.you,
          startedAt: msg.startedAt,
          finishedAt: msg.finishedAt,
        });
    } else if (msg.type === 'rejected') {
      onRejected && onRejected(msg.reason || 'rejected');
    }
  });

  return {
    identify(next) {
      socket.send(
        JSON.stringify({
          type: 'identify',
          name: next.name,
          profileImage: next.profileImage ?? null,
          provider: next.provider ?? 'guest',
        }),
      );
    },
    setReady(ready) {
      socket.send(JSON.stringify({ type: ready ? 'ready' : 'unready' }));
    },
    sendTap(side) {
      socket.send(JSON.stringify({ type: 'tap', side }));
    },
    sendReset() {
      // Server validates the sender is admin before honoring this.
      socket.send(JSON.stringify({ type: 'reset' }));
    },
    // serverNow() lets the UI render countdowns against the same clock the
    // server uses, eliminating drift caused by client-server clock skew.
    serverNow() {
      return Date.now() + serverClockOffset;
    },
    myConnId() {
      return myConnId;
    },
    destroy() {
      try {
        socket.close();
      } catch {
        // already closed
      }
    },
  };
}
