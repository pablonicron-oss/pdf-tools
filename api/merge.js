import formidable from "formidable";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";

export const config = {
  api: {
    bodyParser: false, // necesario para recibir archivos
  },
};

// ── helpers ────────────────────────────────────────────────────────────────────

async function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

async function ilovepdfRequest(endpoint, body, token) {
  const res = await fetch(`https://api.ilovepdf.com/v1${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`iLovePDF ${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const PUBLIC_KEY = process.env.ILOVEPDF_PUBLIC_KEY;
  const SECRET_KEY = process.env.ILOVEPDF_SECRET_KEY;

  if (!PUBLIC_KEY || !SECRET_KEY) {
    return res.status(500).json({ error: "iLovePDF keys not configured" });
  }

  try {
    // 1. Parsear archivos del form
    const { files } = await parseForm(req);
    const pdfs = Array.isArray(files.pdfs) ? files.pdfs : [files.pdfs];

    if (!pdfs || pdfs.length < 2) {
      return res.status(400).json({ error: "Se necesitan al menos 2 PDFs" });
    }

    // 2. Autenticarse → obtener JWT
    const authRes = await fetch("https://api.ilovepdf.com/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key: PUBLIC_KEY }),
    });
    if (!authRes.ok) throw new Error("Auth fallida");
    const { token } = await authRes.json();

    // 3. Crear tarea de merge
    const { server, task } = await ilovepdfRequest(
      "/start/merge",
      {},
      token
    );

    // 4. Subir cada PDF al servidor de la tarea
    const serverFiles = [];
    for (const file of pdfs) {
      const form = new FormData();
      form.append("task", task);
      form.append("file", fs.createReadStream(file.filepath), {
        filename: file.originalFilename || path.basename(file.filepath),
        contentType: "application/pdf",
      });

      const uploadRes = await fetch(`https://${server}/v1/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        throw new Error(`Upload fallido: ${uploadRes.status} ${t}`);
      }

      const uploadData = await uploadRes.json();
      serverFiles.push({ server_filename: uploadData.server_filename });
    }

    // 5. Ejecutar merge
    await fetch(`https://${server}/v1/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task,
        tool: "merge",
        files: serverFiles,
      }),
    });

    // 6. Descargar el resultado
    const downloadRes = await fetch(`https://${server}/v1/download/${task}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!downloadRes.ok) {
      throw new Error(`Download fallido: ${downloadRes.status}`);
    }

    // 7. Devolver el PDF al cliente
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="merged.pdf"'
    );
    downloadRes.body.pipe(res);
  } catch (err) {
    console.error("merge error:", err);
    res.status(500).json({ error: err.message });
  }
}
