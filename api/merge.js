export default async function handler(req, res) {
  try {
const formData = await req.formData();
const files = formData.getAll("files");

    const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
    const secretKey = process.env.ILOVEPDF_SECRET_KEY;

    // 1. Crear task
    const startRes = await fetch("https://api.ilovepdf.com/v1/start/merge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicKey}`,
      },
    });

    const startData = await startRes.json();

    const { server, task } = startData;

    // 2. Subir archivos
    const uploaded = [];

    for (let file of files) {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch(`${server}/v1/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicKey}`,
        },
        body: formData,
      });

      const uploadData = await uploadRes.json();
      uploaded.push(uploadData.server_filename);
    }

    // 3. Merge
    await fetch(`${server}/v1/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task,
        tool: "merge",
        files: uploaded,
      }),
    });

    // 4. Download
    const downloadRes = await fetch(`${server}/v1/download/${task}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const buffer = await downloadRes.arrayBuffer();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="merged.pdf"'
    );

    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en merge" });
  }
}
