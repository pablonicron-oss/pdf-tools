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

    const apiKey = process.env.ILOVEPDF_SECRET_KEY;

    // iniciar tarea
    const start = await fetch("https://api.ilovepdf.com/v1/start/merge", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const startData = await start.json();

    if (!startData.server || !startData.task) {
      throw new Error("Error iniciando tarea");
    }

    const { server, task } = startData;

    const uploaded = [];

    for (let file of files) {
      const fd = new FormData();
      fd.append("file", file);

      const upload = await fetch(`https://${server}/v1/upload/${task}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: fd,
      });

      const data = await upload.json();

      if (!data.server_filename) {
        throw new Error("Error subiendo archivo");
      }

      uploaded.push(data.server_filename);
    }

    // procesar merge
    const processRes = await fetch(`https://${server}/v1/process/${task}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task,
        tool: "merge",
        files: uploaded,
      }),
    });

    const processData = await processRes.json();

    if (processData.error) {
      throw new Error(processData.error.message || "Error procesando");
    }

    // descargar resultado
    const download = await fetch(`https://${server}/v1/download/${task}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!download.ok) {
      throw new Error("Error descargando PDF");
    }

    const buffer = await download.arrayBuffer();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=merged.pdf");

    res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("ERROR REAL:", err);
    res.status(500).json({ error: err.message });
  }
}
