// Picks the real PartyKit network if VITE_PARTYKIT_HOST is configured,
// otherwise falls back to the in-browser mock. The two implementations
// expose an identical surface, so the rest of the app doesn't branch on
// transport.

import { createPartyNetwork } from './network-party.js';
import { createMockNetwork } from './network-mock.js';

const PARTY_HOST = import.meta.env.VITE_PARTYKIT_HOST;
const PARTY_ROOM = import.meta.env.VITE_PARTYKIT_ROOM || 'main';

export function isMultiplayerEnabled() {
  return Boolean(PARTY_HOST);
}

export function createNetwork(opts) {
  if (PARTY_HOST) {
    return createPartyNetwork({
      host: PARTY_HOST,
      room: PARTY_ROOM,
      ...opts,
    });
  }
  return createMockNetwork(opts);
}
