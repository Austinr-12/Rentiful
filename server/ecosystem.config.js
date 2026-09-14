// pm2 process definition. Build first (`npm run build`), then `pm2 start ecosystem.config.js`.
module.exports = {
  apps: [
    {
      name: "rentiful-api",
      script: "dist/src/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
