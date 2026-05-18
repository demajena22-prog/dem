import "../config.js";
import axios from "axios";

const BASE_URL = global.midtrans_is_production
  ? "https://api.midtrans.com/v2"
  : "https://api.sandbox.midtrans.com/v2";

function getAuthHeader() {
  const serverKey = global.midtrans_server_key;
  const encoded = Buffer.from(serverKey + ":").toString("base64");
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" };
}

async function createQr(nominal, ref_id) {
  try {
    const response = await axios.post(
      `${BASE_URL}/charge`,
      {
        payment_type: "qris",
        transaction_details: {
          order_id: ref_id,
          gross_amount: parseInt(nominal),
        },
      },
      { headers: getAuthHeader(), timeout: 30000 }
    );

    const data = response.data;

    if (data.status_code === "201" && data.actions) {
      const qrAction = data.actions.find((a) => a.name === "generate-qr-code");
      if (qrAction && qrAction.url) {
        const qrImageResp = await axios.get(qrAction.url, { responseType: "arraybuffer" });
        return Buffer.from(qrImageResp.data);
      }
    }

    console.log("Terjadi kesalahan saat membuat QRIS:", JSON.stringify(data));
    return null;
  } catch (e) {
    console.log("Terjadi kesalahan saat membuat QRIS:", e.response?.data || e.message);
    return null;
  }
}

async function cekTransaksi(nominal, ref_id) {
  try {
    const response = await axios.get(`${BASE_URL}/${ref_id}/status`, {
      headers: getAuthHeader(),
      timeout: 15000,
    });

    const data = response.data;
    const status = data.transaction_status?.toLowerCase();

    if (status === "settlement" || status === "capture") return true;
    if (status === "expire" || status === "cancel" || status === "deny") return false;

    return null;
  } catch (e) {
    console.log("Terjadi kesalahan saat cek transaksi:", e.response?.data || e.message);
    return null;
  }
}

export { createQr, cekTransaksi };
