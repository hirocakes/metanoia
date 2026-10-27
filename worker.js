// Static-asset Worker: every request is served straight from the edge cache.
// No backend, no database — METANOIA is a single-player client-only game.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
