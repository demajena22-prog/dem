import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packages = [
    "axios",
    "bcryptjs",
    "chokidar",
    "glob",
    "lodash",
    "lowdb",
    "md5",
    "moment-timezone",
    "mongodb",
    "mongoose",
    "node-cron",
    "node-fetch",
    "node-telegram-bot-api",
    "qrcode",
    "@napi-rs/canvas",
    "strip-comments",
    "tel-connect",
];

const missing = packages.filter((name) => {
    try {
        require.resolve(name);
        return false;
    } catch (_) {
        return true;
    }
});

if (missing.length) {
    console.error("Dependency belum terinstall:");
    console.error(`- ${missing.join("\n- ")}`);
    console.error("\nJalankan perintah ini di folder project:");
    console.error("npm install");
    process.exit(1);
}
