import QRCode from "qrcode";

export default async function customizeQR(qrisString) {
  try {
    const qrSize = 1100;

    const qrBuffer = await QRCode.toBuffer(qrisString, {
      errorCorrectionLevel: "H",
      type: "png",
      width: qrSize,
      margin: 4,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    return qrBuffer;
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
    throw error;
  }
}