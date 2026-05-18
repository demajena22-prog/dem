const enabled = process.env.NO_COLOR !== "1" && process.env.NO_COLOR !== "true";

function color(code) {
    return (value = "") => enabled ? `\x1b[${code}m${String(value)}\x1b[0m` : String(value);
}

export default {
    blue: color(34),
    yellow: color(33),
    green: color(32),
    red: color(31),
    redBright: color(91),
    gray: color(90),
    white: color(37),
    whiteBright: color(97),
};
