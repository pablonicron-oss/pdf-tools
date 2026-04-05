export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files");

    if (!files || files.length < 2) {
      return res.status(400).json({ error: "Subí al menos 2 PDFs" });
    }

    const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
    const secretKey = process.env.ILOVEPDF_SECRET_KEY;

    const serverRes = await fetch("https://api.ilovepdf.com/v1/start/merge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicKey}`,
      },
    });

    const { server, task } = await serverRes.json();

    // subir archivos
    const uploaded = [];

    for (let file of files) {
      const fd = new FormData();
      fd.append("file", file);

      const uploadRes = await fetch(`https://${server}/v1/upload/${task}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicKey}`,
        },
        body: fd,
      });

      const data = await uploadRes.json();
      uploaded.push(data.server_filename);
    }

    // procesar merge
    await fetch(`https://${server}/v1/process/${task}`, {
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

    // descargar resultado
    const download = await fetch(`https://${server}/v1/download/${task}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const buffer = await download.arrayBuffer();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=merged.pdf"
    );

    res.send(Buffer.from(buffer));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en merge" });
  }
}
