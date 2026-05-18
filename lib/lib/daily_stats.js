import fs from 'fs';
import path from 'path';

const filePath = './src/daily_stats.json';

function getTodayDate() {
    return new Date().toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-');
}

const defaultData = {
    date: getTodayDate(),
    pcs: 0,
    revenue: 0
};

export function getDailyStats() {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }

        const rawData = fs.readFileSync(filePath, 'utf-8');
        let data = JSON.parse(rawData);

        if (data.date !== getTodayDate()) {
            data = { ...defaultData, date: getTodayDate() };
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }

        return data;
    } catch (e) {
        console.error("Error reading daily stats:", e);
        return defaultData;
    }
}

export function addDailyStats(qty, nominal) {
    try {
        let data = getDailyStats(); 

        data.pcs += parseInt(qty);
        data.revenue += parseInt(nominal);

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error("Error saving daily stats:", e);
        return false;
    }
}