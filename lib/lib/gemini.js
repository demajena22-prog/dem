import axios from "axios";

export async function gemini({ message, sessionId = null }) {
  try {
    if (!message) throw new Error("Message is required.");

    let resumeArray = null;
    let cookie = null;
    let savedInstruction = `Kamu adalah Asisten AI cerdas untuk "RifalosID", sebuah bot toko otomatis di Telegram. Tugasmu adalah membantu pelanggan dengan ramah, sopan, dan efisien dalam menjawab pertanyaan seputar cara penggunaan bot, cara order, deposit, dan informasi stok.

GUNAKAN INFORMASI BERIKUT SEBAGAI BASIS PENGETAHUANMU:

1. NAVIGASI UTAMA (PENTING)
- Jika user bertanya cara kembali ke menu, cara melihat menu awal, atau tampak bingung dengan posisi mereka saat ini, SELALU arahkan mereka untuk mengetik perintah: /start
- Jelaskan bahwa /start adalah tombol "Home" atau "Reset" untuk kembali ke tampilan awal bot.

2. IDENTITAS & KONTAK
- Nama Toko: RifalosID
- Zona Waktu: Asia/Jakarta
- Owner/Admin: @rifalosid
- Jika ada kendala teknis berat yang tidak bisa kamu jawab, arahkan user untuk menghubungi Owner.

3. CARA MELAKUKAN ORDER
- Langkah 1: Cari produk di menu "List Product".
- Langkah 2: Pilih kategori dan varian produk.
- Langkah 3: Tentukan jumlah pembelian.
- Langkah 4: Pilih metode pembayaran (Saldo Akun atau QRIS).
- Langkah 5: Jika via QRIS, scan kode yang muncul. Produk otomatis terkirim setelah sukses.

4. CARA DEPOSIT / ISI SALDO
- Minimal deposit: Rp 10.000.
- Metode: QRIS (via Pakasir).
- PENTING: Ingatkan user untuk transfer SESUAI nominal hingga 3 digit terakhir (kode unik) agar saldo masuk otomatis.

5. PERINTAH (COMMAND) DASAR
- /start : Menu Utama / Mulai Ulang Bot (Gunakan ini untuk navigasi pulang).
- /stok : Cek ketersediaan stok produk (Live Status).
- /bot : Info status bot.

GAYA BICARA & BATASAN:
- Gunakan Bahasa Indonesia yang luwes, ramah, dan santai (boleh pakai emoji).
- Jangan mengarang data stok atau harga. Arahkan user cek sendiri via tombol di bot.
- Jawaban harus solutif. Jika user bertanya "Menu mana?", jawab "Ketik /start ya Kak."

CONTOH INTERAKSI:
User: "Cara balik ke menu awal gimana?"
AI: "Untuk kembali ke menu utama, silakan ketik /start ya Kak! Nanti tombol-tombol menunya akan muncul lagi. 😊"

User: "Saya tersesat, ini harus pencet apa?"
AI: "Jangan bingung Kak, ketik /start saja untuk mereset bot dan kembali ke halaman depan. 👍"

User: "Gimana cara belinya?"
AI: "Halo Kak! Klik 'List Produk' di menu utama untuk cari barangnya. Kalau menunya tidak ada, ketik /start dulu ya. Setelah pilih barang, tinggal bayar pakai Saldo atau QRIS."`;
    let instruction = savedInstruction;
    if (sessionId) {
      try {
        const sessionData = JSON.parse(
          Buffer.from(sessionId, "base64").toString()
        );
        resumeArray = sessionData.resumeArray;
        cookie = sessionData.cookie;
        savedInstruction = instruction || sessionData.instruction || "";
      } catch (e) {
        console.error("Error parsing session:", e.message);
      }
    }

    if (!cookie) {
      const { headers } = await axios.post(
        "https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c",
        "f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&",
        {
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
        }
      );

      cookie = headers["set-cookie"]?.[0]?.split("; ")[0] || "";
    }

    const requestBody = [
      [message, 0, null, null, null, null, 0],
      ["en-US"],
      resumeArray || ["", "", "", null, null, null, null, null, null, ""],
      null,
      null,
      null,
      [1],
      1,
      null,
      null,
      1,
      0,
      null,
      null,
      null,
      null,
      null,
      [[0]],
      1,
      null,
      null,
      null,
      null,
      null,
      [
        "",
        "",
        savedInstruction,
        null,
        null,
        null,
        null,
        null,
        0,
        null,
        1,
        null,
        null,
        null,
        [],
      ],
      null,
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      1,
      null,
      null,
      null,
      null,
      [1],
    ];

    const payload = [null, JSON.stringify(requestBody)];

    const { data } = await axios.post(
      "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c",
      new URLSearchParams({ "f.req": JSON.stringify(payload) }).toString(),
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "x-goog-ext-525001261-jspb":
            '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]',
          cookie: cookie,
        },
      }
    );

    const match = Array.from(data.matchAll(/^\d+\n(.+?)\n/gm));

    if (!match || match.length === 0) {
      throw new Error("Gemini API response format tidak valid");
    }

    const array = match.reverse();

    if (!array[3] || !array[3][1]) {
      throw new Error("Gemini API response tidak lengkap");
    }

    const selectedArray = array[3][1];
    const realArray = JSON.parse(selectedArray);

    if (!realArray || !realArray[0] || !realArray[0][2]) {
      throw new Error("Gemini API response structure tidak sesuai");
    }

    const parse1 = JSON.parse(realArray[0][2]);

    if (!parse1 || !parse1[1] || !parse1[4] || !parse1[4][0] || !parse1[4][0][1] || !parse1[4][0][1][0]) {
      throw new Error("Gemini API response data tidak lengkap");
    }

    const newResumeArray = [...parse1[1], parse1[4][0][0]];
    const text = parse1[4][0][1][0].replace(/\*\*(.+?)\*\*/g, "*$1*");

    const newSessionId = Buffer.from(
      JSON.stringify({
        resumeArray: newResumeArray,
        cookie: cookie,
        instruction: savedInstruction,
      })
    ).toString("base64");

    return {
      text: text,
      sessionId: newSessionId,
    };
  } catch (error) {
    console.error("Gemini API Error:", error.message);

    // Fallback response jika API gagal
    return {
      text: `Maaf Kak, asisten AI sedang mengalami gangguan. 😔\n\nUntuk bantuan cepat:\n• Ketik /start untuk kembali ke menu utama\n• Ketik /stok untuk cek ketersediaan produk\n• Hubungi admin @rifalosid jika ada kendala\n\nError: ${error.message}`,
      sessionId: null,
    };
  }
}
