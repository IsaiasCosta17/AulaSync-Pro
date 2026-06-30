module.exports = {
  apps: [
    {
      name: "aulasync-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "aulasync-worker",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/background-worker.ts",
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        AULASYNC_WORKER_PROCESS: "1",
      },
    },
  ],
};
