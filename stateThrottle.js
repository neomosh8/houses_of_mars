// stateThrottle.js - Efficient state broadcasting
class StateThrottle {
  constructor(broadcastFn, interval = 50) { // 20 updates/sec instead of 60+
    this.broadcast = broadcastFn;
    this.interval = interval;
    this.pendingUpdates = new Map(); // playerId -> latest state
    this.timer = setInterval(() => this.flush(), interval);
  }

  update(playerId, state) {
    this.pendingUpdates.set(playerId, { state });
  }

  flush() {
    if (this.pendingUpdates.size === 0) return;

    const updates = [];
    for (const [playerId, { state }] of this.pendingUpdates) {
      updates.push({ id: playerId, ...state });
    }

    this.broadcast({ type: 'batchUpdate', updates });
    this.pendingUpdates.clear();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = StateThrottle;
