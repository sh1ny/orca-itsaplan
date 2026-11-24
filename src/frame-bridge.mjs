// Orca's dev bridge can invent a caller id. A targeted push instead goes only to an attached frame.
export function connectFrame(plugin) {
  const lifetime = new AbortController();
  let witness;
  let handshake;
  let receive;
  const subscription = plugin.on('sidebar.witness', (event) => {
    if (typeof event?.witness === 'string' && /^[a-f0-9]{64}$/.test(event.witness)) receive?.(event.witness);
  });

  function challenge() {
    if (handshake) return handshake;
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(5_000)]);
    const read = new Promise((resolve) => {
      if (signal.aborted) resolve(null);
      else {
        receive = resolve;
        signal.addEventListener('abort', () => resolve(null), { once: true });
      }
    });
    handshake = (async () => {
      try {
        const reply = await plugin.request('sidebar.challenge', null, { timeoutMs: 5_000, signal });
        return reply.ok ? await read : null;
      } catch { return null; }
      finally { receive = undefined; handshake = undefined; }
    })();
    return handshake;
  }

  return {
    async request(name, input, options) {
      if (name !== 'projects.list' && name !== 'board.read') return plugin.request(name, input, options);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (lifetime.signal.aborted || options.signal?.aborted) return { ok: false, code: 'cancelled' };
        const current = witness ??= await challenge();
        if (!current) return { ok: false, code: 'frame_required' };
        if (lifetime.signal.aborted || options.signal?.aborted) return { ok: false, code: 'cancelled' };
        const result = await plugin.request(name, { ...input, witness: current }, options);
        if (result.code !== 'frame_required') return result;
        if (witness === current) witness = undefined; // Idle worker may have restarted.
      }
      return { ok: false, code: 'frame_required' };
    },
    close() { lifetime.abort(); subscription.dispose(); },
  };
}
