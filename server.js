require("dotenv").config();

const path = require("path");

const { createApp } = require("./lib/app");

const app = createApp();

if (process.env.NODE_ENV !== "production") {
  try {
    const livereload = require("livereload");
    const connectLiveReload = require("connect-livereload");
    const liveReloadServer = livereload.createServer({ port: 35730 });

    liveReloadServer.watch(path.join(__dirname, "public"));
    liveReloadServer.watch(path.join(__dirname, "data"));

    app.use(connectLiveReload({ port: 35730 }));
  } catch (error) {
    console.warn("Live reload not enabled:", error.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VA CFR MVP running on port ${PORT}`);
});
