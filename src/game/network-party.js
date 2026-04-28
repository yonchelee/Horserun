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
  onKicked,
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
    } else if (msg.type === 'kicked') {
      // Admin removed us from the room. Two things have to happen
      // here, IN THIS ORDER:
      //
      //  1. Disable PartySocket auto-reconnect by calling socket.close()
      //     synchronously. PartySocket's _shouldReconnect defaults to
      //     true; the only way to flip it is to call .close() (or pass
      //     startClosed at construction). The server is also closing
      //     the connection, but the client's _handleClose checks
      //     _shouldReconnect and reconnects unless we've already set
      //     it to false — otherwise we land right back in the room as
      //     a fresh slot, which is exactly the bug this fix prevents.
      //
      //  2. THEN tell App.jsx via onKicked so it can tear down identity
      //     state and surface the banner.
      try {
        socket.close(1000, 'kicked');
      } catch {
        // Already-closed sockets throw; harmless.
      }
      onKicked && onKicked(msg.reason || '방장이 내보냈습니다');
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
    sendKick(targetConnId) {
      // Server validates the sender is admin AND that the target is a
      // human (not a bot) AND that the admin isn't kicking themselves.
      if (!targetConnId) return;
      socket.send(JSON.stringify({ type: 'kick', targetConnId }));
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
