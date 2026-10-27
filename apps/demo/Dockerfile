# The release brief demo. Build from the repo root:
#   docker build -f apps/demo/Dockerfile -t release-brief-demo .
#   docker run -p 3000:3000 release-brief-demo
# The image bakes its inputs at build time (bun run demo:bake) and needs no environment beyond PORT at run time.
# The model key, when a viewer wants the model, comes from the page.
FROM oven/bun:1.3.1

# measure() and the evidence quotes read the repo through git.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# The bare clone and the exports are committed, so the bake clones nothing here; it re-measures the 21 PRs
# and fails the build if any PR fails. Then the page is built.
RUN bun run demo:bake && bunx vite build --config apps/demo/vite.config.ts

ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "apps/demo/server/main.ts"]
