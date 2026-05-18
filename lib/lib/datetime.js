import '../config.js';
import moment from 'moment-timezone';

moment.locale('id');

function buildTime() {
  const timezone = typeof global.zone === 'string' && global.zone.trim() ? global.zone : 'Asia/Jakarta';
  const waktu = moment().tz(timezone);
  const jamKe = waktu.hour();
  let salam = 'Malam';

  if (jamKe >= 4 && jamKe < 11) {
    salam = 'Pagi';
  } else if (jamKe >= 11 && jamKe < 15) {
    salam = 'Siang';
  } else if (jamKe >= 15 && jamKe < 18) {
    salam = 'Sore';
  } else if (jamKe >= 18 && jamKe < 23) {
    salam = 'Malam';
  }

  return {
    tanggal: waktu.format('DD MMMM YYYY'),
    hari: waktu.format('dddd'),
    jam: `${waktu.format('HH:mm')} WIB`,
    salam: salam
  };
}

async function time() {
  return buildTime();
}

for (const key of ['tanggal', 'hari', 'jam', 'salam']) {
  Object.defineProperty(time, key, {
    get() {
      return buildTime()[key];
    },
  });
}

export default time;