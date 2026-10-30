// =============================================================================
// PM2 ECOSYSTEM CONFIGURATION FOR GORSE (SHORTY RECSYS)
// Run command: pm2 start ecosystem.config.js
// =============================================================================

module.exports = {
  apps: [
    {
      name: "shorty-gorse-recsys",
      // On Windows use: "./gorse-in-one.exe" or "gorse-in-one.exe"
      // On Linux/Mac use: "./gorse-in-one"
      script: process.platform === "win32" ? "./gorse-in-one.exe" : "./gorse-in-one",
      args: "--config config.toml",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/gorse-error.log",
      out_file: "./logs/gorse-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};

